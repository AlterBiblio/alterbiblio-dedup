// Salidas del motor — port fiel de scripts/dedup.py:442-514, como strings/filas
// en memoria (sin E/S de disco). Python es la referencia.
//
// Idioma (lang): "es" (por defecto) reproduce la salida histórica byte a byte —la paridad
// y la batería no se mueven—; "en" traduce motivos, cabeceras de CSV y el informe vía i18n.

import { reasonI18n, HEADERS, REPORT, methodsSentence } from "./i18n.js";

// dedup.py:442
export function escaparRis(s) {
  return (s || "").trim().replace(/\s+/g, " ");
}

// dedup.py:444-460 — mismo orden y emisión de campos que write_ris, a string
export function escribirRis(recs) {
  let out = "";
  for (const r of recs) {
    out += "TY  - JOUR\n";
    if (r.title) out += `TI  - ${escaparRis(r.title)}\n`;
    for (const a of r.authors) out += `AU  - ${escaparRis(a)}\n`;
    if (r.year) out += `PY  - ${r.year}\n`;
    if (r.journal) out += `JO  - ${escaparRis(r.journal)}\n`;
    if (r.volume) out += `VL  - ${r.volume}\n`;
    if (r.issue) out += `IS  - ${r.issue}\n`;
    if (r.spage) out += `SP  - ${r.spage}\n`;
    if (r.abstract) out += `AB  - ${escaparRis(r.abstract)}\n`;
    if (r.doi) out += `DO  - ${r.doi}\n`;
    if (r.pmid) out += `AN  - ${r.pmid}\n`;
    out += `DB  - ${[r.source, ...r.also_in].join("; ")}\n`;
    out += "ER  - \n\n";
  }
  return out;
}

// dedup.py:462-469 — filas de duplicados.csv (mismas columnas), ordenadas por
// fuente retirada (sorted estable de Python, comparación de strings simple).
// El orden de las claves fija el orden de columnas del CSV; se conserva en ambos idiomas.
export function filasDuplicados(removed, lang = "es") {
  const H = HEADERS.duplicados[lang] || HEADERS.duplicados.es;
  return [...removed]
    .sort((x, y) => (x.r.source < y.r.source ? -1 : x.r.source > y.r.source ? 1 : 0))
    .map(({ r, keptr, reason }) => ({
      [H.motivo]: reasonI18n(reason, lang),
      [H.fuente_retirada]: r.source, [H.titulo_retirado]: r.title,
      [H.doi_retirado]: r.doi, [H.año_retirado]: r.year, [H.tipo_retirado]: (r.ptypes || []).join("; "),
      [H.fuente_conservada]: keptr.source, [H.titulo_conservado]: keptr.title,
      [H.doi_conservado]: keptr.doi, [H.tipo_conservado]: (keptr.ptypes || []).join("; "),
    }));
}

// dedup.py:471-478 — filas de revisar.csv (mismas columnas, mismo orden de llegada)
export function filasRevisar(review, lang = "es") {
  const H = HEADERS.revisar[lang] || HEADERS.revisar.es;
  return review.map(({ r, other, reason }, i) => ({
    [H.n]: i + 1,
    [H.motivo_duda]: reasonI18n(reason, lang),
    [H.fuente_A]: r.source, [H.titulo_A]: r.title, [H.doi_A]: r.doi, [H.año_A]: r.year, [H.tipo_A]: (r.ptypes || []).join("; "),
    [H.fuente_B]: other.source, [H.titulo_B]: other.title, [H.doi_B]: other.doi, [H.año_B]: other.year, [H.tipo_B]: (other.ptypes || []).join("; "),
  }));
}

// repr() de un dict de Python con claves string: {'PMID': 2, 'abstract': 1}
function dictRepr(m) {
  return "{" + [...m.entries()].map(([k, v]) => `'${k}': ${v}`).join(", ") + "}";
}

// dedup.py:480-514 — informe markdown, mismo texto que write_report.
// sourcesCounts: Map fuente -> nº de registros identificados (orden de aparición).
export function informe(sourcesCounts, kept, removed, review, lang = "es", referred = null) {
  const T = REPORT[lang] || REPORT.es;
  if (referred == null) referred = review.length;
  let total = 0;
  for (const n of sourcesCounts.values()) total += n;
  const byReason = new Map();
  for (const { reason } of removed) {
    const key = reasonI18n(reason, lang).split(" ")[0];
    byReason.set(key, (byReason.get(key) ?? 0) + 1);
  }
  const names = [...sourcesCounts.keys()];
  const overlap = new Map();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      overlap.set(`${names[i]} ∩ ${names[j]}`, 0);
    }
  }
  for (const r of kept) {
    const srcs = new Set([r.source, ...r.also_in]);
    for (const k of overlap.keys()) {
      const [a, b] = k.split(" ∩ ");
      if (srcs.has(a) && srcs.has(b)) overlap.set(k, overlap.get(k) + 1);
    }
  }
  let g = `# ${T.h1}\n\n`;
  g += T.method + "\n\n";
  g += `## ${T.numbers}\n\n| ${T.colSource} | ${T.colIdentified} |\n|---|---|\n`;
  for (const [s, n] of sourcesCounts) g += `| ${s} | ${n} |\n`;
  g += `| **${T.total}** | **${total}** |\n\n`;
  g += `- **${T.dupRemoved}: ${removed.length}** (${dictRepr(byReason)})\n`;
  g += `- **${T.reviewKept}: ${review.length}**\n`;
  g += `- **${T.uniqueScreening}: ${kept.length}**\n\n`;
  g += `## ${T.overlap}\n\n`;
  for (const [k, v] of overlap) g += `- ${k}: ${v}\n`;
  g += `\n## ${T.files}\n\n- ${T.fDedup}\n- ${T.fDups}\n- ${T.fReview}\n`;
  // avisos de calidad
  const noId = kept.filter(r => !r.doi && !r.pmid).length;
  const noYear = kept.filter(r => !r.year).length;
  if (noId || noYear) {
    g += `\n## ${T.warnings}\n\n- ${T.noId}: ${noId} ${T.noIdTail}\n- ${T.noYear}: ${noYear}\n`;
  }
  const sentence = methodsSentence(lang, {
    total, sources: [...sourcesCounts], removed: removed.length, kept: kept.length, referred,
  });
  g += `\n## ${T.methodsHeading}\n\n> ${sentence}\n`;
  return g;
}
