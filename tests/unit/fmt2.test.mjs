// Regresión del redondeo bancario de Python en fmt2 (revisión adversarial fase 2):
// f"{x:.2f}" redondea la mitad al par; toFixed(2) hacia arriba. Valores golden
// verificados contra Python 3: sólo 0.125 y 0.625 divergen en [0,1].
import test from "node:test";
import assert from "node:assert/strict";
import { fmt2 } from "../../docs/engine/dedup.js";

test("fmt2 mitades al par como Python (0.125, 0.625)", () => {
  assert.equal(fmt2(0.125), "0.12");
  assert.equal(fmt2(0.625), "0.62");
});

test("fmt2 no-empates iguales a toFixed", () => {
  assert.equal(fmt2(0.5), "0.50");
  assert.equal(fmt2(0.333333), "0.33");
});
