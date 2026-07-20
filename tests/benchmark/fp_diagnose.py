#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fp_diagnose.py — diagnóstico de FP por regla × (gold-error / genuino), comparando
los campos ORIGINALES del gold (no los del superviviente ya fusionado, que puede
haber adoptado el título/DOI del propio FP retirado — fallo de fp_characterize.py).

Clasificación:
  gold-error: el FP retirado y su superviviente comparten (título normalizado + año)
              o DOI normalizado EN LOS DATOS ORIGINALES → misma obra que el gold no agrupó.
  genuino:    campos originales distintos → sobre-fusión real de la cascada.

Uso: python3 tests/benchmark/fp_diagnose.py [--verbose]
"""
import argparse, os, sys, collections

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
sys.path.insert(0, SCRIPT_DIR)

from dedup import dedup, norm_title, norm_doi  # noqa: E402
from run_benchmark import load_records  # noqa: E402

DATASETS = [
    ("Diabetes", os.path.join(SCRIPT_DIR, "data", "asysd", "Diabetes_duplicates_labelled.csv"), "latin1"),
    ("NeuroImaging", os.path.join(SCRIPT_DIR, "data", "asysd", "NeuroImaging_duplicates_labelled.csv"), "utf-8"),
    ("Cardiac", os.path.join(SCRIPT_DIR, "data", "asysd", "Cardiac_duplicates_labelled.csv"), "utf-8"),
]


def diagnose(name, path, encoding, verbose=False):
    records, rows = load_records(path, encoding=encoding)
    orig = {row["record_id"]: row for row in rows}
    gold_by_id = {row["record_id"]: row["label"] for row in rows}
    kept, removed, review = dedup(records)

    table = collections.Counter()   # (reason, clase) -> n
    genuine_pairs = []
    for r, keeper, reason in removed:
        rid = r["extra"]["record_id"]
        if gold_by_id.get(rid) != "Unique":
            continue
        kid = keeper["extra"]["record_id"]
        ro, ko = orig[rid], orig[kid]
        nt_r, nt_k = norm_title(ro.get("title", "")), norm_title(ko.get("title", ""))
        same_ty = nt_r and nt_r == nt_k and (ro.get("year", "") == ko.get("year", ""))
        rd, kd = norm_doi(ro.get("doi", "")), norm_doi(ko.get("doi", ""))
        same_doi = bool(rd) and rd == kd
        # ¿mismo grupo del gold? (Unique fusionado dentro de OTRO grupo, o dentro del suyo)
        same_group = ro.get("duplicateid") == ko.get("duplicateid")
        clase = "gold-error" if (same_ty or same_doi) else "genuino"
        table[(reason, clase)] += 1
        if clase == "genuino":
            genuine_pairs.append((reason, ro, ko, same_group))

    print(f"\n=== {name} ===")
    reasons = sorted({r for r, _ in table})
    print(f"{'regla':<22}{'gold-error':>11}{'genuino':>9}{'total':>7}")
    tot_ge = tot_g = 0
    for rs in reasons:
        ge, g = table[(rs, 'gold-error')], table[(rs, 'genuino')]
        tot_ge += ge; tot_g += g
        print(f"{rs:<22}{ge:>11}{g:>9}{ge+g:>7}")
    print(f"{'TOTAL':<22}{tot_ge:>11}{tot_g:>9}{tot_ge+tot_g:>7}")

    for reason, ro, ko, same_group in genuine_pairs:
        print(f"\n-- GENUINO [{reason}] mismo grupo gold: {same_group}")
        for tag, o in (("retirado", ro), ("keeper  ", ko)):
            print(f"   {tag} id={o['record_id']} gid={o.get('duplicateid')} y={o.get('year')} "
                  f"vol={o.get('volume')} pg={o.get('pages')} doi={o.get('doi')}")
            print(f"            au={ (o.get('author') or '')[:60] }")
            print(f"            ti={ (o.get('title') or '')[:110] }")
    return table, genuine_pairs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    grand = collections.Counter()
    for name, path, enc in DATASETS:
        t, _ = diagnose(name, path, enc, args.verbose)
        grand.update(t)
    print("\n=== GLOBAL (3 datasets) ===")
    reasons = sorted({r for r, _ in grand})
    print(f"{'regla':<22}{'gold-error':>11}{'genuino':>9}{'total':>7}")
    for rs in reasons:
        ge, g = grand[(rs, 'gold-error')], grand[(rs, 'genuino')]
        print(f"{rs:<22}{ge:>11}{g:>9}{ge+g:>7}")
    print(f"{'TOTAL':<22}{sum(v for (r,c),v in grand.items() if c=='gold-error'):>11}"
          f"{sum(v for (r,c),v in grand.items() if c=='genuino'):>9}"
          f"{sum(grand.values()):>7}")


if __name__ == "__main__":
    main()
