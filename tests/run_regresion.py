#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regresión con datos privados. Uso:
   DEDUP_REGRESION_DIR=/ruta/al/caso python3 tests/run_regresion.py
El directorio debe contener case.json con el mismo esquema que un fixture de
fixtures.json (uno solo, rutas de "files" relativas al propio directorio).
Sin la variable de entorno: SKIP con exit 0 (pensado para CI públicas)."""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import run_shared

def main():
    d = os.environ.get("DEDUP_REGRESION_DIR")
    if not d:
        print("SKIP - regresión privada (DEDUP_REGRESION_DIR no definida)"); sys.exit(0)
    d = os.path.abspath(d)  # ejecuta() une rutas relativas a tests/, no al cwd
    with open(os.path.join(d, "case.json"), encoding="utf-8") as f:
        fx = json.load(f)
    fx["files"] = [os.path.join(d, p) for p in fx["files"]]
    fallos = run_shared.comprueba(fx)
    print(("PASS" if not fallos else "FAIL"), "-", fx["name"])
    for msg in fallos:
        print("       ", msg)
    sys.exit(0 if not fallos else 1)

if __name__ == "__main__":
    main()
