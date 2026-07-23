// Renderizado HTML de valores no confiables procedentes de exportaciones bibliográficas.

export function esc(value) {
  return (value == null ? "" : String(value)).replace(
    /[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}

export function identifierLinks(record) {
  const doiOk = record.doi && /^10\.\d{4,9}\/[^\s"'<>]+$/.test(record.doi);
  const pmidOk = record.pmid && /^\d+$/.test(record.pmid);
  const doi = record.doi
    ? (doiOk
      ? `<a href="https://doi.org/${encodeURI(record.doi)}" target="_blank" rel="noopener">${esc(record.doi)}</a>`
      : esc(record.doi))
    : '<span class="mo">—</span>';
  const pmid = record.pmid
    ? (pmidOk
      ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(record.pmid)}/" target="_blank" rel="noopener">${esc(record.pmid)}</a>`
      : esc(record.pmid))
    : '<span class="mo">—</span>';
  return `<b>DOI:</b> ${doi}&nbsp;·&nbsp;<b>PMID:</b> ${pmid}`;
}
