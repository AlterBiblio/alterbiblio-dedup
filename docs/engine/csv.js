// CSV seguro para abrir en hojas de cálculo. Los valores proceden de ficheros importados.

const FORMULA_PREFIX = /^[=+\-@\t\r\n]/;

export function csvSafe(value) {
  const text = value == null ? "" : String(value);
  return FORMULA_PREFIX.test(text) ? "'" + text : text;
}

export function csvEscape(value) {
  const text = csvSafe(value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function toCsv(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  return columns.join(",") + "\n"
    + rows.map(row => columns.map(key => csvEscape(row[key])).join(",")).join("\n")
    + "\n";
}
