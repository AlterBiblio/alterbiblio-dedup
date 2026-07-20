#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_benchmark.py — arnés de evaluación del deduplicador contra datasets ASySD.

Métrica (replica calculate_performance de ASySD):
  Cada registro trae una etiqueta de oro (`label`): "Unique" = debería CONSERVARSE
  (es el representante del grupo), "Duplicate" = debería ELIMINARSE. Ejecutamos
  nuestro deduplicador y asignamos a cada registro una `pred_label`: "Duplicate"
  si nuestra herramienta lo retiró, "Unique" en caso contrario (conservado, esté
  o no en revisión humana).

  Matriz de confusión sobre el total de registros:
    TN = oro Unique  & pred Unique    (representante correctamente conservado)
    FN = oro Duplicate & pred Unique  (duplicado real que se conservó por error)
    TP = oro Duplicate & pred Duplicate (duplicado real correctamente retirado)
    FP = oro Unique  & pred Duplicate (representante retirado por error — SE PIERDE
         UN REGISTRO ÚNICO: el error grave)

  Sensibilidad = TP / (TP+FN) × 100 ; Especificidad = TN / (TN+FP) × 100

  Comprobaciones de cordura que DEBEN cumplirse:
    TN+FP = nº de registros oro "Unique"
    TP+FN = nº de registros oro "Duplicate"
    TN+FP+TP+FN = total de registros

Control del superviviente (para casar con keep_label="Unique" de ASySD):
  Nuestro `dedup()` conserva el PRIMER registro registrado de cada grupo detectado.
  Para que el superviviente coincida con el "Unique" de oro (y así la comparación
  registro a registro no quede confundida por una elección arbitraria de
  superviviente — exactamente lo que hace ASySD), los registros se ordenan de modo
  que, dentro de cada `duplicateid`, la fila con label=="Unique" vaya primero,
  seguida de las filas "Duplicate". Basta un sort estable por la clave
  (duplicateid, 0 si label=="Unique" si no 1).

Dos escenarios:
  1) Solo automático: pred "Duplicate" = retirado por la cascada; los pares en
     revisión cuentan como conservados ("Unique"). Es la comparación justa con
     ASySD totalmente automático.
  2) Pipeline completo (automático + revisión humana simulada): además, para cada
     par en revisión (r, other, motivo), si ambos comparten el `duplicateid` de
     oro (es decir, son de verdad duplicados), se simula la decisión humana
     correcta retirando el miembro que NO es el "Unique" de oro. Muestra el
     resultado del pipeline una vez el humano resuelve los dudosos.

Uso:
  python3 tests/benchmark/run_benchmark.py [ruta_csv] [--encoding ENC]
  (por defecto: tests/benchmark/data/asysd/Diabetes_duplicates_labelled.csv, encoding latin1)

  Codificación por dataset (ASySD no es uniforme):
    Diabetes: latin1 · NeuroImaging/Cardiac/Depression/SRSR: utf-8
"""
import argparse
import csv
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))

from dedup import rec, dedup  # noqa: E402

DEFAULT_DATASET = os.path.join(SCRIPT_DIR, "data", "asysd", "Diabetes_duplicates_labelled.csv")
DEFAULT_ENCODING = "latin1"


def load_records(csv_path, encoding=DEFAULT_ENCODING):
    """Lee el CSV ASySD y construye una lista de rec() con la identidad de oro
    guardada en extra. Ordena por (duplicateid, 0/1) para que el registro
    "Unique" de cada grupo sea el primero registrado (superviviente natural de
    dedup()). El orden de columnas varía según el dataset ASySD; DictReader lo
    resuelve por nombre, así que basta con los nombres esperados."""
    with open(csv_path, encoding=encoding, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    rows.sort(key=lambda row: (row["duplicateid"], 0 if row["label"] == "Unique" else 1))

    records = []
    for row in rows:
        r = rec(
            source="asysd",
            title=row.get("title", ""),
            doi=row.get("doi", ""),
            year=row.get("year", ""),
            journal=row.get("journal", ""),
            volume=row.get("volume", ""),
            spage=row.get("pages", ""),
            abstract=row.get("abstract", ""),
            authors=[row.get("author", "")] if row.get("author") else [],
            extra={
                "record_id": row["record_id"],
                "label": row["label"],
                "duplicateid": row["duplicateid"],
            },
        )
        records.append(r)
    return records, rows


def confusion_matrix(gold_by_id, pred_duplicate_ids):
    """gold_by_id: record_id -> 'Unique'/'Duplicate'. pred_duplicate_ids: set de
    record_id predichos como Duplicate (retirados); el resto se consideran Unique
    (conservados)."""
    tn = fn = tp = fp = 0
    for record_id, gold in gold_by_id.items():
        pred_duplicate = record_id in pred_duplicate_ids
        if gold == "Unique":
            if pred_duplicate:
                fp += 1
            else:
                tn += 1
        else:  # gold == "Duplicate"
            if pred_duplicate:
                tp += 1
            else:
                fn += 1
    return tn, fp, tp, fn


def sens_spec(tn, fp, tp, fn):
    sens = (tp / (tp + fn) * 100) if (tp + fn) else float("nan")
    spec = (tn / (tn + fp) * 100) if (tn + fp) else float("nan")
    return sens, spec


def print_matrix(label, tn, fp, tp, fn, n_unique_gold, n_dup_gold, total):
    sens, spec = sens_spec(tn, fp, tp, fn)
    print(f"\n--- {label} ---")
    print(f"{'':>12}{'pred Unique':>14}{'pred Duplicate':>16}")
    print(f"{'oro Unique':>12}{tn:>14}{fp:>16}   (TN/FP)")
    print(f"{'oro Duplicate':>12}{fn:>14}{tp:>16}   (FN/TP)")
    print(f"Sensibilidad = TP/(TP+FN) = {tp}/({tp}+{fn}) = {sens:.2f}%")
    print(f"Especificidad = TN/(TN+FP) = {tn}/({tn}+{fp}) = {spec:.2f}%")

    ok_unique = (tn + fp) == n_unique_gold
    ok_dup = (tp + fn) == n_dup_gold
    ok_total = (tn + fp + tp + fn) == total
    estado = "OK" if (ok_unique and ok_dup and ok_total) else "FALLO"
    print(f"Comprobaciones de cordura: TN+FP={tn+fp} (esperado {n_unique_gold}), "
          f"TP+FN={tp+fn} (esperado {n_dup_gold}), suma={tn+fp+tp+fn} (esperado {total}) -> {estado}")
    return estado == "OK"


def run(csv_path, encoding=DEFAULT_ENCODING):
    records, rows = load_records(csv_path, encoding=encoding)
    total = len(records)
    gold_by_id = {row["record_id"]: row["label"] for row in rows}
    n_unique_gold = sum(1 for v in gold_by_id.values() if v == "Unique")
    n_dup_gold = sum(1 for v in gold_by_id.values() if v == "Duplicate")

    print(f"Dataset: {csv_path}")
    print(f"Registros totales: {total} · oro Unique: {n_unique_gold} · oro Duplicate: {n_dup_gold}")

    kept, removed, review = dedup(records)

    # ---------- Escenario 1: solo automático ----------
    pred_duplicate_ids_auto = {r["extra"]["record_id"] for (r, _, _) in removed}
    tn1, fp1, tp1, fn1 = confusion_matrix(gold_by_id, pred_duplicate_ids_auto)
    ok1 = print_matrix("Escenario 1: solo automático", tn1, fp1, tp1, fn1,
                        n_unique_gold, n_dup_gold, total)

    # Métricas Bateup 2026 (para el escenario automático)
    print(f"\nMétricas Bateup 2026 (escenario 1):")
    print(f"  Registros únicos eliminados por error (FP): {fp1}")
    print(f"  Registros duplicados retenidos por error (FN): {fn1}")
    print(f"  Pares enviados a revisión humana: {len(review)}")

    # ---------- Escenario 2: automático + revisión humana simulada ----------
    pred_duplicate_ids_full = set(pred_duplicate_ids_auto)
    true_dup_review_pairs = 0
    for r, other, _reason in review:
        rid_group = r["extra"]["duplicateid"]
        other_group = other["extra"]["duplicateid"]
        if rid_group == other_group and rid_group != "":
            true_dup_review_pairs += 1
            # El humano decide correctamente: se retira el miembro que NO es el
            # "Unique" de oro (si ambos o ninguno lo fuesen, no cambia el resultado
            # sobre la identidad de oro real, pero en este dataset cada grupo
            # tiene exactamente un "Unique").
            for member in (r, other):
                if member["extra"]["label"] != "Unique":
                    pred_duplicate_ids_full.add(member["extra"]["record_id"])

    tn2, fp2, tp2, fn2 = confusion_matrix(gold_by_id, pred_duplicate_ids_full)
    ok2 = print_matrix("Escenario 2: automático + revisión humana simulada", tn2, fp2, tp2, fn2,
                        n_unique_gold, n_dup_gold, total)

    print(f"\nPares en revisión: {len(review)} · de ellos, duplicados reales (mismo duplicateid): "
          f"{true_dup_review_pairs}")

    return ok1 and ok2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", nargs="?", default=DEFAULT_DATASET)
    parser.add_argument("--encoding", default=DEFAULT_ENCODING,
                         help="codificación del CSV (por defecto latin1; los ASySD "
                              "más recientes usan utf-8)")
    args = parser.parse_args()
    ok = run(args.csv_path, encoding=args.encoding)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
