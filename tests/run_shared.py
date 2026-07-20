#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Runner de la batería compartida (tests/fixtures/fixtures.json) contra dedup.py.
La implementación JS (fase 2) debe pasar este MISMO json con su propio runner.

Contrato de "expect" (cada fixture):
  - El dedup.ris se evalúa EN MINÚSCULAS: toda comparación de substrings es
    case-insensitive y los valores del json deben escribirse en minúsculas.
  - Claves obligatorias (counts):
      duplicados            nº de filas de duplicados.csv
      unicos                nº de líneas de dedup.ris que empiezan por "ER  -"
      dudosos               nº de filas de revisar.csv
  - Claves opcionales:
      ris_contiene          substrings que deben aparecer en dedup.ris
      ris_no_contiene       substrings que NO deben aparecer en dedup.ris
      ris_una_vez           substrings que aparecen exactamente 1 vez en dedup.ris
      motivos_incluyen      pertenencia EXACTA al conjunto de valores de la
                            columna "motivo" de duplicados.csv
      motivos_duda_incluyen substring sobre la columna "motivo_duda" de
                            revisar.csv (todas las filas concatenadas)
      dudosos_texto_incluye substring sobre las columnas "titulo_A"+"titulo_B"
                            de revisar.csv (todas las filas concatenadas,
                            en minúsculas)
  - Cualquier otra clave en expect es un error del fixture y hace fallar el test.
  - Un stderr no vacío de dedup.py (AVISO de export truncado, 0 registros...)
    cuenta como fallo del fixture: la batería es estática y no debe avisar.
"""
import os, sys, csv, json, shutil, subprocess, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "scripts", "dedup.py")

CLAVES_OBLIGATORIAS = {"duplicados", "unicos", "dudosos"}
CLAVES_CONOCIDAS = CLAVES_OBLIGATORIAS | {
    "ris_contiene", "ris_no_contiene", "ris_una_vez",
    "motivos_incluyen", "motivos_duda_incluyen", "dudosos_texto_incluye",
}

def ejecuta(fx):
    """Ejecuta dedup.py sobre el fixture y devuelve (ris, dups, rev, stderr).
    OJO: el RIS se devuelve pasado a minúsculas (comparaciones case-insensitive)."""
    out = tempfile.mkdtemp(prefix="dedup_fx_")
    try:
        files = [os.path.join(HERE, f) for f in fx["files"]]
        proc = subprocess.run([sys.executable, SCRIPT] + files +
                              ["--source-names", fx["source_names"], "--out", out],
                              check=True, capture_output=True, text=True)
        with open(os.path.join(out, "dedup.ris"), encoding="utf-8") as f:
            ris = f.read().lower()
        with open(os.path.join(out, "duplicados.csv"), encoding="utf-8") as f:
            dups = list(csv.DictReader(f))
        with open(os.path.join(out, "revisar.csv"), encoding="utf-8") as f:
            rev = list(csv.DictReader(f))
        return ris, dups, rev, proc.stderr
    finally:
        shutil.rmtree(out, ignore_errors=True)

def cuenta_unicos(ris):
    return sum(1 for linea in ris.splitlines() if linea.startswith("er  -"))

def comprueba(fx):
    e, fallos = fx["expect"], []
    for k in sorted(set(e) - CLAVES_CONOCIDAS):
        fallos.append("clave expect desconocida: %s" % k)
    for k in sorted(CLAVES_OBLIGATORIAS - set(e)):
        fallos.append("falta clave expect obligatoria: %s" % k)
    if fallos:
        return fallos
    try:
        ris, dups, rev, stderr = ejecuta(fx)
    except subprocess.CalledProcessError as err:
        return ["dedup.py falló (exit %d): %s" % (err.returncode, (err.stderr or "").strip())]
    def chk(cond, msg):
        if not cond: fallos.append(msg)
    chk(not stderr, "stderr inesperado: %r" % stderr[:200])
    chk(len(dups) == e["duplicados"], "duplicados: %d != %d" % (len(dups), e["duplicados"]))
    chk(cuenta_unicos(ris) == e["unicos"], "unicos: %d != %d" % (cuenta_unicos(ris), e["unicos"]))
    chk(len(rev) == e["dudosos"], "dudosos: %d != %d" % (len(rev), e["dudosos"]))
    for s in e.get("ris_contiene", []): chk(s in ris, "falta en ris: %r" % s)
    for s in e.get("ris_no_contiene", []): chk(s not in ris, "sobra en ris: %r" % s)
    for s in e.get("ris_una_vez", []): chk(ris.count(s) == 1, "no exactamente 1 vez: %r" % s)
    mot = {d["motivo"] for d in dups}
    for s in e.get("motivos_incluyen", []): chk(s in mot, "falta motivo: %r" % s)
    duda = " | ".join(r["motivo_duda"] for r in rev)
    for s in e.get("motivos_duda_incluyen", []): chk(s in duda, "falta motivo_duda: %r" % s)
    texto = " ".join((r["titulo_A"] + r["titulo_B"]).lower() for r in rev)
    for s in e.get("dudosos_texto_incluye", []): chk(s in texto, "falta en dudosos: %r" % s)
    return fallos

def main():
    with open(os.path.join(HERE, "fixtures", "fixtures.json"), encoding="utf-8") as f:
        data = json.load(f)
    ok = True
    for fx in data["fixtures"]:
        fallos = comprueba(fx)
        print(("PASS" if not fallos else "FAIL"), "-", fx["name"])
        for msg in fallos:
            print("       ", msg); ok = False
    print("\n== TODOS EN VERDE ==" if ok else "\n== HAY FALLOS ==")
    sys.exit(0 if ok else 1)

if __name__ == "__main__":
    main()
