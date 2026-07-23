import test from "node:test";
import assert from "node:assert/strict";

import { esc, identifierLinks } from "../../docs/engine/html.js";

test("escapa texto para contenido y atributos HTML", () => {
  assert.equal(esc(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("DOI y PMID manipulados nunca crean enlaces ni atributos", () => {
  const html = identifierLinks({
    doi: 'x" onmouseover="globalThis.PWNED=1',
    pmid: '123" onmouseover="globalThis.PWNED=2',
  });
  assert.equal(html.includes("<a "), false);
  assert.equal(html.includes('onmouseover="'), false);
  assert.match(html, /&quot; onmouseover=&quot;/);
});

test("identificadores válidos usan únicamente orígenes fijos", () => {
  const html = identifierLinks({ doi: "10.1000/abc(1)", pmid: "123456" });
  assert.match(html, /href="https:\/\/doi\.org\/10\.1000\/abc\(1\)"/);
  assert.match(html, /href="https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/123456\/"/);
});
