// Prueba de paridad Python↔JS: ejecuta AMBOS motores sobre cada fixture de
// tests/fixtures/fixtures.json y exige igualdad BYTE A BYTE en las 4 salidas
// (dedup.ris, duplicados.csv, revisar.csv, dedup_informe.md). Es la garantía
// anti-divergencia del premortem: si dedup.py y docs/engine/ se separan en
// cualquier byte, este test falla.
//
// Con DEDUP_REGRESION_DIR definida, aplica la misma comprobación al caso real
// privado (case.json en ese directorio, como run_regresion.py). Sin la
// variable: SKIP con exit 0.
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";
import { deduplicar } from "../docs/engine/index.js";
import { HEADERS } from "../docs/engine/i18n.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "..", "scripts", "dedup.py");

// Réplica del csv.writer de Python (dialecto excel, QUOTE_MINIMAL):
// comillas solo si el campo contiene delimitador, comilla o salto de línea;
// comillas internas dobladas; terminador \r\n en todas las filas.
function campoCsv(v) {
  const s = String(v ?? "");
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function csv(cabecera, filas) {
  const lineas = [cabecera, ...filas.map(f => cabecera.map(c => f[c]))];
  return lineas.map(f => f.map(campoCsv).join(",") + "\r\n").join("");
}

// Derivadas de HEADERS (es) para que el harness no se desfase del motor.
const COLS_DUPS = Object.values(HEADERS.duplicados.es);
const COLS_REV = Object.values(HEADERS.revisar.es);

function primeraDiferencia(py, js) {
  const a = py.split("\n"), b = js.split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      return `línea ${i + 1}\n          py: ${JSON.stringify(a[i])}\n          js: ${JSON.stringify(b[i])}`;
    }
  }
  return `sin diferencia por líneas (longitudes ${py.length} vs ${js.length})`;
}

// Ejecuta ambos motores sobre un fixture y devuelve la lista de fallos.
// baseDir: raíz de las rutas relativas de fx.files.
function comparaFixture(fx, baseDir) {
  const files = fx.files.map(f => (isAbsolute(f) ? f : join(baseDir, f)));
  const fuentes = fx.source_names.split(",").map(s => s.trim());

  // --- Python: dedup.py escribe los 4 ficheros en un tmp
  const tmp = mkdtempSync(join(tmpdir(), "dedup_paridad_"));
  let py;
  try {
    const proc = spawnSync("python3", [SCRIPT, ...files,
      "--source-names", fx.source_names, "--out", tmp], { encoding: "utf8" });
    if (proc.status !== 0) {
      return [`dedup.py falló (exit ${proc.status}): ${(proc.stderr || "").trim()}`];
    }
    py = {
      "dedup.ris": readFileSync(join(tmp, "dedup.ris"), "utf8"),
      "duplicados.csv": readFileSync(join(tmp, "duplicados.csv"), "utf8"),
      "revisar.csv": readFileSync(join(tmp, "revisar.csv"), "utf8"),
      "dedup_informe.md": readFileSync(join(tmp, "dedup_informe.md"), "utf8"),
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // --- JS: mismas entradas, salidas en memoria
  let out;
  try {
    const entradas = files.map((f, i) => ({
      name: f, text: readFileSync(f, "utf8"), source: fuentes[i],
    }));
    out = deduplicar(entradas);
  } catch (err) {
    return [`motor JS lanzó: ${err.message}`];
  }
  const js = {
    "dedup.ris": out.ris,
    "duplicados.csv": csv(COLS_DUPS, out.dups),
    "revisar.csv": csv(COLS_REV, out.review),
    "dedup_informe.md": out.informe,
  };

  const fallos = [];
  for (const nombre of Object.keys(py)) {
    if (py[nombre] !== js[nombre]) {
      fallos.push(`${nombre} difiere: ${primeraDiferencia(py[nombre], js[nombre])}`);
    }
  }
  return { fallos, counts: out.counts };
}

function informa(etiqueta, res) {
  const fallos = Array.isArray(res) ? res : res.fallos;
  console.log((fallos.length ? "FAIL" : "PASS") + " - " + etiqueta);
  for (const m of fallos) console.log("        " + m);
  return fallos.length === 0;
}

let ok = true;

const data = JSON.parse(readFileSync(join(HERE, "fixtures", "fixtures.json"), "utf8"));
for (const fx of data.fixtures) {
  ok = informa(`paridad ${fx.name}`, comparaFixture(fx, HERE)) && ok;
}

const regDir = process.env.DEDUP_REGRESION_DIR;
if (!regDir) {
  console.log("SKIP - paridad regresión (DEDUP_REGRESION_DIR no definida)");
} else {
  const fx = JSON.parse(readFileSync(join(regDir, "case.json"), "utf8"));
  const res = comparaFixture(fx, regDir);
  ok = informa(`paridad regresión ${fx.name}`, res) && ok;
  if (!Array.isArray(res)) {
    const c = res.counts;
    console.log(`        (${c.unicos} únicos · ${c.duplicados} duplicados · ${c.dudosos} dudosos)`);
  }
}

console.log(ok ? "\n== PARIDAD TOTAL ==" : "\n== HAY DIVERGENCIAS ==");
process.exit(ok ? 0 : 1);
