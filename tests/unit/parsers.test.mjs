// Tests golden de parsers.js — recuentos extraídos de scripts/dedup.py (autoritativo).
// No ajustar los goldens para que pase JS: si divergen, el bug está en el port.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseRis, parseMedline, parsePubmedXml, parseBibtex, parseCsv, detectFormat } from "../../docs/engine/parsers.js";

const T = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = f => readFileSync(join(T, f), "utf8");

test("parseRis embase_sample = 5", () => assert.equal(parseRis(leer("embase_sample.ris"), "Embase").length, 5));
test("parseMedline pubmed_sample = 3", () => assert.equal(parseMedline(leer("pubmed_sample.nbib"), "PubMed").length, 3));
test("parseBibtex scopus_sample = 1", () => assert.equal(parseBibtex(leer("scopus_sample.bib"), "Scopus").length, 1));
test("parseCsv central_sample = 2", () => assert.equal(parseCsv(leer("central_sample.csv"), "CENTRAL").length, 2));
test("parsePubmedXml pubmed_xml_sample = 2", () => assert.equal(parsePubmedXml(leer("pubmed_xml_sample.xml"), "PubMedXML").length, 2));
test("parsePubmedXml rechaza XML mal formado antes de devolver registros parciales", () => {
  const malformed = [
    "<PubmedArticleSet><PubmedArticle><PMID>1</PMID></PubmedArticleSet>",
    "<PubmedArticleSet><PubmedArticle><ArticleTitle>A & B</ArticleTitle></PubmedArticle></PubmedArticleSet>",
    '<PubmedArticleSet bad=x></PubmedArticleSet>',
    "<PubmedArticleSet><PubmedArticle></PubmedArticle>",
    "texto<PubmedArticleSet></PubmedArticleSet>",
    "<PubmedArticleSet></PubmedArticleSet>texto",
    "<![CDATA[fuera]]><PubmedArticleSet></PubmedArticleSet>",
  ];
  for (const xml of malformed) {
    assert.throws(() => parsePubmedXml(xml, "PubMedXML"), /XML mal formado/);
  }
});
test("parseCsv conserva campos multilínea entrecomillados", () => {
  const csv = 'Title,Abstract,PMID\n"Title first line\nsecond line","Abstract first line\nsecond line",123\n';
  const [r] = parseCsv(csv, "CSV");
  assert.equal(r.title, "Title first line\nsecond line");
  assert.equal(r.abstract, "Abstract first line\nsecond line");
  assert.equal(r.ntitle, "title first line second line");
  assert.equal(r.nabs, "abstract first line second line");
});
test("parseMedline patterns/pubmed = 2", () => assert.equal(parseMedline(leer("patterns/pubmed.nbib"), "PubMed").length, 2));
test("parseRis patterns/embase = 6", () => assert.equal(parseRis(leer("patterns/embase.ris"), "Embase").length, 6));
test("parseRis patterns/registry = 1", () => assert.equal(parseRis(leer("patterns/registry.ris"), "Registro").length, 1));

test("detectFormat", () => {
  assert.equal(detectFormat("x.ris", "TY  - JOUR\nER  - \n"), "ris");
  assert.equal(detectFormat("x.xml", "<PubmedArticle></PubmedArticle>"), "pubmed_xml");
  assert.equal(detectFormat("x.csv", "a,b\n1,2\n"), "csv");
  assert.equal(detectFormat("x.nbib", ""), "medline");
  assert.equal(detectFormat("x.bib", ""), "bibtex");
  // sin extensión reconocida: sniff sobre el contenido
  assert.equal(detectFormat("x.txt", "TY  - JOUR\nTI  - t\nER  - \n"), "ris");
  assert.equal(detectFormat("x.txt", "PMID- 123\nTI  - t\n"), "medline");
  assert.equal(detectFormat("x.zzz", "prosa suelta sin estructura alguna"), null);
});
