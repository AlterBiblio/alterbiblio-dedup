#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Caracteriza los FN que el guardarraíl romo (both, min1) INTRODUCE:
duplicados reales que PROD retiraba y exp manda a revisión. Reporta la regla
con que PROD los fusionaba y los campos en conflicto."""
import os, sys, collections
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "scripts"))
sys.path.insert(0, SCRIPT_DIR)
from run_benchmark import load_records  # noqa
import dedup as prod
import dedup_exp as exp
from dedup_exp import hard_conflict_fields  # noqa

DATASETS = [
    ("Diabetes", os.path.join(SCRIPT_DIR, "data", "asysd", "Diabetes_duplicates_labelled.csv"), "latin1"),
    ("NeuroImaging", os.path.join(SCRIPT_DIR, "data", "asysd", "NeuroImaging_duplicates_labelled.csv"), "utf-8"),
    ("Cardiac", os.path.join(SCRIPT_DIR, "data", "asysd", "Cardiac_duplicates_labelled.csv"), "utf-8"),
]
exp.GUARD_ABSTRACT = True; exp.GUARD_TAY = True; exp.GUARD_MIN = 1

by_rule_field = collections.Counter()
for name, path, enc in DATASETS:
    recs_p, rows = load_records(path, encoding=enc)
    gold = {row["record_id"]: row["label"] for row in rows}
    kp, rem_p, rev_p = prod.dedup(recs_p)
    # record_id -> regla con que PROD lo retiró (solo verdaderos duplicados del gold)
    prod_removed_rule = {r["extra"]["record_id"]: reason for (r,_,reason) in rem_p}
    recs_e, _ = load_records(path, encoding=enc)
    ke, rem_e, rev_e = exp.dedup(recs_e)
    exp_removed = {r["extra"]["record_id"] for (r,_,_) in rem_e}
    # FN nuevos = verdaderos dup que PROD retiró y exp NO
    for r, other, ureason in rev_e:
        rid = r["extra"]["record_id"]
        if gold.get(rid) == "Duplicate" and rid in prod_removed_rule and rid not in exp_removed:
            rule = prod_removed_rule[rid]
            fields = "+".join(hard_conflict_fields(r, other)) or "?"
            by_rule_field[(rule, fields)] += 1

print(f"{'regla PROD':<20}{'campo(s) en conflicto':<24}{'FN nuevos':>10}")
for (rule, fields), n in sorted(by_rule_field.items(), key=lambda x:-x[1]):
    print(f"{rule:<20}{fields:<24}{n:>10}")
print(f"{'TOTAL':<44}{sum(by_rule_field.values()):>10}")
# desglose por regla
byrule = collections.Counter()
for (rule,_),n in by_rule_field.items(): byrule[rule]+=n
print("\nPor regla:", dict(byrule))
byfield = collections.Counter()
for (_,f),n in by_rule_field.items(): byfield[f]+=n
print("Por campo:", dict(byfield))
