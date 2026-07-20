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
  [/^abstract casi idéntico pero DOIs distintos — posible duplicado \(conservar ambos\)$/,
    () => "near-identical abstract but different DOIs — possible duplicate (keep both)"],
  [/^abstract casi idéntico pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$/,
    m => `near-identical abstract but ≥2 identifiers (${fieldsEn(m[1])}) in conflict (review)`],
  [/^título\+año idénticos pero DOIs distintos — posible duplicado \(conservar ambos\)$/,
    () => "identical title+year but different DOIs — possible duplicate (keep both)"],
  [/^título\+año idénticos pero ≥2 identificadores \((.+?)\) discrepantes \(revisar\)$/,
    m => `identical title+year but ≥2 identifiers (${fieldsEn(m[1])}) in conflict (review)`],
  [/^DOI igual, título similar ([\d.]+)$/,
    m => `same DOI, similar title ${m[1]}`],
  [/^título ([\d.]+)\+mismo autor pero DOIs distintos — posible duplicado \(conservar ambos\)$/,
    m => `title ${m[1]}+same author but different DOIs — possible duplicate (keep both)`],
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
  [/^mismo ensayo clínico \((.+?)\) — posible duplicado \(conservar ambos\)$/,
    m => `same clinical trial (${m[1]}) — possible duplicate (keep both)`],
  [/^títulos casi idénticos \(variación de escritura\) pero DOIs distintos — posible duplicado \(conservar ambos\)$/,
    () => "near-identical titles (spelling variant) but different DOIs — possible duplicate (keep both)"],
  [/^títulos casi idénticos \(variación de escritura, Jaro-Winkler\) — posible duplicado \(sin DOI\/PMID\/autor común\)$/,
    () => "near-identical titles (spelling variant, Jaro-Winkler) — possible duplicate (no shared DOI/PMID/author)"],
  [/^título casi idéntico ([\d.]+) \(sin DOI\/PMID\/autor común\)$/,
    m => `near-identical title ${m[1]} (no shared DOI/PMID/author)`],
  // compuestos con comment_kind (+ "mantener ambos")
  [/^artículo \+ fe de erratas\/corrección \(mantener ambos\)$/,
    () => "article + erratum/correction (keep both)"],
  [/^artículo \+ respuesta\/comentario \(mantener ambos\)$/,
    () => "article + reply/comment (keep both)"],
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
          doi_retirado: "doi_retirado", año_retirado: "año_retirado",
          fuente_conservada: "fuente_conservada", titulo_conservado: "titulo_conservado", doi_conservado: "doi_conservado" },
    en: { motivo: "reason", fuente_retirada: "removed_source", titulo_retirado: "removed_title",
          doi_retirado: "removed_doi", año_retirado: "removed_year",
          fuente_conservada: "kept_source", titulo_conservado: "kept_title", doi_conservado: "kept_doi" },
  },
  revisar: {
    es: { n: "n", motivo_duda: "motivo_duda", fuente_A: "fuente_A", titulo_A: "titulo_A", doi_A: "doi_A", año_A: "año_A",
          fuente_B: "fuente_B", titulo_B: "titulo_B", doi_B: "doi_B", año_B: "año_B" },
    en: { n: "n", motivo_duda: "review_reason", fuente_A: "source_A", titulo_A: "title_A", doi_A: "doi_A", año_A: "year_A",
          fuente_B: "source_B", titulo_B: "title_B", doi_B: "doi_B", año_B: "year_B" },
  },
  decisiones: {
    es: { n: "n", decision: "decision", titulo_A: "titulo_A", titulo_B: "titulo_B", motivo: "motivo" },
    en: { n: "n", decision: "decision", titulo_A: "title_A", titulo_B: "title_B", motivo: "reason" },
  },
};

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
    s3note: 'La herramienta <b>no fusiona a ciegas</b>: decide para cada par si es la misma obra. <b>Despliega para ver las referencias completas</b> (incluido el resumen). Elige <b>Registro A</b>, <b>Registro B</b>, <b>Mantener ambos</b> (obras distintas) o <b>Decidir en la criba</b> (se quedan los dos, lo resuelves en Rayyan).',
    s4: "Diagrama PRISMA 2020",
    prismaGate: "Se genera cuando cada dudoso tiene una decisión (arriba). Pendientes:",
    dlPptx: "Descargar PRISMA editable (PPT)", dlSvg: "PRISMA (SVG)", dlPng: "PRISMA (PNG)",
    prismaNote: "Las cajas posteriores al cribado van vacías en el PPT (<code>n = ____</code>) para que las completes tras el cribado y la selección.",
    s5: "Descarga de archivos", s5note: "Los archivos reflejan tus decisiones sobre los dudosos.",
    s6: "Informe completo",
    mId: "Identificados", mDup: "Duplicados retirados", mUniq: "Únicos para cribar", mPend: "Dudosos sin resolver",
    noPairs: "No hay pares dudosos: la deduplicación fue inequívoca.",
    recA: "Registro A", recB: "Registro B", keepBoth: "Mantener ambos", inScreen: "Decidir en la criba",
    undecided: "sin decidir", lblA: "conservar A", lblB: "conservar B", lblBoth: "ambos", lblScreen: "en la criba",
    noTitle: "(sin título)", noAbs: "(sin resumen)", srcLabel: "fuente:",
    dlDedup: "⬇ dedup.ris (únicos)", dlDups: "⬇ duplicados.csv", dlReview: "⬇ revisar.csv (sin resolver)",
    dlDecisions: "⬇ decisiones.csv", dlReport: "⬇ informe.rtf (Word)",
    footerTool: "Herramienta abierta de", footerRest: "· deduplicación conservadora ·", footerGh: "código y algoritmo en GitHub",
    footerPrinciple: "El DOI por sí solo nunca fusiona; los registros de ensayo se mantienen aparte; los pares ambiguos van a decisión humana.",
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
    s3note: 'The tool <b>does not merge blindly</b>: decide for each pair whether it is the same work. <b>Expand to see the full references</b> (including the abstract). Choose <b>Record A</b>, <b>Record B</b>, <b>Keep both</b> (distinct works) or <b>Decide at screening</b> (both are kept, you resolve it in Rayyan).',
    s4: "PRISMA 2020 diagram",
    prismaGate: "Generated once every ambiguous pair has a decision (above). Pending:",
    dlPptx: "Download editable PRISMA (PPT)", dlSvg: "PRISMA (SVG)", dlPng: "PRISMA (PNG)",
    prismaNote: "The post-screening boxes are left empty in the PPT (<code>n = ____</code>) for you to complete after screening and selection.",
    s5: "Download files", s5note: "The files reflect your decisions on the ambiguous pairs.",
    s6: "Full report",
    mId: "Identified", mDup: "Duplicates removed", mUniq: "Unique for screening", mPend: "Unresolved ambiguous",
    noPairs: "No ambiguous pairs: deduplication was unambiguous.",
    recA: "Record A", recB: "Record B", keepBoth: "Keep both", inScreen: "Decide at screening",
    undecided: "undecided", lblA: "keep A", lblB: "keep B", lblBoth: "both", lblScreen: "at screening",
    noTitle: "(no title)", noAbs: "(no abstract)", srcLabel: "source:",
    dlDedup: "⬇ dedup.ris (unique)", dlDups: "⬇ duplicados.csv", dlReview: "⬇ revisar.csv (unresolved)",
    dlDecisions: "⬇ decisiones.csv", dlReport: "⬇ report.rtf (Word)",
    footerTool: "An open tool by", footerRest: "· conservative deduplication ·", footerGh: "code and algorithm on GitHub",
    footerPrinciple: "A shared DOI alone never merges; trial-registry records are kept separate; ambiguous pairs go to human decision.",
    prIdentified: "Records identified from databases", prTotal: "Total", prRemoved: "Records removed before screening:",
    prDupRemoved: "Duplicates removed", prAuto: "Marked ineligible by automation", prOther: "Removed for other reasons",
    prScreened: "Records screened", prPending: "Unresolved ambiguous", prPendingTail: "resolve at screening",
    prToScreening: "Screening and selection → review tool",
    prBandId: "Identification", prBandScreen: "Screening",
    langName: "ES", htmlLang: "en",
  },
};
