#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Grid de variantes quirúrgicas del guardarraíl vs producción.
Reporta por variante (suma de los 3 datasets):
  FP           : únicos del gold retirados por error
  FN_auto      : duplicados del gold conservados (escenario 1, solo automático)
  FN_rev       : idem tras resolver la revisión humana (escenario 2)
  review       : pares mandados a revisión
También caracteriza los FN nuevos que introduce cada variante (regla origen + campo).
"""
import os, sys, importlib
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "scripts"))
sys.path.insert(0, SCRIPT_DIR)
from run_benchmark import load_records, confusion_matrix, sens_spec  # noqa
import dedup as prod
import dedup_exp as exp

DATASETS = [
    ("Diabetes", os.path.join(SCRIPT_DIR, "data", "asysd", "Diabetes_duplicates_labelled.csv"), "latin1"),
    ("NeuroImaging", os.path.join(SCRIPT_DIR, "data", "asysd", "NeuroImaging_duplicates_labelled.csv"), "utf-8"),
    ("Cardiac", os.path.join(SCRIPT_DIR, "data", "asysd", "Cardiac_duplicates_labelled.csv"), "utf-8"),
]

def run_engine(dedup_fn, path, enc):
    records, rows = load_records(path, encoding=enc)
    gold = {row["record_id"]: row["label"] for row in rows}
    kept, removed, review = dedup_fn(records)
    pred_auto = {r["extra"]["record_id"] for (r,_,_) in removed}
    # escenario 2: resolver revisión (retirar el no-Unique de pares que comparten duplicateid)
    pred_rev = set(pred_auto)
    for r, other, _ in review:
        g1, g2 = r["extra"]["duplicateid"], other["extra"]["duplicateid"]
        if g1 == g2 and g1 != "":
            for m in (r, other):
                if m["extra"]["label"] != "Unique":
                    pred_rev.add(m["extra"]["record_id"])
    tn1,fp1,tp1,fn1 = confusion_matrix(gold, pred_auto)
    tn2,fp2,tp2,fn2 = confusion_matrix(gold, pred_rev)
    return dict(FP=fp1, FN_auto=fn1, FN_rev=fn2, review=len(review),
                sens1=sens_spec(tn1,fp1,tp1,fn1)[0], spec1=sens_spec(tn1,fp1,tp1,fn1)[1])

def total(dedup_fn):
    agg = dict(FP=0, FN_auto=0, FN_rev=0, review=0)
    for _, path, enc in DATASETS:
        r = run_engine(dedup_fn, path, enc)
        for k in agg: agg[k]+=r[k]
    return agg

VARIANTS = [
    ("PROD (baseline)",        None),
    ("Vc both, min1 (romo)",   dict(GUARD_ABSTRACT=True,  GUARD_TAY=True,  GUARD_MIN=1)),
    ("Va abstract-only, min1", dict(GUARD_ABSTRACT=True,  GUARD_TAY=False, GUARD_MIN=1)),
    ("   tay-only, min1",      dict(GUARD_ABSTRACT=False, GUARD_TAY=True,  GUARD_MIN=1)),
    ("Vb both, min2",          dict(GUARD_ABSTRACT=True,  GUARD_TAY=True,  GUARD_MIN=2)),
    ("   abstract-only, min2", dict(GUARD_ABSTRACT=True,  GUARD_TAY=False, GUARD_MIN=2)),
    ("   tay-only, min2",      dict(GUARD_ABSTRACT=False, GUARD_TAY=True,  GUARD_MIN=2)),
]

print(f"{'variante':<26}{'FP':>5}{'FN_auto':>9}{'FN_rev':>8}{'review':>8}")
for name, cfg in VARIANTS:
    if cfg is None:
        agg = total(prod.dedup)
    else:
        exp.GUARD_ABSTRACT = cfg["GUARD_ABSTRACT"]
        exp.GUARD_TAY = cfg["GUARD_TAY"]
        exp.GUARD_MIN = cfg["GUARD_MIN"]
        agg = total(exp.dedup)
    print(f"{name:<26}{agg['FP']:>5}{agg['FN_auto']:>9}{agg['FN_rev']:>8}{agg['review']:>8}")
