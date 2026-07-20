# Tests de deduplicar-referencias

Dos escenarios declarados en `fixtures/fixtures.json` (batería compartida: la implementación JS de fase 2 debe pasar este mismo json con su propio runner). Ejecutar:

```bash
python3 run_shared.py
```

- **Escenario A** (`*_sample.*`): los cinco formatos (RIS/MEDLINE/BibTeX/CSV/XML) + online-first vs número + abstract de congreso con DOI compartido + dudoso por DOI.
- **Escenario B** (`patterns/`): patrones reales afinados con Rayyan — título traducido entre corchetes (PubMed) fusionado, dos abstracts del mismo ensayo en congresos distintos colapsados, abstract de congreso vs artículo → revisión, artículo + réplica «Re:» → revisión (mantener ambos), registro de ensayo (clinicaltrials.gov) conservado aparte.

## Qué cubre cada fixture

| Fixture | Formato | Caso que prueba |
|---------|---------|-----------------|
| `embase_sample.ris` | RIS | base; incluye la versión **online-first** (sin vol/pág, DOI viejo) del par de sarcopenia-riñón |
| `pubmed_sample.nbib` | MEDLINE | duplicado por DOI+título (título con "overall"); versión **publicada** (vol 73, pp 215-24, DOI nuevo) del par online-first |
| `scopus_sample.bib` | BibTeX | duplicado por título+año |
| `central_sample.csv` | CSV `;` | duplicado por título+año **sin DOI**; y un **abstract de congreso con DOI compartido** pero título distinto (debe conservarse) |
| `pubmed_xml_sample.xml` | PubMed XML | registro único + par **dudoso** (mismo DOI, título 0,33 → revisar) |

## Resultado esperado

- Total 13 → **9 únicos**, **4 duplicados**, **1 dudoso**.
- Motivos de duplicado presentes: `abstract`, `DOI+título`, `título+año`.
- El abstract de congreso con DOI compartido (`Nutritional status in elderly surgical patients`) **se conserva**.
- El par online-first/publicado se fusiona por **abstract** y el superviviente conserva el **DOI publicado** `10.23736/s2724-6051…` (no el `s0393-2249` online-first) + vol 73 + pp 215-24.
- El par `phase angle` (mismo DOI, título 0,33) va a `revisar.csv`.
