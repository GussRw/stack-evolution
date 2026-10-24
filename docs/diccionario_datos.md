# Diccionario de datos y reglas de cálculo

Fuente: Stack Overflow Annual Developer Survey 2024, archivo `survey_results_public.csv`
(65,437 respuestas), versión 1 del dataset de Kaggle `berkayalan/stack-overflow-annual-developer-survey-2024`.

## Variables originales utilizadas

| Variable | Tipo de dato | Descripción | Uso |
|---|---|---|---|
| `ResponseId` | Identificador | ID único del encuestado | Llave de las tablas en formato largo |
| `YearsCodePro` | Texto → cuantitativa discreta | Años programando profesionalmente | Origen de `Rango` |
| `DevType` | Nominal | Rol principal del encuestado | Origen de `Segmento` |
| `PlatformHaveWorkedWith` | Nominal multivalor (`;`) | Plataformas de nube y hosting usadas en el último año | Brecha de plataformas |
| `ToolsTechHaveWorkedWith` | Nominal multivalor (`;`) | Herramientas de desarrollo usadas en el último año | Brecha de herramientas |
| `LanguageHaveWorkedWith` | Nominal multivalor (`;`) | Lenguajes usados en el último año | Brecha de lenguajes |

## Variables derivadas

| Variable | Tipo | Regla | Implementación |
|---|---|---|---|
| `YearsCodePro` (numérica) | Cuantitativa discreta | `"Less than 1 year"` → 0; `"More than 50 years"` → 51 (cota inferior); otro texto → nulo | `utils.limpiar_experiencia` |
| `Segmento` | Nominal (3 niveles) | Ver tabla de segmentación | `utils.segmentar_rol` |
| `Rango` | Ordinal | 0-2, 3-5, 6-10, 11-15, 16-20, 20+ años | `utils.rango_experiencia` |

## Segmentación de rol

Se aplica sobre el rol principal: el primer valor de `DevType`.

| Segmento | Regla |
|---|---|
| Liderazgo y dirección | Coincidencia exacta con `Engineering manager` o `Senior Executive (C-Suite, VP, etc.)` |
| Desarrollo (contribuidor individual) | Empieza con `Developer, ` (incluye la coma, para excluir *Developer Advocate* y *Developer Experience*) |
| Otro | Cualquier otro rol o respuesta vacía; queda fuera del análisis |

## Reglas de cálculo

- **Selección.** Las 12 plataformas y herramientas más usadas entre los dos segmentos, contadas juntas (3 plataformas y 9 herramientas), y los 10 lenguajes más usados entre quienes tienen `Rango` válido.
- **Porcentaje de adopción.** Usuarios de la tecnología divididos entre los encuestados del grupo que respondieron esa pregunta. Quien dejó la pregunta en blanco no cuenta como «no usa» (`utils.tabla_adopcion`).
- **Brecha.** Liderazgo − desarrollo en puntos porcentuales, con IC 95% de Newcombe (híbrido de Wilson), calculada dentro de cada `Rango` (`utils.diferencia_adopcion`). Un estrato se descarta si cualquiera de los dos grupos tiene menos de 30 encuestados; con los datos actuales se omite 0-2 años (16 líderes).
- **Global.** La misma brecha sin estratificar, sobre todos los encuestados del segmento que respondieron la pregunta (con o sin `YearsCodePro`).
- **IC por segmento.** Wilson al 95%, para el panel de detalle del dashboard.
- **Indicadores del dashboard.** Se calculan en el navegador solo con plataformas y herramientas. *Brecha consistente* = diferencia positiva con IC que excluye 0 en todos los rangos de 6 años en adelante; 3-5 se excluye del criterio porque tiene unos 90 líderes.

## `docs/data/brechas.json`

Una fila por tecnología × rango, más la fila `Global` de cada tecnología (132 filas). `data/processed/brechas_por_rango.csv` tiene el mismo contenido.

| Columna | Descripción |
|---|---|
| `tecnologia` | Valor de la pregunta multivalor |
| `pregunta` | `plataformas`, `herramientas` o `lenguajes` |
| `rango` | `Global`, 3-5, 6-10, 11-15, 16-20 o 20+ |
| `n_desarrollo`, `n_liderazgo` | Encuestados de cada segmento que respondieron la pregunta en ese rango |
| `p_desarrollo`, `p_liderazgo` | % de adopción de cada segmento |
| `li_*`, `ls_*` (por segmento) | IC 95% de Wilson de cada segmento, en % |
| `diferencia_pp`, `li_pp`, `ls_pp` | Brecha liderazgo − desarrollo y su IC 95% de Newcombe, en puntos porcentuales |
| `ic_excluye_cero` | `true` si el IC de la brecha no incluye el 0 |

Todos los valores numéricos van en escala 0-100 con 4 decimales; la web redondea a 1 al mostrarlos.

## Otros archivos generados

| Archivo | Contenido |
|---|---|
| `data/processed/tamanos_muestra.csv` | n de cada pregunta por segmento, sin estratificar y sumando los rangos incluidos |
