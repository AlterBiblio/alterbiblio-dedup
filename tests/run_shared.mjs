import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deduplicar } from "../docs/engine/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLAVES = new Set(["duplicados","unicos","dudosos","motivos_incluyen",
  "ris_contiene","ris_no_contiene","ris_una_vez","dudosos_texto_incluye","motivos_duda_incluyen"]);
const OBLIG = ["duplicados","unicos","dudosos"];

function comprueba(fx) {
  const e = fx.expect, fallos = [];
  for (const k of Object.keys(e)) if (!CLAVES.has(k)) fallos.push(`clave expect desconocida: ${k}`);
  for (const k of OBLIG) if (!(k in e)) fallos.push(`falta clave expect obligatoria: ${k}`);
  if (fallos.length) return fallos;

  let out;
  try {
    const entradas = fx.files.map((f, i) => ({
      name: f,
      text: readFileSync(join(HERE, f), "utf8"),
      source: fx.source_names.split(",")[i].trim(),
    }));
    out = deduplicar(entradas);
  } catch (err) { return [`motor lanzó: ${err.message}`]; }

  const ris = out.ris.toLowerCase();
  const chk = (c, m) => { if (!c) fallos.push(m); };
  const unicos = ris.split(/\r\n|\r|\n/).filter(l => l.startsWith("er  -")).length;
  chk(out.dups.length === e.duplicados, `duplicados: ${out.dups.length} != ${e.duplicados}`);
  chk(unicos === e.unicos, `unicos: ${unicos} != ${e.unicos}`);
  chk(out.review.length === e.dudosos, `dudosos: ${out.review.length} != ${e.dudosos}`);
  for (const s of e.ris_contiene ?? []) chk(ris.includes(s), `falta en ris: ${s}`);
  for (const s of e.ris_no_contiene ?? []) chk(!ris.includes(s), `sobra en ris: ${s}`);
  for (const s of e.ris_una_vez ?? []) chk(ris.split(s).length - 1 === 1, `no exactamente 1 vez: ${s}`);
  const mot = new Set(out.dups.map(d => d.motivo));
  for (const s of e.motivos_incluyen ?? []) chk(mot.has(s), `falta motivo: ${s}`);
  const duda = out.review.map(r => r.motivo_duda).join(" | ");
  for (const s of e.motivos_duda_incluyen ?? []) chk(duda.includes(s), `falta motivo_duda: ${s}`);
  const texto = out.review.map(r => (r.titulo_A + r.titulo_B).toLowerCase()).join(" ");
  for (const s of e.dudosos_texto_incluye ?? []) chk(texto.includes(s), `falta en dudosos: ${s}`);
  return fallos;
}

const data = JSON.parse(readFileSync(join(HERE, "fixtures", "fixtures.json"), "utf8"));
let ok = true;
for (const fx of data.fixtures) {
  const fallos = comprueba(fx);
  console.log((fallos.length ? "FAIL" : "PASS") + " - " + fx.name);
  for (const m of fallos) { console.log("        " + m); ok = false; }
}
console.log(ok ? "\n== TODOS EN VERDE ==" : "\n== HAY FALLOS ==");
process.exit(ok ? 0 : 1);
