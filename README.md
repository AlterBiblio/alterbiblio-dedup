# alterbiblio-dedup

🇪🇸 [Léeme en español](README.es.md)

**Conservative, traceable** deduplication of bibliographic search results
(PubMed, Embase, CENTRAL, Scopus, Web of Science…) prior to screening in Rayyan,
Covidence or similar, with PRISMA 2020-ready counts and flow diagram.

A tool by [AlterBiblio](https://alterbiblio.com).

## Try it in your browser (nothing to install)

**→ https://alterbiblio.github.io/alterbiblio-dedup/**

Everything is processed **in your browser**: no file leaves your computer. No
server, no account, no installation.

### How to use it

1. **Upload one export per database** (one file per source). Accepted formats:
   RIS (`.ris`), MEDLINE/PubMed (`.nbib`), PubMed XML (`.xml`), BibTeX (`.bib`)
   and CSV. Each file's label is the source name in the counts and in the
   overlap matrix.
2. Click **Deduplicate**. You will see the removed duplicates, the unique
   records and the **ambiguous** pairs.
3. **Review the ambiguous pairs**: the tool *does not merge blindly*. For each
   pair you decide *Record A*, *Record B*, *Keep both* or *Decide at screening*.
4. Download `dedup.ris` (unique records for screening), the duplicates and
   decisions CSVs, the master screening spreadsheet, the **PRISMA 2020 flow
   diagram** (SVG/PNG/editable PPT) and the report.

Conservative principle: **a DOI alone never merges**; clinical-trial registry
entries are kept separate; ambiguous pairs are referred for human decision.

## Command line (optional)

Exact equivalent of the web tool, with no external dependencies. Requires
Python 3.

```bash
python3 scripts/dedup.py embase.ris pubmed.nbib central.ris \
  --source-names Embase,PubMed,CENTRAL --out output/
```

Produces `dedup.ris`, `duplicados.csv`, `revisar.csv` and `dedup_informe.md` in
the output folder. With `--decisiones decisiones.csv` it reapplies human
decisions from a previous pass.

## Two engines, one logic

The tool is implemented twice —JavaScript (browser) and Python (command line)—
and both are validated against a shared test battery that requires
**byte-for-byte identical output**. Python is the reference.

```bash
npm run test:js                 # JS tests + parity + unit tests
python3 tests/run_shared.py     # shared battery (Python)
python3 tests/benchmark/run_benchmark.py data/asysd/Diabetes_duplicates_labelled.csv
```

The gold-standard evaluation datasets (ASySD, Hair et al. 2023) are downloaded
from OSF (`osf.io/c9evs`) and are not included in the repository.

## Citation

If you use this tool, please cite it using the metadata in
[`CITATION.cff`](CITATION.cff).

## Licence

© 2026 Alter Biblio S.L. Code, algorithm and documentation under
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(CC BY-NC-SA 4.0): cite the source, non-commercial use, and share alike under
the same licence.
