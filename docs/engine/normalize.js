// Normalización bibliográfica — port fiel de scripts/dedup.py:36-79.
// Python es la referencia: ante cualquier discrepancia manda dedup.py.

// dedup.py:36-37 — NFKD + encode("ascii","ignore"): descarta todo lo no-ASCII
// (la ñ pierde la virgulilla vía NFKD; "…" se descompone en "...")
export function stripAccents(s) {
  return s.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
}

// dedup.py:39-43
export function normTitle(t) {
  if (!t) return "";
  t = stripAccents(t).toLowerCase();
  t = t.replace(/[^a-z0-9]+/g, " ");
  return t.replace(/\s+/g, " ").trim();
}

// dedup.py:45-51
// Entidades HTML/XML que aparecen en DOIs (los SICI de Wiley llevan '<' '>'). Conjunto
// acotado, idéntico a _decode_entities de dedup.py, para garantizar la paridad.
function decodeEntities(s) {
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  s = s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function normDoi(d) {
  if (!d) return "";
  d = stripAccents(d).trim().toLowerCase();
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  // Canonizar la escritura del DOI antes de comparar (bases distintas lo codifican distinto):
  //   - entidades HTML: "…74:1&lt;73…" == "…74:1<73…" (SICI de Wiley),
  //   - porcentaje URL: "s0008-6363%2899%29…" == "s0008-6363(99)…".
  // Sin esto, el MISMO DOI se veía distinto y activaba un falso conflicto. Idéntico a dedup.py.
  d = decodeEntities(d);
  d = d.replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const m = d.match(/10\.\d{4,9}\/\S+/);
  d = m ? m[0] : d;
  return d.trim().replace(/[ .;,]+$/, "");
}

// dedup.py:is_cn_doi — accesión interna de Cochrane CENTRAL: NO es un DOI real.
export function isCnDoi(d) {
  return Boolean(d) && d.startsWith("10.1002/central/cn-");
}
// dedup.py:match_doi — DOI utilizable para emparejar: el CN de Cochrane cuenta como "sin DOI".
export function matchDoi(d) {
  return isCnDoi(d) ? "" : d;
}

// dedup.py:norm_eid — ID de registro de Embase (PUI). Embase lo da en U2 con prefijo "L"
// (L643991551); CENTRAL referencia el MISMO id en C3 ("EMBASE 643991551") sin la "L". Se canoniza
// a sólo dígitos para casar un registro de CENTRAL con su gemelo de Embase por identificador.
export function normEid(s) {
  const m = /^[Ll]?(\d{6,})$/.exec((s || "").trim());
  return m ? m[1] : "";
}

// dedup.py:extract_nct — nº de registro de ensayo clínico (ClinicalTrials.gov). Un mismo
// ensayo aparece con títulos muy distintos entre bases; el NCT los reconcilia. Forma canónica
// NCT + 8 dígitos con ceros a la izquierda.
const NCT_RE = /NCT0*(\d{6,8})/i;
export function extractNct(...texts) {
  for (const t of texts) {
    const m = NCT_RE.exec(t || "");
    if (m) return "NCT" + m[1].padStart(8, "0");
  }
  return "";
}

// dedup.py:53-54 — \d de Python es \p{Nd} (cualquier dígito Unicode), no sólo ASCII
export function first4(s) {
  const m = (s || "").match(/(\p{Nd}{4})/u);
  return m ? m[1] : "";
}

// dedup.py:56-60
// Primer APELLIDO del primer autor — port fiel de dedup.py:first_author_last. Formas:
//   "Smith, John" (coma) -> antes de la coma; "Smith JA" / "de la Cruz M" (apellido+iniciales)
//   -> TODO lo anterior a las iniciales (conserva apellidos compuestos); "John Smith"
//   (nombre+apellido) -> último token. Sin coma se distingue por si el último token son iniciales
//   (<=3 letras mayúsculas). Mismas operaciones que Python para la paridad.
export function firstAuthorLast(auth) {
  if (!auth || !auth.length) return "";
  const a = (auth[0] || "").trim();
  let surname;
  if (a.includes(",")) {
    surname = a.split(",")[0];
  } else {
    const parts = a.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      surname = parts.length ? parts[0] : a;
    } else {
      const bare = parts[parts.length - 1].replace(/\./g, "");
      const isInitials = bare.length > 0 && bare.length <= 3 && bare === bare.toUpperCase() && /[A-Z]/i.test(bare);
      surname = isInitials ? parts.slice(0, -1).join(" ") : parts[parts.length - 1];
    }
  }
  return normTitle(surname);
}

// dedup.py:62-65 — Jaccard sobre tokens (split por espacios, como str.split())
export function titleSim(a, b) {
  const sa = new Set(a.split(/\s+/).filter(Boolean));
  const sb = new Set(b.split(/\s+/).filter(Boolean));
  if (!sa.size || !sb.size) return 0.0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// Jaro-Winkler (nivel de carácter) — port fiel de dedup.py:jaro/jaro_winkler. Complementa al
// Jaccard de palabras (pilla guiones/erratas/una palabra distinta). Mismas operaciones que Python
// para dar el mismo float; ojo: `t //= 2` de Python es Math.floor, y `//2 - 1` también.
export function jaro(s1, s2) {
  if (s1 === s2) return 1.0;
  const l1 = s1.length, l2 = s2.length;
  if (l1 === 0 || l2 === 0) return 0.0;
  const md = Math.floor(Math.max(l1, l2) / 2) - 1;
  const m1 = new Array(l1).fill(false), m2 = new Array(l2).fill(false);
  let matches = 0;
  for (let i = 0; i < l1; i++) {
    for (let j = Math.max(0, i - md); j < Math.min(i + md + 1, l2); j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0.0;
  let t = 0, k = 0;
  for (let i = 0; i < l1; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t = Math.floor(t / 2);
  return (matches / l1 + matches / l2 + (matches - t) / matches) / 3;
}
export function jaroWinkler(s1, s2, p = 0.1) {
  const j = jaro(s1, s2);
  let pref = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) pref++;
    else break;
  }
  return j + pref * p * (1 - j);
}

// dedup.py:67-78 — prefijos de documento editorial RELACIONADO (no duplicado)
const COMMENT_RE = /^\s*(re|reply|response to|author'?s?\s+reply|comment(ary)?\s+(on|to)|editorial\s+comment|letter\s+to\s+the\s+editor|erratum|corrigendum|correction(s)?(\s+to)?)\b/i;

export function commentKind(title) {
  const m = COMMENT_RE.exec(stripAccents(title || ""));
  if (!m) return null;
  const w = m[1].toLowerCase();
  if (w.startsWith("erratum") || w.startsWith("corrigendum") || w.startsWith("correction")) {
    return "artículo + fe de erratas/corrección";
  }
  return "artículo + respuesta/comentario";
}
