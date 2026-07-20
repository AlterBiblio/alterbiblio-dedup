// Orquestador del motor de deduplicación — equivalente a main() de dedup.py:523-567
// sin E/S de disco ni CLI: las entradas llegan ya leídas y el resultado se devuelve
// en memoria. Python es la referencia.
//
// Entrada: [{ name, text, source }]  (source opcional: si falta, nombre base sin extensión)
// Salida:  { ris, dups, review, counts, informe }

import { detectFormat, PARSERS } from "./parsers.js";
import { dedup } from "./dedup.js";
import { escribirRis, filasDuplicados, filasRevisar, informe } from "./output.js";

// dedup.py:517-521
function errFormato(name) {
  return `ERROR: no reconozco el formato de '${name}'.\n`
    + "Formatos admitidos: RIS (.ris), MEDLINE/PubMed (.nbib), "
    + "PubMed XML (.xml), BibTeX (.bib), CSV (.csv).\n"
    + "Guía de exportación por base de datos: docs/guia-exportacion.md";
}

function nombreBase(name) {
  const base = (name || "").split(/[\\/]/).pop();
  const d = base.lastIndexOf(".");
  return d > 0 ? base.slice(0, d) : base;
}

export function deduplicar(entradas, opts = {}) {
  const { mergeThr = 0.5, reviewThr = 0.3, format = null, lang = "es" } = opts;
  const allrecs = [];
  const counts = new Map();
  for (const { name, text, source } of entradas) {
    const fmt = format || detectFormat(name, text);
    if (fmt === null) throw new Error(errFormato(name));
    const src = (source || "").trim() || nombreBase(name);
    const recs = PARSERS[fmt](text, src);
    if (!recs.length) {
      // CSV llegado por sniff sin registros: problema de formato, no de corrupción
      const ext = "." + (name || "").split(".").pop().toLowerCase();
      const csvPorSniff = fmt === "csv" && !format && ext !== ".csv";
      if (csvPorSniff) throw new Error(errFormato(name));
      console.error(`AVISO: '${name}' leído como ${fmt} pero contiene 0 registros (¿export corrupto?)`);
    }
    counts.set(src, (counts.get(src) ?? 0) + recs.length);
    allrecs.push(...recs);
  }
  if (!allrecs.length) throw new Error("ERROR: 0 registros en total; nada que deduplicar.");
  // Orden canónico independiente del orden de los ficheros de entrada (equivalente a
  // dedup.py main): el resultado depende sólo del CONJUNTO de registros. El benchmark
  // llama a dedup() directamente y conserva su propio control de orden.
  allrecs.sort((x, y) => {
    const a = [x.ntitle, x.year, x.doi, x.pmid, x.source, x.title];
    const b = [y.ntitle, y.year, y.doi, y.pmid, y.source, y.title];
    for (let k = 0; k < a.length; k++) { if (a[k] < b[k]) return -1; if (a[k] > b[k]) return 1; }
    return 0;
  });
  const { kept, removed, review } = dedup(allrecs, { mergeThr, reviewThr });
  return {
    ris: escribirRis(kept),
    dups: filasDuplicados(removed, lang),
    review: filasRevisar(review, lang),
    counts: {
      total: allrecs.length, unicos: kept.length,
      duplicados: removed.length, dudosos: review.length,
      porFuente: Object.fromEntries(counts),
    },
    informe: informe(counts, kept, removed, review, lang),
    // --- extras para la resolución humana en la web (no afectan a CLI/CSV/paridad) ---
    kept,               // registros conservados (objetos completos)
    removed,            // [{ r, keptr, reason }]
    reviewFull: review.map((p, i) => ({ n: i + 1, reason: p.reason, a: p.r, b: p.other })),
    srcCounts: counts,  // Map fuente -> nº identificados (para regenerar el informe)
  };
}

// Reexportados para que la web regenere las salidas tras aplicar las decisiones humanas.
export { escribirRis, filasDuplicados, filasRevisar, informe } from "./output.js";
