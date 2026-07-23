import test from "node:test";
import assert from "node:assert/strict";

import { csvSafe, toCsv } from "../../docs/engine/csv.js";

test("neutraliza todos los prefijos de fórmula", () => {
  for (const prefix of ["=", "+", "-", "@", "\t", "\r", "\n"]) {
    assert.equal(csvSafe(prefix + "PAYLOAD"), "'" + prefix + "PAYLOAD");
  }
  assert.equal(csvSafe("Título normal"), "Título normal");
});

test("toCsv neutraliza y conserva comillas y saltos", () => {
  const out = toCsv([{ title: '=HYPERLINK("https://evil.example")', note: "a\nb" }]);
  assert.equal(
    out,
    'title,note\n"\'=HYPERLINK(""https://evil.example"")","a\nb"\n',
  );
});
