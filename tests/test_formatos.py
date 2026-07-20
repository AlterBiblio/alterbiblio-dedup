#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Formatos: rechazar lo no reconocido, avisar con 0 registros."""
import os, sys, subprocess, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "dedup.py")

def corre(contenido, ext):
    d = tempfile.mkdtemp(prefix="fmt_")
    p = os.path.join(d, "entrada" + ext)
    with open(p, "w", encoding="utf-8") as f:
        f.write(contenido)
    out = os.path.join(d, "out")
    r = subprocess.run([sys.executable, SCRIPT, p, "--out", out],
                       capture_output=True, text=True)
    return r, out

class TestFormatos(unittest.TestCase):
    def test_desconocido_rechaza_con_instrucciones(self):
        r, _ = corre("esto no es ningún formato bibliográfico, solo prosa suelta.", ".xyz")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Formatos admitidos", r.stderr)

    def test_txt_sin_marcas_rechaza(self):
        r, _ = corre("notas de la reunión\nsegunda línea sin estructura\n", ".txt")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Formatos admitidos", r.stderr)

    def test_txt_ris_valido_pasa(self):
        ris = "TY  - JOUR\nTI  - Un título suficientemente largo para contar\nPY  - 2020\nER  - \n"
        r, _ = corre(ris, ".txt")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_txt_tabular_pasa_como_csv(self):
        r, _ = corre("title,year\nUn título suficientemente largo para contar,2020\n", ".txt")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_txt_prosa_con_comas_rechaza_como_formato(self):
        r, _ = corre("notas de la reunión, segunda parte\notra línea con coma, más texto\ny una tercera, también\n", ".txt")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("Formatos admitidos", r.stderr)

    def test_ris_truncado_conserva_con_aviso(self):
        ris = ("TY  - JOUR\nTI  - Registro completo con su terminador\nPY  - 2020\nER  - \n"
               "TY  - JOUR\nTI  - Registro truncado sin terminador\nPY  - 2021\n")
        r, out = corre(ris, ".ris")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("sin terminador ER", r.stderr)
        with open(os.path.join(out, "dedup.ris"), encoding="utf-8") as f:
            salida = f.read()
        self.assertEqual(salida.count("ER  - "), 2)

    def test_cero_registros_totales_error(self):
        r, _ = corre("TY  - JOUR\n", ".ris")  # RIS sin ER: 0 registros completos
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("0 registros", r.stderr)
        self.assertIn("en total", r.stderr)

if __name__ == "__main__":
    unittest.main(verbosity=2)
