#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Analiza los FP genuinos: ¿cuántos se evitarían con guardarraíles concretos?
No modifica el motor; reimplementa los checks sobre los pares FP reales."""
import os, sys, collections, re
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "scripts"))
sys.path.insert(0, SCRIPT_DIR)
from dedup import dedup, norm_title, norm_doi  # noqa
from run_benchmark import load_records  # noqa

DATASETS = [
    ("Diabetes", os.path.join(SCRIPT_DIR, "data", "asysd", "Diabetes_duplicates_labelled.csv"), "latin1"),
    ("NeuroImaging", os.path.join(SCRIPT_DIR, "data", "asysd", "NeuroImaging_duplicates_labelled.csv"), "utf-8"),
    ("Cardiac", os.path.join(SCRIPT_DIR, "data", "asysd", "Cardiac_duplicates_labelled.csv"), "utf-8"),
]

def start_page(pg):
    return (pg or "").split("-")[0].strip()

def part_token(title):
    # detecta "part 1", "part i", "part ii", "part 2" etc.
    m = re.search(r"\bpart\s+([ivx]+|\d+)\b", (title or "").lower())
    return m.group(1) if m else None

# guardarraíles a probar sobre cada par FP genuino
def gr_doi_disagree(ro, ko):
    rd, kd = norm_doi(ro.get("doi","")), norm_doi(ko.get("doi",""))
    return bool(rd) and bool(kd) and rd != kd

def gr_page_disagree(ro, ko):
    rp, kp = start_page(ro.get("pages","")), start_page(ko.get("pages",""))
    return bool(rp) and bool(kp) and rp != kp

def gr_vol_disagree(ro, ko):
    rv, kv = (ro.get("volume","") or "").strip(), (ko.get("volume","") or "").strip()
    return bool(rv) and bool(kv) and rv != kv

def gr_part_mismatch(ro, ko):
    pr, pk = part_token(ro.get("title","")), part_token(ko.get("title",""))
    return pr is not None and pk is not None and pr != pk

for name, path, enc in DATASETS:
    records, rows = load_records(path, encoding=enc)
    orig = {row["record_id"]: row for row in rows}
    gold = {row["record_id"]: row["label"] for row in rows}
    kept, removed, review = dedup(records)
    genuine = []
    for r, keeper, reason in removed:
        rid = r["extra"]["record_id"]
        if gold.get(rid) != "Unique": continue
        kid = keeper["extra"]["record_id"]
        ro, ko = orig[rid], orig[kid]
        nt_r, nt_k = norm_title(ro.get("title","")), norm_title(ko.get("title",""))
        same_ty = nt_r and nt_r==nt_k and ro.get("year","")==ko.get("year","")
        rd,kd = norm_doi(ro.get("doi","")), norm_doi(ko.get("doi",""))
        if (same_ty or (rd and rd==kd)): continue  # gold-error
        genuine.append((reason, ro, ko))
    print(f"\n=== {name}: {len(genuine)} FP genuinos ===")
    caught = collections.Counter()
    for reason, ro, ko in genuine:
        flags = []
        if gr_doi_disagree(ro,ko): flags.append("DOI!=")
        if gr_page_disagree(ro,ko): flags.append("pg!=")
        if gr_vol_disagree(ro,ko): flags.append("vol!=")
        if gr_part_mismatch(ro,ko): flags.append("part!=")
        for f in flags: caught[f]+=1
        if flags: caught["ANY"]+=1
        else: caught["NONE"]+=1
        print(f"  [{reason:18}] {'+'.join(flags) or '--- NINGUNO ---'}  "
              f"({ro['record_id']}<-{ko['record_id']})")
    print(f"  RESUMEN: {dict(caught)}")
