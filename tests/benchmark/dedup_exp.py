#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""EXPERIMENTAL — copia del motor con guardarraíl configurable. NO es producción.
Controlado por globals antes de llamar dedup():
  GUARD_ABSTRACT : aplica guardarraíl en la regla 2 (abstract)
  GUARD_TAY      : aplica guardarraíl en la regla 5 (título+autor+año~)
  GUARD_MIN      : nº mínimo de campos duros en conflicto para disparar (1 o 2)
Acción del guardarraíl = mandar el par a REVISIÓN (conservador), no bloquear en seco.
"""
import re, unicodedata

GUARD_ABSTRACT = True
GUARD_TAY = True
GUARD_MIN = 1

def strip_accents(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
def norm_title(t):
    if not t: return ""
    t = strip_accents(t).lower()
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()
def norm_doi(d):
    if not d: return ""
    d = strip_accents(d).strip().lower()
    d = re.sub(r"^https?://(dx\.)?doi\.org/", "", d)
    m = re.search(r"10\.\d{4,9}/\S+", d)
    d = m.group(0) if m else d
    return d.strip().rstrip(" .;,")
def first4(s):
    m = re.search(r"(\d{4})", s or ""); return m.group(1) if m else ""
def first_author_last(auth):
    if not auth: return ""
    a = auth[0]
    a = a.split(",")[0] if "," in a else a.split()[0] if a.split() else a
    return norm_title(a)
def title_sim(a, b):
    sa, sb = set(a.split()), set(b.split())
    if not sa or not sb: return 0.0
    return len(sa & sb) / len(sa | sb)

def hard_conflict_fields(a, b):
    out = []
    if a["doi"] and b["doi"] and a["doi"] != b["doi"]: out.append("doi")
    if a["volume"] and b["volume"] and a["volume"] != b["volume"]: out.append("vol")
    if a["start_page"] and b["start_page"] and a["start_page"] != b["start_page"]: out.append("pag")
    return out
def guarded(a, b):
    return len(hard_conflict_fields(a, b)) >= GUARD_MIN

_COMMENT_RE = re.compile(
    r"^\s*(re|reply|response to|author'?s?\s+reply|comment(ary)?\s+(on|to)|"
    r"editorial\s+comment|letter\s+to\s+the\s+editor|erratum|corrigendum|correction(s)?(\s+to)?)\b",
    re.I)
def comment_kind(title):
    m = _COMMENT_RE.match(strip_accents(title or ""))
    if not m: return None
    w = m.group(1).lower()
    if w.startswith(("erratum", "corrigendum", "correction")): return "artículo + fe de erratas/corrección"
    return "artículo + respuesta/comentario"

def rec(source, title="", doi="", year="", authors=None, journal="", volume="",
        issue="", spage="", pmid="", abstract="", extra=None):
    return {"source": source, "title": (title or "").strip(),
            "ntitle": norm_title(title), "doi": norm_doi(doi), "year": first4(year),
            "authors": authors or [], "fauthor": first_author_last(authors or []),
            "journal": (journal or "").strip(),
            "volume": (volume or "").strip(), "issue": (issue or "").strip(),
            "spage": (spage or "").strip(), "start_page": (spage or "").split("-")[0].strip(),
            "pmid": (pmid or "").strip(),
            "abstract": (abstract or "").strip(), "nabs": norm_title(abstract),
            "also_in": [], "extra": extra or {}}

def is_abstract_page(x):
    return bool(re.match(r"^[A-Za-z]\d", x["spage"] or ""))
def pub_rank(x):
    r = 0.0
    if x["volume"]: r += 1
    if x["spage"]:
        r += 1
        if is_abstract_page(x): r -= 1.5
    if x["pmid"]: r += 1
    if x["doi"]: r += 0.5
    if len(x["nabs"]) >= 150: r += 0.5
    return r
def merge_record(keeper, other):
    adopt = pub_rank(other) > pub_rank(keeper)
    fields = ("title", "ntitle", "year", "doi", "volume", "issue", "spage",
              "journal", "pmid", "abstract", "nabs", "fauthor", "authors")
    for f in fields:
        if other[f] and (adopt or not keeper[f]):
            keeper[f] = other[f]

def dedup(records, merge_thr=0.5, review_thr=0.3, prio=None):
    prio = prio or {}
    records = sorted(records, key=lambda r: prio.get(r["source"], 99))
    kept, removed, review = [], [], []
    by_pmid, by_doi, by_title, by_author, by_year, by_struct = {}, {}, {}, {}, {}, {}
    def struct_of(r):
        return (r["volume"], r["start_page"], r["fauthor"], r["year"]) \
            if r["volume"] and r["start_page"] and r["fauthor"] and r["year"] else None
    def register(r):
        if r["pmid"]: by_pmid[r["pmid"]] = r
        if r["doi"]: by_doi.setdefault(r["doi"], []).append(r)
        if r["ntitle"] and len(r["ntitle"]) >= 25: by_title[(r["ntitle"], r["year"])] = r
        if r["fauthor"]: by_author.setdefault(r["fauthor"], []).append(r)
        if r["year"]: by_year.setdefault(r["year"], []).append(r)
        sk = struct_of(r)
        if sk: by_struct.setdefault(sk, r)
    def year_ok(a, b, tol=1):
        if not a["year"] or not b["year"]: return False
        try: return abs(int(a["year"]) - int(b["year"])) <= tol
        except ValueError: return False
    _REGISTRY_RE = re.compile(r"clinicaltrials\.gov|isrctn|eudract|who\s*ictrp|"
                              r"trial\s*regist|drks|anzctr|chictr|\bctri\b|jprn|\bumin\b", re.I)
    def is_registry(x):
        if _REGISTRY_RE.search(x["journal"] or ""): return True
        return bool(re.search(r"\b(NCT\d{6,}|ISRCTN\d{6,}|EudraCT)\b", x["title"] or ""))
    def is_conf_abstract(x):
        if is_abstract_page(x): return True
        if re.search(r"suppl|abstract", x["journal"] or "", re.I): return True
        return bool(re.search(r"_suppl|meeting[-_ ]?abstract", x["doi"] or "", re.I))
    def rec_kind(x):
        if is_registry(x): return "registry"
        if is_conf_abstract(x): return "abstract"
        return "article"
    def kind_block(r, c):
        kr, kc = rec_kind(r), rec_kind(c)
        if kr == kc: return None
        if "registry" in (kr, kc): return "registry"
        return "abs_vs_art"
    def merge_into(keeper, other):
        merge_record(keeper, other)
        register(keeper)
    def candidates(r):
        c = []
        if r["pmid"] and r["pmid"] in by_pmid: c.append(by_pmid[r["pmid"]])
        if r["doi"]: c += by_doi.get(r["doi"], [])
        if r["fauthor"]: c += by_author.get(r["fauthor"], [])
        if r["year"]:
            c += by_year.get(r["year"], [])
            try:
                yi = int(r["year"]); c += by_year.get(str(yi-1), []) + by_year.get(str(yi+1), [])
            except ValueError: pass
        sk = struct_of(r)
        if sk and sk in by_struct: c.append(by_struct[sk])
        seen, uniq = set(), []
        for x in c:
            if id(x) not in seen: seen.add(id(x)); uniq.append(x)
        return uniq

    for r in records:
        dup = reason = unsure = ureason = None
        cands = candidates(r)
        for c in cands:
            if r["pmid"] and c["pmid"] == r["pmid"]: dup, reason = c, "PMID"; break
        if not dup and len(r["nabs"]) >= 150:
            ab_border = ab_reason = None
            for c in cands:
                if len(c["nabs"]) >= 150 and title_sim(r["nabs"], c["nabs"]) >= 0.85:
                    kb = kind_block(r, c)
                    if kb == "registry": continue
                    cmix = bool(comment_kind(r["title"])) != bool(comment_kind(c["title"]))
                    if not cmix and kb is None and (title_sim(r["ntitle"], c["ntitle"]) >= 0.5 or (r["fauthor"] and r["fauthor"] == c["fauthor"])):
                        if GUARD_ABSTRACT and guarded(r, c):
                            if ab_border is None:
                                ab_border = c
                                ab_reason = "abstract casi idéntico pero %s discrepa (revisar)" % "+".join(hard_conflict_fields(r, c))
                            continue
                        dup, reason = c, "abstract"; break
                    elif ab_border is None:
                        ab_border = c
                        k = comment_kind(r["title"]) or comment_kind(c["title"])
                        ab_reason = (f"{k} (mantener ambos)" if k
                            else "abstract casi idéntico: abstract de congreso vs artículo (revisar)" if kb == "abs_vs_art"
                            else "abstract casi idéntico pero título/autor distintos (¿respuesta/comentario?)")
            if not dup and ab_border is not None and unsure is None:
                unsure, ureason = ab_border, ab_reason
        if not dup and r["ntitle"] and len(r["ntitle"]) >= 25 and (r["ntitle"], r["year"]) in by_title:
            dup, reason = by_title[(r["ntitle"], r["year"])], "título+año"
        if not dup and r["doi"] and r["doi"] in by_doi:
            best, bs = None, 0.0
            for c in by_doi[r["doi"]]:
                s = title_sim(r["ntitle"], c["ntitle"])
                if s > bs: bs, best = s, c
            if best is not None:
                if bs >= merge_thr: dup, reason = best, "DOI+título"
                elif bs >= review_thr: unsure, ureason = best, f"DOI igual, título similar {bs:.2f}"
        if not dup:
            for c in cands:
                if not (r["fauthor"] and c["fauthor"] == r["fauthor"]): continue
                s = title_sim(r["ntitle"], c["ntitle"])
                if year_ok(r, c):
                    if s >= 0.85:
                        kb = kind_block(r, c)
                        if kb == "abs_vs_art":
                            if not unsure:
                                unsure, ureason = c, f"título {s:.2f}+mismo autor, abstract de congreso vs artículo (¿misma obra? mantener/enlazar)"
                        elif kb is None:
                            if GUARD_TAY and guarded(r, c):
                                if not unsure:
                                    unsure, ureason = c, "título %.2f+autor pero %s discrepa (revisar)" % (s, "+".join(hard_conflict_fields(r, c)))
                            else:
                                dup, reason = c, "título+autor+año~"; break
                    elif s >= 0.70 and not unsure:
                        unsure, ureason = c, f"título {s:.2f}+autor+año~ (revisar)"
                elif s >= 0.90 and not unsure:
                    unsure, ureason = c, f"título casi idéntico {s:.2f}+mismo autor, años distintos (¿abstract de congreso vs artículo?)"
        sk = struct_of(r)
        if not dup and not unsure and sk and sk in by_struct:
            c = by_struct[sk]
            ab_ok = len(r["nabs"]) >= 150 and len(c["nabs"]) >= 150 and title_sim(r["nabs"], c["nabs"]) >= 0.85
            if title_sim(r["ntitle"], c["ntitle"]) >= 0.5 or ab_ok:
                dup, reason = c, "vol+pág+autor+año"
            else:
                unsure, ureason = c, f"mismo vol+pág+autor+año pero títulos distintos {title_sim(r['ntitle'], c['ntitle']):.2f} (revisar)"
        if not dup and not unsure and r["ntitle"] and len(r["ntitle"]) >= 25:
            for c in by_year.get(r["year"], []):
                s = title_sim(r["ntitle"], c["ntitle"])
                if s >= 0.9 and (r["ntitle"], r["year"]) != (c["ntitle"], c["year"]):
                    kind = comment_kind(r["title"]) or comment_kind(c["title"])
                    unsure, ureason = c, (f"{kind} (mantener ambos)" if kind
                        else f"título casi idéntico {s:.2f} (sin DOI/PMID/autor común)"); break
        if dup is not None and kind_block(r, dup) == "registry":
            dup = reason = None
        if dup is not None:
            if r["source"] not in dup["also_in"] and r["source"] != dup["source"]:
                dup["also_in"].append(r["source"])
            merge_into(dup, r)
            removed.append((r, dup, reason))
        else:
            if unsure is not None: review.append((r, unsure, ureason))
            kept.append(r); register(r)
    return kept, removed, review
