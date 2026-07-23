import test from "node:test";
import assert from "node:assert/strict";

import { deduplicar } from "../../docs/engine/index.js";

const ris = title => `TY  - JOUR\nTI  - ${title}\nPY  - 2024\nER  - \n`;

test("rechaza el lote antes de deduplicar si supera maxRecords", () => {
  assert.throws(
    () => deduplicar([
      { name: "a.ris", source: "A", text: ris("Título suficientemente largo número uno") },
      { name: "b.ris", source: "B", text: ris("Título suficientemente largo número dos") },
    ], { maxRecords: 1 }),
    /supera el límite de 1 registros/,
  );
});
