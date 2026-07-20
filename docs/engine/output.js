// Salidas del motor — port fiel de scripts/dedup.py:442-514, como strings/filas
// en memoria (sin E/S de disco). Python es la referencia.

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
// fuente retirada (sorted estable de Python, comparación de strings simple)
export function filasDuplicados(removed) {
  return [...removed]
    .sort((x, y) => (x.r.source < y.r.source ? -1 : x.r.source > y.r.source ? 1 : 0))
    .map(({ r, keptr, reason }) => ({
      motivo: reason,
      fuente_retirada: r.source, titulo_retirado: r.title,
      doi_retirado: r.doi, año_retirado: r.year,
      fuente_conservada: keptr.source, titulo_conservado: keptr.title,
      doi_conservado: keptr.doi,
    }));
}

// dedup.py:471-478 — filas de revisar.csv (mismas columnas, mismo orden de llegada)
export function filasRevisar(review) {
  return review.map(({ r, other, reason }, i) => ({
    n: i + 1,
    motivo_duda: reason,
    fuente_A: r.source, titulo_A: r.title, doi_A: r.doi, año_A: r.year,
    fuente_B: other.source, titulo_B: other.title, doi_B: other.doi, año_B: other.year,
  }));
}

// repr() de un dict de Python con claves string: {'PMID': 2, 'abstract': 1}
function dictRepr(m) {
  return "{" + [...m.entries()].map(([k, v]) => `'${k}': ${v}`).join(", ") + "}";
}

// dedup.py:480-514 — informe markdown, mismo texto que write_report.
// sourcesCounts: Map fuente -> nº de registros identificados (orden de aparición).
export function informe(sourcesCounts, kept, removed, review) {
  let total = 0;
  for (const n of sourcesCounts.values()) total += n;
  const byReason = new Map();
  for (const { reason } of removed) {
    const key = reason.split(" ")[0];
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
  let g = "# Informe de deduplicación\n\n";
  g += "Método conservador: PMID · título+año · DOI+título (Jaccard≥umbral) · revista+vol+nº+pág. "
    + "El **DOI solo NO fusiona** (los abstracts de congreso comparten el DOI del suplemento). "
    + "Los emparejamientos dudosos se apartan a `revisar.csv` y **no** se fusionan.\n\n";
  g += "## Números (para PRISMA)\n\n| Fuente | Registros identificados |\n|---|---|\n";
  for (const [s, n] of sourcesCounts) g += `| ${s} | ${n} |\n`;
  g += `| **Total** | **${total}** |\n\n`;
  g += `- **Duplicados retirados: ${removed.length}** (${dictRepr(byReason)})\n`;
  g += `- **Dudosos apartados a revisión (conservados): ${review.length}**\n`;
  g += `- **Registros únicos para cribado: ${kept.length}**\n\n`;
  g += "## Solapamiento entre bases (registros presentes en 2+)\n\n";
  for (const [k, v] of overlap) g += `- ${k}: ${v}\n`;
  g += "\n## Ficheros\n\n- `dedup.ris` — únicos para cribar\n- `duplicados.csv` — retirados (suplementario)\n"
    + "- `revisar.csv` — dudosos para decisión humana\n";
  // avisos de calidad
  const noId = kept.filter(r => !r.doi && !r.pmid).length;
  const noYear = kept.filter(r => !r.year).length;
  if (noId || noYear) {
    g += `\n## Avisos\n\n- Únicos sin DOI ni PMID: ${noId} (solo casables por título)\n- Únicos sin año: ${noYear}\n`;
  }
  return g;
}
