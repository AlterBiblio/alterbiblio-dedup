import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonToEn, reasonI18n } from "../../docs/engine/i18n.js";

// Cada cadena ES es un literal EXACTO que emite el motor (dedup.js/output.js). Si un regex
// no casara, reasonToEn devolvería el español -> este test lo caza.
const CASES = [
  ["PMID", "PMID"],
  ["ID de Embase", "Embase ID"],
  ["abstract", "abstract"],
  ["título+año", "title+year"],
  ["DOI+título", "DOI+title"],
  ["título+autor+año~", "title+author+year~"],
  ["vol+pág+autor+año", "vol+page+author+year"],
  ["abstract casi idéntico pero DOIs distintos — posible duplicado (conservar ambos)",
   "near-identical abstract but different DOIs — possible duplicate (keep both)"],
  ["abstract casi idéntico pero ≥2 identificadores (doi+pag) discrepantes (revisar)",
   "near-identical abstract but ≥2 identifiers (doi+page) in conflict (review)"],
  ["título+año idénticos pero DOIs distintos — posible duplicado (conservar ambos)",
   "identical title+year but different DOIs — possible duplicate (keep both)"],
  ["título+año idénticos pero ≥2 identificadores (doi+vol) discrepantes (revisar)",
   "identical title+year but ≥2 identifiers (doi+vol) in conflict (review)"],
  ["DOI igual, título similar 0.42", "same DOI, similar title 0.42"],
  ["título 0.93+mismo autor pero DOIs distintos — posible duplicado (conservar ambos)",
   "title 0.93+same author but different DOIs — possible duplicate (keep both)"],
  ["título 0.87+mismo autor, abstract de congreso vs artículo (¿misma obra? mantener/enlazar)",
   "title 0.87+same author, conference abstract vs article (same work? keep/link)"],
  ["título 0.95+autor+año~ pero ≥2 identificadores (doi+pag) discrepantes (revisar)",
   "title 0.95+author+year~ but ≥2 identifiers (doi+page) in conflict (review)"],
  ["título 0.95+autor+año~ (revisar)", "title 0.95+author+year~ (review)"],
  ["título casi idéntico 0.93+mismo autor, años distintos (¿abstract de congreso vs artículo?)",
   "near-identical title 0.93+same author, different years (conference abstract vs article?)"],
  ["mismo vol+pág+autor+año pero títulos distintos 0.50 (revisar)",
   "same vol+page+author+year but different titles 0.50 (review)"],
  ["mismo ensayo clínico (NCT03998579) — posible duplicado (conservar ambos)",
   "same clinical trial (NCT03998579) — possible duplicate (keep both)"],
  ["títulos casi idénticos (variación de escritura) pero DOIs distintos — posible duplicado (conservar ambos)",
   "near-identical titles (spelling variant) but different DOIs — possible duplicate (keep both)"],
  ["títulos casi idénticos (variación de escritura, Jaro-Winkler) — posible duplicado (sin DOI/PMID/autor común)",
   "near-identical titles (spelling variant, Jaro-Winkler) — possible duplicate (no shared DOI/PMID/author)"],
  ["título casi idéntico 0.95 (sin DOI/PMID/autor común)",
   "near-identical title 0.95 (no shared DOI/PMID/author)"],
  ["artículo + fe de erratas/corrección (mantener ambos)", "article + erratum/correction (keep both)"],
  ["artículo + respuesta/comentario (mantener ambos)", "article + reply/comment (keep both)"],
];

test("reasonToEn traduce cada plantilla del motor (ninguna se queda en español)", () => {
  for (const [es, en] of CASES) {
    assert.equal(reasonToEn(es), en, `ES no traducido correctamente: "${es}"`);
  }
});

test("reasonI18n: es devuelve el original; en traduce", () => {
  assert.equal(reasonI18n("PMID", "es"), "PMID");
  assert.equal(reasonI18n("ID de Embase", "en"), "Embase ID");
  assert.equal(reasonI18n("", "en"), "");
});

test("reasonToEn: motivo desconocido se deja tal cual (no rompe)", () => {
  assert.equal(reasonToEn("algo inesperado"), "algo inesperado");
});
