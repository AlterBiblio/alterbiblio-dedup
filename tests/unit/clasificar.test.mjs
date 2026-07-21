import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarEstudio, confianzaPar } from "../../docs/engine/clasificar.js";

// Espejo de la lógica de scripts/clasificar.py; los mismos casos deben dar el
// mismo (tipo, fiabilidad). rec mínimo = {ptypes, title, abstract, spage}.
const rec = (o = {}) => ({ ptypes: [], title: "", abstract: "", spage: "", ...o });

test("tipología de la base manda (fiabilidad alta) y prioridad menor gana", () => {
  assert.deepEqual(clasificarEstudio(rec({ ptypes: ["Journal Article", "Randomized Controlled Trial"] })),
    ["Ensayo clínico aleatorizado", "Alta (base)"]);
  assert.deepEqual(clasificarEstudio(rec({ ptypes: ["Systematic Review", "Meta-Analysis"] })),
    ["Revisión sistemática o metaanálisis", "Alta (base)"]);
  assert.deepEqual(clasificarEstudio(rec({ ptypes: ["Conference Abstract"] })),
    ["Resumen de congreso", "Alta (base)"]);
});

test("genérico solo -> se infiere del título (fiabilidad sugerida)", () => {
  assert.deepEqual(clasificarEstudio(rec({ ptypes: ["Journal Article"], title: "A systematic review of X" })),
    ["Revisión sistemática o metaanálisis", "Sugerida (título)"]);
  // genérico sin señal de título -> artículo sin especificar
  assert.deepEqual(clasificarEstudio(rec({ ptypes: ["Journal Article"], title: "Bladder cancer outcomes" })),
    ["Artículo (sin especificar)", "Sin determinar"]);
});

test("sin tipología: página de suplemento delata resumen de congreso", () => {
  assert.deepEqual(clasificarEstudio(rec({ spage: "e824" })), ["Resumen de congreso", "Sugerida (página)"]);
  // revisión narrativa débil + página de suplemento -> gana congreso
  assert.deepEqual(clasificarEstudio(rec({ title: "prehabilitation: a review of the literature", spage: "S76" })),
    ["Resumen de congreso", "Sugerida (título)"]);
});

test("sin nada -> sin determinar", () => {
  assert.deepEqual(clasificarEstudio(rec({})), ["Sin determinar", "Sin determinar"]);
});

test("confianzaPar: relaciones y umbrales", () => {
  assert.equal(confianzaPar(rec(), rec(), "mismo ensayo clínico (NCT12345678)"), "Alta (mismo ensayo clínico)");
  assert.match(confianzaPar(rec(), rec(), "artículo + respuesta/comentario"), /^Baja/);
  const a = { ntitle: "prehabilitation in bladder cancer", year: "2021", fauthor: "smith", start_page: "10", journal: "eur urol" };
  const b = { ...a };
  assert.equal(confianzaPar(a, b, "título 0.95+autor+año~"), "Alta");
});
