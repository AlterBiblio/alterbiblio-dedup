# Cifras del artículo — FUENTE ÚNICA DE VERDAD

> Regenerado el 2026-07-20 con el motor actual (`scripts/dedup.py`). Sustituye a los
> antiguos `RESULTADOS.md` y `HEADTOHEAD.md` (retirados: tenían cifras de motores previos,
> incoherentes entre sí). **Cualquier cifra del artículo sale de aquí.** Para regenerar,
> ver los comandos al final.

Datasets ASySD (Hair et al. 2023), OSF `osf.io/c9evs`, carpeta `duplicates_labelled`.
Los CSV están gitignored (`tests/benchmark/data/`); se descargan de OSF para reproducir.
Métrica por registro (réplica de `calculate_performance_1` de ASySD): a cada herramienta se
le indica conservar el registro `Unique` del gold, para no confundir la métrica con la
elección arbitraria de superviviente.

## Tabla 1 — Nuestra herramienta, etapa automática (esc. 1) y tras revisión humana (esc. 2)

| Dataset | Registros | Sens (auto) | Espec (auto) | FP | FN | Pares a revisión | Sens (tras revisión) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Diabetes | 1.845 | 99,76% | 99,66% | 2 | 3 | 14 | 99,92% |
| NeuroImaging | 3.438 | 99,31% | 99,67% | 7 | 9 | 23 | 100,00% |
| Cardiac | 8.948 | 98,84% | 99,91% | 5 | 41 | 103 | 99,94% |
| **Media** | | **99,30%** | **99,75%** | **14** | **53** | **140** | |

Escenario 2 (con revisión humana simulada, resolviendo los pares a favor del gold): la
sensibilidad sube a 100% sólo en NeuroImaging; en Diabetes queda 99,92% (1 duplicado real ni
retirado ni marcado) y en Cardiac 99,94% (2). No es "100% en los tres" — declararlo así.

## Tabla 2 — Head-to-head vs ASySD 0.4.6 (mismos datos, misma métrica)

ASySD ejecutado con R 4.6.1 y ASySD 0.4.6 (`tests/benchmark/run_asysd.R`). ASySD es
determinista; sus cifras no cambian aunque cambie nuestro motor, así que se conservan de la
corrida original. Nuestras cifras son las de la Tabla 1 (reproducidas 2026-07-20).

| Dataset | Registros | Nuestra (Sens / Espec) | ASySD (Sens / Espec) | Nuestros FP/FN | ASySD FP/FN |
|---|---:|---:|---:|---:|---:|
| Diabetes | 1.845 | 99,76% / 99,66% | 99,84% / 100,00% | 2 / 3 | 0 / 2 |
| NeuroImaging | 3.438 | 99,31% / 99,67% | 98,61% / 99,86% | 7 / 9 | 3 / 18 |
| Cardiac | 8.948 | 98,84% / 99,91% | 99,24% / 99,93% | 5 / 41 | 4 / 27 |
| **Media** | | **99,30% / 99,75%** | **99,23% / 99,93%** | **14 / 53** | **7 / 47** |

### Lectura honesta (repositionamiento — NO "más sensibles")

- **Comparables, ninguna domina.** ASySD es más específica en los tres datasets (media 99,93%
  vs 99,75%): retira por error menos registros únicos (7 FP vs 14).
- **Sensibilidad ≈ empate.** En media simple de los tres, nosotras un pelín arriba (99,30% vs
  99,23%), **pero eso lo produce un solo dataset** (NeuroImaging, donde ASySD flojea: 98,61%).
  Dataset a dataset, ASySD es MÁS sensible en Diabetes (99,84 vs 99,76) y Cardiac (99,24 vs
  98,84). **Por recuento bruto de duplicados perdidos, nosotras perdemos algo MÁS** (53 FN vs
  47). NO afirmar "somos más sensibles" ni "menos FN".
- **Qué aporta nuestro método** (no accuracy): (a) los pares ambiguos van a revisión humana en
  vez de decidirse en silencio; (b) transparencia y trazabilidad (regla que produjo cada
  fusión, decisiones auditables, PRISMA); (c) DOIs realmente distintos se conservan y anotan en
  vez de fusionarse.

## Ejemplo real (Ferreiro — búsqueda multi-base en oncología urológica)

800 registros (560 Embase + 197 PubMed + 43 CENTRAL) → **629 únicos · 171 duplicados · 41
dudosos a revisión**. Reproducido 2026-07-20. (No mide accuracy; ilustra el pipeline completo.)

## Escalabilidad

Depression (79.880) y SRSR (53.001) no terminan en tiempo práctico (>20-30 min CPU, abortados):
la recogida de candidatos compara cada registro contra todos los de su año. Los tres evaluados
y el caso real están en el rango cientos-a-pocos-miles, típico de una revisión sistemática.

## Cómo regenerar (comandos exactos)

```bash
# Tabla 1 (nuestra herramienta) — descargar antes los CSV de OSF a tests/benchmark/data/asysd/
cd tests/benchmark
for d in Diabetes NeuroImaging Cardiac; do
  python3 run_benchmark.py "data/asysd/${d}_duplicates_labelled.csv"
done

# Tabla 2 (ASySD) — requiere R 4.6.1 + ASySD 0.4.6
Rscript run_asysd.R

# Ejemplo real (datos de cliente, no redistribuibles)
python3 ../../scripts/dedup.py embase.ris pubmed.nbib central.ris \
  --source-names Embase,PubMed,CENTRAL --out /tmp/out
```
