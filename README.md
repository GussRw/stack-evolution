# Evolución del stack tecnológico según experiencia y rol

Entrega final de la materia Visualización de Datos, Maestría Profesionalizante en Inteligencia Artificial,
Instituto Tecnológico de Aguascalientes. Autor: Gustavo Peralta Vázquez.

**Pregunta analítica.** ¿Cómo evoluciona el stack tecnológico y la demanda de herramientas a medida que un perfil avanza
desde sus primeros años de experiencia (Entry-level) hasta alcanzar roles de liderazgo o dirección (Engineering manager y
Senior Executive)?

- **Dashboard:** <https://cv.guss.uk/stack-evolution/>

## Datos

- **Fuente original:** Stack Overflow (2024). *2024 Stack Overflow Developer Survey*. https://survey.stackoverflow.co/2024
- **Copia utilizada:** berkayalan (2024), Kaggle, versión 1:
  https://www.kaggle.com/datasets/berkayalan/stack-overflow-annual-developer-survey-2024

El CSV original no se incluye en el repositorio (supera los 100 MB). El notebook lo descarga automáticamente
con `kagglehub` usando la versión fijada en `src/utils.py`. Las variables y reglas de cálculo están en
[`docs/diccionario_datos.md`](docs/diccionario_datos.md).

## Estructura

```
├── notebooks/analisis.ipynb    # Carga → limpieza → brechas por rango → datos del dashboard
├── src/utils.py                # Limpieza, segmentación, adopción e intervalos de confianza
├── tests/test_utils.py         # Pruebas de las funciones de src/
├── docs/                       # Carpeta publicada por GitHub Pages
│   ├── index.html, dashboard.js  # Dashboard (Observable Plot + Tailwind CSS)
│   ├── styles.css              # CSS compilado por Tailwind (no editar a mano)
│   ├── data/brechas.json       # Datos del dashboard (generado por el notebook)
│   └── diccionario_datos.md    # Variables y reglas de cálculo
├── data/
│   ├── raw/                    # Copia local opcional del CSV (no versionada)
│   └── processed/              # Tablas generadas por el notebook
├── tailwind/entrada.css        # Entrada de Tailwind: tema (colores del proyecto) y estilos base
├── package.json                # CLI de Tailwind para compilar docs/styles.css
├── scripts/versionar.mjs       # Huella ?v= en index.html contra la caché del CDN
```

## Ejecución (Linux / WSL)

Requisitos: Python 3.12 y conexión a internet en la primera ejecución.

```bash
git clone https://github.com/gussrw/stack-evolution.git && cd stack-evolution
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Verificar las funciones de limpieza e intervalos
pytest -q

# Ejecutar el notebook completo de arriba abajo; regenera docs/data/brechas.json
jupyter nbconvert --to notebook --execute --inplace notebooks/analisis.ipynb
```

Si `kagglehub` solicita autenticación, configura tu token en `~/.kaggle/kaggle.json` según la documentación de Kaggle.

**Sin conexión:** si ya tienes el CSV, apunta a él con una variable de entorno y el notebook no intentará descargarlo:

```bash
export SO_SURVEY_CSV="$PWD/data/raw/survey_results_public.csv"
```

## Dashboard en local

La página carga `docs/data/brechas.json` con `fetch`, así que debe servirse por HTTP (abrir `index.html` con `file://`
no funciona):

```bash
python3 -m http.server 8000 --directory docs
# abrir http://localhost:8000
```

### Estilos (Tailwind CSS)

El dashboard usa clases de Tailwind en `docs/index.html` y `docs/dashboard.js`. `docs/styles.css` es la salida
compilada y se versiona, así que GitHub Pages no necesita ningún paso de build. Después de cambiar clases, recompila
(requiere Node 18 o superior):

```bash
npm install
npm run build:css     # o npm run watch:css mientras editas
```

Los colores del proyecto (`lider` violeta, `dev` naranja, `incierto` gris neutro) se definen en `tailwind/entrada.css`
con `@theme static`; la paleta está validada para daltonismo y contraste.
`dashboard.js` también los lee como variables CSS (`--color-lider`, etc.) para colorear las gráficas.

### Caché del CDN

El dominio pasa por Cloudflare, que guarda los archivos hasta 4 horas. Para que una publicación no mezcle HTML nuevo
con CSS o datos viejos, `scripts/versionar.mjs` escribe en `index.html` una huella de `styles.css`, `dashboard.js` y
`brechas.json` (`?v=...`); `dashboard.js` usa la misma huella para pedir el JSON. `npm run build:css` ya lo ejecuta.
Si solo cambiaste el JSON (al volver a ejecutar el notebook) o `dashboard.js`, ejecuta `npm run versionar` antes del
push.

### Publicación

En GitHub, Pages publica la carpeta `docs/` de la rama `main` (*Settings → Pages → Deploy from a branch*, carpeta
`/docs`). `docs/.nojekyll` desactiva el procesamiento con Jekyll. El JSON se versiona; si cambia la limpieza, vuelve
a ejecutar el notebook antes de hacer push.

## Referencias

- berkayalan. (2024). *Stack Overflow Annual Developer Survey 2024* [Conjunto de datos]. Kaggle.
- Cleveland, W. S., & McGill, R. (1984). Graphical perception. *JASA, 79*(387), 531–554.
- Munzner, T. (2014). *Visualization analysis and design*. CRC Press.
- Newcombe, R. G. (1998). Interval estimation for the difference between independent proportions: Comparison of eleven methods. *Statistics in Medicine, 17*(8), 873–890.
- Observable. (2025). *Observable Plot* (versión 0.6.17) [Software]. https://observablehq.com/plot/
- Stack Overflow. (2024). *2024 Stack Overflow Developer Survey* [Conjunto de datos]. Stack Exchange Inc.
