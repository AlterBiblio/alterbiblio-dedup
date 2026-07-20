# -*- coding: utf-8 -*-
"""Verifica que scripts/i18n.py traduce cada plantilla de motivo EXACTAMENTE igual
que docs/engine/i18n.js (mismas 24 parejas). Junto con la paridad ES (ya idéntica),
esto garantiza que la salida EN de ambos motores sea idéntica."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
from i18n import reason_to_en, reason_i18n  # noqa: E402

# Mismas parejas ES->EN que tests/unit/i18n.test.mjs
CASES = [
    ("PMID", "PMID"),
    ("ID de Embase", "Embase ID"),
    ("abstract", "abstract"),
    ("título+año", "title+year"),
    ("DOI+título", "DOI+title"),
    ("título+autor+año~", "title+author+year~"),
    ("vol+pág+autor+año", "vol+page+author+year"),
    ("abstract casi idéntico pero DOIs distintos — posible duplicado (conservar ambos)",
     "near-identical abstract but different DOIs — possible duplicate (keep both)"),
    ("abstract casi idéntico pero ≥2 identificadores (doi+pag) discrepantes (revisar)",
     "near-identical abstract but ≥2 identifiers (doi+page) in conflict (review)"),
    ("título+año idénticos pero DOIs distintos — posible duplicado (conservar ambos)",
     "identical title+year but different DOIs — possible duplicate (keep both)"),
    ("título+año idénticos pero ≥2 identificadores (doi+vol) discrepantes (revisar)",
     "identical title+year but ≥2 identifiers (doi+vol) in conflict (review)"),
    ("DOI igual, título similar 0.42", "same DOI, similar title 0.42"),
    ("título 0.93+mismo autor pero DOIs distintos — posible duplicado (conservar ambos)",
     "title 0.93+same author but different DOIs — possible duplicate (keep both)"),
    ("título 0.87+mismo autor, abstract de congreso vs artículo (¿misma obra? mantener/enlazar)",
     "title 0.87+same author, conference abstract vs article (same work? keep/link)"),
    ("título 0.95+autor+año~ pero ≥2 identificadores (doi+pag) discrepantes (revisar)",
     "title 0.95+author+year~ but ≥2 identifiers (doi+page) in conflict (review)"),
    ("título 0.95+autor+año~ (revisar)", "title 0.95+author+year~ (review)"),
    ("título casi idéntico 0.93+mismo autor, años distintos (¿abstract de congreso vs artículo?)",
     "near-identical title 0.93+same author, different years (conference abstract vs article?)"),
    ("mismo vol+pág+autor+año pero títulos distintos 0.50 (revisar)",
     "same vol+page+author+year but different titles 0.50 (review)"),
    ("mismo ensayo clínico (NCT03998579) — posible duplicado (conservar ambos)",
     "same clinical trial (NCT03998579) — possible duplicate (keep both)"),
    ("títulos casi idénticos (variación de escritura) pero DOIs distintos — posible duplicado (conservar ambos)",
     "near-identical titles (spelling variant) but different DOIs — possible duplicate (keep both)"),
    ("títulos casi idénticos (variación de escritura, Jaro-Winkler) — posible duplicado (sin DOI/PMID/autor común)",
     "near-identical titles (spelling variant, Jaro-Winkler) — possible duplicate (no shared DOI/PMID/author)"),
    ("título casi idéntico 0.95 (sin DOI/PMID/autor común)",
     "near-identical title 0.95 (no shared DOI/PMID/author)"),
    ("artículo + fe de erratas/corrección (mantener ambos)", "article + erratum/correction (keep both)"),
    ("artículo + respuesta/comentario (mantener ambos)", "article + reply/comment (keep both)"),
]


class TestI18n(unittest.TestCase):
    def test_traduce_todas_las_plantillas(self):
        for es, en in CASES:
            self.assertEqual(reason_to_en(es), en, f"ES no traducido bien: {es!r}")

    def test_reason_i18n(self):
        self.assertEqual(reason_i18n("PMID", "es"), "PMID")
        self.assertEqual(reason_i18n("ID de Embase", "en"), "Embase ID")
        self.assertEqual(reason_i18n("", "en"), "")

    def test_desconocido_se_deja(self):
        self.assertEqual(reason_to_en("algo inesperado"), "algo inesperado")


if __name__ == "__main__":
    unittest.main()
