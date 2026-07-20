#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deduplicar-referencias — deduplicación transparente de exportaciones bibliográficas.

Une varios ficheros de resultados de búsqueda (PubMed/Embase/CENTRAL/Scopus/WoS...),
detecta duplicados de forma CONSERVADORA y produce:
  - <salida>/dedup.ris          -> registros únicos, para cribar (Rayyan/Zotero)
  - <salida>/duplicados.csv     -> duplicados retirados (suplementario, consulta)
  - <salida>/revisar.csv        -> emparejamientos DUDOSOS (no fusionados; decisión humana)
  - <salida>/dedup_informe.md   -> números para PRISMA + matriz de solapamiento

Regla de duplicado (María, 16/07/2026): el DOI SOLO no basta (los abstracts de congreso
comparten el DOI del suplemento). Cascada:
  1) mismo PMID
  2) título+año idénticos (normalizados)
  3) mismo DOI + títulos parecidos (Jaccard >= 0,5)
  4) revista+volumen+número+página inicial + títulos parecidos
Ambiguos (mismo DOI con título medianamente distinto, o títulos ~iguales sin DOI/año) ->
NO se fusionan: se apartan a revisar.csv. Ante la duda, se conservan ambos.
Guardarraíl (18/07/2026): las reglas de señal blanda (abstract, título+año, título+autor+año~)
no fusionan si ≥2 identificadores duros (DOI/volumen/página inicial) discrepan -> a revisión.

Formatos de entrada (autodetección por extensión, override con --format):
  .ris .txt(RIS)  -> RIS (Embase/Ovid, Cochrane, Scopus, WoS, EndNote)
  .nbib .medline  -> MEDLINE/PubMed
  .xml            -> PubMed XML (efetch)
  .bib            -> BibTeX
  .csv            -> CSV genérico (autodetecta columnas título/doi/año/autor/revista/resumen)

Solo librería estándar de Python 3. Uso:
  python3 dedup.py fichero1 fichero2 ... [--out CARPETA] [--source-names "PubMed,Embase,CENTRAL"]
                   [--merge-threshold 0.5] [--review-threshold 0.3]
"""
import sys, os, re, csv, argparse, unicodedata, xml.etree.ElementTree as ET

# ------------------------------------------------------------------ normalización
def strip_accents(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")

def norm_title(t):
    if not t: return ""
    t = strip_accents(t).lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()

_ENT_NUM_X = re.compile(r"&#x([0-9a-fA-F]+);")
_ENT_NUM = re.compile(r"&#(\d+);")
def _decode_entities(s):
    # Entidades HTML/XML que aparecen en DOIs (los SICI de Wiley llevan '<' '>': 74:1<73::…).
    # Conjunto acotado (mismos casos que normalize.js) para garantizar la paridad.
    s = _ENT_NUM_X.sub(lambda m: chr(int(m.group(1), 16)), s)
    s = _ENT_NUM.sub(lambda m: chr(int(m.group(1))), s)
    for k, v in (("&lt;", "<"), ("&gt;", ">"), ("&quot;", '"'), ("&apos;", "'"), ("&amp;", "&")):
        s = s.replace(k, v)
    return s

def norm_doi(d):
    if not d: return ""
    d = strip_accents(d).strip().lower()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    # Canonizar la escritura del DOI antes de comparar (bases distintas lo codifican distinto):
    #   - entidades HTML: "…74:1&lt;73…" == "…74:1<73…" (SICI de Wiley),
    #   - porcentaje URL: "s0008-6363%2899%29…" == "s0008-6363(99)…".
    # Sin esto, el MISMO DOI se veía distinto y activaba un falso conflicto de DOI.
    d = _decode_entities(d)
    d = re.sub(r"%([0-9a-fA-F]{2})", lambda m: chr(int(m.group(1), 16)), d)
    m = re.search(r"10\.\d{4,9}/\S+", d)
    d = m.group(0) if m else d
    return d.strip().rstrip(" .;,")

def is_cn_doi(d):
    # Accesión interna de Cochrane CENTRAL (10.1002/central/cn-XXXXXXXX): NO es un DOI real.
    # Se conserva visible pero NO se usa para emparejar (ni fusionar ni regla de oro).
    return bool(d) and d.startswith("10.1002/central/cn-")

def match_doi(d):
    # DOI utilizable para el emparejamiento: el CN de Cochrane se trata como "sin DOI".
    return "" if is_cn_doi(d) else d

def norm_eid(s):
    # ID de registro de Embase (PUI). Embase lo da en U2 con prefijo "L" (L643991551);
    # CENTRAL referencia el MISMO id en C3 ("EMBASE 643991551") sin la "L". Se canoniza a
    # sólo dígitos para que un registro de CENTRAL case con su gemelo de Embase por identificador
    # (referencia cruzada de la propia Cochrane), no por parecido de título/abstract.
    m = re.fullmatch(r"[Ll]?(\d{6,})", (s or "").strip())
    return m.group(1) if m else ""

_NCT_RE = re.compile(r"NCT0*(\d{6,8})", re.I)
def extract_nct(*texts):
    # Nº de registro de ensayo clínico (ClinicalTrials.gov). Un mismo ensayo aparece con
    # títulos muy distintos entre bases; el NCT los reconcilia. Se busca en título, resumen,
    # enlace (clinicaltrials.gov), accesión de Embase (LNCT…) y DOI. Devuelve forma canónica
    # NCT + 8 dígitos con ceros a la izquierda (NCT02050451).
    for t in texts:
        m = _NCT_RE.search(t or "")
        if m: return "NCT" + m.group(1).zfill(8)
    return ""

def first4(s):
    m = re.search(r"(\d{4})", s or ""); return m.group(1) if m else ""

def first_author_last(auth):
    # Primer APELLIDO del primer autor (lo único que llega fiable entre bases; el nombre suele
    # venir solo como inicial). Tres formas habituales:
    #   "Smith, John"  (coma) -> apellido = lo anterior a la coma
    #   "Smith JA"     (MEDLINE/Embase: apellido + iniciales, sin coma) -> apellido = 1er token
    #   "John Smith"   (BibTeX: nombre + apellido, sin coma) -> apellido = último token
    # Distinción sin coma: si el ÚLTIMO token son iniciales (<=3 letras en mayúsculas, p. ej. "JA",
    # "J.A."), el apellido es TODO lo anterior (conserva apellidos compuestos: "de la Cruz M" ->
    # "de la cruz", "Von Neumann J" -> "von neumann", "Smith JA" -> "smith"); si el último token es
    # una palabra completa, es "Nombre Apellido" y el apellido va al final ("John Smith" -> "smith").
    if not auth: return ""
    a = (auth[0] or "").strip()
    if "," in a:
        surname = a.split(",")[0]
    else:
        parts = a.split()
        if len(parts) <= 1:
            surname = parts[0] if parts else a
        else:
            bare = parts[-1].replace(".", "")
            surname = " ".join(parts[:-1]) if (0 < len(bare) <= 3 and bare.isupper()) else parts[-1]
    return norm_title(surname)

def title_sim(a, b):
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb: return 0.0
    return len(sa & sb) / len(sa | sb)

# Jaro-Winkler (nivel de carácter): complementa al Jaccard de palabras. Pilla variaciones de
# escritura que el Jaccard penaliza (guiones "pre-habilitation" vs "prehabilitation", erratas,
# una palabra distinta). Sin dependencias y con las MISMAS operaciones que normalize.js para
# que Python y JS den el mismo float (sólo se compara contra umbral, nunca se formatea en la
# salida compartida, así la paridad no depende del redondeo).
def jaro(s1, s2):
    if s1 == s2: return 1.0
    l1, l2 = len(s1), len(s2)
    if l1 == 0 or l2 == 0: return 0.0
    md = max(l1, l2) // 2 - 1
    m1 = [False] * l1; m2 = [False] * l2; matches = 0
    for i in range(l1):
        for j in range(max(0, i - md), min(i + md + 1, l2)):
            if m2[j] or s1[i] != s2[j]: continue
            m1[i] = m2[j] = True; matches += 1; break
    if matches == 0: return 0.0
    t = 0; k = 0
    for i in range(l1):
        if not m1[i]: continue
        while not m2[k]: k += 1
        if s1[i] != s2[k]: t += 1
        k += 1
    t //= 2
    return (matches / l1 + matches / l2 + (matches - t) / matches) / 3

def jaro_winkler(s1, s2, p=0.1):
    j = jaro(s1, s2); pref = 0
    for i in range(min(4, len(s1), len(s2))):
        if s1[i] == s2[i]: pref += 1
        else: break
    return j + pref * p * (1 - j)

# Guardarraíl "≥2 identificadores en conflicto": las reglas de señal blanda (abstract,
# título+año, título+autor+año~) pueden emparejar dos obras DISTINTAS con metadatos casi
# iguales (artículo y su reseña en otra revista, dos entregas de una serie...). Antes de
# fusionar por esas reglas se comparan los campos duros DOI (normalizado), volumen y página
# inicial: un campo cuenta como conflicto SOLO si ambos registros lo traen no vacío y
# difiere (vacío en uno de los dos NO es conflicto). Con 2 o más en conflicto no se
# fusiona: el par va a revisión. Las reglas 1/4/6 no lo necesitan (sus campos duros ya
# coinciden por definición).
def hard_conflict_fields(a, b):
    out = []
    # doi completo (incluye el CN de Cochrane): dos identificadores distintos = conflicto.
    if a["doi"] and b["doi"] and a["doi"] != b["doi"]: out.append("doi")
    if a["volume"] and b["volume"] and a["volume"] != b["volume"]: out.append("vol")
    if a["start_page"] and b["start_page"] and a["start_page"] != b["start_page"]: out.append("pag")
    return out

def hard_conflict(a, b):
    return len(hard_conflict_fields(a, b)) >= 2

def doi_conflict(a, b):
    # Regla de oro: dos DOI presentes y DISTINTOS => publicaciones distintas, siempre.
    # Aunque sean el mismo abstract en dos sitios, dos DOI = dos obras (práctica bibliotecaria):
    # se conservan ambos y, ordenados por título, quedan juntos para revisarlos. Anula las reglas
    # de INFERENCIA (abstract, título+año, título+autor+año~, estructural). No anula PMID (regla 1,
    # identificador autoritativo) ni DOI+título (regla 4, que exige el MISMO DOI).
    # Usa el doi COMPLETO (incluye el CN de Cochrane): dos identificadores presentes y
    # distintos = obras distintas = conservar ambos. (El CN no sirve para FUSIONAR —regla 4,
    # que usa mdoi—, pero dos CN distintos sí son "dos registros distintos": tu regla.)
    return bool(a["doi"] and b["doi"] and a["doi"] != b["doi"])

# Prefijos que marcan un documento editorial RELACIONADO (no duplicado): réplica, comentario,
# fe de erratas. Título del artículo + su respuesta/erratum se PARECEN pero NO se fusionan.
_COMMENT_RE = re.compile(
    r"^\s*(re|reply|response to|author'?s?\s+reply|comment(ary)?\s+(on|to)|"
    r"editorial\s+comment|letter\s+to\s+the\s+editor|erratum|corrigendum|correction(s)?(\s+to)?)\b",
    re.I)
def comment_kind(title):
    m = _COMMENT_RE.match(strip_accents(title or ""))
    if not m: return None
    w = m.group(1).lower()
    if w.startswith(("erratum", "corrigendum", "correction")): return "artículo + fe de erratas/corrección"
    return "artículo + respuesta/comentario"

# ------------------------------------------------------------------ record model
def rec(source, title="", doi="", year="", authors=None, journal="", volume="",
        issue="", spage="", pmid="", abstract="", extra=None, url="", accession="", ptypes=None,
        eid=""):
    return {"source": source, "title": (title or "").strip(),
            "ntitle": norm_title(title), "doi": norm_doi(doi), "year": first4(year),
            "authors": authors or [], "fauthor": first_author_last(authors or []),
            "journal": (journal or "").strip(),
            "volume": (volume or "").strip(), "issue": (issue or "").strip(),
            "spage": (spage or "").strip(), "start_page": (spage or "").split("-")[0].strip(),
            "pmid": (pmid or "").strip(),
            # eid: ID de registro de Embase de EMPAREJAMIENTO (canonizado a dígitos). Casa un
            # registro de CENTRAL con su gemelo de Embase por identificador (ver norm_eid).
            "eid": norm_eid(eid),
            # mdoi: DOI de EMPAREJAMIENTO (el CN de Cochrane cuenta como "sin DOI").
            "mdoi": match_doi(norm_doi(doi)),
            # nct: nº de ensayo clínico, reconciliado desde varios campos.
            "nct": extract_nct(title, abstract, url, accession, doi, journal),
            # url/accession: enlace al registro en la base de origen y su nº de accesión
            # (Embase UR/U2, etc.). Puramente informativos (verificación y Excel);
            # NO participan en el emparejamiento salvo el NCT que sí sale de accession/url.
            "url": (url or "").strip(), "accession": (accession or "").strip(),
            # ptypes: tipología documental declarada por la base (PubMed PT / Embase M3).
            # Autoridad para el clasificador de tipo de estudio; [] si la base no la da.
            "ptypes": [p.strip() for p in (ptypes or []) if p and p.strip()],
            "abstract": (abstract or "").strip(), "nabs": norm_title(abstract),
            "also_in": [], "extra": extra or {}}

# ------------------------------------------------------------------ parsers
def parse_ris(text, source):
    out = []
    for block in re.split(r"(?=^TY\s{2}- )", text, flags=re.M):
        if "TY" not in block: continue
        f, cur = {}, None
        for line in block.splitlines():
            m = re.match(r"^([A-Z0-9]{2})\s{2}-\s?(.*)$", line)
            if m:
                cur = m.group(1); f.setdefault(cur, []).append(m.group(2).strip())
            elif cur and line.strip():
                f[cur][-1] += " " + line.strip()
        if not f: continue
        if "ER" not in f:
            # bloque truncado sin ER: se conserva si tiene título (registro real de un export
            # truncado, nunca perder referencias sin avisar); sin título es fragmento sin sustancia
            titulo = (f.get("TI") or f.get("T1") or [""])[0]
            if not titulo.strip(): continue
            print("AVISO: registro sin terminador ER conservado (¿export truncado?): %s"
                  % titulo[:60], file=sys.stderr)
        def g(*tags):
            for t in tags:
                if f.get(t): return f[t][0]
            return ""
        doi = g("DO", "DI")
        if not doi:
            for t in ("L3", "M3", "UR", "N1", "AID"):
                for v in f.get(t, []):
                    mm = re.search(r"10\.\d{4,9}/\S+", v)
                    if mm: doi = mm.group(0); break
                if doi: break
        # PMID: puede venir en AN (numérico), en Embase en C5, o en CENTRAL dentro de C3
        # ("PUBMED 38507156,EMBASE 2029064766"). Se toma el primero disponible; así un
        # registro de CENTRAL casa con su gemelo de PubMed por PMID y el CN no interviene.
        pmid = next((v for v in (g("AN"), g("C5")) if re.fullmatch(r"\d+", v)), "")
        if not pmid:
            mc3 = re.search(r"PUBMED\s+(\d+)", " ".join(f.get("C3", [])), re.I)
            if mc3: pmid = mc3.group(1)
        # Enlace al registro en la base y nº de accesión (Embase: UR + U2).
        url = g("UR", "L1"); accession = g("U2", "AN")
        # ID de Embase de emparejamiento: Embase lo da en U2 con prefijo L (L643991551);
        # CENTRAL referencia el mismo id en C3 ("EMBASE 643991551"). norm_eid canoniza a dígitos.
        eid = g("U2") if re.fullmatch(r"[Ll]\d{6,}", g("U2") or "") else ""
        if not eid:
            mc3e = re.search(r"EMBASE\s+(\d{6,})", " ".join(f.get("C3", [])), re.I)
            if mc3e: eid = mc3e.group(1)
        # Tipología documental (Embase M3 / CENTRAL M3): puede venir compuesta ("Journal
        # article; Conference proceeding"); se separa por ';'.
        ptypes = [p for v in (f.get("M3", []) + f.get("PT", [])) for p in v.split(";")]
        out.append(rec(source, title=g("TI", "T1"), doi=doi, year=g("PY", "Y1", "DA"),
                       authors=f.get("AU", f.get("A1", [])), journal=g("JO", "JF", "T2", "JA"),
                       volume=g("VL"), issue=g("IS"), spage=g("SP"),
                       pmid=pmid, abstract=g("AB", "N2"), url=url, accession=accession,
                       ptypes=ptypes, eid=eid))
    return out

def parse_medline(text, source):
    out = []
    for block in re.split(r"\n\s*\n", text):
        if "TI  -" not in block and "TI-" not in block: continue
        f, cur = {}, None
        for line in block.splitlines():
            m = re.match(r"^([A-Z]{2,4})\s*- (.*)$", line)
            if m:
                cur = m.group(1); f.setdefault(cur, []).append(m.group(2))
            elif line.startswith("      ") and cur:
                f[cur][-1] += " " + line.strip()
        if not f: continue
        doi = ""
        for t in ("LID", "AID"):
            for v in f.get(t, []):
                if "[doi]" in v.lower(): doi = v.lower().replace("[doi]", "").strip(); break
            if doi: break
        out.append(rec(source, title=" ".join(f.get("TI", [])), doi=doi,
                       year=(f.get("DP", [""])[0]), authors=f.get("FAU", f.get("AU", [])),
                       journal=(f.get("JT") or f.get("TA") or [""])[0],
                       volume=(f.get("VI", [""])[0]), issue=(f.get("IP", [""])[0]),
                       spage=(f.get("PG", [""])[0]), pmid=(f.get("PMID", [""])[0]).strip(),
                       abstract=" ".join(f.get("AB", [])), ptypes=f.get("PT", [])))
    return out

def parse_pubmed_xml(text, source):
    out = []
    root = ET.fromstring(text)
    for art in root.iter("PubmedArticle"):
        pmid = (art.findtext(".//PMID") or "").strip()
        title = "".join(art.find(".//ArticleTitle").itertext()) if art.find(".//ArticleTitle") is not None else ""
        doi = ""
        for eid in art.iter("ELocationID"):
            if eid.get("EIdType") == "doi": doi = (eid.text or "").strip()
        if not doi:
            for aid in art.iter("ArticleId"):
                if aid.get("IdType") == "doi": doi = (aid.text or "").strip()
        year = art.findtext(".//PubDate/Year") or art.findtext(".//PubDate/MedlineDate") or ""
        authors = []
        for a in art.iter("Author"):
            ln, fn = a.findtext("LastName"), a.findtext("ForeName")
            if ln: authors.append(f"{ln}, {fn}" if fn else ln)
        ab = " ".join("".join(x.itertext()) for x in art.iter("AbstractText"))
        j = art.findtext(".//Journal/Title") or art.findtext(".//ISOAbbreviation") or ""
        out.append(rec(source, title=title, doi=doi, year=year, authors=authors,
                       journal=j, volume=art.findtext(".//JournalIssue/Volume") or "",
                       issue=art.findtext(".//JournalIssue/Issue") or "",
                       spage=art.findtext(".//Pagination/StartPage") or
                             (art.findtext(".//MedlinePgn") or "").split("-")[0],
                       pmid=pmid, abstract=ab))
    return out

def parse_bibtex(text, source):
    out = []
    for m in re.finditer(r"@\w+\s*\{", text):
        start = m.end(); depth = 1; i = start
        while i < len(text) and depth:
            if text[i] == "{": depth += 1
            elif text[i] == "}": depth -= 1
            i += 1
        body = text[start:i-1]
        fields = {}
        for fm in re.finditer(r"(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|\"[^\"]*\"|[^,\n]+)", body):
            key = fm.group(1).lower(); val = fm.group(2).strip().strip("{}").strip('"').strip()
            fields[key] = re.sub(r"\s+", " ", val)
        if not fields.get("title"): continue
        auth = [a.strip() for a in re.split(r"\s+and\s+", fields.get("author", "")) if a.strip()]
        out.append(rec(source, title=fields.get("title", ""), doi=fields.get("doi", ""),
                       year=fields.get("year", ""), authors=auth,
                       journal=fields.get("journal", fields.get("journaltitle", "")),
                       volume=fields.get("volume", ""), issue=fields.get("number", ""),
                       spage=(fields.get("pages", "").split("-")[0].replace("-", "")),
                       pmid=fields.get("pmid", ""), abstract=fields.get("abstract", "")))
    return out

def parse_csv(text, source):
    out = []
    try: dialect = csv.Sniffer().sniff(text[:4096], delimiters=";,\t")
    except Exception: dialect = csv.excel
    reader = csv.DictReader(text.splitlines(), dialect=dialect)
    def pick(row, *names):
        low = {k.lower().strip(): v for k, v in row.items() if k}
        for n in names:
            for k, v in low.items():
                if n in k: return v
        return ""
    for row in reader:
        title = pick(row, "title", "titulo", "título", "article title")
        if not title: continue
        auth = pick(row, "author", "autor")
        out.append(rec(source, title=title, doi=pick(row, "doi"),
                       year=pick(row, "year", "año", "publication year", "date"),
                       authors=[a.strip() for a in re.split(r"[;|]", auth) if a.strip()],
                       journal=pick(row, "journal", "revista", "source"),
                       volume=pick(row, "volume", "volumen"), issue=pick(row, "issue", "número", "numero"),
                       spage=pick(row, "start page", "página", "pagina", "beginning page"),
                       pmid=pick(row, "pmid"), abstract=pick(row, "abstract", "resumen")))
    return out

def detect_format(path):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".nbib", ".medline"): return "medline"
    if ext == ".xml": return "pubmed_xml"
    if ext == ".bib": return "bibtex"
    if ext == ".csv": return "csv"
    if ext in (".ris",): return "ris"
    # .txt u otros: sniff
    head = open(path, encoding="utf-8", errors="replace").read(2000)
    if re.search(r"^TY\s{2}- ", head, re.M): return "ris"
    if re.search(r"^PMID- ", head, re.M): return "medline"
    if "<PubmedArticle" in head: return "pubmed_xml"
    if re.search(r"^@\w+\s*\{", head, re.M): return "bibtex"
    if _parece_tabla(head): return "csv"
    return None

def _parece_tabla(head):
    # tabular de verdad: 2+ líneas con el mismo nº de separadores (,;\t) — si no, no es CSV
    lineas = head.splitlines()
    if len(head) == 2000: lineas = lineas[:-1]   # última línea partida por el corte de lectura
    lineas = [l for l in lineas if l.strip()][:5]
    if len(lineas) < 2: return False
    for sep in (",", ";", "\t"):
        cols = [l.count(sep) for l in lineas]
        if cols[0] >= 1 and len(set(cols)) == 1:
            return True
    return False

PARSERS = {"ris": parse_ris, "medline": parse_medline, "pubmed_xml": parse_pubmed_xml,
           "bibtex": parse_bibtex, "csv": parse_csv}

# ------------------------------------------------------------------ fusión
def is_abstract_page(x):   # página tipo e824 / S76 / A12 -> abstract de reunión o suplemento
    return bool(re.match(r"^[A-Za-z]\d", x["spage"] or ""))

def pub_rank(x):   # cuánto de "versión de número publicada" es (vs online-first / abstract de reunión)
    r = 0.0
    if x["volume"]: r += 1
    if x["spage"]:
        r += 1
        if is_abstract_page(x): r -= 1.5   # página de suplemento/reunión (S76, e824) = abstract, pesa menos
    if x["pmid"]: r += 1
    if x["doi"]: r += 0.5
    if len(x["nabs"]) >= 150: r += 0.5
    return r

def merge_record(keeper, other):
    # Preferir la versión de número PUBLICADA (no online-first ni abstract de suplemento).
    # Si 'other' es más "publicada" que 'keeper', el superviviente adopta su identidad;
    # si no, solo se rellenan huecos.
    adopt = pub_rank(other) > pub_rank(keeper)
    fields = ("title", "ntitle", "year", "doi", "volume", "issue", "spage",
              "journal", "pmid", "eid", "abstract", "nabs", "fauthor", "authors")
    for f in fields:
        if other[f] and (adopt or not keeper[f]):
            keeper[f] = other[f]
    # Unir la tipología documental de ambas bases (una puede decir "Article" y la otra "RCT"):
    # el superviviente hereda todas, para que el clasificador escoja la más específica.
    seen = set(keeper["ptypes"])
    keeper["ptypes"] += [p for p in other["ptypes"] if not (p in seen or seen.add(p))]

# ------------------------------------------------------------------ dedup
def dedup(records, merge_thr=0.5, review_thr=0.3, prio=None):
    prio = prio or {}
    records = sorted(records, key=lambda r: prio.get(r["source"], 99))
    kept, removed, review = [], [], []
    by_pmid, by_doi, by_title, by_author, by_year, by_struct = {}, {}, {}, {}, {}, {}
    by_nct, by_eid = {}, {}
    def struct_of(r):
        # Clave bibliográfica INDEPENDIENTE del nombre de la revista (que puede venir abreviado
        # distinto entre bases): mismo volumen + página inicial + primer autor + año. Dos artículos
        # distintos no empiezan en la misma página del mismo volumen. Capta traducciones (título en
        # corchetes de PubMed vs directo de Embase) aunque no compartan abstract.
        return (r["volume"], r["start_page"], r["fauthor"], r["year"]) \
            if r["volume"] and r["start_page"] and r["fauthor"] and r["year"] else None
    def register(r):
        if r["pmid"]: by_pmid[r["pmid"]] = r
        if r["eid"]: by_eid[r["eid"]] = r
        if r["mdoi"]: by_doi.setdefault(r["mdoi"], []).append(r)
        if r["ntitle"] and len(r["ntitle"]) >= 25: by_title[(r["ntitle"], r["year"])] = r
        if r["fauthor"]: by_author.setdefault(r["fauthor"], []).append(r)
        if r["year"]: by_year.setdefault(r["year"], []).append(r)
        if r["nct"]: by_nct.setdefault(r["nct"], []).append(r)
        sk = struct_of(r)
        if sk: by_struct.setdefault(sk, r)
    def year_ok(a, b, tol=1):
        if not a["year"] or not b["year"]: return False
        try: return abs(int(a["year"]) - int(b["year"])) <= tol
        except ValueError: return False
    _REGISTRY_RE = re.compile(r"clinicaltrials\.gov|isrctn|eudract|who\s*ictrp|"
                              r"trial\s*regist|drks|anzctr|chictr|\bctri\b|jprn|\bumin\b", re.I)
    def is_registry(x):        # registro de ensayo (brazo aparte en PRISMA)
        if _REGISTRY_RE.search(x["journal"] or ""): return True
        return bool(re.search(r"\b(NCT\d{6,}|ISRCTN\d{6,}|EudraCT)\b", x["title"] or ""))
    def is_conf_abstract(x):   # abstract de congreso (página e/S, suplemento, o DOI de congreso)
        if is_abstract_page(x): return True
        if re.search(r"suppl|abstract", x["journal"] or "", re.I): return True
        return bool(re.search(r"_suppl|meeting[-_ ]?abstract", x["doi"] or "", re.I))
    def rec_kind(x):
        if is_registry(x): return "registry"
        if is_conf_abstract(x): return "abstract"
        return "article"
    def kind_block(r, c):
        # None = mismo tipo, se pueden fusionar; "registry" = registro aparte, nunca fusionar ni revisar;
        # "abs_vs_art" = abstract de congreso vs artículo -> revisar (misma obra, venue distinto)
        kr, kc = rec_kind(r), rec_kind(c)
        if kr == kc: return None
        if "registry" in (kr, kc): return "registry"
        return "abs_vs_art"
    def merge_into(keeper, other):
        merge_record(keeper, other)
        register(keeper)  # reindexar por si cambió doi/título/año
    def candidates(r):
        c = []
        if r["pmid"] and r["pmid"] in by_pmid: c.append(by_pmid[r["pmid"]])
        if r["eid"] and r["eid"] in by_eid: c.append(by_eid[r["eid"]])
        if r["mdoi"]: c += by_doi.get(r["mdoi"], [])
        if r["nct"]: c += by_nct.get(r["nct"], [])
        if r["fauthor"]: c += by_author.get(r["fauthor"], [])
        if r["year"]:
            c += by_year.get(r["year"], [])
            try:
                yi = int(r["year"]); c += by_year.get(str(yi-1), []) + by_year.get(str(yi+1), [])
            except ValueError: pass
        sk = struct_of(r)
        if sk and sk in by_struct: c.append(by_struct[sk])
        seen, uniq = set(), []
        for x in c:
            if id(x) not in seen: seen.add(id(x)); uniq.append(x)
        return uniq

    for r in records:
        dup = reason = unsure = ureason = None
        cands = candidates(r)
        # 1) PMID o ID de Embase (identificadores autoritativos: mismo id = mismo registro).
        #    El ID de Embase reconcilia CENTRAL con su gemelo de Embase (referencia cruzada de Cochrane).
        for c in cands:
            if r["pmid"] and c["pmid"] == r["pmid"]: dup, reason = c, "PMID"; break
            if r["eid"] and c["eid"] == r["eid"]: dup, reason = c, "ID de Embase"; break
        # 2) abstract casi idéntico (>=150 car.) -> señal fuerte, cruza DOI/año/título.
        #    PERO exige título afín (>=0,5) o mismo primer autor: evita fusionar una carta/respuesta/
        #    comentario que reproduce el abstract del artículo comentado (autor distinto -> a revisión).
        if not dup and len(r["nabs"]) >= 150:
            ab_border = ab_reason = None
            for c in cands:
                if len(c["nabs"]) >= 150 and title_sim(r["nabs"], c["nabs"]) >= 0.85:
                    kb = kind_block(r, c)
                    if kb == "registry": continue            # registro de ensayo: aparte, ni fusiona ni revisa
                    if doi_conflict(r, c):   # regla de oro: DOIs distintos => conservar ambos, pero ANOTAR
                        if ab_border is None:
                            ab_border, ab_reason = c, "abstract casi idéntico pero DOIs distintos — posible duplicado (conservar ambos)"
                        continue
                    cmix = bool(comment_kind(r["title"])) != bool(comment_kind(c["title"]))
                    if not cmix and kb is None and (title_sim(r["ntitle"], c["ntitle"]) >= 0.5 or (r["fauthor"] and r["fauthor"] == c["fauthor"])):
                        if hard_conflict(r, c):   # guardarraíl: ≥2 identificadores duros discrepan
                            if ab_border is None:
                                ab_border = c
                                ab_reason = ("abstract casi idéntico pero ≥2 identificadores (%s) discrepantes (revisar)"
                                             % "+".join(hard_conflict_fields(r, c)))
                            continue
                        dup, reason = c, "abstract"; break     # mismo tipo (abstract-abstract o artículo-artículo)
                    elif ab_border is None:
                        ab_border = c
                        k = comment_kind(r["title"]) or comment_kind(c["title"])
                        ab_reason = (f"{k} (mantener ambos)" if k
                            else "abstract casi idéntico: abstract de congreso vs artículo (revisar)" if kb == "abs_vs_art"
                            else "abstract casi idéntico pero título/autor distintos (¿respuesta/comentario?)")
            if not dup and ab_border is not None and unsure is None:
                unsure, ureason = ab_border, ab_reason
        # 3) título + año exactos (con guardarraíl: un título idéntico en revista/volumen/DOI
        #    distintos puede ser el artículo y su reseña o reimpresión -> a revisión)
        if not dup and r["ntitle"] and len(r["ntitle"]) >= 25 and (r["ntitle"], r["year"]) in by_title:
            c = by_title[(r["ntitle"], r["year"])]
            if doi_conflict(r, c):
                # regla de oro: DOI distintos => obras distintas. No se fusiona, pero un título+año
                # idénticos con DOIs distintos es un posible duplicado (revista que cambia de prefijo
                # DOI, misma obra en dos venues...) -> se conserva y se ANOTA (no se descarta en silencio).
                if unsure is None:
                    unsure, ureason = c, "título+año idénticos pero DOIs distintos — posible duplicado (conservar ambos)"
            elif hard_conflict(r, c):
                if unsure is None:
                    unsure, ureason = c, ("título+año idénticos pero ≥2 identificadores (%s) discrepantes (revisar)"
                                          % "+".join(hard_conflict_fields(r, c)))
            else:
                dup, reason = c, "título+año"
        # 4) DOI + título parecido (mdoi: el CN de Cochrane no casa aquí)
        if not dup and r["mdoi"] and r["mdoi"] in by_doi:
            best, bs = None, 0.0
            for c in by_doi[r["mdoi"]]:
                s = title_sim(r["ntitle"], c["ntitle"])
                if s > bs: bs, best = s, c
            if best is not None:
                if bs >= merge_thr: dup, reason = best, "DOI+título"
                elif bs >= review_thr: unsure, ureason = best, f"DOI igual, título similar {bs:.2f}"
                # bs < review_thr -> DOI compartido, título distinto: NO es duplicado (abstract congreso)
        # 5) mismo primer autor + título alto:
        #    - año ±1 y título ≥0,85 -> fusiona (online-first vs número)
        #    - años distantes y título ≥0,90 -> REVISAR (¿abstract de congreso vs artículo completo posterior?)
        if not dup:
            for c in cands:
                if not (r["fauthor"] and c["fauthor"] == r["fauthor"]): continue
                s = title_sim(r["ntitle"], c["ntitle"])
                if doi_conflict(r, c):   # regla de oro: DOIs distintos => conservar ambos, pero ANOTAR si son afines
                    if s >= 0.70 and not unsure:
                        unsure, ureason = c, f"título {s:.2f}+mismo autor pero DOIs distintos — posible duplicado (conservar ambos)"
                    continue
                if year_ok(r, c):
                    if s >= 0.85:
                        kb = kind_block(r, c)
                        if kb == "abs_vs_art":   # abstract de congreso vs artículo -> revisar
                            if not unsure:
                                unsure, ureason = c, f"título {s:.2f}+mismo autor, abstract de congreso vs artículo (¿misma obra? mantener/enlazar)"
                        elif kb is None:         # mismo tipo (online-first vs número) -> fusiona
                            if hard_conflict(r, c):   # guardarraíl: ≥2 identificadores duros discrepan
                                if not unsure:
                                    unsure, ureason = c, ("título %.2f+autor+año~ pero ≥2 identificadores (%s) discrepantes (revisar)"
                                                          % (s, "+".join(hard_conflict_fields(r, c))))
                            else:
                                dup, reason = c, "título+autor+año~"; break
                        # kb == registry -> lo bloquea el catch-all de registro
                    elif s >= 0.70 and not unsure:
                        unsure, ureason = c, f"título {s:.2f}+autor+año~ (revisar)"
                elif s >= 0.90 and not unsure:
                    unsure, ureason = c, f"título casi idéntico {s:.2f}+mismo autor, años distintos (¿abstract de congreso vs artículo?)"
        # 6) identidad bibliográfica: mismo volumen+página inicial+primer autor+año (sin depender del
        #    nombre de la revista). Clave casi única. Si además el título es afín o el abstract casa
        #    -> fusiona (capta traducciones con título en corchetes); si el título diverge mucho
        #    -> a revisión (podría ser colisión o dato raro): nunca fusionar a ciegas.
        sk = struct_of(r)
        if not dup and not unsure and sk and sk in by_struct:
            c = by_struct[sk]
            # Regla de oro: DOI presentes y distintos => obras distintas. La clave estructural
            # (mismo volumen+página) es una coincidencia frágil entre abstracts de un mismo
            # suplemento; un DOI en conflicto la anula (ni fusión ni revisión). Caso real: dos
            # abstracts consecutivos en la página e561 de un suplemento con DOIs .../02.1563 y
            # .../02.1564 -> obras distintas, NO anotar (sería un falso "posible duplicado").
            # No es una decisión silenciosa que pierda un duplicado real: si estos dos fueran la
            # misma obra con una errata en el DOI, compartirían título y los capta la REGLA 7
            # (título casi idéntico), que corre a continuación. Justificar así en Métodos.
            # Las coincidencias por señal FUERTE (título+año idénticos, abstract casi idéntico) sí
            # van a revisión aunque el DOI difiera (misma obra en dos venues) — reglas 2/3/5.
            if r["doi"] and c["doi"] and r["doi"] != c["doi"]:
                pass
            else:
                ab_ok = len(r["nabs"]) >= 150 and len(c["nabs"]) >= 150 and title_sim(r["nabs"], c["nabs"]) >= 0.85
                if title_sim(r["ntitle"], c["ntitle"]) >= 0.5 or ab_ok:
                    dup, reason = c, "vol+pág+autor+año"
                else:
                    unsure, ureason = c, f"mismo vol+pág+autor+año pero títulos distintos {title_sim(r['ntitle'], c['ntitle']):.2f} (revisar)"
        # 6.5) mismo nº de ensayo clínico (NCT): posible duplicado, SIEMPRE conservar ambos.
        #      Un ensayo genera varias publicaciones (protocolo, resultados, análisis secundario)
        #      que comparten NCT sin ser el mismo artículo -> nunca se fusiona, se anota. El
        #      registro de ClinicalTrials.gov en sí (is_registry) va a su brazo aparte, no aquí.
        if not dup and not unsure and r["nct"]:
            for c in by_nct.get(r["nct"], []):
                if c is r or kind_block(r, c) == "registry": continue
                unsure, ureason = c, f"mismo ensayo clínico ({r['nct']}) — posible duplicado (conservar ambos)"; break
        # 7) título casi idéntico -> dudoso. Señal doble: Jaccard de palabras >=0,9 O Jaro-Winkler
        #    >=0,95 (este último pilla variaciones de escritura: guiones, erratas, una palabra). Si
        #    los DOIs reales difieren, es la regla de oro: posible duplicado que se conserva.
        if not dup and not unsure and r["ntitle"] and len(r["ntitle"]) >= 25:
            for c in by_year.get(r["year"], []):
                if (r["ntitle"], r["year"]) == (c["ntitle"], c["year"]): continue
                s = title_sim(r["ntitle"], c["ntitle"])
                jwok = s < 0.9 and jaro_winkler(r["ntitle"], c["ntitle"]) >= 0.95
                if s >= 0.9 or jwok:
                    kind = comment_kind(r["title"]) or comment_kind(c["title"])
                    if kind:
                        unsure, ureason = c, f"{kind} (mantener ambos)"
                    elif doi_conflict(r, c):
                        unsure, ureason = c, ("títulos casi idénticos (variación de escritura) pero DOIs distintos — posible duplicado (conservar ambos)"
                                              if jwok else f"mismo título {s:.2f} pero DOIs distintos — posible duplicado (conservar ambos)")
                    elif jwok:
                        unsure, ureason = c, "títulos casi idénticos (variación de escritura, Jaro-Winkler) — posible duplicado (sin DOI/PMID/autor común)"
                    else:
                        unsure, ureason = c, f"título casi idéntico {s:.2f} (sin DOI/PMID/autor común)"
                    break

        # Registro de ensayo (clinicaltrials.gov, NCT…) SIEMPRE aparte (brazo PRISMA propio):
        # anula cualquier fusión con un artículo/abstract, gane la regla que gane.
        if dup is not None and kind_block(r, dup) == "registry":
            dup = reason = None

        if dup is not None:
            if r["source"] not in dup["also_in"] and r["source"] != dup["source"]:
                dup["also_in"].append(r["source"])
            merge_into(dup, r)   # el superviviente adopta la versión publicada / rellena huecos
            removed.append((r, dup, reason))
        else:
            if unsure is not None: review.append((r, unsure, ureason))
            kept.append(r); register(r)
    return kept, removed, review

# ------------------------------------------------------------------ salida
def ris_escape(s): return re.sub(r"\s+", " ", (s or "").strip())

def write_ris(recs, path):
    with open(path, "w", encoding="utf-8") as g:
        for r in recs:
            g.write("TY  - JOUR\n")
            if r["title"]: g.write(f"TI  - {ris_escape(r['title'])}\n")
            for a in r["authors"]: g.write(f"AU  - {ris_escape(a)}\n")
            if r["year"]: g.write(f"PY  - {r['year']}\n")
            if r["journal"]: g.write(f"JO  - {ris_escape(r['journal'])}\n")
            if r["volume"]: g.write(f"VL  - {r['volume']}\n")
            if r["issue"]: g.write(f"IS  - {r['issue']}\n")
            if r["spage"]: g.write(f"SP  - {r['spage']}\n")
            if r["abstract"]: g.write(f"AB  - {ris_escape(r['abstract'])}\n")
            if r["doi"]: g.write(f"DO  - {r['doi']}\n")
            if r["pmid"]: g.write(f"AN  - {r['pmid']}\n")
            if r["extra"].get("nota"): g.write(f"N1  - {ris_escape(r['extra']['nota'])}\n")
            srcs = "; ".join([r["source"]] + r["also_in"])
            g.write(f"DB  - {srcs}\n")
            g.write("ER  - \n\n")

def write_dupes_csv(removed, path):
    with open(path, "w", encoding="utf-8", newline="") as g:
        w = csv.writer(g)
        w.writerow(["motivo", "fuente_retirada", "titulo_retirado", "doi_retirado", "año_retirado",
                    "fuente_conservada", "titulo_conservado", "doi_conservado"])
        for r, keptr, reason in sorted(removed, key=lambda x: x[0]["source"]):
            w.writerow([reason, r["source"], r["title"], r["doi"], r["year"],
                        keptr["source"], keptr["title"], keptr["doi"]])

def write_review_csv(review, path):
    with open(path, "w", encoding="utf-8", newline="") as g:
        w = csv.writer(g)
        w.writerow(["n", "motivo_duda", "fuente_A", "titulo_A", "doi_A", "año_A",
                    "fuente_B", "titulo_B", "doi_B", "año_B"])
        for n, (r, other, reason) in enumerate(review, 1):
            w.writerow([n, reason, r["source"], r["title"], r["doi"], r["year"],
                        other["source"], other["title"], other["doi"], other["year"]])

def write_report(sources_counts, kept, removed, review, path, decisiones_resumen=None):
    # decisiones_resumen: {decisión: nº} de la pasada con --decisiones, o None
    # (pasada normal -> informe byte-idéntico al de siempre, la paridad lo compara)
    total = sum(sources_counts.values())
    by_reason = {}
    for _, _, reason in removed:
        key = reason.split(" ")[0]; by_reason[key] = by_reason.get(key, 0) + 1
    names = list(sources_counts)
    overlap = {}
    for i in range(len(names)):
        for j in range(i+1, len(names)):
            a, b = names[i], names[j]; overlap[f"{a} ∩ {b}"] = 0
    for r in kept:
        srcs = set([r["source"]] + r["also_in"])
        for k in overlap:
            a, b = k.split(" ∩ ")
            if {a, b} <= srcs: overlap[k] += 1
    with open(path, "w", encoding="utf-8") as g:
        g.write("# Informe de deduplicación\n\n")
        g.write("Método conservador: PMID · título+año · DOI+título (Jaccard≥umbral) · revista+vol+nº+pág. "
                "El **DOI solo NO fusiona** (los abstracts de congreso comparten el DOI del suplemento). "
                "Los emparejamientos dudosos se apartan a `revisar.csv` y **no** se fusionan.\n\n")
        g.write("## Números (para PRISMA)\n\n| Fuente | Registros identificados |\n|---|---|\n")
        for s, n in sources_counts.items(): g.write(f"| {s} | {n} |\n")
        g.write(f"| **Total** | **{total}** |\n\n")
        g.write(f"- **Duplicados retirados: {len(removed)}** ({by_reason})\n")
        if decisiones_resumen:
            detalle = " · ".join(f"{k}: {v}" for k, v in sorted(decisiones_resumen.items()))
            g.write(f"- **Decisiones humanas aplicadas: {sum(decisiones_resumen.values())}** ({detalle})\n")
        g.write(f"- **Dudosos apartados a revisión (conservados): {len(review)}**\n")
        g.write(f"- **Registros únicos para cribado: {len(kept)}**\n\n")
        g.write("## Solapamiento entre bases (registros presentes en 2+)\n\n")
        for k, v in overlap.items(): g.write(f"- {k}: {v}\n")
        g.write("\n## Ficheros\n\n- `dedup.ris` — únicos para cribar\n- `duplicados.csv` — retirados (suplementario)\n"
                "- `revisar.csv` — dudosos para decisión humana\n")
        if decisiones_resumen:
            g.write("- `decisiones.csv` — decisión tomada por dudoso (suplementario RS)\n")
        # avisos de calidad
        no_id = sum(1 for r in kept if not r["doi"] and not r["pmid"])
        no_year = sum(1 for r in kept if not r["year"])
        if no_id or no_year:
            g.write(f"\n## Avisos\n\n- Únicos sin DOI ni PMID: {no_id} (solo casables por título)\n- Únicos sin año: {no_year}\n")

# ------------------------------------------------------------------ main
def _err_formato(path):
    return ("ERROR: no reconozco el formato de %r.\n"
            "Formatos admitidos: RIS (.ris), MEDLINE/PubMed (.nbib), "
            "PubMed XML (.xml), BibTeX (.bib), CSV (.csv).\n"
            "Guía de exportación por base de datos: docs/guia-exportacion.md" % path)

def main():
    ap = argparse.ArgumentParser(description="Deduplicación de exportaciones bibliográficas")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--out", default=None, help="carpeta de salida (por defecto, la del 1er fichero)")
    ap.add_argument("--source-names", default=None, help="nombres de fuente por fichero, separados por coma")
    ap.add_argument("--format", default=None, help="forzar formato para todos (ris|medline|pubmed_xml|bibtex|csv)")
    ap.add_argument("--merge-threshold", type=float, default=0.5)
    ap.add_argument("--review-threshold", type=float, default=0.3)
    ap.add_argument("--decisiones", default=None, metavar="FILE",
                    help="mini CSV n,decisión con las decisiones humanas sobre el revisar.csv "
                         "de una pasada previa (conservar_A/conservar_B/mantener_ambos/enlazar); "
                         "emite además decisiones.csv como registro trazable")
    a = ap.parse_args()

    names = a.source_names.split(",") if a.source_names else None
    allrecs, counts = [], {}
    for i, path in enumerate(a.files):
        fmt = a.format or detect_format(path)
        if fmt is None:
            sys.exit(_err_formato(path))
        text = open(path, encoding="utf-8", errors="replace").read()
        src = (names[i].strip() if names and i < len(names)
               else os.path.splitext(os.path.basename(path))[0])
        recs = PARSERS[fmt](text, src)
        if not recs:
            # CSV llegado por sniff sin registros: problema de formato, no de corrupción
            ext = os.path.splitext(path)[1].lower()
            csv_por_sniff = fmt == "csv" and not a.format and ext != ".csv"
            if csv_por_sniff:
                sys.exit(_err_formato(path))
            print("AVISO: %r leído como %s pero contiene 0 registros (¿export corrupto?)"
                  % (path, fmt), file=sys.stderr)
        counts[src] = counts.get(src, 0) + len(recs)
        allrecs += recs
        print(f"[{fmt}] {os.path.basename(path)} -> {len(recs)} registros (fuente: {src})")
    if not allrecs:
        sys.exit("ERROR: 0 registros en total; nada que deduplicar.")
    # Orden canónico independiente del orden de los ficheros de entrada: el resultado
    # depende sólo del CONJUNTO de registros, no de en qué orden se suministren los
    # ficheros. La cascada es voraz, así que el orden de llegada podría cambiar si un par
    # fronterizo se fusiona o se aparta a revisión; fijar un orden por contenido lo hace
    # reproducible. (El benchmark llama a dedup() directamente y conserva su control de
    # orden para casar el superviviente con el gold standard.)
    allrecs.sort(key=lambda r: (r["ntitle"], r["year"], r["doi"], r["pmid"], r["source"], r["title"]))
    kept, removed, review = dedup(allrecs, a.merge_threshold, a.review_threshold, None)

    con_decisiones = None
    if a.decisiones:
        from decisiones import cargar_decisiones, aplicar_decisiones, write_decisiones_csv
        try:
            decs = cargar_decisiones(a.decisiones)
            # foto de los dudosos ANTES de aplicar: al fusionar, el conservado puede
            # adoptar campos del retirado y decisiones.csv debe reflejar lo revisado
            foto = [(dict(r), dict(o), reason) for r, o, reason in review]
            kept, removed, review, enlaces = aplicar_decisiones(kept, removed, review, decs)
        except ValueError as e:
            sys.exit(f"ERROR: {e}")
        tipos = {}
        for d in decs.values():
            tipos[d] = tipos.get(d, 0) + 1
        con_decisiones = (foto, decs, enlaces, tipos)

    out = a.out or os.path.dirname(os.path.abspath(a.files[0]))
    os.makedirs(out, exist_ok=True)
    write_ris(kept, os.path.join(out, "dedup.ris"))
    write_dupes_csv(removed, os.path.join(out, "duplicados.csv"))
    write_review_csv(review, os.path.join(out, "revisar.csv"))
    write_report(counts, kept, removed, review, os.path.join(out, "dedup_informe.md"),
                 decisiones_resumen=con_decisiones[3] if con_decisiones else None)
    if con_decisiones:
        foto, decs, enlaces, tipos = con_decisiones
        write_decisiones_csv(foto, decs, enlaces, os.path.join(out, "decisiones.csv"))
        detalle = " · ".join(f"{k}: {v}" for k, v in sorted(tipos.items()))
        print(f"Decisiones aplicadas: {len(decs)} ({detalle}) · dudosos pendientes: {len(review)}")
    print(f"\nTotal {len(allrecs)} -> únicos {len(kept)} · duplicados {len(removed)} · dudosos {len(review)}")
    print(f"Salida en: {out}")
    print("  dedup.ris · duplicados.csv · revisar.csv · dedup_informe.md"
          + (" · decisiones.csv" if con_decisiones else ""))

if __name__ == "__main__":
    main()
