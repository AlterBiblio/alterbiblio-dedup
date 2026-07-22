# -*- coding: utf-8 -*-
"""i18n — internacionalización de la SALIDA (es/en). Gemelo de docs/engine/i18n.js.

El MOTOR (dedup.py/dedup.js) NO se toca: sigue emitiendo los motivos en español
(canónicos) y la paridad byte a byte se mantiene. Para inglés, la capa de salida
traduce la etiqueta con reason_to_en() y usa cabeceras/informe EN.

Las 26 plantillas de reason_to_en coinciden EXACTAMENTE con las de i18n.js
(mismo español de entrada, mismo inglés de salida): esto garantiza que la salida
EN de ambos motores sea idéntica, igual que ya lo es la ES.
"""
import re


def _fields_en(s):
    return re.sub(r"\bpag\b", "page", s)


# Lista ordenada (regex, fn). Primer match gana. Reproducen EXACTAMENTE las cadenas del motor.
_REASON_EN = [
    (re.compile(r"^PMID$"), lambda m: "PMID"),
    (re.compile(r"^ID de Embase$"), lambda m: "Embase ID"),
    (re.compile(r"^abstract$"), lambda m: "abstract"),
    (re.compile(r"^título\+año$"), lambda m: "title+year"),
    (re.compile(r"^DOI\+título$"), lambda m: "DOI+title"),
    (re.compile(r"^título\+autor\+año~$"), lambda m: "title+author+year~"),
    (re.compile(r"^vol\+pág\+autor\+año$"), lambda m: "vol+page+author+year"),
    (re.compile(r"^abstract casi idéntico pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$"),
     lambda m: "near-identical abstract but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)"),
    (re.compile(r"^abstract casi idéntico pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$"),
     lambda m: f"near-identical abstract but ≥2 identifiers ({_fields_en(m.group(1))}) in conflict (review)"),
    (re.compile(r"^título\+año idénticos pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$"),
     lambda m: "identical title+year but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)"),
    (re.compile(r"^título\+año idénticos pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$"),
     lambda m: f"identical title+year but ≥2 identifiers ({_fields_en(m.group(1))}) in conflict (review)"),
    (re.compile(r"^DOI igual, título similar ([\d.]+)$"),
     lambda m: f"same DOI, similar title {m.group(1)}"),
    (re.compile(r"^título ([\d.]+)\+mismo autor pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$"),
     lambda m: f"title {m.group(1)}+same author but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)"),
    (re.compile(r"^título ([\d.]+)\+mismo autor, abstract de congreso vs artículo \(¿misma obra\? mantener/enlazar\)$"),
     lambda m: f"title {m.group(1)}+same author, conference abstract vs article (same work? keep/link)"),
    (re.compile(r"^título ([\d.]+)\+autor\+año~ pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$"),
     lambda m: f"title {m.group(1)}+author+year~ but ≥2 identifiers ({_fields_en(m.group(2))}) in conflict (review)"),
    (re.compile(r"^título ([\d.]+)\+autor\+año~ \(revisar\)$"),
     lambda m: f"title {m.group(1)}+author+year~ (review)"),
    (re.compile(r"^título casi idéntico ([\d.]+)\+mismo autor, años distintos \(¿abstract de congreso vs artículo\?\)$"),
     lambda m: f"near-identical title {m.group(1)}+same author, different years (conference abstract vs article?)"),
    (re.compile(r"^mismo vol\+pág\+autor\+año pero títulos distintos ([\d.]+) \(revisar\)$"),
     lambda m: f"same vol+page+author+year but different titles {m.group(1)} (review)"),
    (re.compile(r"^mismo ensayo clínico \((.+?)\) — posible duplicado \(comprobar cada uno en su fuente\)$"),
     lambda m: f"same clinical trial ({m.group(1)}) — possible duplicate (check each in its source)"),
    (re.compile(r"^títulos casi idénticos \(variación de escritura\) pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$"),
     lambda m: "near-identical titles (spelling variant) but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)"),
    (re.compile(r"^títulos casi idénticos \(variación de escritura, Jaro-Winkler\) — posible duplicado \(sin DOI/PMID/autor común\)$"),
     lambda m: "near-identical titles (spelling variant, Jaro-Winkler) — possible duplicate (no shared DOI/PMID/author)"),
    (re.compile(r"^título casi idéntico ([\d.]+) \(sin DOI/PMID/autor común\)$"),
     lambda m: f"near-identical title {m.group(1)} (no shared DOI/PMID/author)"),
    (re.compile(r"^artículo \+ fe de erratas/corrección \(mantener ambos\)$"),
     lambda m: "article + erratum/correction (keep both)"),
    (re.compile(r"^artículo \+ respuesta/comentario \(mantener ambos\)$"),
     lambda m: "article + reply/comment (keep both)"),
    (re.compile(r"^misma obra co-publicada en dos revistas \(publicación conjunta o doble publicación CME\) — mantener solo uno: el de PMID (\d+)$"),
     lambda m: f"same work co-published in two journals (joint or CME dual publication) — keep only one: the one with PMID {m.group(1)}"),
    (re.compile(r"^misma obra co-publicada en dos revistas \(publicación conjunta o doble publicación CME\) — mantener solo uno: cualquiera \(mismo contenido\)$"),
     lambda m: "same work co-published in two journals (joint or CME dual publication) — keep only one: either (same content)"),
]


def reason_to_en(es):
    if not es:
        return "" if es is None else es
    for rx, fn in _REASON_EN:
        m = rx.match(es)
        if m:
            return fn(m)
    return es  # sin traducción conocida: se deja el original


def reason_i18n(es, lang):
    return reason_to_en(es) if lang == "en" else es


# Cabeceras de CSV por idioma (mismas claves internas, distinto rótulo en el fichero).
HEADERS = {
    "duplicados": {
        "es": ["motivo", "fuente_retirada", "titulo_retirado", "doi_retirado", "año_retirado", "tipo_retirado",
               "fuente_conservada", "titulo_conservado", "doi_conservado", "tipo_conservado"],
        "en": ["reason", "removed_source", "removed_title", "removed_doi", "removed_year", "removed_type",
               "kept_source", "kept_title", "kept_doi", "kept_type"],
    },
    "revisar": {
        "es": ["n", "motivo_duda", "fuente_A", "titulo_A", "doi_A", "año_A", "tipo_A",
               "fuente_B", "titulo_B", "doi_B", "año_B", "tipo_B"],
        "en": ["n", "review_reason", "source_A", "title_A", "doi_A", "year_A", "type_A",
               "source_B", "title_B", "doi_B", "year_B", "type_B"],
    },
    "decisiones": {
        "es": ["n", "decision", "titulo_A", "titulo_B", "motivo"],
        "en": ["n", "decision", "title_A", "title_B", "reason"],
    },
    "totales": {
        "es": ["estado", "titulo", "año", "doi", "pmid", "tipo", "fuente", "relacionado_con", "motivo"],
        "en": ["status", "title", "year", "doi", "pmid", "type", "source", "related_to", "reason"],
    },
}

# Estados del fichero resultados_totales.csv.
ESTADO = {
    "mantenido": {"es": "mantenido", "en": "kept"},
    "eliminado": {"es": "eliminado", "en": "removed"},
    "vinculado": {"es": "vinculado", "en": "linked"},
    "pendiente": {"es": "pendiente", "en": "unresolved"},
}


def estado_label(code, lang):
    e = ESTADO.get(code)
    return (e.get(lang) or e["es"]) if e else code


def methods_sentence(lang, c):
    """Frase para Material y Métodos. c = {total, sources:[(nombre,n),...], removed, kept, referred}."""
    src_list = "; ".join(f"{s}, {n}" for s, n in c["sources"])
    n_db = len(c["sources"])
    if lang == "en":
        return (
            "Deduplication was performed with alterbiblio-dedup (AlterBiblio; https://alterbiblio.github.io/alterbiblio-dedup/), "
            "a conservative tool that never merges records on a shared DOI alone and keeps trial-registry records separate. "
            f"{c['total']} records were identified from {n_db} database{'s' if n_db != 1 else ''} ({src_list}). "
            f"{c['removed']} duplicates were removed and {c['kept']} unique records were retained for screening; "
            f"{c['referred']} ambiguous pairs were referred for human decision."
        )
    return (
        "La deduplicación se realizó con alterbiblio-dedup (AlterBiblio; https://alterbiblio.github.io/alterbiblio-dedup/), "
        "una herramienta conservadora que no fusiona registros por un DOI compartido de forma aislada y mantiene aparte "
        f"los registros de ensayos. Se identificaron {c['total']} registros procedentes de {n_db} bases de datos ({src_list}). "
        f"Se eliminaron {c['removed']} duplicados y se conservaron {c['kept']} registros únicos para el cribado; "
        f"{c['referred']} pares ambiguos se remitieron a decisión humana."
    )


# Textos del informe markdown por idioma. El español reproduce EXACTAMENTE el literal histórico.
REPORT = {
    "es": {
        "h1": "Informe de deduplicación",
        "method": ("Método conservador: PMID · título+año · DOI+título (Jaccard≥umbral) · revista+vol+nº+pág. "
                   "El **DOI solo NO fusiona** (los abstracts de congreso comparten el DOI del suplemento). "
                   "Los emparejamientos dudosos se apartan a `revisar.csv` y **no** se fusionan."),
        "numbers": "Números (para PRISMA)", "colSource": "Fuente", "colIdentified": "Registros identificados",
        "total": "Total", "dupRemoved": "Duplicados retirados",
        "decisionsApplied": "Decisiones humanas aplicadas",
        "reviewKept": "Dudosos apartados a revisión (conservados)",
        "uniqueScreening": "Registros únicos para cribado",
        "overlap": "Solapamiento entre bases (registros presentes en 2+)",
        "files": "Ficheros", "fDedup": "`dedup.ris` — únicos para cribar",
        "fDups": "`duplicados.csv` — retirados (suplementario)",
        "fReview": "`revisar.csv` — dudosos para decisión humana",
        "fDecisions": "`decisiones.csv` — decisión tomada por dudoso (suplementario RS)",
        "warnings": "Avisos", "noId": "Únicos sin DOI ni PMID", "noIdTail": "(solo casables por título)",
        "noYear": "Únicos sin año", "methodsHeading": "Frase para Material y Métodos",
    },
    "en": {
        "h1": "Deduplication report",
        "method": ("Conservative method: PMID · title+year · DOI+title (Jaccard≥threshold) · journal+vol+no+pages. "
                   "A **shared DOI alone does NOT merge** (conference abstracts share the supplement DOI). "
                   "Ambiguous pairs are set aside in `revisar.csv` and are **not** merged."),
        "numbers": "Numbers (for PRISMA)", "colSource": "Source", "colIdentified": "Records identified",
        "total": "Total", "dupRemoved": "Duplicates removed",
        "decisionsApplied": "Human decisions applied",
        "reviewKept": "Ambiguous pairs set aside for review (kept)",
        "uniqueScreening": "Unique records for screening",
        "overlap": "Overlap between databases (records present in 2+)",
        "files": "Files", "fDedup": "`dedup.ris` — unique records for screening",
        "fDups": "`duplicados.csv` — removed (supplementary)",
        "fReview": "`revisar.csv` — ambiguous pairs for human decision",
        "fDecisions": "`decisiones.csv` — decision taken per ambiguous pair (systematic-review supplement)",
        "warnings": "Warnings", "noId": "Unique records without DOI or PMID", "noIdTail": "(matchable by title only)",
        "noYear": "Unique records without year", "methodsHeading": "Sentence for Methods",
    },
}
