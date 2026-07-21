import { test } from "node:test";
import assert from "node:assert/strict";
import { excelMaestroFiles } from "../../docs/engine/xlsx.js";

// El generador de Excel de la web produce las partes OOXML de un .xlsx de 3 hojas.
// No abrimos el zip aquí (eso lo cubre la prueba con openpyxl en el flujo manual);
// verificamos estructura, columnas, filas y las traducciones es/en.
const kept = [
  { ntitle: "aaa", title: "AAA study", authors: ["Smith J", "Lee K"], year: "2021",
    journal: "Eur Urol", doi: "10.1/aaa", pmid: "111", source: "PubMed", also_in: [],
    ptypes: ["Randomized Controlled Trial"], spage: "1", fauthor: "smith", start_page: "1" },
  { ntitle: "bbb", title: "BBB abstract", authors: [], year: "2020",
    journal: "J Urol", doi: "", pmid: "", source: "Embase", also_in: [],
    ptypes: ["Conference Abstract"], spage: "e50", fauthor: "", start_page: "e50" },
];
const removed = [{ r: { ntitle: "ccc", title: "CCC dup", year: "2019", doi: "10.1/ccc", pmid: "222", source: "Embase", ptypes: [] },
                   keptr: { title: "AAA study", doi: "10.1/aaa", source: "PubMed" }, reason: "PMID" }];
const review = [{ r: kept[0], other: kept[1], reason: "mismo ensayo clínico (NCT01234567)" }];
const counts = { PubMed: 197, Embase: 560, CENTRAL: 43 };

test("genera las 8 partes OOXML de un xlsx de 3 hojas", () => {
  const f = excelMaestroFiles(kept, removed, review, counts, "es");
  for (const p of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels", "xl/styles.xml",
    "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml", "xl/worksheets/sheet3.xml"]) {
    assert.ok(f.has(p), `falta la parte ${p}`);
  }
});

test("hoja Referencias: cabecera, validación, autofiltro y sombreado de posibles", () => {
  const s1 = excelMaestroFiles(kept, removed, review, counts, "es").get("xl/worksheets/sheet1.xml");
  assert.ok(s1.includes("Tipo de estudio (provisional)"));
  assert.ok(s1.includes("⚠️ Posible duplicado"));
  assert.ok(s1.includes("Ensayo clínico aleatorizado")); // clasificación de kept[0]
  assert.ok(s1.includes("Posible duplicado de")); // anotación del par
  assert.ok(/<dataValidation type="list"/.test(s1));
  assert.ok(/<autoFilter ref="A1:L3"/.test(s1)); // 2 filas de datos + cabecera
  assert.ok(/state="frozen"/.test(s1));
});

test("hoja PRISMA: recuentos por base + totales", () => {
  const s3 = excelMaestroFiles(kept, removed, review, counts, "es").get("xl/worksheets/sheet3.xml");
  assert.ok(s3.includes("Total identificados"));
  assert.ok(s3.includes("<v>800</v>"));   // 197+560+43
  assert.ok(s3.includes("Registros únicos para cribado"));
  assert.ok(s3.includes("<v>2</v>"));     // kept.length
});

test("bilingüe: en traduce hojas, cabeceras y etiquetas del clasificador", () => {
  const f = excelMaestroFiles(kept, removed, review, counts, "en");
  const wb = f.get("xl/workbook.xml");
  assert.ok(wb.includes('name="References"') && wb.includes('name="PRISMA summary"'));
  const s1 = f.get("xl/worksheets/sheet1.xml");
  assert.ok(s1.includes("Study type (provisional)"));
  assert.ok(s1.includes("Randomized controlled trial")); // etiqueta traducida
  assert.ok(s1.includes("Possible duplicate of"));
});
