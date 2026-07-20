#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compara motor de producción vs experimental (con guardarraíl hard_conflict)
sobre los 3 datasets ASySD. Reporta FP, FN, sens, espec en escenario 1 (auto)."""
import os, sys, importlib.util
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "scripts"))
sys.path.insert(0, SCRIPT_DIR)
from run_benchmark import load_records, confusion_matrix, sens_spec  # noqa
import dedup as prod

spec = importlib.util.spec_from_file_location("dedup_exp", os.path.join(SCRIPT_DIR, "dedup_exp.py"))
exp = importlib.util.module_from_spec(spec); spec.loader.exec_module(exp)

DATASETS = [
    ("Diabetes", os.path.join(SCRIPT_DIR, "data", "asysd", "Diabetes_duplicates_labelled.csv"), "latin1"),
    ("NeuroImaging", os.path.join(SCRIPT_DIR, "data", "asysd", "NeuroImaging_duplicates_labelled.csv"), "utf-8"),
    ("Cardiac", os.path.join(SCRIPT_DIR, "data", "asysd", "Cardiac_duplicates_labelled.csv"), "utf-8"),
]

def evalu(dedup_fn, records, gold):
    kept, removed, review = dedup_fn(records)
    pred = {r["extra"]["record_id"] for (r,_,_) in removed}
    tn,fp,tp,fn = confusion_matrix(gold, pred)
    sens,spec_ = sens_spec(tn,fp,tp,fn)
    return fp, fn, sens, spec_, len(review)

print(f"{'dataset':<14}{'motor':<6}{'FP':>4}{'FN':>4}{'sens%':>8}{'espec%':>8}{'review':>8}")
tot = {'prod':[0,0], 'exp':[0,0]}
for name, path, enc in DATASETS:
    records, rows = load_records(path, encoding=enc)
    gold = {row["record_id"]: row["label"] for row in rows}
    for tag, mod in (("prod", prod), ("exp", exp)):
        # reconstruir records limpios por motor (dedup muta in-place)
        recs2, _ = load_records(path, encoding=enc)
        fp,fn,se,sp,rv = evalu(mod.dedup, recs2, gold)
        tot[tag][0]+=fp; tot[tag][1]+=fn
        print(f"{name:<14}{tag:<6}{fp:>4}{fn:>4}{se:>8.2f}{sp:>8.2f}{rv:>8}")
print(f"{'TOTAL':<14}{'prod':<6}{tot['prod'][0]:>4}{tot['prod'][1]:>4}")
print(f"{'TOTAL':<14}{'exp':<6}{tot['exp'][0]:>4}{tot['exp'][1]:>4}")
