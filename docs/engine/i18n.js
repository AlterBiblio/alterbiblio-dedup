// i18n — internacionalización de la SALIDA (es/en). El MOTOR (dedup.js/dedup.py) NO se toca:
// sigue emitiendo los motivos en español (canónicos), y la paridad byte a byte se mantiene.
// Para inglés, la capa de salida traduce la etiqueta con reasonToEn() y usa cabeceras/informe EN.
// Port fiel: scripts/i18n.py es el gemelo Python; ante discrepancia manda i18n.py.

// Localiza la lista de campos en conflicto (doi/vol/pag) que aparece entre paréntesis.
function fieldsEn(s) {
  return s.replace(/\bpag\b/g, "page");
}

// Traducción español -> inglés del motivo. Lista ordenada [regex, fn]; primer match gana.
// Los regex reproducen EXACTAMENTE las cadenas del motor (incluidos — «≥» «¿?»).
const REASON_EN = [
  // fusiones (etiquetas cortas) — match exacto
  [/^PMID$/, () => "PMID"],
  [/^ID de Embase$/, () => "Embase ID"],
  [/^abstract$/, () => "abstract"],
  [/^título\+año$/, () => "title+year"],
  [/^DOI\+título$/, () => "DOI+title"],
  [/^título\+autor\+año~$/, () => "title+author+year~"],
  [/^vol\+pág\+autor\+año$/, () => "vol+page+author+year"],
  // dudosos (frases), específicos antes que generales
  [/^abstract casi idéntico pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$/,
    () => "near-identical abstract but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)"],
  [/^abstract casi idéntico pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$/,
    m => `near-identical abstract but ≥2 identifiers (${fieldsEn(m[1])}) in conflict (review)`],
  [/^título\+año idénticos pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$/,
    () => "identical title+year but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)"],
  [/^título\+año idénticos pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$/,
    m => `identical title+year but ≥2 identifiers (${fieldsEn(m[1])}) in conflict (review)`],
  [/^DOI igual, título similar ([\d.]+)$/,
    m => `same DOI, similar title ${m[1]}`],
  [/^título ([\d.]+)\+mismo autor pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$/,
    m => `title ${m[1]}+same author but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)`],
  [/^título ([\d.]+)\+mismo autor, abstract de congreso vs artículo \(¿misma obra\? mantener\/enlazar\)$/,
    m => `title ${m[1]}+same author, conference abstract vs article (same work? keep/link)`],
  [/^título ([\d.]+)\+autor\+año~ pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$/,
    m => `title ${m[1]}+author+year~ but ≥2 identifiers (${fieldsEn(m[2])}) in conflict (review)`],
  [/^título ([\d.]+)\+autor\+año~ \(revisar\)$/,
    m => `title ${m[1]}+author+year~ (review)`],
  [/^título casi idéntico ([\d.]+)\+mismo autor, años distintos \(¿abstract de congreso vs artículo\?\)$/,
    m => `near-identical title ${m[1]}+same author, different years (conference abstract vs article?)`],
  [/^mismo vol\+pág\+autor\+año pero títulos distintos ([\d.]+) \(revisar\)$/,
    m => `same vol+page+author+year but different titles ${m[1]} (review)`],
  [/^mismo ensayo clínico \((.+?)\) — posible duplicado \(comprobar cada uno en su fuente\)$/,
    m => `same clinical trial (${m[1]}) — possible duplicate (check each in its source)`],
  [/^títulos casi idénticos \(variación de escritura\) pero DOIs distintos — posible duplicado \(comprobar cada uno en su fuente, p. ej. por su DOI\)$/,
    () => "near-identical titles (spelling variant) but different DOIs — possible duplicate (check each in its source, e.g. by its DOI)"],
  [/^títulos casi idénticos \(variación de escritura, Jaro-Winkler\) — posible duplicado \(sin DOI\/PMID\/autor común\)$/,
    () => "near-identical titles (spelling variant, Jaro-Winkler) — possible duplicate (no shared DOI/PMID/author)"],
  [/^título casi idéntico ([\d.]+) \(sin DOI\/PMID\/autor común\)$/,
    m => `near-identical title ${m[1]} (no shared DOI/PMID/author)`],
  // compuestos con comment_kind (+ "mantener ambos")
  [/^artículo \+ fe de erratas\/corrección \(mantener ambos\)$/,
    () => "article + erratum/correction (keep both)"],
  [/^artículo \+ respuesta\/comentario \(mantener ambos\)$/,
    () => "article + reply/comment (keep both)"],
  [/^misma obra co-publicada en dos revistas \(publicación conjunta o doble publicación CME\) — mantener solo uno: el de PMID (\d+)$/,
    m => `same work co-published in two journals (joint or CME dual publication) — keep only one: the one with PMID ${m[1]}`],
  [/^misma obra co-publicada en dos revistas \(publicación conjunta o doble publicación CME\) — mantener solo uno: cualquiera \(mismo contenido\)$/,
    () => "same work co-published in two journals (joint or CME dual publication) — keep only one: either (same content)"],
];

export function reasonToEn(es) {
  if (es == null || es === "") return "";
  for (const [re, fn] of REASON_EN) { const m = re.exec(es); if (m) return fn(m); }
  return es;  // sin traducción conocida: se deja el original (nunca debería ocurrir)
}

// Traduce el motivo al idioma pedido (es = original del motor, en = traducido).
export function reasonI18n(es, lang) { return lang === "en" ? reasonToEn(es) : es; }

// Cabeceras de CSV por idioma (mismas claves internas, distinto rótulo en el fichero).
export const HEADERS = {
  duplicados: {
    es: { motivo: "motivo", fuente_retirada: "fuente_retirada", titulo_retirado: "titulo_retirado",
          doi_retirado: "doi_retirado", año_retirado: "año_retirado", tipo_retirado: "tipo_retirado",
          fuente_conservada: "fuente_conservada", titulo_conservado: "titulo_conservado",
          doi_conservado: "doi_conservado", tipo_conservado: "tipo_conservado" },
    en: { motivo: "reason", fuente_retirada: "removed_source", titulo_retirado: "removed_title",
          doi_retirado: "removed_doi", año_retirado: "removed_year", tipo_retirado: "removed_type",
          fuente_conservada: "kept_source", titulo_conservado: "kept_title",
          doi_conservado: "kept_doi", tipo_conservado: "kept_type" },
  },
  revisar: {
    es: { n: "n", motivo_duda: "motivo_duda", fuente_A: "fuente_A", titulo_A: "titulo_A", doi_A: "doi_A", año_A: "año_A", tipo_A: "tipo_A",
          fuente_B: "fuente_B", titulo_B: "titulo_B", doi_B: "doi_B", año_B: "año_B", tipo_B: "tipo_B" },
    en: { n: "n", motivo_duda: "review_reason", fuente_A: "source_A", titulo_A: "title_A", doi_A: "doi_A", año_A: "year_A", tipo_A: "type_A",
          fuente_B: "source_B", titulo_B: "title_B", doi_B: "doi_B", año_B: "year_B", tipo_B: "type_B" },
  },
  decisiones: {
    es: { n: "n", decision: "decision", titulo_A: "titulo_A", titulo_B: "titulo_B", motivo: "motivo" },
    en: { n: "n", decision: "decision", titulo_A: "title_A", titulo_B: "title_B", motivo: "reason" },
  },
  totales: {
    es: { estado: "estado", titulo: "titulo", año: "año", doi: "doi", pmid: "pmid", tipo: "tipo",
          fuente: "fuente", relacionado_con: "relacionado_con", motivo: "motivo" },
    en: { estado: "status", titulo: "title", año: "year", doi: "doi", pmid: "pmid", tipo: "type",
          fuente: "source", relacionado_con: "related_to", motivo: "reason" },
  },
};

// Estados del fichero resultados_totales.csv.
export const ESTADO = {
  mantenido: { es: "mantenido", en: "kept" },
  eliminado: { es: "eliminado", en: "removed" },
  vinculado: { es: "vinculado", en: "linked" },
  pendiente: { es: "pendiente", en: "unresolved" },
};
export function estadoLabel(code, lang) { const e = ESTADO[code]; return e ? (e[lang] || e.es) : code; }

// Frase lista para Material y Métodos, con los números reales.
// c: { total, sources: [[nombre, n], ...], removed, kept, referred }
export function methodsSentence(lang, c) {
  const srcList = c.sources.map(([s, n]) => `${s}, ${n}`).join("; ");
  const nDb = c.sources.length;
  if (lang === "en") {
    return `Deduplication was performed with alterbiblio-dedup (AlterBiblio; https://alterbiblio.github.io/alterbiblio-dedup/), `
      + `a conservative tool that never merges records on a shared DOI alone and keeps trial-registry records separate. `
      + `${c.total} records were identified from ${nDb} database${nDb !== 1 ? "s" : ""} (${srcList}). `
      + `${c.removed} duplicates were removed and ${c.kept} unique records were retained for screening; `
      + `${c.referred} ambiguous pairs were referred for human decision.`;
  }
  return `La deduplicación se realizó con alterbiblio-dedup (AlterBiblio; https://alterbiblio.github.io/alterbiblio-dedup/), `
    + `una herramienta conservadora que no fusiona registros por un DOI compartido de forma aislada y mantiene aparte `
    + `los registros de ensayos. Se identificaron ${c.total} registros procedentes de ${nDb} bases de datos (${srcList}). `
    + `Se eliminaron ${c.removed} duplicados y se conservaron ${c.kept} registros únicos para el cribado; `
    + `${c.referred} pares ambiguos se remitieron a decisión humana.`;
}

// Textos del informe markdown por idioma.
export const REPORT = {
  es: {
    h1: "Informe de deduplicación",
    method: "Método conservador: PMID · título+año · DOI+título (Jaccard≥umbral) · revista+vol+nº+pág. "
          + "El **DOI solo NO fusiona** (los abstracts de congreso comparten el DOI del suplemento). "
          + "Los emparejamientos dudosos se apartan a `revisar.csv` y **no** se fusionan.",
    numbers: "Números (para PRISMA)", colSource: "Fuente", colIdentified: "Registros identificados",
    total: "Total", dupRemoved: "Duplicados retirados", reviewKept: "Dudosos apartados a revisión (conservados)",
    uniqueScreening: "Registros únicos para cribado",
    overlap: "Solapamiento entre bases (registros presentes en 2+)",
    files: "Ficheros", fDedup: "`dedup.ris` — únicos para cribar", fDups: "`duplicados.csv` — retirados (suplementario)",
    fReview: "`revisar.csv` — dudosos para decisión humana",
    warnings: "Avisos", noId: "Únicos sin DOI ni PMID", noIdTail: "(solo casables por título)", noYear: "Únicos sin año",
    methodsHeading: "Frase para Material y Métodos",
  },
  en: {
    h1: "Deduplication report",
    method: "Conservative method: PMID · title+year · DOI+title (Jaccard≥threshold) · journal+vol+no+pages. "
          + "A **shared DOI alone does NOT merge** (conference abstracts share the supplement DOI). "
          + "Ambiguous pairs are set aside in `revisar.csv` and are **not** merged.",
    numbers: "Numbers (for PRISMA)", colSource: "Source", colIdentified: "Records identified",
    total: "Total", dupRemoved: "Duplicates removed", reviewKept: "Ambiguous pairs set aside for review (kept)",
    uniqueScreening: "Unique records for screening",
    overlap: "Overlap between databases (records present in 2+)",
    files: "Files", fDedup: "`dedup.ris` — unique records for screening", fDups: "`duplicados.csv` — removed (supplementary)",
    fReview: "`revisar.csv` — ambiguous pairs for human decision",
    warnings: "Warnings", noId: "Unique records without DOI or PMID", noIdTail: "(matchable by title only)", noYear: "Unique records without year",
    methodsHeading: "Sentence for Methods",
  },
};

// Cadenas de la interfaz web por idioma.
export const UI = {
  es: {
    tagline: 'Deduplicación conservadora de resultados de búsqueda, antes del cribado. Todo se procesa <b>en tu navegador</b>: ningún fichero sale de tu ordenador.',
    s1: "Deduplicación · sube las exportaciones",
    s1note: "Un fichero por base de datos (RIS <code>.ris</code>, MEDLINE/PubMed <code>.nbib</code>, PubMed XML <code>.xml</code>, BibTeX <code>.bib</code> o CSV). La etiqueta de cada fichero es el nombre de la fuente en el recuento y el solapamiento.",
    drop: "<b>Arrastra aquí</b> tus ficheros o <u>haz clic para elegirlos</u>",
    revlabel: "Título de la revisión (para el diagrama PRISMA)",
    revph: "p. ej. Sarcopenia y complicaciones tras cistectomía radical",
    run: "Deduplicar", srcword: "fuente:",
    hint0: "Añade al menos un fichero.", hint1: "fichero listo", hintN: "ficheros listos",
    s2: "Resultado",
    s3: "Dudosos · requieren verificación humana",
    s3note: 'La herramienta <b>no fusiona a ciegas</b>: decide para cada par si es la misma obra. <b>Despliega para ver las referencias completas</b> (incluido el resumen). Elige <b>Registro A</b> o <b>Registro B</b> (es un duplicado, te quedas con esa versión), <b>Diferentes pero relacionados</b> (registros distintos emparentados —artículos hermanos, mismo ensayo—: se quedan los dos, enlazados), <b>Mantener ambos</b> (registros distintos sin relación) o <b>Decidir en la criba</b> (se quedan los dos, lo resuelves en Rayyan).',
    s4: "Diagrama PRISMA 2020",
    prismaGate: "Se genera cuando cada dudoso tiene una decisión (arriba). Pendientes:",
    dlPptx: "Descargar PRISMA editable (PPT)", dlSvg: "PRISMA (SVG)", dlPng: "PRISMA (PNG)",
    prismaNote: "Las cajas posteriores al cribado van vacías en el PPT (<code>n = ____</code>) para que las completes tras el cribado y la selección.",
    s5: "Descarga de archivos", s5note: "Los archivos reflejan tus decisiones sobre los dudosos.",
    s6: "Informe completo",
    mId: "Identificados", mDup: "Duplicados retirados", mUniq: "Únicos para cribar", mPend: "Dudosos sin resolver",
    noPairs: "No hay pares dudosos: la deduplicación fue inequívoca.",
    nextPending: "↓ siguiente sin decidir", allDoneMsg: "Todo decidido ✓",
    pendLeft: n => `Faltan ${n} por decidir`,
    recA: "Registro A", recB: "Registro B", related: "Diferentes pero relacionados", keepBoth: "Mantener ambos", inScreen: "Decidir en la criba",
    undecided: "sin decidir", lblA: "conservar A", lblB: "conservar B", lblRelated: "relacionados", lblBoth: "ambos", lblScreen: "en la criba",
    suggested: "sugerido:",
    badgePosible: "posible duplicado", posibleNota: "Marcados como «posible duplicado»: dos identificadores distintos (DOIs, ensayo, accesión). La herramienta te propone una acción por defecto (botón resaltado) —conservar ambos si son obras relacionadas, o quedarte con un registro si son la misma ficha duplicada—, pero valídalo tú: confírmala o cámbiala en cada uno.",
    noTitle: "(sin título)", noAbs: "(sin resumen)", srcLabel: "fuente:", docType: "tipo",
    dlDedup: "⬇ dedup.ris (únicos)", dlDups: "⬇ duplicados.csv", dlReview: "⬇ revisar.csv (sin resolver)",
    dlDecisions: "⬇ decisiones.csv", dlReport: "⬇ informe.rtf (Word)", dlTotales: "⬇ resultados_totales.csv",
    dlExcel: "⬇ Excel maestro (.xlsx)", dlExcelFile: "cribado_maestro.xlsx",
    footerTool: "Herramienta abierta de", footerRest: "· deduplicación conservadora ·", footerGh: "código y algoritmo en GitHub",
    footerPrinciple: "El DOI por sí solo nunca fusiona; los registros de ensayo se mantienen aparte; los pares ambiguos van a decisión humana.",
    citeHead: "Cómo citar", citeCopy: "Copiar", citeCopied: "¡Copiado!",
    prIdentified: "Registros identificados de bases de datos", prTotal: "Total", prRemoved: "Registros eliminados antes del cribado:",
    prDupRemoved: "Duplicados eliminados", prAuto: "Marcados no elegibles por automatización", prOther: "Eliminados por otros motivos",
    prScreened: "Registros cribados", prPending: "Dudosos sin resolver", prPendingTail: "resolver en el cribado",
    prToScreening: "Cribado y selección → herramienta de revisión",
    prBandId: "Identificación", prBandScreen: "Cribado",
    langName: "EN", htmlLang: "es",
  },
  en: {
    tagline: 'Conservative deduplication of search results, before screening. Everything runs <b>in your browser</b>: no file leaves your computer.',
    s1: "Deduplication · upload your exports",
    s1note: "One file per database (RIS <code>.ris</code>, MEDLINE/PubMed <code>.nbib</code>, PubMed XML <code>.xml</code>, BibTeX <code>.bib</code> or CSV). Each file's label is the source name used in the counts and the overlap matrix.",
    drop: "<b>Drag your files here</b> or <u>click to choose them</u>",
    revlabel: "Review title (for the PRISMA diagram)",
    revph: "e.g. Sarcopenia and complications after radical cystectomy",
    run: "Deduplicate", srcword: "source:",
    hint0: "Add at least one file.", hint1: "file ready", hintN: "files ready",
    s2: "Result",
    s3: "Ambiguous pairs · need human review",
    s3note: 'The tool <b>does not merge blindly</b>: decide for each pair whether it is the same work. <b>Expand to see the full references</b> (including the abstract). Choose <b>Record A</b> or <b>Record B</b> (it is a duplicate, keep that version), <b>Different but related</b> (distinct but related works —companion papers, same trial—: both kept and linked), <b>Keep both</b> (distinct, unrelated works) or <b>Decide at screening</b> (both kept, you resolve it in Rayyan).',
    s4: "PRISMA 2020 diagram",
    prismaGate: "Generated once every ambiguous pair has a decision (above). Pending:",
    dlPptx: "Download editable PRISMA (PPT)", dlSvg: "PRISMA (SVG)", dlPng: "PRISMA (PNG)",
    prismaNote: "The post-screening boxes are left empty in the PPT (<code>n = ____</code>) for you to complete after screening and selection.",
    s5: "Download files", s5note: "The files reflect your decisions on the ambiguous pairs.",
    s6: "Full report",
    mId: "Identified", mDup: "Duplicates removed", mUniq: "Unique for screening", mPend: "Unresolved ambiguous",
    noPairs: "No ambiguous pairs: deduplication was unambiguous.",
    nextPending: "↓ next undecided", allDoneMsg: "All decided ✓",
    pendLeft: n => `${n} left to decide`,
    recA: "Record A", recB: "Record B", related: "Different but related", keepBoth: "Keep both", inScreen: "Decide at screening",
    undecided: "undecided", lblA: "keep A", lblB: "keep B", lblRelated: "related", lblBoth: "both", lblScreen: "at screening",
    suggested: "suggested:",
    badgePosible: "possible duplicate", posibleNota: "Flagged as “possible duplicate”: two distinct identifiers (DOIs, trial, accession). The tool proposes a default action (highlighted button) —keep both if they are related works, or keep one record if they are the same entry duplicated—, but you validate it: confirm or change it on each one.",
    noTitle: "(no title)", noAbs: "(no abstract)", srcLabel: "source:", docType: "type",
    dlDedup: "⬇ dedup.ris (unique)", dlDups: "⬇ duplicados.csv", dlReview: "⬇ revisar.csv (unresolved)",
    dlDecisions: "⬇ decisiones.csv", dlReport: "⬇ report.rtf (Word)", dlTotales: "⬇ resultados_totales.csv",
    dlExcel: "⬇ Master Excel (.xlsx)", dlExcelFile: "screening_master.xlsx",
    footerTool: "An open tool by", footerRest: "· conservative deduplication ·", footerGh: "code and algorithm on GitHub",
    footerPrinciple: "A shared DOI alone never merges; trial-registry records are kept separate; ambiguous pairs go to human decision.",
    citeHead: "How to cite", citeCopy: "Copy", citeCopied: "Copied!",
    prIdentified: "Records identified from databases", prTotal: "Total", prRemoved: "Records removed before screening:",
    prDupRemoved: "Duplicates removed", prAuto: "Marked ineligible by automation", prOther: "Removed for other reasons",
    prScreened: "Records screened", prPending: "Unresolved ambiguous", prPendingTail: "resolve at screening",
    prToScreening: "Screening and selection → review tool",
    prBandId: "Identification", prBandScreen: "Screening",
    langName: "ES", htmlLang: "en",
  },
};
