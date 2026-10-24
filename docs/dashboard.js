// Dashboard final: brecha de adopción liderazgo − desarrollo por rango de experiencia.
// Datos: data/brechas.json, generado por la sección 5 de notebooks/analisis.ipynb.
// Versiones exactas fijadas; Plot 0.6.17 importa internamente d3@7.9.0, así que solo se carga una copia.
import * as Plot from "https://cdn.jsdelivr.net/npm/@observablehq/plot@0.6.17/+esm";
import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";

// Misma huella que index.html pone en la URL de este archivo (scripts/versionar.mjs): evita un JSON viejo en caché
const VERSION = new URL(import.meta.url).searchParams.get("v");
const RUTA_DATOS = VERSION ? `data/brechas.json?v=${VERSION}` : "data/brechas.json";
const ORDEN_RANGOS = ["0-2", "3-5", "6-10", "11-15", "16-20", "20+"];
const RANGO_POCOS_LIDERES = "3-5"; // ~90 líderes: se excluye del criterio de brecha consistente
// Grupos del filtro principal. Los indicadores se calculan solo sobre "tec", que es el hallazgo del titular;
// los lenguajes se exploran con los mismos paneles y el mismo detalle.
const GRUPOS = {
  tec: { preguntas: ["plataformas", "herramientas"], inicial: "Amazon Web Services (AWS)", pronombre: "la" },
  lenguajes: { preguntas: ["lenguajes"], inicial: "Python", pronombre: "lo" },
};

// Nombres cortos para los títulos de los paneles; el tooltip y el detalle usan el nombre completo
const NOMBRES_CORTOS = {
  "Amazon Web Services (AWS)": "AWS",
  "Microsoft Azure": "Azure",
  "Bash/Shell (all shells)": "Bash/Shell",
};

const fmtEntero = d3.format(",");
const fmtPP = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} pp`;
// Los indicadores usan la unidad completa: es lo primero que se lee y no todas las audiencias conocen "pp"
const fmtPuntos = (v) => fmtPP(v).replace(" pp", " puntos");
const fmtPct = (v) => `${v.toFixed(1)}%`;
const corto = (t) => NOMBRES_CORTOS[t] ?? t;

const $kpis = document.getElementById("kpis");
const $multiples = document.getElementById("multiples");
const $detalle = document.getElementById("detalle");
const $notaDetalle = document.getElementById("nota-detalle");
const $tituloDetalle = document.getElementById("titulo-detalle");
const $pregunta = document.getElementById("filtro-pregunta");
const $global = document.getElementById("filtro-global");
const $tecnologia = document.getElementById("filtro-tecnologia");

// Colores del tema de Tailwind (tailwind/entrada.css, @theme static)
const css = (nombre) => getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
const BLANCO = "#ffffff";

// Clases de Tailwind de los componentes que genera este archivo. Deben escribirse completas para que la CLI las detecte.
const CLASES = {
  kpi: "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-900/5",
  kpiPrincipal: "rounded-2xl bg-lider p-5 text-white shadow-lg shadow-lider/25",
  valor: "text-3xl font-bold tracking-tight tabular-nums",
  valorPrincipal: "text-[2.6rem] leading-none font-extrabold tracking-tight tabular-nums",
  etiqueta: "mt-2 text-[15px]",
  detalle: "mt-1 text-sm text-stone-500",
  detallePrincipal: "mt-1 text-sm text-white/80",
  panel: "min-w-0 cursor-pointer rounded-xl border border-stone-200 bg-stone-50 pt-2.5 pr-2.5 pb-1 pl-3 transition " +
    "hover:-translate-y-px hover:bg-white hover:shadow-md focus-visible:ring-2 focus-visible:ring-stone-400 " +
    "focus-visible:outline-none aria-pressed:border-stone-700 aria-pressed:bg-white aria-pressed:shadow-sm " +
    "aria-pressed:ring-1 aria-pressed:ring-stone-700 motion-reduce:transition-none motion-reduce:hover:translate-y-0 " +
    "[&_svg]:block [&_svg]:h-auto [&_svg]:max-w-full [&_svg]:overflow-visible",
};

let filas = [];
let rangos = [];
let tecnologias = []; // ordenadas por brecha global, de mayor a menor
let dominioBrecha = [];
const estado = { grupo: "tec", tec: GRUPOS.tec.inicial, global: false };

// ---------------------------------------------------------------------------
// Estado en la URL (#grupo=...&tec=...&global=1) para compartir una vista concreta
// ---------------------------------------------------------------------------

function leerHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const grupo = params.get("grupo");
  const tec = params.get("tec");
  if (grupo in GRUPOS) estado.grupo = grupo;
  estado.tec = deGrupo(estado.grupo).includes(tec) ? tec : GRUPOS[estado.grupo].inicial;
  estado.global = params.get("global") === "1";
}

function escribirHash() {
  const params = new URLSearchParams({ grupo: estado.grupo, tec: estado.tec });
  if (estado.global) params.set("global", "1");
  history.replaceState(null, "", `#${params}`);
}

// ---------------------------------------------------------------------------
// Consultas sobre los datos
// ---------------------------------------------------------------------------

const deTecnologia = (tec) => filas.filter((d) => d.tecnologia === tec && d.rango !== "Global");
const globalDe = (tec) => filas.find((d) => d.tecnologia === tec && d.rango === "Global");
const positiva = (d) => d.ic_excluye_cero && d.diferencia_pp > 0;
const deGrupo = (grupo) => tecnologias.filter((t) => GRUPOS[grupo].preguntas.includes(globalDe(t).pregunta));

function indicadores() {
  const plataformasYHerramientas = deGrupo("tec");
  const porRango = filas.filter((d) => d.rango !== "Global" && plataformasYHerramientas.includes(d.tecnologia));
  const mayor = d3.greatest(porRango, (d) => d.diferencia_pp);

  // Brecha positiva y distinguible de 0 en todos los rangos con muestra suficiente de liderazgo
  const consistentes = plataformasYHerramientas.filter((t) =>
    deTecnologia(t).filter((d) => d.rango !== RANGO_POCOS_LIDERES).every(positiva));

  // Brecha global significativa que no aparece en ningún rango: la explica la experiencia, no el rol
  const espejismo = plataformasYHerramientas
    .filter((t) => globalDe(t).ic_excluye_cero && !deTecnologia(t).some((d) => d.ic_excluye_cero))
    .map((t) => ({ tec: t, global: globalDe(t), rangos: deTecnologia(t) }))[0];

  return { mayor, consistentes, total: plataformasYHerramientas.length, espejismo };
}

// ---------------------------------------------------------------------------
// Nivel 2: indicadores
// ---------------------------------------------------------------------------

function renderKpis() {
  const { mayor, consistentes, total, espejismo } = indicadores();
  const tarjetas = [
    `<article class="${CLASES.kpiPrincipal}">
      <p class="${CLASES.valorPrincipal}">${fmtPuntos(mayor.diferencia_pp)}</p>
      <p class="${CLASES.etiqueta}">Mayor brecha: <strong>${corto(mayor.tecnologia)}</strong>, ${mayor.rango} años de experiencia</p>
      <p class="${CLASES.detallePrincipal}">${fmtPct(mayor.p_liderazgo)} de líderes la usa frente a
        ${fmtPct(mayor.p_desarrollo)} de quienes desarrollan</p>
    </article>`,
    `<article class="${CLASES.kpi}">
      <p class="${CLASES.valor}">${consistentes.length} de ${total}</p>
      <p class="${CLASES.etiqueta}">plataformas y herramientas con brecha a favor de liderazgo en <strong>todos</strong> los rangos de 6+ años</p>
      <p class="${CLASES.detalle}">${consistentes.map(corto).join(", ")}</p>
    </article>`,
  ];
  if (espejismo) {
    const [min, max] = d3.extent(espejismo.rangos, (d) => d.diferencia_pp);
    tarjetas.push(`<article class="${CLASES.kpi}">
      <p class="${CLASES.valor} text-stone-500">${fmtPuntos(espejismo.global.diferencia_pp)} <span class="font-normal text-stone-400">→</span> ≈ 0</p>
      <p class="${CLASES.etiqueta}">Brecha de <strong>${corto(espejismo.tec)}</strong> que desaparece al comparar con la misma experiencia</p>
      <p class="${CLASES.detalle}">Por rango va de ${fmtPP(min).replace(" pp", "")} a ${fmtPuntos(max)}, ningún intervalo excluye 0</p>
    </article>`);
  }
  $kpis.innerHTML = tarjetas.join("");
}

// ---------------------------------------------------------------------------
// Nivel 3: un panel pequeño por tecnología
// ---------------------------------------------------------------------------

// Tooltip en lenguaje llano: qué grupo la usa más, con qué datos, y si el margen de error permite afirmarlo
const fmtPuntosSinSigno = (v) => `${Math.abs(v).toFixed(1)} puntos`;
const fmtLimite = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

function textoTooltip(d) {
  const quien = d.diferencia_pp >= 0 ? "Liderazgo" : "Desarrollo";
  const lectura = !d.ic_excluye_cero
    ? "La barra cruza el 0: no es concluyente."
    : `Toda la barra está ${d.diferencia_pp > 0 ? "sobre" : "bajo"} el 0: la diferencia es clara.`;
  return `${corto(d.tecnologia)} · ${d.rango} años de experiencia\n` +
    `${quien} la usa ${fmtPuntosSinSigno(d.diferencia_pp)} más\n` +
    `Liderazgo: ${fmtPct(d.p_liderazgo)} de ${fmtEntero(d.n_liderazgo)} personas\n` +
    `Desarrollo: ${fmtPct(d.p_desarrollo)} de ${fmtEntero(d.n_desarrollo)} personas\n` +
    `Margen de error: de ${fmtLimite(d.li_pp)} a ${fmtLimite(d.ls_pp)} puntos\n${lectura}`;
}

function panelBrecha(tec, ancho) {
  const datos = deTecnologia(tec);
  const global = globalDe(tec);
  // Escala divergente: violeta = liderazgo usa más, naranja = desarrollo usa más (los colores de cada segmento);
  // el gris neutro es el punto medio, para las diferencias que no se distinguen de 0.
  const acento = css("--color-lider");
  const grisDev = css("--color-dev");
  const gris = css("--color-incierto");
  const color = (d) => (!d.ic_excluye_cero ? gris : d.diferencia_pp > 0 ? acento : grisDev);

  const grafico = Plot.plot({
    width: ancho,
    height: 150,
    marginLeft: 34,
    marginRight: 8,
    marginTop: 8,
    marginBottom: 22,
    style: { fontSize: "10.5px", fontFamily: "inherit", background: "transparent" },
    x: { type: "point", domain: rangos, padding: 0.4, label: null, tickSize: 0 },
    y: { domain: dominioBrecha, ticks: [-10, 0, 10, 20], tickFormat: (v) => (v > 0 ? `+${v}` : `${v}`),
      label: null, tickSize: 0 },
    marks: [
      Plot.ruleY([0], { stroke: css("--color-eje"), strokeWidth: 1 }),
      estado.global
        ? Plot.ruleY([global.diferencia_pp], { stroke: css("--color-tinta"), strokeDasharray: "4 3", strokeWidth: 1.2 })
        : null,
      Plot.ruleX(datos, { x: "rango", y1: "li_pp", y2: "ls_pp", stroke: color, strokeWidth: 2, strokeLinecap: "round" }),
      Plot.dot(datos, { x: "rango", y: "diferencia_pp", fill: color, r: 4, stroke: BLANCO, strokeWidth: 1.5 }),
      Plot.tip(datos, Plot.pointerX({
        x: "rango", y: "diferencia_pp", title: textoTooltip, lineHeight: 1.35, lineWidth: 26,
        fill: BLANCO, stroke: css("--color-borde"),
      })),
    ],
  });
  grafico.setAttribute("role", "img");
  grafico.setAttribute("aria-label", `Brecha de ${tec} por rango de experiencia; sin controlar: ` +
    fmtPP(global.diferencia_pp));

  const panel = document.createElement("article");
  panel.className = CLASES.panel;
  panel.tabIndex = 0;
  panel.setAttribute("role", "button");
  panel.setAttribute("aria-pressed", String(tec === estado.tec));
  panel.dataset.tec = tec;
  const etiquetaGlobal = estado.global
    ? `<span class="text-xs font-normal whitespace-nowrap text-stone-500">sin controlar ${fmtPP(global.diferencia_pp)}</span>` : "";
  panel.innerHTML = `<h3 class="flex justify-between gap-1.5 text-sm font-semibold">${corto(tec)}${etiquetaGlobal}</h3>`;
  panel.append(grafico);
  return panel;
}

function renderMultiples() {
  const visibles = deGrupo(estado.grupo);
  const anchoDisponible = $multiples.clientWidth;
  const columnas = Math.max(1, Math.min(4, Math.floor(anchoDisponible / 230)));
  const ancho = Math.floor((anchoDisponible - (columnas - 1) * 14) / columnas) - 24; // padding (pl-3, pr-2.5) + borde
  $multiples.style.gridTemplateColumns = `repeat(${columnas}, minmax(0, 1fr))`;
  $multiples.replaceChildren(...visibles.map((t) => panelBrecha(t, ancho)));
}

// ---------------------------------------------------------------------------
// Nivel 4: detalle de la tecnología seleccionada
// ---------------------------------------------------------------------------

function renderDetalle() {
  const datos = deTecnologia(estado.tec);
  const global = globalDe(estado.tec);
  const acento = css("--color-lider");
  const grisDev = css("--color-dev");
  const largo = datos.flatMap((d) => [
    { rango: d.rango, segmento: "Desarrollo", p: d.p_desarrollo, li: d.li_desarrollo, ls: d.ls_desarrollo,
      n: d.n_desarrollo },
    { rango: d.rango, segmento: "Liderazgo", p: d.p_liderazgo, li: d.li_liderazgo, ls: d.ls_liderazgo,
      n: d.n_liderazgo },
  ]);
  const ultimo = largo.filter((d) => d.rango === rangos.at(-1));
  const colorSeg = { Desarrollo: grisDev, Liderazgo: acento };
  const ancho = Math.min($detalle.clientWidth, 820);

  const grafico = Plot.plot({
    width: ancho,
    height: 260,
    marginLeft: 40,
    marginRight: 110,
    marginBottom: 36,
    style: { fontSize: "12px", fontFamily: "inherit", background: "transparent" },
    x: { type: "point", domain: rangos, padding: 0.2, label: "Años de experiencia profesional →",
      labelAnchor: "center", labelOffset: 32, tickSize: 0 },
    y: { domain: [0, Math.max(60, d3.max(largo, (d) => d.ls) + 5)], tickFormat: (v) => `${v}%`,
      label: `↑ % que ${GRUPOS[estado.grupo].pronombre} usa`, labelAnchor: "top", grid: true, ticks: 4 },
    color: { domain: Object.keys(colorSeg), range: Object.values(colorSeg) },
    marks: [
      Plot.areaY(largo, { x: "rango", y1: "li", y2: "ls", fill: "segmento", fillOpacity: 0.15, curve: "linear" }),
      Plot.lineY(largo, { x: "rango", y: "p", stroke: "segmento", strokeWidth: 2 }),
      Plot.dot(largo, { x: "rango", y: "p", fill: "segmento", r: 4, stroke: BLANCO, strokeWidth: 1.5 }),
      // Etiquetas directas (además de la leyenda) en tinta neutra: el punto de color lleva la identidad
      Plot.text(ultimo, { x: "rango", y: "p", text: (d) => `${d.segmento} ${Math.round(d.p)}%`, dx: 10,
        textAnchor: "start", fill: css("--color-tinta"), fontWeight: 600, fontSize: 12.5 }),
      Plot.tip(largo, Plot.pointer({
        x: "rango", y: "p", lineHeight: 1.35, fill: BLANCO, stroke: css("--color-borde"),
        title: (d) => `${d.segmento} · ${d.rango} años\n${fmtPct(d.p)} (IC 95%: ${fmtPct(d.li)}–${fmtPct(d.ls)})\n` +
          `n = ${fmtEntero(d.n)}`,
      })),
    ],
  });
  grafico.setAttribute("role", "img");
  grafico.setAttribute("aria-label", `Adopción de ${estado.tec} por rango de experiencia, liderazgo y desarrollo`);

  const significativos = datos.filter((d) => d.ic_excluye_cero);
  $tituloDetalle.textContent = `${estado.tec}: % que ${GRUPOS[estado.grupo].pronombre} usa en cada rango de experiencia`;
  $notaDetalle.textContent = `La brecha es distinguible de 0 en ${significativos.length} de ${datos.length} rangos. ` +
    `Sin controlar experiencia: ${fmtPP(global.diferencia_pp)} ` +
    `(${fmtPct(global.p_liderazgo)} de líderes vs ${fmtPct(global.p_desarrollo)} de desarrollo). ` +
    "La banda sombreada es el IC 95% de Wilson.";
  $detalle.replaceChildren(grafico);
}

// ---------------------------------------------------------------------------
// Render y eventos
// ---------------------------------------------------------------------------

function seleccionar(tec) {
  estado.tec = tec;
  $tecnologia.value = tec;
  for (const p of $multiples.children) p.setAttribute("aria-pressed", String(p.dataset.tec === tec));
  escribirHash();
  renderDetalle();
}

function render() {
  renderMultiples();
  renderDetalle();
}

function poblarSelector() {
  $tecnologia.replaceChildren(...deGrupo(estado.grupo).map((t) => new Option(t, t, false, t === estado.tec)));
}

function cambiarGrupo(grupo) {
  estado.grupo = grupo;
  if (!deGrupo(grupo).includes(estado.tec)) estado.tec = GRUPOS[grupo].inicial;
  poblarSelector();
  escribirHash();
  render();
}

function poblarControles() {
  poblarSelector();
  $pregunta.querySelector(`input[value="${estado.grupo}"]`).checked = true;
  $global.checked = estado.global;

  const nGlobal = d3.rollup(filas.filter((d) => d.rango === "Global"),
    (v) => v[0], (d) => d.pregunta);
  const rangoN = (campo) => d3.extent([...nGlobal.values()], (d) => d[campo]).map(fmtEntero).join("–");
  document.getElementById("subtitulo").insertAdjacentHTML("beforeend",
    ` <span class="text-stone-500">n = ${rangoN("n_desarrollo")} desarrolladores y ${rangoN("n_liderazgo")} líderes, ` +
    "según la pregunta.</span>");
}

async function iniciar() {
  try {
    filas = await d3.json(RUTA_DATOS);
  } catch (error) {
    $multiples.innerHTML = `<p class="text-red-700">No se pudieron cargar los datos (${error.message}).
      Si abriste el archivo directamente, sírvelo con <code>python3 -m http.server</code> dentro de <code>docs/</code>.</p>`;
    return;
  }
  const presentes = new Set(filas.map((d) => d.rango));
  rangos = ORDEN_RANGOS.filter((r) => presentes.has(r));
  tecnologias = filas.filter((d) => d.rango === "Global")
    .sort((a, b) => d3.descending(a.diferencia_pp, b.diferencia_pp)).map((d) => d.tecnologia);
  // Eje Y común a todos los paneles para que las alturas sean comparables
  const [min, max] = d3.extent(filas.flatMap((d) => [d.li_pp, d.ls_pp]));
  dominioBrecha = [Math.floor(min / 5) * 5, Math.ceil(max / 5) * 5];

  leerHash();
  poblarControles();
  renderKpis();
  render();

  $pregunta.addEventListener("change", (e) => cambiarGrupo(e.target.value));
  $global.addEventListener("change", () => { estado.global = $global.checked; escribirHash(); renderMultiples(); });
  $tecnologia.addEventListener("change", () => seleccionar($tecnologia.value));
  $multiples.addEventListener("click", (e) => {
    const panel = e.target.closest("[data-tec]");
    if (panel) seleccionar(panel.dataset.tec);
  });
  $multiples.addEventListener("keydown", (e) => {
    const panel = e.target.closest("[data-tec]");
    if (panel && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); seleccionar(panel.dataset.tec); }
  });

  let ultimoAncho = $multiples.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs($multiples.clientWidth - ultimoAncho) < 8) return;
    ultimoAncho = $multiples.clientWidth;
    render();
  }).observe($multiples);
}

iniciar();
