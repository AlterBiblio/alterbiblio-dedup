# alterbiblio-dedup

🇬🇧 [Read this in English](README.md)

Deduplicación **conservadora y trazable** de resultados de búsqueda bibliográfica
(PubMed, Embase, CENTRAL, Scopus, Web of Science…) previa al cribado en Rayyan,
Covidence o equivalente, con recuentos y diagrama listos para PRISMA 2020.

Herramienta de [AlterBiblio](https://alterbiblio.com).

## Probar en el navegador (sin instalar nada)

**→ https://alterbiblio.github.io/alterbiblio-dedup/**

Todo se procesa **en tu navegador**: ningún fichero sale de tu ordenador. No hay
servidor, ni cuenta, ni instalación.

### Cómo se usa

1. **Sube una exportación por base de datos** (un fichero por fuente). Formatos
   admitidos: RIS (`.ris`), MEDLINE/PubMed (`.nbib`), PubMed XML (`.xml`),
   BibTeX (`.bib`) y CSV. La etiqueta de cada fichero es el nombre de la fuente
   en el recuento y en la matriz de solapamiento.
2. Pulsa **Deduplicar**. Verás los duplicados retirados, los únicos y los
   **dudosos**.
3. **Revisa los dudosos**: la herramienta *no fusiona a ciegas*. Para cada par
   decides *Registro A*, *Registro B*, *Mantener ambos* o *Decidir en la criba*.
4. Descarga el `dedup.ris` (únicos para cribar), los CSV de duplicados y
   decisiones, el Excel maestro de cribado, el **diagrama PRISMA 2020**
   (SVG/PNG/PPT editable) y el informe.

Principio conservador: **el DOI por sí solo nunca fusiona**; los registros de
ensayo clínico se mantienen aparte; los pares ambiguos van a decisión humana.

## Línea de comandos (opcional)

Equivalente exacto de la web, sin dependencias externas. Requiere Python 3.

```bash
python3 scripts/dedup.py embase.ris pubmed.nbib central.ris \
  --source-names Embase,PubMed,CENTRAL --out salida/
```

Genera `dedup.ris`, `duplicados.csv`, `revisar.csv` e `dedup_informe.md` en la
carpeta de salida. Con `--decisiones decisiones.csv` reaplica decisiones humanas
de una pasada previa.

## Dos motores, una sola lógica

La herramienta está implementada dos veces —JavaScript (navegador) y Python
(línea de comandos)— y ambas se validan contra una batería compartida que exige
**salida idéntica byte a byte**. Python es la referencia.

```bash
npm run test:js                 # tests JS + paridad + unitarios
python3 tests/run_shared.py     # batería compartida (Python)
python3 tests/benchmark/run_benchmark.py data/asysd/Diabetes_duplicates_labelled.csv
```

Los datasets gold-standard de evaluación (ASySD, Hair et al. 2023) se descargan
de OSF (`osf.io/c9evs`) y no se incluyen en el repositorio.

## Cómo citar

Si usas la herramienta, cítala con los metadatos de
[`CITATION.cff`](CITATION.cff).

## Licencia

© 2026 Alter Biblio S.L. Código, algoritmo y documentación bajo
[Creative Commons Attribution-NonCommercial-ShareAlike 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
(CC BY-NC-SA 4.0): cítese la fuente, uso no comercial, y compartir bajo la misma
licencia.
