// Cascada de deduplicación — port fiel de scripts/dedup.py:262-439.
// Python es la referencia: ante cualquier discrepancia manda dedup.py.
//
// Regla de duplicado (María, 16/07/2026): el DOI SOLO no basta (los abstracts de
// congreso comparten el DOI del suplemento). Cascada conservadora de 6 reglas +
// título casi idéntico a revisión. Ante la duda, se conservan ambos.

import { titleSim, commentKind, jaroWinkler } from "./normalize.js";

// Python f"{x:.2f}" usa redondeo bancario (mitad al par); toFixed(2) de JS redondea
// la mitad hacia arriba. En [0,1] (dominio de los Jaccard) sólo divergen 0,125 y 0,625,
// verificado por fuerza bruta sobre los cocientes a/b con b<=400. Se corrigen a mano.
export function fmt2(x) {
  if (x === 0.125) return "0.12";
  if (x === 0.625) return "0.62";
  return x.toFixed(2);
}

// Separador para claves de tupla de Python ((ntitle, year), struct_of):
//   NUL no aparece en los campos, así la concatenación es inyectiva.
const SEP = "\u0000";

// Guardarraíl "≥2 identificadores en conflicto" (dedup.py hard_conflict): las reglas de
// señal blanda (abstract, título+año, título+autor+año~) pueden emparejar dos obras
// DISTINTAS con metadatos casi iguales. Un campo duro (DOI normalizado, volumen, página
// inicial) cuenta como conflicto SOLO si ambos registros lo traen no vacío y difiere;
// con 2 o más en conflicto no se fusiona: el par va a revisión.
export function hardConflictFields(a, b) {
  const out = [];
  if (a.doi && b.doi && a.doi !== b.doi) out.push("doi");
  if (a.volume && b.volume && a.volume !== b.volume) out.push("vol");
  if (a.start_page && b.start_page && a.start_page !== b.start_page) out.push("pag");
  return out;
}
export function hardConflict(a, b) {
  return hardConflictFields(a, b).length >= 2;
}

// Regla de oro: dos DOI presentes y DISTINTOS => publicaciones distintas, siempre. Aunque sean
// el mismo abstract en dos sitios, dos DOI = dos obras: se conservan ambos (ni fusión ni revisión).
// Anula las reglas de INFERENCIA (abstract, título+año, título+autor+año~, estructural). No anula
// PMID (regla 1) ni DOI+título (regla 4, que exige el MISMO DOI).
export function doiConflict(a, b) {
  return Boolean(a.doi && b.doi && a.doi !== b.doi);
}

// dedup.py:288-289
const REGISTRY_RE = /clinicaltrials\.gov|isrctn|eudract|who\s*ictrp|trial\s*regist|drks|anzctr|chictr|\bctri\b|jprn|\bumin\b/i;

// dedup.py:262-439 — devuelve { kept, removed, review }:
//   kept:    registros únicos (mutados por merge_into: metadatos publicados + also_in)
//   removed: [{ r, keptr, reason }] duplicados retirados
//   review:  [{ r, other, reason }] emparejamientos dudosos, NO fusionados
export function dedup(records, { mergeThr = 0.5, reviewThr = 0.3, prio = {} } = {}) {
  // sorted() de Python es estable; Array.prototype.sort también (ES2019+)
  records = [...records].sort(
    (a, b) => (prio[a.source] ?? 99) - (prio[b.source] ?? 99));
  const kept = [], removed = [], review = [];
  const byPmid = new Map(), byDoi = new Map(), byTitle = new Map(),
    byAuthor = new Map(), byYear = new Map(), byStruct = new Map(), byNct = new Map(),
    byEid = new Map();
  const structOf = (r) => {
    // Clave bibliográfica INDEPENDIENTE del nombre de la revista (que puede venir abreviado
    // distinto entre bases): mismo volumen + página inicial + primer autor + año. Dos artículos
    // distintos no empiezan en la misma página del mismo volumen. Capta traducciones (título en
    // corchetes de PubMed vs directo de Embase) aunque no compartan abstract.
    return r.volume && r.start_page && r.fauthor && r.year
      ? r.volume + SEP + r.start_page + SEP + r.fauthor + SEP + r.year : null;
  };
  const push = (map, k, v) => { (map.get(k) ?? map.set(k, []).get(k)).push(v); };
  const register = (r) => {
    if (r.pmid) byPmid.set(r.pmid, r);
    if (r.eid) byEid.set(r.eid, r);
    if (r.mdoi) push(byDoi, r.mdoi, r);
    if (r.ntitle && r.ntitle.length >= 25) byTitle.set(r.ntitle + SEP + r.year, r);
    if (r.fauthor) push(byAuthor, r.fauthor, r);
    if (r.year) push(byYear, r.year, r);
    if (r.nct) push(byNct, r.nct, r);
    const sk = structOf(r);
    if (sk && !byStruct.has(sk)) byStruct.set(sk, r); // setdefault: el primero se queda
  };
  const yearOk = (a, b, tol = 1) => {
    if (!a.year || !b.year) return false;
    const ai = parseInt(a.year, 10), bi = parseInt(b.year, 10);
    if (Number.isNaN(ai) || Number.isNaN(bi)) return false; // int() lanzaría ValueError
    return Math.abs(ai - bi) <= tol;
  };
  // página tipo e824 / S76 / A12 -> abstract de reunión o suplemento
  const isAbstractPage = (x) => /^[A-Za-z]\d/.test(x.spage || "");
  const isRegistry = (x) => {   // registro de ensayo (brazo aparte en PRISMA)
    if (REGISTRY_RE.test(x.journal || "")) return true;
    return /\b(NCT\d{6,}|ISRCTN\d{6,}|EudraCT)\b/.test(x.title || "");
  };
  const isConfAbstract = (x) => {  // abstract de congreso (página e/S, suplemento, o DOI de congreso)
    if (isAbstractPage(x)) return true;
    if (/suppl|abstract/i.test(x.journal || "")) return true;
    return /_suppl|meeting[-_ ]?abstract/i.test(x.doi || "");
  };
  const recKind = (x) => {
    if (isRegistry(x)) return "registry";
    if (isConfAbstract(x)) return "abstract";
    return "article";
  };
  const kindBlock = (r, c) => {
    // null = mismo tipo, se pueden fusionar; "registry" = registro aparte, nunca fusionar ni revisar;
    // "abs_vs_art" = abstract de congreso vs artículo -> revisar (misma obra, venue distinto)
    const kr = recKind(r), kc = recKind(c);
    if (kr === kc) return null;
    if (kr === "registry" || kc === "registry") return "registry";
    return "abs_vs_art";
  };
  const pubRank = (x) => {  // cuánto de "versión de número publicada" es (vs online-first / abstract de reunión)
    let r = 0.0;
    if (x.volume) r += 1;
    if (x.spage) {
      r += 1;
      if (isAbstractPage(x)) r -= 1.5;  // página de suplemento/reunión (S76, e824) = abstract, pesa menos
    }
    if (x.pmid) r += 1;
    if (x.doi) r += 0.5;
    if (x.nabs.length >= 150) r += 0.5;
    return r;
  };
  const mergeInto = (keeper, other) => {
    // Preferir la versión de número PUBLICADA (no online-first ni abstract de suplemento).
    // Si 'other' es más "publicada" que 'keeper', el superviviente adopta su identidad;
    // si no, solo se rellenan huecos.
    const adopt = pubRank(other) > pubRank(keeper);
    const fields = ["title", "ntitle", "year", "doi", "volume", "issue", "spage",
      "journal", "pmid", "eid", "abstract", "nabs", "fauthor", "authors"];
    for (const f of fields) {
      // "truthy" de Python: la lista vacía de authors también cuenta como vacío
      const val = other[f];
      const truthy = Array.isArray(val) ? val.length > 0 : Boolean(val);
      const keeperEmpty = Array.isArray(keeper[f]) ? keeper[f].length === 0 : !keeper[f];
      if (truthy && (adopt || keeperEmpty)) keeper[f] = val;
    }
    // ptypes: unión (el superviviente acumula la tipología de ambos), como dedup.py
    const seen = new Set(keeper.ptypes);
    for (const p of other.ptypes || []) if (!seen.has(p)) { seen.add(p); keeper.ptypes.push(p); }
    register(keeper);  // reindexar por si cambió doi/título/año
  };
  const candidates = (r) => {
    const c = [];
    if (r.pmid && byPmid.has(r.pmid)) c.push(byPmid.get(r.pmid));
    if (r.eid && byEid.has(r.eid)) c.push(byEid.get(r.eid));
    if (r.mdoi) c.push(...(byDoi.get(r.mdoi) ?? []));
    if (r.nct) c.push(...(byNct.get(r.nct) ?? []));
    if (r.fauthor) c.push(...(byAuthor.get(r.fauthor) ?? []));
    if (r.year) {
      c.push(...(byYear.get(r.year) ?? []));
      const yi = parseInt(r.year, 10);
      if (!Number.isNaN(yi)) {
        c.push(...(byYear.get(String(yi - 1)) ?? []), ...(byYear.get(String(yi + 1)) ?? []));
      }
    }
    const sk = structOf(r);
    if (sk && byStruct.has(sk)) c.push(byStruct.get(sk));
    const seen = new Set(), uniq = [];  // dedupe por identidad, como id(x) en Python
    for (const x of c) {
      if (!seen.has(x)) { seen.add(x); uniq.push(x); }
    }
    return uniq;
  };

  for (const r of records) {
    let dup = null, reason = null, unsure = null, ureason = null;
    const cands = candidates(r);
    // 1) PMID
    for (const c of cands) {
      if (r.pmid && c.pmid === r.pmid) { dup = c; reason = "PMID"; break; }
      if (r.eid && c.eid === r.eid) { dup = c; reason = "ID de Embase"; break; }
    }
    // 2) abstract casi idéntico (>=150 car.) -> señal fuerte, cruza DOI/año/título.
    //    PERO exige título afín (>=0,5) o mismo primer autor: evita fusionar una carta/respuesta/
    //    comentario que reproduce el abstract del artículo comentado (autor distinto -> a revisión).
    if (!dup && r.nabs.length >= 150) {
      let abBorder = null, abReason = null;
      for (const c of cands) {
        if (c.nabs.length >= 150 && titleSim(r.nabs, c.nabs) >= 0.85) {
          const kb = kindBlock(r, c);
          if (kb === "registry") continue;  // registro de ensayo: aparte, ni fusiona ni revisa
          if (doiConflict(r, c)) {   // regla de oro: DOIs distintos => conservar ambos, pero ANOTAR
            if (abBorder === null) {
              abBorder = c;
              abReason = "abstract casi idéntico pero DOIs distintos — posible duplicado (conservar ambos)";
            }
            continue;
          }
          const cmix = Boolean(commentKind(r.title)) !== Boolean(commentKind(c.title));
          if (!cmix && kb === null && (titleSim(r.ntitle, c.ntitle) >= 0.5 || (r.fauthor && r.fauthor === c.fauthor))) {
            if (hardConflict(r, c)) {  // guardarraíl: ≥2 identificadores duros discrepan
              if (abBorder === null) {
                abBorder = c;
                abReason = `abstract casi idéntico pero ≥2 identificadores (${hardConflictFields(r, c).join("+")}) discrepantes (revisar)`;
              }
              continue;
            }
            dup = c; reason = "abstract"; break;  // mismo tipo (abstract-abstract o artículo-artículo)
          } else if (abBorder === null) {
            abBorder = c;
            const k = commentKind(r.title) || commentKind(c.title);
            abReason = k ? `${k} (mantener ambos)`
              : kb === "abs_vs_art" ? "abstract casi idéntico: abstract de congreso vs artículo (revisar)"
              : "abstract casi idéntico pero título/autor distintos (¿respuesta/comentario?)";
          }
        }
      }
      if (!dup && abBorder !== null && unsure === null) {
        unsure = abBorder; ureason = abReason;
      }
    }
    // 3) título + año exactos (con guardarraíl: un título idéntico en revista/volumen/DOI
    //    distintos puede ser el artículo y su reseña o reimpresión -> a revisión)
    if (!dup && r.ntitle && r.ntitle.length >= 25 && byTitle.has(r.ntitle + SEP + r.year)) {
      const c = byTitle.get(r.ntitle + SEP + r.year);
      if (doiConflict(r, c)) {
        // regla de oro: DOI distintos => obras distintas. No se fusiona, pero título+año idénticos
        // con DOIs distintos es un posible duplicado (revista que cambia de prefijo DOI, misma obra
        // en dos venues...) -> se conserva y se ANOTA (no se descarta en silencio).
        if (unsure === null) {
          unsure = c;
          ureason = "título+año idénticos pero DOIs distintos — posible duplicado (conservar ambos)";
        }
      } else if (hardConflict(r, c)) {
        if (unsure === null) {
          unsure = c;
          ureason = `título+año idénticos pero ≥2 identificadores (${hardConflictFields(r, c).join("+")}) discrepantes (revisar)`;
        }
      } else {
        dup = c; reason = "título+año";
      }
    }
    // 4) DOI + título parecido (mdoi: el CN de Cochrane no casa aquí)
    if (!dup && r.mdoi && byDoi.has(r.mdoi)) {
      let best = null, bs = 0.0;
      for (const c of byDoi.get(r.mdoi)) {
        const s = titleSim(r.ntitle, c.ntitle);
        if (s > bs) { bs = s; best = c; }
      }
      if (best !== null) {
        if (bs >= mergeThr) { dup = best; reason = "DOI+título"; }
        else if (bs >= reviewThr) { unsure = best; ureason = `DOI igual, título similar ${fmt2(bs)}`; }
        // bs < reviewThr -> DOI compartido, título distinto: NO es duplicado (abstract congreso)
      }
    }
    // 5) mismo primer autor + título alto:
    //    - año ±1 y título ≥0,85 -> fusiona (online-first vs número)
    //    - años distantes y título ≥0,90 -> REVISAR (¿abstract de congreso vs artículo completo posterior?)
    if (!dup) {
      for (const c of cands) {
        if (!(r.fauthor && c.fauthor === r.fauthor)) continue;
        const s = titleSim(r.ntitle, c.ntitle);
        if (doiConflict(r, c)) {   // regla de oro: DOIs distintos => conservar ambos, pero ANOTAR si son afines
          if (s >= 0.70 && !unsure) {
            unsure = c;
            ureason = `título ${fmt2(s)}+mismo autor pero DOIs distintos — posible duplicado (conservar ambos)`;
          }
          continue;
        }
        if (yearOk(r, c)) {
          if (s >= 0.85) {
            const kb = kindBlock(r, c);
            if (kb === "abs_vs_art") {  // abstract de congreso vs artículo -> revisar
              if (!unsure) {
                unsure = c; ureason = `título ${fmt2(s)}+mismo autor, abstract de congreso vs artículo (¿misma obra? mantener/enlazar)`;
              }
            } else if (kb === null) {   // mismo tipo (online-first vs número) -> fusiona
              if (hardConflict(r, c)) {  // guardarraíl: ≥2 identificadores duros discrepan
                if (!unsure) {
                  unsure = c;
                  ureason = `título ${fmt2(s)}+autor+año~ pero ≥2 identificadores (${hardConflictFields(r, c).join("+")}) discrepantes (revisar)`;
                }
              } else {
                dup = c; reason = "título+autor+año~"; break;
              }
            }
            // kb === "registry" -> lo bloquea el catch-all de registro
          } else if (s >= 0.70 && !unsure) {
            unsure = c; ureason = `título ${fmt2(s)}+autor+año~ (revisar)`;
          }
        } else if (s >= 0.90 && !unsure) {
          unsure = c; ureason = `título casi idéntico ${fmt2(s)}+mismo autor, años distintos (¿abstract de congreso vs artículo?)`;
        }
      }
    }
    // 6) identidad bibliográfica: mismo volumen+página inicial+primer autor+año (sin depender del
    //    nombre de la revista). Clave casi única. Si además el título es afín o el abstract casa
    //    -> fusiona (capta traducciones con título en corchetes); si el título diverge mucho
    //    -> a revisión (podría ser colisión o dato raro): nunca fusionar a ciegas.
    const sk = structOf(r);
    if (!dup && !unsure && sk && byStruct.has(sk)) {
      const c = byStruct.get(sk);
      // Regla de oro: DOI presentes y distintos => obras distintas. La clave estructural
      // (mismo volumen+página) es una coincidencia frágil entre abstracts de un mismo
      // suplemento; un DOI en conflicto la anula (ni fusión ni revisión). Las coincidencias
      // por señal FUERTE (título+año idénticos, abstract casi idéntico) sí van a revisión
      // aunque el DOI difiera, porque ahí un DOI distinto suele ser la misma obra en dos venues.
      if (r.doi && c.doi && r.doi !== c.doi) {
        // no aplica la regla estructural
      } else {
        const abOk = r.nabs.length >= 150 && c.nabs.length >= 150 && titleSim(r.nabs, c.nabs) >= 0.85;
        if (titleSim(r.ntitle, c.ntitle) >= 0.5 || abOk) {
          dup = c; reason = "vol+pág+autor+año";
        } else {
          unsure = c; ureason = `mismo vol+pág+autor+año pero títulos distintos ${fmt2(titleSim(r.ntitle, c.ntitle))} (revisar)`;
        }
      }
    }
    // 6.5) mismo nº de ensayo clínico (NCT): posible duplicado, SIEMPRE conservar ambos.
    //      Un ensayo genera varias publicaciones (protocolo, resultados, análisis secundario)
    //      que comparten NCT sin ser el mismo artículo -> nunca se fusiona, se anota. El
    //      registro de ClinicalTrials.gov en sí (registry) va a su brazo aparte, no aquí.
    if (!dup && !unsure && r.nct) {
      for (const c of byNct.get(r.nct) ?? []) {
        if (c === r || kindBlock(r, c) === "registry") continue;
        unsure = c;
        ureason = `mismo ensayo clínico (${r.nct}) — posible duplicado (conservar ambos)`;
        break;
      }
    }
    // 7) título casi idéntico -> dudoso. Señal doble: Jaccard de palabras >=0,9 O Jaro-Winkler
    //    >=0,95 (variaciones de escritura: guiones, erratas, una palabra). Si los DOIs reales
    //    difieren, es la regla de oro: posible duplicado que se conserva.
    if (!dup && !unsure && r.ntitle && r.ntitle.length >= 25) {
      for (const c of byYear.get(r.year) ?? []) {
        if (r.ntitle === c.ntitle && r.year === c.year) continue;
        const s = titleSim(r.ntitle, c.ntitle);
        const jwok = s < 0.9 && jaroWinkler(r.ntitle, c.ntitle) >= 0.95;
        if (s >= 0.9 || jwok) {
          const kind = commentKind(r.title) || commentKind(c.title);
          if (kind) {
            unsure = c; ureason = `${kind} (mantener ambos)`;
          } else if (doiConflict(r, c)) {
            unsure = c;
            ureason = jwok
              ? "títulos casi idénticos (variación de escritura) pero DOIs distintos — posible duplicado (conservar ambos)"
              : `mismo título ${fmt2(s)} pero DOIs distintos — posible duplicado (conservar ambos)`;
          } else if (jwok) {
            unsure = c;
            ureason = "títulos casi idénticos (variación de escritura, Jaro-Winkler) — posible duplicado (sin DOI/PMID/autor común)";
          } else {
            unsure = c; ureason = `título casi idéntico ${fmt2(s)} (sin DOI/PMID/autor común)`;
          }
          break;
        }
      }
    }

    // Registro de ensayo (clinicaltrials.gov, NCT…) SIEMPRE aparte (brazo PRISMA propio):
    // anula cualquier fusión con un artículo/abstract, gane la regla que gane.
    if (dup !== null && kindBlock(r, dup) === "registry") {
      dup = null; reason = null;
    }

    if (dup !== null) {
      if (!dup.also_in.includes(r.source) && r.source !== dup.source) {
        dup.also_in.push(r.source);
      }
      mergeInto(dup, r);  // el superviviente adopta la versión publicada / rellena huecos
      removed.push({ r, keptr: dup, reason });
    } else {
      if (unsure !== null) review.push({ r, other: unsure, reason: ureason });
      kept.push(r); register(r);
    }
  }
  return { kept, removed, review };
}
