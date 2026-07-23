#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
decisiones — aplica las decisiones humanas sobre los dudosos de revisar.csv.

El dedup aparta los emparejamientos dudosos a revisar.csv con un número n
(orden de revisión). El humano dicta un mini CSV `n,decisión` y aquí se carga
y se aplica SOBRE el resultado ya calculado (kept/removed/review); la cascada
de dedup.py no se toca.

Decisiones válidas: conservar_A · conservar_B · mantener_ambos · enlazar.
"""
import csv

from dedup import merge_record
from safe_output import csv_safe

DECISIONES_VALIDAS = ("conservar_A", "conservar_B", "mantener_ambos", "enlazar")


def cargar_decisiones(path):
    """Lee el mini CSV `n,decisión` y devuelve {n: decisión}.

    Celda de decisión vacía o fila ausente = pendiente (no entra en el dict).
    n no entero, n duplicado o decisión desconocida -> ValueError con mensaje claro.
    """
    out, vistos = {}, set()
    with open(path, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        filas = [fila for fila in reader if fila and any(c.strip() for c in fila)]
    if filas:
        try:
            int(filas[0][0].strip())
        except ValueError:
            pass  # primera fila no numérica: es la cabecera, se descarta
        else:
            raise ValueError("falta la cabecera 'n,decisión' en el fichero de decisiones")
    for fila in filas[1:]:
        n_txt = fila[0].strip()
        dec = fila[1].strip() if len(fila) > 1 else ""
        try:
            n = int(n_txt)
        except ValueError:
            raise ValueError(f"n no es un entero: {n_txt!r} (columna n de revisar.csv)")
        if n in vistos:
            raise ValueError(f"n={n} duplicado: cada dudoso admite una sola decisión")
        vistos.add(n)
        if not dec:
            continue  # pendiente
        if dec not in DECISIONES_VALIDAS:
            raise ValueError(f"decisión no válida para n={n}: {dec!r} "
                             f"(usa {'/'.join(DECISIONES_VALIDAS)})")
        out[n] = dec
    return out


def write_decisiones_csv(review_original, decisiones, enlaces, path, lang="es"):
    """Suplemento decisiones.csv: una fila por dudoso ORIGINAL de revisar.csv.

    Es el registro trazable de la revisión: qué se dudó, qué se decidió y qué
    quedó pendiente. Columnas (las 10 primeras calcan revisar.csv):
      n, motivo_duda, fuente_A, titulo_A, doi_A, año_A,
      fuente_B, titulo_B, doi_B, año_B, decisión, nota
    decisión = la dictada, o 'pendiente'; nota = texto del enlace (solo enlazar).

    review_original debe ser la FOTO de review anterior a aplicar_decisiones
    (al fusionar, el conservado puede adoptar campos del retirado); enlaces es
    la lista que devuelve aplicar_decisiones, en el mismo orden que review.
    """
    from i18n import reason_i18n
    head = (["n", "motivo_duda", "fuente_A", "titulo_A", "doi_A", "año_A",
             "fuente_B", "titulo_B", "doi_B", "año_B", "decisión", "nota"] if lang == "es"
            else ["n", "review_reason", "source_A", "title_A", "doi_A", "year_A",
                  "source_B", "title_B", "doi_B", "year_B", "decision", "note"])
    pend = "pendiente" if lang == "es" else "pending"
    it = iter(enlaces)
    with open(path, "w", encoding="utf-8", newline="") as g:
        w = csv.writer(g)
        w.writerow(head)
        for n, (r, other, reason) in enumerate(review_original, 1):
            dec = decisiones.get(n, "")
            nota = ""
            if dec == "enlazar":
                a, _b = next(it)
                nota = a["extra"]["nota"]
            w.writerow([csv_safe(v) for v in
                        [n, reason_i18n(reason, lang), r["source"], r["title"], r["doi"], r["year"],
                         other["source"], other["title"], other["doi"], other["year"],
                         dec or pend, nota]])


def _nota_relacionado(other):
    nota = f"Relacionado: {other['title']} · {other['source']}"
    return f"{nota} {other['doi']}" if other["doi"] else nota


def aplicar_decisiones(kept, removed, review, decisiones):
    """Aplica {n: decisión} sobre el resultado de dedup(); el par n es review[n-1].

    Devuelve (kept, removed, review, enlaces): las LISTAS son nuevas, pero los
    dicts de registro son los mismos objetos de entrada y se mutan in situ
    (fusión de campos en conservar_*, nota en enlazar).

    Sin decisión explícita conservar_* no se fusiona nada; los pares sin
    decisión quedan en review marcados "(sin resolver)".
    """
    for n in decisiones:
        if n < 1 or n > len(review):
            raise ValueError(f"n={n} fuera de rango: revisar.csv tiene "
                             f"{len(review)} dudosos (1..{len(review)})")
    # Un conservar_* que retira un registro presente en OTRO dudoso dejaría a ese
    # par apuntando a un retirado (resultado corrupto): parar ANTES de mutar nada.
    retira = {}  # id(registro retirado) -> n de la decisión que lo retira
    for n, (r, other, _) in enumerate(review, 1):
        dec = decisiones.get(n)
        if dec in ("conservar_A", "conservar_B"):
            retira[id(other if dec == "conservar_A" else r)] = n
    for m, (r, other, _) in enumerate(review, 1):
        for x in (r, other):
            n = retira.get(id(x))
            if n is not None and n != m:
                raise ValueError(f"la decisión sobre n={n} retira un registro que "
                                 f"también aparece en el dudoso n={m}; revísalos juntos")
    kept = list(kept)
    removed = list(removed)
    review_out, enlaces = [], []
    for n, (r, other, reason) in enumerate(review, 1):
        dec = decisiones.get(n)
        if dec in ("conservar_A", "conservar_B"):
            keeper, loser = (r, other) if dec == "conservar_A" else (other, r)
            # procedencia completa del retirado: su fuente Y lo que él absorbió
            # en la cascada (also_in), como acumularía la propia cascada
            for s in [loser["source"]] + loser["also_in"]:
                if s not in keeper["also_in"] and s != keeper["source"]:
                    keeper["also_in"].append(s)
            merge_record(keeper, loser)
            kept = [x for x in kept if x is not loser]
            removed.append((loser, keeper, f"{reason} · decisión {dec}"))
        elif dec == "enlazar":
            r["extra"]["nota"] = _nota_relacionado(other)
            other["extra"]["nota"] = _nota_relacionado(r)
            enlaces.append((r, other))
        elif dec == "mantener_ambos":
            pass  # ambos se quedan; el par queda resuelto y sale de review
        else:  # pendiente
            if "(sin resolver)" not in reason:
                reason += " (sin resolver)"
            review_out.append((r, other, reason))
    return kept, removed, review_out, enlaces
