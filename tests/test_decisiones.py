#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decisiones sobre dudosos: cargar el n,decisión y aplicarlo al resultado del dedup."""
import os, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))

from dedup import rec
from decisiones import cargar_decisiones, aplicar_decisiones


def csv_decisiones(contenido):
    d = tempfile.mkdtemp(prefix="dec_")
    p = os.path.join(d, "decisiones.csv")
    with open(p, "w", encoding="utf-8") as f:
        f.write(contenido)
    return p


class TestCargarDecisiones(unittest.TestCase):
    def test_cuatro_validas(self):
        p = csv_decisiones("n,decisión\n1,conservar_A\n2,conservar_B\n"
                           "3,mantener_ambos\n4,enlazar\n")
        self.assertEqual(cargar_decisiones(p),
                         {1: "conservar_A", 2: "conservar_B",
                          3: "mantener_ambos", 4: "enlazar"})

    def test_decision_no_valida_error(self):
        p = csv_decisiones("n,decisión\n1,conservar_A\n2,fusionar\n")
        with self.assertRaises(ValueError) as cm:
            cargar_decisiones(p)
        self.assertIn("decisión no válida para n=2: 'fusionar'", str(cm.exception))
        self.assertIn("conservar_A/conservar_B/mantener_ambos/enlazar", str(cm.exception))

    def test_n_duplicado_error(self):
        p = csv_decisiones("n,decisión\n1,conservar_A\n1,enlazar\n")
        with self.assertRaises(ValueError) as cm:
            cargar_decisiones(p)
        self.assertIn("n=1", str(cm.exception))
        self.assertIn("duplicado", str(cm.exception))

    def test_sin_cabecera_error(self):
        # primera fila con n entero = datos, no cabecera: no se puede descartar en silencio
        p = csv_decisiones("1,conservar_A\n2,enlazar\n")
        with self.assertRaises(ValueError) as cm:
            cargar_decisiones(p)
        self.assertIn("falta la cabecera 'n,decisión'", str(cm.exception))

    def test_n_no_entero_error(self):
        p = csv_decisiones("n,decisión\nuno,conservar_A\n")
        with self.assertRaises(ValueError) as cm:
            cargar_decisiones(p)
        self.assertIn("'uno'", str(cm.exception))

    def test_celda_vacia_se_omite(self):
        p = csv_decisiones("n,decisión\n1,conservar_A\n2,\n3,enlazar\n")
        self.assertEqual(cargar_decisiones(p), {1: "conservar_A", 3: "enlazar"})


def par(n):
    """Par dudoso n: registro A (PubMed) y B (Embase) del mismo trabajo."""
    a = rec("PubMed", title=f"Trabajo número {n} con su título largo",
            doi=f"10.1000/t{n}", year="2020", authors=["García, M"],
            journal="Rev A", volume="10", spage="100")
    b = rec("Embase", title=f"Trabajo numero {n} con su titulo largo v2",
            doi=f"10.1000/t{n}", year="2020", authors=["García, M"])
    return a, b


class TestAplicarDecisiones(unittest.TestCase):
    def setUp(self):
        self.pares = [par(i) for i in range(1, 5)]
        self.kept = [x for a, b in self.pares for x in (a, b)]
        self.removed = []
        self.review = [(a, b, f"duda {i}") for i, (a, b) in enumerate(self.pares, 1)]

    def test_n_fuera_de_rango_error(self):
        for n in (0, 5):
            with self.assertRaises(ValueError) as cm:
                aplicar_decisiones(self.kept, self.removed, self.review, {n: "enlazar"})
            self.assertIn(f"n={n}", str(cm.exception))

    def test_conservar_A(self):
        a, b = self.pares[0]
        kept, removed, review, enlaces = aplicar_decisiones(
            self.kept, self.removed, self.review, {1: "conservar_A"})
        self.assertIn(a, kept)
        self.assertNotIn(b, kept)
        self.assertEqual(len(removed), 1)
        r, keeper, reason = removed[0]
        self.assertIs(r, b)
        self.assertIs(keeper, a)
        self.assertEqual(reason, "duda 1 · decisión conservar_A")
        self.assertIn("Embase", a["also_in"])          # fusión real: trazabilidad
        self.assertNotIn(1, [self.review.index(t) + 1 for t in review if t[0] is a])

    def test_conservar_B(self):
        a, b = self.pares[1]
        kept, removed, review, enlaces = aplicar_decisiones(
            self.kept, self.removed, self.review, {2: "conservar_B"})
        self.assertIn(b, kept)
        self.assertNotIn(a, kept)
        r, keeper, reason = removed[0]
        self.assertIs(r, a)
        self.assertIs(keeper, b)
        self.assertEqual(reason, "duda 2 · decisión conservar_B")
        self.assertIn("PubMed", b["also_in"])
        # merge_into: B (sin volumen/página) adopta la versión publicada de A
        self.assertEqual(b["volume"], "10")
        self.assertEqual(b["spage"], "100")

    def test_enlazar_nota_espejo(self):
        a, b = self.pares[2]
        kept, removed, review, enlaces = aplicar_decisiones(
            self.kept, self.removed, self.review, {3: "enlazar"})
        self.assertIn(a, kept)
        self.assertIn(b, kept)
        self.assertEqual(removed, [])
        self.assertEqual(enlaces, [(a, b)])
        na, nb = a["extra"]["nota"], b["extra"]["nota"]
        self.assertEqual(na, f"Relacionado: {b['title']} · Embase {b['doi']}")
        self.assertEqual(nb, f"Relacionado: {a['title']} · PubMed {a['doi']}")

    def test_mantener_ambos_y_pendientes(self):
        kept, removed, review, enlaces = aplicar_decisiones(
            self.kept, self.removed, self.review, {4: "mantener_ambos"})
        self.assertEqual(len(kept), 8)      # nadie retirado
        self.assertEqual(removed, [])
        # el par 4 sale de review; 1-3 quedan pendientes marcados
        self.assertEqual(len(review), 3)
        for r, other, reason in review:
            self.assertTrue(reason.endswith("(sin resolver)"), reason)

    def test_todas_las_decisiones_a_la_vez(self):
        kept, removed, review, enlaces = aplicar_decisiones(
            self.kept, self.removed, self.review,
            {1: "conservar_A", 2: "conservar_B", 3: "enlazar", 4: "mantener_ambos"})
        self.assertEqual(len(kept), 6)      # 8 - 2 retirados
        self.assertEqual(len(removed), 2)
        self.assertEqual(review, [])
        self.assertEqual(len(enlaces), 1)

    def test_sin_resolver_no_se_duplica(self):
        review = [(self.pares[0][0], self.pares[0][1], "duda 1 (sin resolver)")]
        _, _, review2, _ = aplicar_decisiones(self.kept, self.removed, review, {})
        self.assertEqual(review2[0][2], "duda 1 (sin resolver)")

    def test_conservar_hereda_also_in_del_retirado(self):
        # el retirado ya había absorbido duplicados en la cascada: su procedencia
        # completa (fuente + also_in) pasa al conservado, sin duplicar la propia
        a, b = self.pares[0]
        b["also_in"] = ["Embase", "CENTRAL", "PubMed"]  # PubMed = fuente de a: no se añade
        kept, removed, review, enlaces = aplicar_decisiones(
            self.kept, self.removed, self.review, {1: "conservar_A"})
        self.assertEqual(a["also_in"], ["Embase", "CENTRAL"])

    def test_decision_sobre_par_solapado_error(self):
        # b aparece en dos dudosos; retirarlo por el n=1 dejaría al n=2 corrupto
        a, b = self.pares[0]
        c = rec("CENTRAL", title="Trabajo número 1 con su título largo (central)",
                year="2020", authors=["García, M"])
        review = [(a, b, "duda 1"), (b, c, "duda 2")]
        with self.assertRaises(ValueError) as cm:
            aplicar_decisiones(self.kept + [c], self.removed, review, {1: "conservar_A"})
        self.assertEqual(str(cm.exception),
                         "la decisión sobre n=1 retira un registro que también aparece "
                         "en el dudoso n=2; revísalos juntos")

    def test_nota_enlazar_sale_como_N1_en_ris(self):
        from dedup import write_ris
        a, b = self.pares[2]
        aplicar_decisiones(self.kept, self.removed, self.review, {3: "enlazar"})
        d = tempfile.mkdtemp(prefix="dec_ris_")
        p = os.path.join(d, "dedup.ris")
        write_ris([a], p)
        with open(p, encoding="utf-8") as f:
            salida = f.read()
        self.assertIn(f"N1  - Relacionado: {b['title']} · Embase {b['doi']}\n", salida)


class TestFlujoCompleto(unittest.TestCase):
    """dedup.py de verdad, dos pasadas: sin --decisiones (revisar.csv numerado)
    y con --decisiones (fusiones, N1, decisiones.csv, renumeración)."""

    SCRIPT = os.path.join(HERE, "..", "scripts", "dedup.py")
    FILES = [os.path.join(HERE, "patterns", f)
             for f in ("pubmed.nbib", "embase.ris", "registry.ris")]

    def correr(self, out, decisiones=None):
        import subprocess
        cmd = [sys.executable, self.SCRIPT, *self.FILES,
               "--source-names", "PubMed,Embase,Registro", "--out", out]
        if decisiones:
            cmd += ["--decisiones", decisiones]
        r = subprocess.run(cmd, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr + r.stdout)
        return r.stdout

    def leer_csv(self, path):
        import csv
        with open(path, encoding="utf-8", newline="") as f:
            return list(csv.DictReader(f))

    def test_pasada_con_decisiones(self):
        tmp = tempfile.mkdtemp(prefix="dec_e2e_")
        A, B, C = (os.path.join(tmp, x) for x in "ABC")

        # Pasada 1: los patterns dan 2 dudosos numerados
        self.correr(A)
        dudosos = self.leer_csv(os.path.join(A, "revisar.csv"))
        self.assertEqual(sorted(d["n"] for d in dudosos), ["1", "2"])
        # localizar cada par por su motivo, sin depender del orden de la lista
        # (el orden es canónico por contenido, independiente del orden de entrada)
        abs_art = next(d for d in dudosos if "abstract de congreso vs artículo" in d["motivo_duda"])
        reply = next(d for d in dudosos if "respuesta/comentario" in d["motivo_duda"])
        # el par es abstract (Embase) vs artículo completo (PubMed); el lado A/B lo fija
        # el orden canónico, así que no se presupone. Queremos conservar el artículo.
        self.assertEqual({abs_art["fuente_A"], abs_art["fuente_B"]}, {"Embase", "PubMed"})
        keep = "conservar_B" if abs_art["fuente_B"] == "PubMed" else "conservar_A"

        # Pasada 2: conservar el artículo de PubMed en el par abstract-vs-artículo (fusiona,
        # retira el abstract de Embase) y enlazar sobre artículo + réplica
        mini = os.path.join(tmp, "mini.csv")
        with open(mini, "w", encoding="utf-8") as f:
            f.write(f"n,decisión\n{abs_art['n']},{keep}\n{reply['n']},enlazar\n")
        salida = self.correr(B, decisiones=mini)
        self.assertIn(f"Decisiones aplicadas: 2 ({keep}: 1 · enlazar: 1) "
                      "· dudosos pendientes: 0", salida)
        self.assertIn("únicos 6 · duplicados 3 · dudosos 0", salida)

        # la decisión fusionó: fuera de revisar.csv, retirado en duplicados.csv
        self.assertEqual(self.leer_csv(os.path.join(B, "revisar.csv")), [])
        retirado = [d for d in self.leer_csv(os.path.join(B, "duplicados.csv"))
                    if f"decisión {keep}" in d["motivo"]]
        self.assertEqual(len(retirado), 1)
        self.assertEqual(retirado[0]["fuente_retirada"], "Embase")
        self.assertEqual(retirado[0]["titulo_retirado"],
                         "Sarcopenia and postoperative outcomes after radical cystectomy")
        self.assertEqual(retirado[0]["fuente_conservada"], "PubMed")

        # enlazar dejó las dos notas espejo N1 en dedup.ris
        with open(os.path.join(B, "dedup.ris"), encoding="utf-8") as f:
            ris = f.read()
        self.assertEqual(ris.count("N1  - Relacionado:"), 2)

        # el informe distingue las decisiones humanas y lista decisiones.csv
        with open(os.path.join(B, "dedup_informe.md"), encoding="utf-8") as f:
            informe = f.read()
        self.assertIn(f"- **Decisiones humanas aplicadas: 2** "
                      f"({keep}: 1 · enlazar: 1)\n", informe)
        self.assertIn("- `decisiones.csv` — decisión tomada por dudoso (suplementario RS)\n",
                      informe)
        # sin --decisiones, el informe ni las menciona (paridad byte a byte)
        with open(os.path.join(A, "dedup_informe.md"), encoding="utf-8") as f:
            informe_a = f.read()
        self.assertNotIn("Decisiones humanas", informe_a)
        self.assertNotIn("decisiones.csv", informe_a)

        # decisiones.csv documenta cada dudoso original con su decisión
        decs = self.leer_csv(os.path.join(B, "decisiones.csv"))
        self.assertEqual(sorted(d["n"] for d in decs), ["1", "2"])
        dec_keep = next(d for d in decs if d["decisión"] == keep)
        dec_link = next(d for d in decs if d["decisión"] == "enlazar")
        self.assertEqual(dec_keep["nota"], "")
        # foto original (pre-fusión): título y año del artículo aparecen en el par
        self.assertIn("Sarcopenia and postoperative outcomes after radical cystectomy",
                      (dec_keep["titulo_A"], dec_keep["titulo_B"]))
        self.assertIn("2018", (dec_keep["año_A"], dec_keep["año_B"]))
        self.assertTrue(dec_link["nota"].startswith("Relacionado: "), dec_link["nota"])

        # Pasada 3: sólo el par abstract-vs-artículo decidido -> el reply queda pendiente
        # y se renumera como n=1
        mini2 = os.path.join(tmp, "mini2.csv")
        with open(mini2, "w", encoding="utf-8") as f:
            f.write(f"n,decisión\n{abs_art['n']},{keep}\n")
        salida = self.correr(C, decisiones=mini2)
        self.assertIn("dudosos pendientes: 1", salida)
        pendientes = self.leer_csv(os.path.join(C, "revisar.csv"))
        self.assertEqual(len(pendientes), 1)
        self.assertEqual(pendientes[0]["n"], "1")
        self.assertIn("respuesta/comentario", pendientes[0]["motivo_duda"])
        self.assertTrue(pendientes[0]["motivo_duda"].endswith("(sin resolver)"))
        decs = self.leer_csv(os.path.join(C, "decisiones.csv"))
        self.assertEqual(sorted(d["decisión"] for d in decs), sorted([keep, "pendiente"]))


if __name__ == "__main__":
    unittest.main()
