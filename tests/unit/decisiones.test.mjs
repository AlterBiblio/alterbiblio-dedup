import test from "node:test";
import assert from "node:assert/strict";

import { rec } from "../../docs/engine/parsers.js";
import { applyWebDecisions, DecisionConflictError } from "../../docs/engine/decisiones.js";

function pairData() {
  const a = rec("PubMed", {
    title: "Trabajo clínico publicado con metadatos completos",
    doi: "10.1000/published", year: "2024", authors: ["García, M"],
    journal: "Journal", volume: "10", issue: "2", spage: "100", pmid: "123",
  });
  const b = rec("Embase", {
    title: "Trabajo clinico publicado con metadatos", year: "2024",
    authors: ["García, M"], abstract: "Resumen complementario ".repeat(12),
  });
  return { a, b };
}

test("conservar B fusiona metadatos y procedencia sin mutar los originales", () => {
  const { a, b } = pairData();
  const result = {
    kept: [a, b], removed: [],
    reviewFull: [{ n: 1, a, b, reason: "duda" }],
  };
  const out = applyWebDecisions(result, new Map([[1, "B"]]));
  assert.equal(out.kept.length, 1);
  assert.equal(out.kept[0].source, "Embase");
  assert.equal(out.kept[0].doi, "10.1000/published");
  assert.equal(out.kept[0].pmid, "123");
  assert.equal(out.kept[0].volume, "10");
  assert.deepEqual(out.kept[0].also_in, ["PubMed"]);
  assert.equal(b.doi, "");
  assert.deepEqual(b.also_in, []);
});

test("rechaza retirar un registro que participa en otro par", () => {
  const { a, b } = pairData();
  const c = rec("CENTRAL", { title: "Trabajo clínico relacionado", year: "2024" });
  const result = {
    kept: [a, b, c], removed: [],
    reviewFull: [
      { n: 1, a: b, b: a, reason: "duda 1" },
      { n: 2, a: c, b: a, reason: "duda 2" },
    ],
  };
  assert.throws(
    () => applyWebDecisions(result, new Map([[1, "A"]])),
    e => e instanceof DecisionConflictError && e.decisionPair === 1 && e.otherPair === 2,
  );
});

test("vinculados y pendientes se devuelven sobre las mismas copias conservadas", () => {
  const { a, b } = pairData();
  const result = {
    kept: [a, b], removed: [],
    reviewFull: [{ n: 1, a, b, reason: "duda" }],
  };
  const linked = applyWebDecisions(result, new Map([[1, "relacion"]]));
  assert.equal(linked.linked.length, 1);
  assert.ok(linked.kept.includes(linked.linked[0].a));
  assert.ok(linked.kept.includes(linked.linked[0].b));
  const pending = applyWebDecisions(result);
  assert.equal(pending.pending.length, 1);
  assert.ok(pending.kept.includes(pending.pending[0].r));
  assert.ok(pending.kept.includes(pending.pending[0].other));
});

test("redirige duplicados automáticos cuando su antiguo keeper se retira", () => {
  const { a, b } = pairData();
  const old = rec("Scopus", { title: "Versión retirada automáticamente" });
  const result = {
    kept: [a, b],
    removed: [{ r: old, keptr: a, reason: "PMID" }],
    reviewFull: [{ n: 1, a, b, reason: "duda" }],
  };
  const out = applyWebDecisions(result, new Map([[1, "B"]]));
  assert.equal(out.removed.length, 2);
  assert.ok(out.removed.every(x => out.kept.includes(x.keptr)));
  assert.equal(out.removed.find(x => x.reason === "PMID").keptr.source, "Embase");
});
