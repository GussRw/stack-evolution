// Escribe en docs/index.html una huella de los archivos del dashboard (?v=...), para que la caché del CDN
// (Cloudflare delante de GitHub Pages) no sirva una versión vieja después de publicar. dashboard.js lee la misma
// huella de su propia URL para pedir el JSON. Se ejecuta con npm run build:css o npm run versionar.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ARCHIVOS = ["docs/styles.css", "docs/dashboard.js", "docs/data/brechas.json"];
const HTML = "docs/index.html";

const hash = createHash("sha256");
for (const ruta of ARCHIVOS) hash.update(readFileSync(ruta));
const version = hash.digest("hex").slice(0, 10);

const original = readFileSync(HTML, "utf8");
const versionado = original.replace(/(href="styles\.css|src="dashboard\.js)(\?v=[0-9a-f]+)?"/g, `$1?v=${version}"`);
if ((versionado.match(/\?v=/g) ?? []).length !== 2) throw new Error("No se encontraron styles.css y dashboard.js en index.html");
writeFileSync(HTML, versionado);
console.log(`index.html → v=${version}`);
