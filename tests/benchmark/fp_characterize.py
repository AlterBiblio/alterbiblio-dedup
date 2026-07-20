#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fp_characterize.py — caracteriza los falsos positivos (FP) de un dataset ASySD:
registros con etiqueta de oro "Unique" que nuestro deduplicador retiró (los
fusionó dentro de otro registro).

Para cada FP, comprueba si el registro superviviente con el que se fusionó
comparte:
  - título normalizado (norm_title) + mismo año, o
  - DOI normalizado (norm_doi)

Si comparte alguno de los dos, es casi seguro la MISMA obra que el oro de ASySD
no agrupó (limitación del gold standard, no error nuestro). Si no comparte
ninguno, es un candidato genuino de fusión incorrecta a inspeccionar.

Uso:
  python3 tests/benchmark/fp_characterize.py <csv_path> [--encoding ENC]
"""
import argparse
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))

from dedup import dedup, norm_title, norm_doi  # noqa: E402
from run_benchmark import load_records, DEFAULT_DATASET, DEFAULT_ENCODING  # noqa: E402


def characterize(csv_path, encoding=DEFAULT_ENCODING):
    records, rows = load_records(csv_path, encoding=encoding)
    gold_by_id = {row["record_id"]: row["label"] for row in rows}
    kept, removed, review = dedup(records)

    fp_gold_error = []
    fp_genuine = []
    for r, keeper, reason in removed:
        rid = r["extra"]["record_id"]
        if gold_by_id.get(rid) != "Unique":
            continue  # no es FP (era duplicado real de oro)
        same_title_year = (norm_title(r["title"]) == norm_title(keeper["title"])
                            and r["year"] == keeper["year"]
                            and norm_title(r["title"]) != "")
        rd, kd = norm_doi(r["doi"]), norm_doi(keeper["doi"])
        same_doi = bool(rd) and rd == kd
        entry = (rid, keeper["extra"]["record_id"], reason, r["title"][:80], keeper["title"][:80])
        if same_title_year or same_doi:
            fp_gold_error.append(entry)
        else:
            fp_genuine.append(entry)
    return fp_gold_error, fp_genuine


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", nargs="?", default=DEFAULT_DATASET)
    parser.add_argument("--encoding", default=DEFAULT_ENCODING)
    args = parser.parse_args()
    fp_gold_error, fp_genuine = characterize(args.csv_path, encoding=args.encoding)
    print(f"Dataset: {args.csv_path}")
    print(f"FP total: {len(fp_gold_error) + len(fp_genuine)}")
    print(f"  · mismo título+año o DOI con el superviviente (limitación del oro): {len(fp_gold_error)}")
    print(f"  · genuinos, sin coincidencia clara (a inspeccionar): {len(fp_genuine)}")
    if fp_genuine:
        print("\nFP genuinos (record_id retirado -> record_id superviviente, motivo):")
        for rid, kid, reason, rt, kt in fp_genuine:
            print(f"  {rid} -> {kid} [{reason}]")
            print(f"      retirado:     {rt}")
            print(f"      superviviente:{kt}")


if __name__ == "__main__":
    main()
