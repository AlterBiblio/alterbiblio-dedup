// Clasificador de tipo de estudio PROVISIONAL para el cribado — port fiel de
// scripts/clasificar.py (Python es la referencia).
//
// Prioridad de la evidencia: primero la tipología que declara la propia base
// (PubMed `PT` / Embase `M3`) — fiabilidad ALTA; si la base sólo da un genérico
// ("Journal Article"/"Article") o nada, se infiere del título/resumen — fiabilidad
// SUGERIDA. Si no hay nada, "Sin determinar".
//
// Es una AYUDA al cribador, no una clasificación definitiva: la etiqueta y su
// nivel de fiabilidad van juntas en la Excel para que la persona sepa cuánto fiarse.
import { jaroWinkler, normTitle } from "./normalize.js";

// clasificar.py:20-32 — taxonomía ordenada por prioridad (menor = gana).
const TAXO = [
  [1,  "Registro de ensayo clínico",         [/trial registry record/]],
  [2,  "Revisión sistemática o metaanálisis",[/systematic review/, /meta-?analysis/]],
  [3,  "Revisión de alcance (scoping)",      [/scoping review/]],
  [4,  "Ensayo clínico aleatorizado",        [/randomized controlled trial/, /randomised controlled trial/, /equivalence trial/]],
  [5,  "Ensayo clínico / protocolo",         [/clinical trial protocol/, /^clinical trial$/, /\bclinical trial\b/]],
  [6,  "Estudio observacional",              [/observational study/, /comparative study/, /validation study/]],
  [7,  "Caso clínico o serie de casos",      [/case reports?/]],
  [8,  "Revisión (narrativa)",               [/^review$/, /\breview\b/, /short survey/]],
  [9,  "Resumen de congreso",                [/conference abstract/, /conference paper/, /conference proceeding/]],
  [10, "Carta, editorial o comentario",      [/\bcomment\b/, /\bletter\b/, /\beditorial\b/, /^note$/]],
  [11, "Fe de erratas / corrección",         [/erratum/, /correction/, /corrigendum/]],
];
// clasificar.py:34-36 — genéricos que NO determinan tipo por sí solos.
const GENERICOS = [/journal article/, /^article$/, /article in press/, /english abstract/,
  /research support/, /multicenter study/, /conference proceeding.*journal/, /^note$/];

// clasificar.py:39-48 — heurística de título/resumen (fiabilidad sugerida).
const HEUR = [
  ["Revisión sistemática o metaanálisis", /\bsystematic review\b|\bmeta-?analysis\b|\bmetaanalisis\b|revisi[oó]n sistem[aá]tica/],
  ["Ensayo clínico aleatorizado",         /\brandomi[sz]ed\b|\brandomi[sz]ed controlled\b|\brct\b|ensayo.*aleatoriz/],
  ["Ensayo clínico / protocolo",          /\bclinical trial\b|\bstudy protocol\b|\bprotocol\b\s*$|ensayo cl[ií]nico/],
  ["Estudio observacional",               /\bcohort\b|\bcase[- ]control\b|\bcross[- ]sectional\b|\bprospective\b|\bretrospective\b|\bregistry\b|cohorte|casos y controles/],
  ["Caso clínico o serie de casos",       /\bcase report\b|\bcase series\b|\ba case of\b|caso cl[ií]nico/],
  ["Revisión (narrativa)",                /\bnarrative review\b|\bliterature review\b|\ba review of\b|:\s*a review\b|\breview article\b|revisi[oó]n narrativa/],
  ["Resumen de congreso",                 /\bmeeting abstract\b|\bconference\b/],
];

function matchTaxo(ptypes) {
  let best = null;
  for (const p of ptypes) {
    const pl = p.trim().toLowerCase();
    for (const [pri, label, pats] of TAXO) {
      if (pats.some(rx => rx.test(pl))) {
        if (best === null || pri < best[0]) best = [pri, label];
      }
    }
  }
  return best;
}

function heuristica(rec) {
  const texto = ((rec.title || "") + " " + (rec.abstract || "")).toLowerCase();
  for (const [label, rx] of HEUR) if (rx.test(texto)) return label;
  return null;
}

// clasificar.py:74-96
export function clasificarEstudio(rec) {
  const ptypes = rec.ptypes || [];
  const taxo = matchTaxo(ptypes);
  if (taxo !== null) return [taxo[1], "Alta (base)"];
  const heur = heuristica(rec);
  if (heur !== null) {
    const sp = rec.spage || "";
    if (/^[A-Za-z]\d/.test(sp) && heur === "Revisión (narrativa)") {
      return ["Resumen de congreso", "Sugerida (título)"];
    }
    return [heur, "Sugerida (título)"];
  }
  if (/^[A-Za-z]\d/.test(rec.spage || "")) return ["Resumen de congreso", "Sugerida (página)"];
  if (ptypes.length) return ["Artículo (sin especificar)", "Sin determinar"];
  return ["Sin determinar", "Sin determinar"];
}

// clasificar.py:102-118 — confianza de un par "posible duplicado" (2ª señal, estilo
// ASySD, sin fusionar). NO cambia que se conserven ambos.
export function confianzaPar(a, b, reason = "") {
  const r = (reason || "").toLowerCase();
  if (r.includes("comentario") || r.includes("respuesta") || r.includes("erratas") || r.includes("corrección")) {
    return "Baja (documentos relacionados, no el mismo)";
  }
  if (r.includes("mismo ensayo")) return "Alta (mismo ensayo clínico)";
  const jw = jaroWinkler(a.ntitle || "", b.ntitle || "");
  const sameYear = Boolean(a.year) && a.year === b.year;
  const sameAuthor = Boolean(a.fauthor) && a.fauthor === b.fauthor;
  const samePage = Boolean(a.start_page) && a.start_page === b.start_page;
  const sameJournal = Boolean(a.journal) && normTitle(a.journal || "") === normTitle(b.journal || "");
  if (jw >= 0.97 || (jw >= 0.92 && (sameAuthor || samePage || sameJournal))) return "Alta";
  if (jw >= 0.90 || (sameAuthor && sameYear) || samePage) return "Media";
  return "Baja";
}
