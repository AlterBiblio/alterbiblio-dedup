"""Neutralización de valores no confiables en formatos de hoja de cálculo."""


FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n")


def csv_safe(value):
    """Devuelve una celda CSV que Excel/LibreOffice no interpretarán como fórmula."""
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(FORMULA_PREFIXES) else text


def force_openpyxl_text(cell):
    """Fuerza como texto una celda que openpyxl habría clasificado como fórmula."""
    if isinstance(cell.value, str) and cell.value.startswith(FORMULA_PREFIXES):
        cell.data_type = "s"
    return cell
