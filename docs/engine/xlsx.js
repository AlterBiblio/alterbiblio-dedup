// Excel maestro del cribado en el NAVEGADOR — espejo de scripts/excel_maestro.py
// (3 hojas: Referencias · Duplicados eliminados · Resumen PRISMA), generado como
// SpreadsheetML plano y empaquetado con el ZIP store-only de la web (sin dependencias),
// el mismo enfoque que el PPTX. Python/openpyxl es la referencia visual; aquí se
// replican columnas, orden, estilos (Montserrat, cabecera negra, sombreado de posibles),
// validación Sí/No/Quizás, panel congelado y autofiltro.
//
// A diferencia del CLI (castellano), la web es bilingüe: cabeceras, nombres de hoja
// y etiquetas del clasificador se traducen cuando lang="en".
import { clasificarEstudio, confianzaPar } from "./clasificar.js";
import { reasonI18n } from "./i18n.js";

// ---------- i18n propio del Excel ----------
const L = {
  es: {
    sheets: ["Referencias", "Duplicados eliminados", "Resumen PRISMA"],
    h1: ["Nº", "Incluir?", "Autores", "Año", "Título", "Revista",
         "Tipo de estudio (provisional)", "Fiabilidad", "DOI", "PMID",
         "Fuente(s)", "⚠️ Posible duplicado o relacionado (conservado)"],
    h2: ["Nº", "Título eliminado", "Año", "DOI", "PMID", "Fuente eliminada",
         "Regla de coincidencia", "Coincide con (título)", "DOI conservado", "Fuente conservada"],
    h3: ["Concepto", "Valor"],
    dvList: '"Sí,No,Quizás"',
    posDe: (t, reason, conf) => `Posible duplicado o relacionado con «${t}» — ${reason} · Confianza: ${conf}`,
    r3: {
      porBase: "Registros identificados por base", total: "Total identificados",
      dup: "Duplicados eliminados", unicos: "Registros únicos para cribado",
      posibles: "Posibles duplicados o relacionados anotados (conservados)",
    },
    boldRow: (k) => k.startsWith("Total") || k.includes("únicos"),
    label: (s) => s,
  },
  en: {
    sheets: ["References", "Removed duplicates", "PRISMA summary"],
    h1: ["No.", "Include?", "Authors", "Year", "Title", "Journal",
         "Study type (provisional)", "Reliability", "DOI", "PMID",
         "Source(s)", "⚠️ Possible duplicate or related (kept)"],
    h2: ["No.", "Removed title", "Year", "DOI", "PMID", "Removed source",
         "Matching rule", "Matches (title)", "Kept DOI", "Kept source"],
    h3: ["Item", "Value"],
    dvList: '"Yes,No,Maybe"',
    posDe: (t, reason, conf) => `Possible duplicate or related to “${t}” — ${reason} · Confidence: ${conf}`,
    r3: {
      porBase: "Records identified per database", total: "Total identified",
      dup: "Duplicates removed", unicos: "Unique records for screening",
      posibles: "Possible duplicates or related flagged (kept)",
    },
    boldRow: (k) => k.startsWith("Total") || k.includes("Unique"),
    label: (s) => LABELS_EN[s] || s,
  },
};
// Etiquetas del clasificador (clasificar.js, castellano de referencia) en inglés.
const LABELS_EN = {
  "Registro de ensayo clínico": "Clinical trial registry record",
  "Revisión sistemática o metaanálisis": "Systematic review or meta-analysis",
  "Revisión de alcance (scoping)": "Scoping review",
  "Ensayo clínico aleatorizado": "Randomized controlled trial",
  "Ensayo clínico / protocolo": "Clinical trial / protocol",
  "Estudio observacional": "Observational study",
  "Caso clínico o serie de casos": "Case report or case series",
  "Revisión (narrativa)": "Review (narrative)",
  "Resumen de congreso": "Conference abstract",
  "Carta, editorial o comentario": "Letter, editorial or comment",
  "Fe de erratas / corrección": "Erratum / correction",
  "Artículo (sin especificar)": "Article (unspecified)",
  "Sin determinar": "Undetermined",
  "Alta (base)": "High (database)",
  "Sugerida (título)": "Suggested (title)",
  "Sugerida (página)": "Suggested (page)",
  "Alta": "High", "Media": "Medium", "Baja": "Low",
  "Alta (mismo ensayo clínico)": "High (same clinical trial)",
  "Baja (documentos relacionados, no el mismo)": "Low (related documents, not the same)",
};

// ---------- helpers de datos (excel_maestro.py:32-53) ----------
function autores(rec, n = 3) {
  const a = rec.authors || [];
  if (!a.length) return "";
  return a.slice(0, n).join("; ") + (a.length > n ? " et al." : "");
}
function fuentes(rec) { return [rec.source, ...(rec.also_in || [])].join("; "); }
function short(t, n = 70) {
  t = (t || "").trim();
  return t.length <= n ? t : t.slice(0, n - 1) + "…";
}
function posiblesMap(review, lang) {
  const m = new Map();
  for (const { r, other, reason } of review) {
    const conf = L[lang].label(confianzaPar(r, other, reason));
    for (const [a, b] of [[r, other], [other, r]]) {
      const txt = L[lang].posDe(short(b.title, 55), reasonI18n(reason, lang), conf);
      if (!m.has(a)) m.set(a, []);
      m.get(a).push(txt);
    }
  }
  return m;
}

// ---------- SpreadsheetML ----------
function xmlEsc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function colLetter(j) { // 1-indexed
  let s = "";
  while (j > 0) { const m = (j - 1) % 26; s = String.fromCharCode(65 + m) + s; j = (j - 1 - m) / 26; }
  return s;
}
// Celda: números como number, todo lo demás inline string. s = índice de estilo.
function cell(rowN, colN, v, s) {
  const ref = colLetter(colN) + rowN;
  if (typeof v === "number" && Number.isFinite(v)) {
    return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
  }
  const t = String(v ?? "");
  if (t === "") return `<c r="${ref}" s="${s}"/>`;
  return `<c r="${ref}" t="inlineStr" s="${s}"><is><t xml:space="preserve">${xmlEsc(t)}</t></is></c>`;
}

// Estilos (índices de cellXfs):
//  0 celda base · 1 CABECERA (negra, Montserrat blanca, wrap) · 2 celda top ·
//  3 celda wrap · 4 celda top sombreada (posible dup) · 5 celda wrap sombreada ·
//  6 celda top negrita (totales hoja 3)
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="10"/><name val="Montserrat"/></font>
<font><b/><sz val="10"/><color rgb="FFF7F7F7"/><name val="Montserrat"/></font>
<font><b/><sz val="10"/><name val="Montserrat"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF000000"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFCFCEA"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFE7E7E7"/></left><right style="thin"><color rgb="FFE7E7E7"/></right><top style="thin"><color rgb="FFE7E7E7"/></top><bottom style="thin"><color rgb="FFE7E7E7"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml({ headers, rows, widths, wrapCols, dupRows, dvCol, dvList, autoFilter, boldRows }) {
  // rows: array de arrays de valores; dupRows: Set de índices (0-based) sombreados
  // en Nº y última columna (excel_maestro.py:89-90); boldRows: Set con negrita.
  const nCols = headers.length;
  const cols = widths.map((w, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  let sd = `<row r="1">` + headers.map((h, j) => cell(1, j + 1, h, 1)).join("") + `</row>`;
  rows.forEach((vals, i) => {
    const rN = i + 2;
    sd += `<row r="${rN}">` + vals.map((v, j) => {
      const wrap = wrapCols.has(j + 1);
      let s = wrap ? 3 : 2;
      if (dupRows && dupRows.has(i) && (j === 0 || j === nCols - 1)) s = wrap ? 5 : 4;
      if (boldRows && boldRows.has(i)) s = 6;
      return cell(rN, j + 1, v, s);
    }).join("") + `</row>`;
  });
  const lastRef = `${colLetter(nCols)}${rows.length + 1}`;
  const dv = dvCol
    ? `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" sqref="${colLetter(dvCol)}2:${colLetter(dvCol)}${rows.length + 1}"><formula1>${xmlEsc(dvList)}</formula1></dataValidation></dataValidations>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${sd}</sheetData>
${autoFilter ? `<autoFilter ref="A1:${lastRef}"/>` : ""}${dv}
</worksheet>`;
}

// ---------- generador principal ----------
// kept/removed/review con la forma del motor JS ({r, keptr, reason} / {r, other, reason});
// counts: Map o objeto fuente -> nº identificados. Devuelve Map nombre -> string XML,
// listo para writeStoredZip (codificando a UTF-8 en el llamador).
export function excelMaestroFiles(kept, removed, review, counts, lang = "es") {
  const t = L[lang] || L.es;
  const posibles = posiblesMap(review, lang in L ? lang : "es");
  const byNtitle = (a, b) => (a.ntitle < b.ntitle ? -1 : a.ntitle > b.ntitle ? 1 : 0);

  // Hoja 1: Referencias (excel_maestro.py:72-92)
  const orden = [...kept].sort(byNtitle);
  const dupRows = new Set();
  const rows1 = orden.map((r, i) => {
    const [tipo, fiab] = clasificarEstudio(r);
    const pos = (posibles.get(r) || []).join(" | ");
    if (pos) dupRows.add(i);
    return [i + 1, "", autores(r), r.year, r.title, r.journal,
            t.label(tipo), t.label(fiab), r.doi, r.pmid, fuentes(r), pos];
  });

  // Hoja 2: Duplicados eliminados (excel_maestro.py:94-104)
  const rem = [...removed].sort((x, y) => byNtitle(x.r, y.r));
  const rows2 = rem.map(({ r, keptr, reason }, i) =>
    [i + 1, r.title, r.year, r.doi, r.pmid, r.source,
     reasonI18n(reason, lang), short(keptr.title, 70), keptr.doi, keptr.source]);

  // Hoja 3: Resumen PRISMA (excel_maestro.py:106-123)
  const entries = counts instanceof Map ? [...counts] : Object.entries(counts);
  const total = entries.reduce((s, [, n]) => s + n, 0);
  const filas3 = [[t.r3.porBase, ""]];
  for (const [s, n] of entries) filas3.push(["    " + s, n]);
  filas3.push([t.r3.total, total], [t.r3.dup, removed.length],
              [t.r3.unicos, kept.length], [t.r3.posibles, review.length]);
  const boldRows = new Set(filas3.map((f, i) => (t.boldRow(f[0]) ? i : -1)).filter(i => i >= 0));

  const files = new Map();
  files.set("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  files.set("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  files.set("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="${xmlEsc(t.sheets[0])}" sheetId="1" r:id="rId1"/>
<sheet name="${xmlEsc(t.sheets[1])}" sheetId="2" r:id="rId2"/>
<sheet name="${xmlEsc(t.sheets[2])}" sheetId="3" r:id="rId3"/>
</sheets>
</workbook>`);
  files.set("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  files.set("xl/styles.xml", STYLES_XML);
  files.set("xl/worksheets/sheet1.xml", sheetXml({
    headers: t.h1, rows: rows1, widths: [5, 9, 26, 6, 52, 24, 22, 14, 24, 11, 16, 46],
    wrapCols: new Set([3, 5, 6, 12]), dupRows, dvCol: 2, dvList: t.dvList, autoFilter: true,
  }));
  files.set("xl/worksheets/sheet2.xml", sheetXml({
    headers: t.h2, rows: rows2, widths: [5, 50, 6, 24, 11, 15, 20, 50, 24, 16],
    wrapCols: new Set([2, 8]), autoFilter: true,
  }));
  files.set("xl/worksheets/sheet3.xml", sheetXml({
    headers: t.h3, rows: filas3, widths: [44, 12], wrapCols: new Set(), boldRows,
  }));
  return files;
}
