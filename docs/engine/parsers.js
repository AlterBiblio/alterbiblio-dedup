// Parsers bibliográficos — port fiel de scripts/dedup.py:81-260.
// Python es la referencia: ante cualquier discrepancia manda dedup.py.
// Formatos: RIS, MEDLINE/.nbib, PubMed XML, BibTeX, CSV; detectFormat + PARSERS.

import { normTitle, normDoi, first4, firstAuthorLast, matchDoi, extractNct, normEid } from "./normalize.js";

// Equivalente a str.splitlines() de Python: mismos separadores y sin elemento
// vacío final cuando el texto termina en salto de línea.
function splitLines(s) {
  if (!s) return [];
  const parts = s.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

// ------------------------------------------------------------------ record model
// dedup.py:81-91 — el contrato de forma del registro para dedup.js/output.js:
// mismas claves y mismos valores por defecto que el dict de Python.
export function rec(source, { title = "", doi = "", year = "", authors = null,
  journal = "", volume = "", issue = "", spage = "", pmid = "",
  abstract = "", extra = null, url = "", accession = "", eid = "", ptypes = null, keywords = "" } = {}) {
  return {
    source,
    // ptypes: tipología documental declarada por la base (PubMed PT / Embase M3),
    // p. ej. "Editorial", "Letter", "Review". Informativa: no se usa para emparejar.
    ptypes: (ptypes || []).map(p => (p || "").trim()).filter(Boolean),
    title: (title || "").trim(),
    ntitle: normTitle(title),
    doi: normDoi(doi),
    year: first4(year),
    authors: authors || [],
    fauthor: firstAuthorLast(authors || []),
    journal: (journal || "").trim(),
    volume: (volume || "").trim(),
    issue: (issue || "").trim(),
    spage: (spage || "").trim(),
    start_page: (spage || "").split("-")[0].trim(),
    pmid: (pmid || "").trim(),
    // eid: ID de registro de Embase de emparejamiento (canonizado a dígitos). Casa un registro
    // de CENTRAL con su gemelo de Embase por identificador (ver normEid).
    eid: normEid(eid),
    // mdoi: DOI de emparejamiento (el CN de Cochrane cuenta como "sin DOI").
    mdoi: matchDoi(normDoi(doi)),
    // nct: nº de ensayo clínico reconciliado desde varios campos.
    nct: extractNct(title, abstract, url, accession, doi, journal, keywords),
    // url/accession: enlace al registro en la base de origen (Embase UR/U2). Informativos.
    url: (url || "").trim(),
    accession: (accession || "").trim(),
    abstract: (abstract || "").trim(),
    nabs: normTitle(abstract),
    also_in: [],
    extra: extra || {},
  };
}

// ------------------------------------------------------------------ parsers
// dedup.py:94-129
export function parseRis(text, source) {
  const out = [];
  for (const block of text.split(/(?=^TY\s{2}- )/m)) {
    if (!block.includes("TY")) continue;
    const f = {};
    let cur = null;
    for (const line of splitLines(block)) {
      const m = /^([A-Z0-9]{2})\s{2}-\s?(.*)$/.exec(line);
      if (m) {
        cur = m[1];
        (f[cur] ??= []).push(m[2].trim());
      } else if (cur && line.trim()) {
        f[cur][f[cur].length - 1] += " " + line.trim();
      }
    }
    if (!Object.keys(f).length) continue;
    if (!("ER" in f)) {
      // bloque truncado sin ER: se conserva si tiene título (registro real de un export
      // truncado, nunca perder referencias sin avisar); sin título es fragmento sin sustancia
      const titulo = (f.TI || f.T1 || [""])[0];
      if (!titulo.trim()) continue;
      console.error("AVISO: registro sin terminador ER conservado (¿export truncado?): "
        + titulo.slice(0, 60));
    }
    const g = (...tags) => {
      for (const t of tags) if (f[t] && f[t].length) return f[t][0];
      return "";
    };
    let doi = g("DO", "DI");
    if (!doi) {
      outer: for (const t of ["L3", "M3", "UR", "N1", "AID"]) {
        for (const v of f[t] || []) {
          const mm = /10\.\d{4,9}\/\S+/.exec(v);
          if (mm) { doi = mm[0]; break outer; }
        }
      }
    }
    // PMID: puede venir en AN (numérico), en Embase en C5, o en CENTRAL dentro de C3
    // ("PUBMED 38507156,EMBASE 2029064766"). Se toma el primero disponible; así un
    // registro de CENTRAL casa con su gemelo de PubMed por PMID y el CN no interviene.
    let pmid = [g("AN"), g("C5")].find(v => /^\p{Nd}+$/u.test(v)) || "";
    if (!pmid) {
      const mc3 = /PUBMED\s+(\d+)/i.exec((f.C3 || []).join(" "));
      if (mc3) pmid = mc3[1];
    }
    // Enlace al registro en la base y nº de accesión (Embase: UR + U2).
    const url = g("UR", "L1"), accession = g("U2", "AN");
    // ID de Embase de emparejamiento: Embase lo da en U2 con prefijo L (L643991551);
    // CENTRAL referencia el mismo id en C3 ("EMBASE 643991551"). normEid canoniza a dígitos.
    let eid = /^[Ll]\d{6,}$/.test(g("U2") || "") ? g("U2") : "";
    if (!eid) {
      const mc3e = /EMBASE\s+(\d{6,})/i.exec((f.C3 || []).join(" "));
      if (mc3e) eid = mc3e[1];
    }
    // tipología documental: Embase la da en M3, algunos RIS en PT; ambos pueden llevar ";"
    const ptypes = [].concat(f.M3 || [], f.PT || []).flatMap(v => v.split(";"));
    out.push(rec(source, {
      title: g("TI", "T1"), doi, year: g("PY", "Y1", "DA"),
      authors: "AU" in f ? f.AU : ("A1" in f ? f.A1 : []),
      journal: g("JO", "JF", "T2", "JA"),
      volume: g("VL"), issue: g("IS"), spage: g("SP"),
      pmid, abstract: g("AB", "N2"), url, accession, eid, ptypes,
      keywords: (f.KW || []).join(" "),
    }));
  }
  return out;
}

// dedup.py:131-154
export function parseMedline(text, source) {
  const out = [];
  for (const block of text.split(/\n\s*\n/)) {
    if (!block.includes("TI  -") && !block.includes("TI-")) continue;
    const f = {};
    let cur = null;
    for (const line of splitLines(block)) {
      const m = /^([A-Z]{2,4})\s*- (.*)$/.exec(line);
      if (m) {
        cur = m[1];
        (f[cur] ??= []).push(m[2]);
      } else if (line.startsWith("      ") && cur) {
        f[cur][f[cur].length - 1] += " " + line.trim();
      }
    }
    if (!Object.keys(f).length) continue;
    let doi = "";
    outer: for (const t of ["LID", "AID"]) {
      for (const v of f[t] || []) {
        if (v.toLowerCase().includes("[doi]")) {
          doi = v.toLowerCase().split("[doi]").join("").trim();
          break outer;
        }
      }
    }
    out.push(rec(source, {
      title: (f.TI || []).join(" "), doi,
      year: (f.DP || [""])[0],
      authors: "FAU" in f ? f.FAU : ("AU" in f ? f.AU : []),
      journal: ((f.JT && f.JT.length ? f.JT : null) || (f.TA && f.TA.length ? f.TA : null) || [""])[0],
      volume: (f.VI || [""])[0], issue: (f.IP || [""])[0],
      spage: (f.PG || [""])[0], pmid: ((f.PMID || [""])[0]).trim(),
      abstract: (f.AB || []).join(" "),
      ptypes: f.PT || [],
    }));
  }
  return out;
}

// --- mini-extracción XML (sustituto sin dependencias de xml.etree para PubMed XML) ---
function decodeXmlEntities(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e[1] === "x" || e[1] === "X"
      ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isNaN(code) ? m : String.fromCodePoint(code);
  });
}

// itertext() de ElementTree: texto plano del elemento, sin las etiquetas internas
function innerText(xml) {
  return decodeXmlEntities(xml.replace(/<[^>]*>/g, ""));
}

// Todas las apariciones de <tag ...>...</tag> (o <tag ... />) dentro de xml,
// en orden de documento. Devuelve {attrs, inner}.
function xmlElements(xml, tag) {
  const out = [];
  const re = new RegExp(
    "<" + tag + "(\\s[^>]*)?>([\\s\\S]*?)</" + tag + "\\s*>|<" + tag + "(\\s[^>]*)?/>", "g");
  let m;
  while ((m = re.exec(xml)) !== null) {
    out.push({ attrs: m[1] ?? m[3] ?? "", inner: m[2] ?? "" });
  }
  return out;
}

// findtext(".//tag") de ElementTree sobre un fragmento: texto del primer tag, o null
function firstText(xml, tag) {
  const els = xmlElements(xml, tag);
  return els.length ? innerText(els[0].inner) : null;
}

// findtext(".//padre/hijo"): primer `hijo` dentro de un `padre`, en orden de documento
function firstChildText(xml, parent, child) {
  for (const p of xmlElements(xml, parent)) {
    const t = firstText(p.inner, child);
    if (t !== null) return t;
  }
  return null;
}

function attrIs(attrs, name, value) {
  const m = new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')").exec(attrs || "");
  return m !== null && (m[2] ?? m[3]) === value;
}

function xmlError(detail) {
  throw new Error(`XML mal formado: ${detail}`);
}

function findTagEnd(xml, start) {
  let quote = null;
  for (let i = start; i < xml.length; i++) {
    const c = xml[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return i;
  }
  return -1;
}

// Validador estricto sin dependencias para Node. En navegador se usa además DOMParser.
// No extrae datos: garantiza que el parser histórico nunca vea XML parcial.
function assertWellFormedXmlFallback(xml) {
  const stack = [];
  let roots = 0, i = 0;
  const entityOk = /^(?:#\d+|#x[0-9a-fA-F]+|amp|lt|gt|quot|apos)$/;
  const validateEntities = (s) => {
    for (const m of s.matchAll(/&([^;\s<]*)(;?)/g)) {
      if (m[2] !== ";" || !entityOk.test(m[1])) xmlError("entidad no válida");
    }
  };
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) {
      const tail = xml.slice(i);
      validateEntities(tail);
      if (!stack.length && tail.trim()) xmlError("texto fuera del elemento raíz");
      break;
    }
    const text = xml.slice(i, lt);
    validateEntities(text);
    if (!stack.length && text.trim()) xmlError("texto fuera del elemento raíz");
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end < 0) xmlError("comentario sin cerrar");
      i = end + 3; continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      if (!stack.length) xmlError("CDATA fuera del elemento raíz");
      const end = xml.indexOf("]]>", lt + 9);
      if (end < 0) xmlError("CDATA sin cerrar");
      i = end + 3; continue;
    }
    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      if (end < 0) xmlError("instrucción de procesamiento sin cerrar");
      i = end + 2; continue;
    }
    if (/^<!DOCTYPE\b/i.test(xml.slice(lt))) {
      let end = lt + 9, quote = null, subset = 0;
      for (; end < xml.length; end++) {
        const c = xml[end];
        if (quote) { if (c === quote) quote = null; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === "[") subset++;
        else if (c === "]") subset--;
        else if (c === ">" && subset === 0) break;
      }
      if (end >= xml.length) xmlError("DOCTYPE sin cerrar");
      i = end + 1; continue;
    }
    const end = findTagEnd(xml, lt + 1);
    if (end < 0) xmlError("etiqueta sin cerrar");
    const raw = xml.slice(lt + 1, end).trim();
    const closing = raw.startsWith("/");
    const selfClosing = raw.endsWith("/");
    const body = closing ? raw.slice(1).trim() : (selfClosing ? raw.slice(0, -1).trim() : raw);
    const m = /^([A-Za-z_][\w:.-]*)(?:\s+[\s\S]*)?$/.exec(body);
    if (!m) xmlError("etiqueta no válida");
    validateEntities(body);
    const name = m[1];
    if (!closing) {
      let attrs = body.slice(name.length).trim();
      const seenAttrs = new Set();
      while (attrs) {
        const am = /^([A-Za-z_][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(attrs);
        if (!am) xmlError(`atributo no válido en <${name}>`);
        if (seenAttrs.has(am[1])) xmlError(`atributo duplicado ${am[1]}`);
        seenAttrs.add(am[1]);
        attrs = attrs.slice(am[0].length).trim();
      }
    }
    if (closing) {
      if (/\s/.test(body) || selfClosing) xmlError("etiqueta de cierre no válida");
      if (stack.pop() !== name) xmlError(`cierre inesperado </${name}>`);
    } else if (!selfClosing) {
      if (!stack.length) roots++;
      stack.push(name);
    } else if (!stack.length) roots++;
    i = end + 1;
  }
  if (stack.length) xmlError(`falta cerrar <${stack[stack.length - 1]}>`);
  if (roots !== 1) xmlError("se esperaba un único elemento raíz");
}

function assertWellFormedXml(xml) {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) xmlError("el documento no es XML válido");
  }
  // También se ejecuta en navegador para mantener las mismas reglas que en Node.
  assertWellFormedXmlFallback(xml);
}

// dedup.py:156-181 — mismos campos que la versión ElementTree. La extracción ligera
// se conserva por paridad y ausencia de dependencias, pero sólo después de validar el
// documento completo con DOMParser (navegador) y el validador estricto (Node).
export function parsePubmedXml(text, source) {
  assertWellFormedXml(text);
  const out = [];
  for (const art of xmlElements(text, "PubmedArticle")) {
    const a = art.inner;
    const pmid = (firstText(a, "PMID") || "").trim();
    const title = firstText(a, "ArticleTitle") || "";
    let doi = "";
    for (const eid of xmlElements(a, "ELocationID")) {
      if (attrIs(eid.attrs, "EIdType", "doi")) doi = innerText(eid.inner).trim();
    }
    if (!doi) {
      for (const aid of xmlElements(a, "ArticleId")) {
        if (attrIs(aid.attrs, "IdType", "doi")) doi = innerText(aid.inner).trim();
      }
    }
    const year = firstChildText(a, "PubDate", "Year")
      || firstChildText(a, "PubDate", "MedlineDate") || "";
    const authors = [];
    for (const au of xmlElements(a, "Author")) {
      const ln = firstText(au.inner, "LastName");
      const fn = firstText(au.inner, "ForeName");
      if (ln) authors.push(fn ? `${ln}, ${fn}` : ln);
    }
    const ab = xmlElements(a, "AbstractText").map(x => innerText(x.inner)).join(" ");
    const j = firstChildText(a, "Journal", "Title") || firstText(a, "ISOAbbreviation") || "";
    out.push(rec(source, {
      title, doi, year, authors, journal: j,
      volume: firstChildText(a, "JournalIssue", "Volume") || "",
      issue: firstChildText(a, "JournalIssue", "Issue") || "",
      spage: firstChildText(a, "Pagination", "StartPage")
        || (firstText(a, "MedlinePgn") || "").split("-")[0],
      pmid, abstract: ab,
    }));
  }
  return out;
}

// dedup.py:183-204
export function parseBibtex(text, source) {
  const out = [];
  let m;
  const entryRe = /@\w+\s*\{/g;
  while ((m = entryRe.exec(text)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < text.length && depth) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") depth -= 1;
      i += 1;
    }
    const body = text.slice(start, i - 1);
    const fields = {};
    const fieldRe = /(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\n]+)/g;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      const key = fm[1].toLowerCase();
      // como Python: .strip() → .strip("{}") → .strip('"') → .strip()
      const val = fm[2].trim()
        .replace(/^[{}]+/, "").replace(/[{}]+$/, "")
        .replace(/^"+/, "").replace(/"+$/, "")
        .trim();
      fields[key] = val.replace(/\s+/g, " ");
    }
    if (!fields.title) continue;
    const auth = (fields.author || "").split(/\s+and\s+/).map(a => a.trim()).filter(Boolean);
    out.push(rec(source, {
      title: fields.title || "", doi: fields.doi || "",
      year: fields.year || "", authors: auth,
      journal: "journal" in fields ? fields.journal : (fields.journaltitle || ""),
      volume: fields.volume || "", issue: fields.number || "",
      spage: (fields.pages || "").split("-")[0].replace(/-/g, ""),
      pmid: fields.pmid || "", abstract: fields.abstract || "",
    }));
  }
  return out;
}

// --- CSV: sniffer + reader compatibles con el módulo csv de Python ---
// Aproximación al csv.Sniffer restringido a ";,\t": el separador con recuento
// consistente en las primeras líneas, con la preferencia de Python (',' > '\t' > ';').
function sniffDelimiter(text) {
  const head = text.slice(0, 4096);
  const lineas = splitLines(head).filter(l => l.trim()).slice(0, 10);
  if (lineas.length >= 2) {
    for (const sep of [",", "\t", ";"]) {
      const cols = lineas.map(l => l.split(sep).length - 1);
      if (cols[0] >= 1 && cols.every(c => c === cols[0])) return sep;
    }
  }
  // fallback: el más frecuente en la primera línea; si nada, coma (csv.excel)
  let mejor = ",", n = 0;
  for (const sep of [",", "\t", ";"]) {
    const c = lineas.length ? lineas[0].split(sep).length - 1 : 0;
    if (c > n) { mejor = sep; n = c; }
  }
  return mejor;
}

// Reader CSV con comillas dobles y escape "" (dialecto excel de Python)
function csvRows(text, sep) {
  const rows = [];
  let row = [], field = "", inQ = false, started = false;
  const endField = () => { row.push(field); field = ""; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"' && !started && field === "") {
      inQ = true; started = true;
    } else if (c === sep) endField();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else { field += c; started = true; }
  }
  if (field !== "" || started || row.length) endRow();
  // línea en blanco → fila vacía; DictReader las salta
  return rows.filter(r => !(r.length === 1 && r[0] === ""));
}

// dedup.py:206-228
export function parseCsv(text, source) {
  const out = [];
  const sep = sniffDelimiter(text);
  const rows = csvRows(text, sep);
  if (!rows.length) return out;
  const header = rows[0];
  const pick = (row, ...names) => {
    const low = {};
    for (const [k, v] of Object.entries(row)) {
      if (k) low[k.toLowerCase().trim()] = v;
    }
    for (const n of names) {
      for (const [k, v] of Object.entries(low)) {
        if (k.includes(n)) return v;
      }
    }
    return "";
  };
  for (const vals of rows.slice(1)) {
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = i < vals.length ? vals[i] : "";
    const title = pick(row, "title", "titulo", "título", "article title");
    if (!title) continue;
    const auth = pick(row, "author", "autor");
    out.push(rec(source, {
      title, doi: pick(row, "doi"),
      year: pick(row, "year", "año", "publication year", "date"),
      authors: (auth || "").split(/[;|]/).map(a => a.trim()).filter(Boolean),
      journal: pick(row, "journal", "revista", "source"),
      volume: pick(row, "volume", "volumen"), issue: pick(row, "issue", "número", "numero"),
      spage: pick(row, "start page", "página", "pagina", "beginning page"),
      pmid: pick(row, "pmid"), abstract: pick(row, "abstract", "resumen"),
    }));
  }
  return out;
}

// --- Embase "campo por línea" (dedup.py: EMBASE_CAMPOS / parse_embase_campos) ---
// Export de Embase con extensión .csv que NO es una tabla: cada línea es
// "NOMBRE DEL CAMPO","valor" y cada referencia ocupa un bloque que empieza en TITLE.
// Sin esto, un lector tabular convierte cada línea en un registro basura.
const EMBASE_CAMPOS = new Set(["TITLE", "AUTHOR NAMES", "SOURCE", "SOURCE TITLE",
  "PUBLICATION YEAR", "PUBLICATION TYPE", "DATE OF PUBLICATION", "VOLUME", "ISSUE",
  "FIRST PAGE", "LAST PAGE", "DOI", "ABSTRACT", "ORIGINAL (NON-ENGLISH) TITLE",
  "AiP/IP ENTRY DATE", "FULL RECORD ENTRY DATE", "AUTHOR KEYWORDS",
  "EMTREE DRUG INDEX TERMS", "EMTREE MEDICAL INDEX TERMS", "EMBASE ACCESSION ID",
  "MEDLINE PMID", "PMID", "ISSN", "CAS REGISTRY NUMBER"]);

function esEmbaseCampos(head) {
  const lineas = splitLines(head).filter(l => l.trim()).slice(0, 40);
  if (lineas.length < 3) return false;
  const etiquetas = new Set();
  for (const l of lineas) {
    const m = /^"([^"]+)",/.exec(l);
    if (!m) return false;
    etiquetas.add(m[1]);
  }
  let n = 0;
  for (const e of etiquetas) if (EMBASE_CAMPOS.has(e)) n++;
  return n >= 3;
}

export function parseEmbaseCampos(text, source) {
  const out = [];
  const bloques = [];
  let actual = null;
  for (const linea of splitLines(text)) {
    if (!linea.trim()) continue;
    const campos = csvRows(linea, ",")[0];
    if (!campos || !campos.length) continue;
    const etiqueta = (campos[0] || "").trim();
    const valores = campos.slice(1).map(v => v.trim()).filter(Boolean);
    if (etiqueta === "TITLE") {
      if (actual) bloques.push(actual);
      actual = {};
    }
    if (actual === null) continue;      // basura anterior al primer TITLE
    if (valores.length) (actual[etiqueta] = actual[etiqueta] || []).push(...valores);
  }
  if (actual) bloques.push(actual);

  for (const b of bloques) {
    const uno = (...ks) => { for (const k of ks) if (b[k] && b[k].length) return b[k][0]; return ""; };
    const title = uno("TITLE");
    if (!title) continue;
    out.push(rec(source, {
      title, doi: uno("DOI"),
      year: uno("PUBLICATION YEAR", "DATE OF PUBLICATION"),
      authors: b["AUTHOR NAMES"] || [],
      journal: uno("SOURCE TITLE", "SOURCE"),
      volume: uno("VOLUME"), issue: uno("ISSUE"),
      spage: uno("FIRST PAGE"),
      pmid: uno("MEDLINE PMID", "PMID"),
      abstract: uno("ABSTRACT"),
      accession: uno("EMBASE ACCESSION ID"),
      keywords: (b["AUTHOR KEYWORDS"] || []).join(" ; "),
      ptypes: b["PUBLICATION TYPE"] || [],
    }));
  }
  return out;
}

// dedup.py:230-244 — en Python detect_format(path) lee el fichero; en el navegador
// no hay rutas, así que la firma es detectFormat(name, text): extensión de `name`
// + sniff sobre los primeros 2000 caracteres de `text`. Devuelve null si no se reconoce.
export function detectFormat(name, text) {
  const base = (name || "").split(/[\\/]/).pop();
  const lead = /^\.*/.exec(base)[0].length;
  const d = base.lastIndexOf(".");
  const ext = d >= lead && lead < base.length ? base.slice(d).toLowerCase() : "";
  if (ext === ".nbib" || ext === ".medline") return "medline";
  if (ext === ".xml") return "pubmed_xml";
  if (ext === ".bib") return "bibtex";
  if (ext === ".csv") return esEmbaseCampos((text || "").slice(0, 4000)) ? "embase_campos" : "csv";
  if (ext === ".ris") return "ris";
  // .txt u otros: sniff
  const head = (text || "").slice(0, 2000);
  if (/^TY\s{2}- /m.test(head)) return "ris";
  if (/^PMID- /m.test(head)) return "medline";
  if (head.includes("<PubmedArticle")) return "pubmed_xml";
  if (/^@\w+\s*\{/m.test(head)) return "bibtex";
  if (esEmbaseCampos(head)) return "embase_campos";
  if (pareceTabla(head)) return "csv";
  return null;
}

// dedup.py:246-256
function pareceTabla(head) {
  // tabular de verdad: 2+ líneas con el mismo nº de separadores (,;\t) — si no, no es CSV
  let lineas = splitLines(head);
  if (head.length === 2000) lineas = lineas.slice(0, -1); // última línea partida por el corte
  lineas = lineas.filter(l => l.trim()).slice(0, 5);
  if (lineas.length < 2) return false;
  for (const sep of [",", ";", "\t"]) {
    const cols = lineas.map(l => l.split(sep).length - 1);
    if (cols[0] >= 1 && cols.every(c => c === cols[0])) return true;
  }
  return false;
}

export const PARSERS = {
  ris: parseRis, medline: parseMedline, pubmed_xml: parsePubmedXml,
  bibtex: parseBibtex, csv: parseCsv, embase_campos: parseEmbaseCampos,
};
