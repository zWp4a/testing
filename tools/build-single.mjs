#!/usr/bin/env node
/**
 * Empaqueta la app en un único archivo HTML autocontenido.
 *
 * Sirve para compartirla por mail o WhatsApp, abrirla desde un pendrive o
 * publicarla donde sólo se pueda subir un archivo. No reemplaza al despliegue
 * normal: la versión de un archivo no registra service worker, así que no
 * queda instalada para uso sin conexión.
 *
 * Uso: node tools/build-single.mjs [salida.html]
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'js/app.js';
const OUT = process.argv[2] || resolve(ROOT, 'dist/nuestra-casa.html');

const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

/* ------------------------------------------------- grafo de dependencias */

const IMPORT_RE = /import\s+([^;]*?)\s+from\s+['"]([^'"]+)['"]\s*;?/g;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Resuelve './x.js' o '../ui.js' relativo al módulo que lo importa. */
function resolveSpec(fromRel, spec) {
  return posix.normalize(posix.join(posix.dirname(fromRel), spec));
}

const modules = new Map(); // rel -> { source, deps }

function collect(rel) {
  if (modules.has(rel)) return;
  const source = read(rel);
  const deps = new Set();
  for (const m of source.matchAll(IMPORT_RE)) deps.add(resolveSpec(rel, m[2]));
  for (const m of source.matchAll(DYNAMIC_RE)) deps.add(resolveSpec(rel, m[1]));
  modules.set(rel, { source, deps: [...deps] });
  deps.forEach(collect);
}
collect(ENTRY);

/* Orden topológico: cada módulo se define después de los que necesita. */
const order = [];
const seen = new Set();
(function visit(rel, stack = []) {
  if (seen.has(rel)) return;
  if (stack.includes(rel)) throw new Error(`Dependencia circular: ${[...stack, rel].join(' → ')}`);
  modules.get(rel).deps.forEach((d) => visit(d, [...stack, rel]));
  seen.add(rel);
  order.push(rel);
}(ENTRY));

/* ------------------------------------------------- transformación a CJS */

function transform(rel, source) {
  const exported = new Set();
  let code = source;

  // import { a, b } from './x.js'   →  const { a, b } = __req('x.js')
  // import * as ns from './x.js'    →  const ns = __req('x.js')
  code = code.replace(IMPORT_RE, (_m, clause, spec) => {
    const target = JSON.stringify(resolveSpec(rel, spec));
    const ns = clause.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (ns) return `const ${ns[1]} = __req(${target});`;
    return `const ${clause.trim()} = __req(${target});`;
  });

  code = code.replace(DYNAMIC_RE, (_m, spec) => `Promise.resolve(__req(${JSON.stringify(resolveSpec(rel, spec))}))`);

  code = code.replace(/^export\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gm, (_m, asyncKw, name) => {
    exported.add(name);
    return `${asyncKw || ''}function ${name}`;
  });

  code = code.replace(/^export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/gm, (_m, kind, name) => {
    exported.add(name);
    return `${kind} ${name}`;
  });

  if (/^export\s/m.test(code)) {
    throw new Error(`Forma de export no soportada en ${rel}. Revisá tools/build-single.mjs.`);
  }

  const bindings = [...exported].map((n) => `${n}`).join(', ');
  return `${code}\n${exported.size ? `Object.assign(__exports, { ${bindings} });` : ''}`;
}

const bundle = `(() => {
const __defs = {};
const __cache = {};
function __req(name) {
  if (__cache[name]) return __cache[name];
  const __exports = {};
  __cache[name] = __exports;
  __defs[name](__exports, __req);
  return __exports;
}
${order.map((rel) => `__defs[${JSON.stringify(rel)}] = (__exports, __req) => {\n${transform(rel, modules.get(rel).source)}\n};`).join('\n\n')}
__req(${JSON.stringify(ENTRY)});
})();`;

/* ---------------------------------------------------------- armado HTML */

const css = read('css/styles.css');
const iconSvg = read('icons/icon.svg');
const iconPng = readFileSync(resolve(ROOT, 'icons/icon-192.png')).toString('base64');

let html = read('index.html');

html = html
  .replace('<link rel="stylesheet" href="css/styles.css">', `<style>\n${css}\n</style>`)
  .replace('<link rel="manifest" href="manifest.webmanifest">', '')
  .replace('<link rel="icon" href="icons/icon.svg" type="image/svg+xml">',
    `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(iconSvg).toString('base64')}">`)
  .replace('<link rel="apple-touch-icon" href="icons/icon-180.png">',
    `<link rel="apple-touch-icon" href="data:image/png;base64,${iconPng}">`)
  .replace('<script type="module" src="js/app.js"></script>', `<script>\n${bundle}\n</script>`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`✔ ${OUT}`);
console.log(`  ${order.length} módulos · ${kb} KB`);
