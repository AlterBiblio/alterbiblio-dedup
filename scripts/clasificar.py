#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Clasificador de tipo de estudio PROVISIONAL para el cribado.

Prioridad de la evidencia: primero la tipología que declara la propia base
(PubMed `PT` / Embase `M3`) — fiabilidad ALTA; si la base sólo da un genérico
("Journal Article"/"Article") o nada, se infiere del título/resumen — fiabilidad
SUGERIDA. Si no hay nada, "Sin determinar".

Es una AYUDA al cribador, no una clasificación definitiva: la etiqueta y su nivel
de fiabilidad van juntas en la Excel para que la persona sepa cuánto fiarse.
"""
import re
from dedup import jaro_winkler, norm_title

# Taxonomía ordenada por prioridad (menor = gana cuando un registro trae varias
# tipologías, p. ej. "Journal Article" + "Randomized Controlled Trial" -> RCT).
# Cada entrada: (prioridad, etiqueta, patrones de PT/M3 en minúsculas).
_TAXO = [
    (1,  "Registro de ensayo clínico",        [r"trial registry record"]),
    (2,  "Revisión sistemática o metaanálisis",[r"systematic review", r"meta-?analysis"]),
    (3,  "Revisión de alcance (scoping)",      [r"scoping review"]),
    (4,  "Ensayo clínico aleatorizado",        [r"randomized controlled trial", r"randomised controlled trial", r"equivalence trial"]),
    (5,  "Ensayo clínico / protocolo",         [r"clinical trial protocol", r"^clinical trial$", r"\bclinical trial\b"]),
    (6,  "Estudio observacional",              [r"observational study", r"comparative study", r"validation study"]),
    (7,  "Caso clínico o serie de casos",      [r"case reports?"]),
    (8,  "Revisión (narrativa)",               [r"^review$", r"\breview\b", r"short survey"]),
    (9,  "Resumen de congreso",                [r"conference abstract", r"conference paper", r"conference proceeding"]),
    (10, "Carta, editorial o comentario",      [r"\bcomment\b", r"\bletter\b", r"\beditorial\b", r"^note$"]),
    (11, "Fe de erratas / corrección",         [r"erratum", r"correction", r"corrigendum"]),
]
# Genéricos que NO determinan tipo por sí solos (se intenta afinar por título).
_GENERICOS = (r"journal article", r"^article$", r"article in press", r"english abstract",
              r"research support", r"multicenter study", r"conference proceeding.*journal",
              r"^note$")  # note lo dejamos también como carta; se resuelve por prioridad

# Heurística de título/resumen cuando la base no da tipo específico (fiabilidad sugerida).
_HEUR = [
    ("Revisión sistemática o metaanálisis", r"\bsystematic review\b|\bmeta-?analysis\b|\bmetaanalisis\b|revisi[oó]n sistem[aá]tica"),
    ("Ensayo clínico aleatorizado",         r"\brandomi[sz]ed\b|\brandomi[sz]ed controlled\b|\brct\b|ensayo.*aleatoriz"),
    ("Ensayo clínico / protocolo",          r"\bclinical trial\b|\bstudy protocol\b|\bprotocol\b\s*$|ensayo cl[ií]nico"),
    ("Estudio observacional",               r"\bcohort\b|\bcase[- ]control\b|\bcross[- ]sectional\b|\bprospective\b|\bretrospective\b|\bregistry\b|cohorte|casos y controles"),
    ("Caso clínico o serie de casos",       r"\bcase report\b|\bcase series\b|\ba case of\b|caso cl[ií]nico"),
    # revisión narrativa: sólo frases específicas (evita "reviewed the charts" en el abstract)
    ("Revisión (narrativa)",                r"\bnarrative review\b|\bliterature review\b|\ba review of\b|:\s*a review\b|\breview article\b|revisi[oó]n narrativa"),
    ("Resumen de congreso",                 r"\bmeeting abstract\b|\bconference\b"),
]

def _match_taxo(ptypes):
    """Devuelve (prioridad, etiqueta) de la tipología más específica declarada, o None."""
    best = None
    for p in ptypes:
        pl = p.strip().lower()
        for pri, label, pats in _TAXO:
            if any(re.search(pat, pl) for pat in pats):
                if best is None or pri < best[0]:
                    best = (pri, label)
    return best

def _solo_generico(ptypes):
    """True si el registro trae tipología pero toda es genérica (no determina tipo)."""
    if not ptypes:
        return False
    return all(any(re.search(g, p.strip().lower()) for g in _GENERICOS) for p in ptypes)

def _heuristica(rec):
    texto = (rec.get("title", "") + " " + rec.get("abstract", "")).lower()
    for label, pat in _HEUR:
        if re.search(pat, texto):
            return label
    return None

def clasificar_estudio(rec):
    """
    -> (tipo, fiabilidad). fiabilidad ∈ {"Alta (base)", "Sugerida (título)", "Sin determinar"}.
    Señal de congreso por la página (e824/S76/A12) refuerza 'Resumen de congreso'.
    """
    ptypes = rec.get("ptypes", []) or []
    taxo = _match_taxo(ptypes)
    if taxo is not None:
        return taxo[1], "Alta (base)"
    # sin tipo específico en la base -> intentar por título/resumen
    heur = _heuristica(rec)
    if heur is not None:
        # página de suplemento + heurística débil -> resumen de congreso manda
        sp = rec.get("spage", "") or ""
        if re.match(r"^[A-Za-z]\d", sp) and heur in ("Revisión (narrativa)",):
            return "Resumen de congreso", "Sugerida (título)"
        return heur, "Sugerida (título)"
    # nada por título pero la página delata resumen de congreso
    if re.match(r"^[A-Za-z]\d", rec.get("spage", "") or ""):
        return "Resumen de congreso", "Sugerida (página)"
    if ptypes:  # había tipología pero sólo genérica
        return "Artículo (sin especificar)", "Sin determinar"
    return "Sin determinar", "Sin determinar"


# --- confianza de un par "posible duplicado": ¿probabilidad de ser el MISMO documento? ---
# Segunda señal (estilo ASySD, sin fusionar): combina Jaro-Winkler del título con el acuerdo en
# año / primer autor / páginas / ensayo. Ayuda a triar en la criba. NO cambia que se conserven ambos.
def confianza_par(a, b, reason=""):
    r = (reason or "").lower()
    # relaciones que NO son "el mismo documento" (aunque estén emparentadas)
    if "comentario" in r or "respuesta" in r or "erratas" in r or "corrección" in r:
        return "Baja (documentos relacionados, no el mismo)"
    if "mismo ensayo" in r:
        return "Alta (mismo ensayo clínico)"
    jw = jaro_winkler(a.get("ntitle", ""), b.get("ntitle", ""))
    same_year = bool(a.get("year")) and a.get("year") == b.get("year")
    same_author = bool(a.get("fauthor")) and a.get("fauthor") == b.get("fauthor")
    same_page = bool(a.get("start_page")) and a.get("start_page") == b.get("start_page")
    same_journal = bool(a.get("journal")) and norm_title(a.get("journal", "")) == norm_title(b.get("journal", ""))
    if jw >= 0.97 or (jw >= 0.92 and (same_author or same_page or same_journal)):
        return "Alta"
    if jw >= 0.90 or (same_author and same_year) or same_page:
        return "Media"
    return "Baja"
