import { test } from "node:test";
import assert from "node:assert/strict";
import { stripAccents, normTitle, normDoi, first4, firstAuthorLast, titleSim, commentKind } from "../../docs/engine/normalize.js";

test("stripAccents", () => {
  assert.equal(stripAccents("Muñoz Aragón"), "Munoz Aragon");
});
test("normTitle quita corchetes de traducción, acentos, puntuación y baja a minúsculas", () => {
  assert.equal(normTitle("[Small cell carcinoma of the bladder treated with…]"),
                          "small cell carcinoma of the bladder treated with");
  assert.equal(normTitle("Prehabilitation in muscle-invasive bladder cancer"),
                          "prehabilitation in muscle invasive bladder cancer");
  assert.equal(normTitle("Neoadjuvant chemotherapy"), "neoadjuvant chemotherapy");
});
test("normDoi normaliza esquema y minúsculas", () => {
  assert.equal(normDoi("https://doi.org/10.1001/JAMA.2020.1234 "), "10.1001/jama.2020.1234");
});
test("first4 captura 4 dígitos Unicode (paridad con \\d de Python)", () => {
  assert.equal(first4("digits ٢٠٢٠ arabic"), "٢٠٢٠");
  assert.equal(first4("２０２０ fullwidth"), "２０２０");
  assert.equal(first4("year 2020 ascii"), "2020");
});
test("firstAuthorLast toma el apellido del primer autor, sin acentos, minúsculas", () => {
  assert.equal(firstAuthorLast(["Muñoz M", "Smith J"]), "munoz");
});
test("firstAuthorLast: apellido según formato (coma / apellido+iniciales / nombre apellido)", () => {
  assert.equal(firstAuthorLast(["Smith, John"]), "smith");   // coma -> antes de la coma
  assert.equal(firstAuthorLast(["Smith JA"]), "smith");       // MEDLINE: apellido + iniciales
  assert.equal(firstAuthorLast(["John Smith"]), "smith");     // BibTeX: nombre + apellido
  assert.equal(firstAuthorLast(["Núñez-Peña M"]), "nunez pena"); // guion normalizado
  assert.equal(firstAuthorLast(["Nielsen"]), "nielsen");      // un solo token
  assert.equal(firstAuthorLast(["de la Cruz M"]), "de la cruz"); // partícula: apellido compuesto
  assert.equal(firstAuthorLast(["Von Neumann J"]), "von neumann");
  assert.equal(firstAuthorLast(["de la Cruz, María"]), "de la cruz"); // ídem con coma
});
test("titleSim Jaccard de tokens", () => {
  assert.equal(Number(titleSim("Neoadjuvant chemotherapy in bladder",
                               "Neoadjuvant chemotherapy for bladder").toFixed(4)), 0.6);
  assert.equal(titleSim("Pelvic floor training", "Renal cell carcinoma outcomes"), 0.0);
});
test("commentKind reconoce respuestas/comentarios y erratas", () => {
  assert.equal(commentKind("Re: Prostate cancer screening"), "artículo + respuesta/comentario");
  assert.equal(commentKind("Reply to the authors"), "artículo + respuesta/comentario");
  assert.equal(commentKind("Comment on the study"), "artículo + respuesta/comentario");
  assert.equal(commentKind("Erratum: original article"), "artículo + fe de erratas/corrección");
  assert.equal(commentKind("A normal article title"), null);
});
