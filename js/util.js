/* Utilidades generales: ids, dinero, fechas y helpers de DOM. */

/* ---------------------------------------------------------------- ids */

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function randomCode(bytes = 16) {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function nowIso() {
  return new Date().toISOString();
}

/* -------------------------------------------------------------- dinero */
/* Todo se guarda en centavos (enteros) para no arrastrar errores de coma
   flotante al dividir gastos. */

export function toCents(value) {
  const n = typeof value === 'number' ? value : parseAmount(value);
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  return (cents || 0) / 100;
}

/**
 * Acepta lo que la gente realmente escribe: "1.234,56", "1234.56", "1 234,5",
 * "$2.500", "2500". La última coma o punto con 1-2 dígitos detrás se toma como
 * separador decimal; el resto se descarta como separador de miles.
 */
export function parseAmount(text) {
  if (typeof text === 'number') return text;
  if (!text) return 0;
  let s = String(text).trim().replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const sep = Math.max(lastComma, lastDot);
  let intPart = s;
  let decPart = '';

  if (sep !== -1) {
    const tail = s.slice(sep + 1);
    if (tail.length > 0 && tail.length <= 2 && /^\d+$/.test(tail)) {
      intPart = s.slice(0, sep);
      decPart = tail;
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  const n = Number(`${intPart || '0'}.${decPart || '0'}`);
  return neg ? -n : n;
}

/** Reparte `cents` según pesos, sin perder ni inventar centavos. */
export function allocate(cents, weights) {
  const keys = Object.keys(weights);
  const total = keys.reduce((s, k) => s + (weights[k] || 0), 0);
  const out = {};
  if (total <= 0 || keys.length === 0) {
    keys.forEach((k) => { out[k] = 0; });
    return out;
  }
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  let assigned = 0;
  const rema = [];
  keys.forEach((k) => {
    const exact = (abs * (weights[k] || 0)) / total;
    const floor = Math.floor(exact);
    out[k] = floor;
    assigned += floor;
    rema.push([k, exact - floor]);
  });
  rema.sort((a, b) => b[1] - a[1]);
  let left = abs - assigned;
  for (let i = 0; left > 0; i = (i + 1) % rema.length) {
    out[rema[i][0]] += 1;
    left -= 1;
  }
  keys.forEach((k) => { out[k] *= sign; });
  return out;
}

let moneyFmt = null;
let moneyFmtCompact = null;
let currentMoneyKey = '';

function ensureFormatters(locale, currency) {
  const key = `${locale}|${currency}`;
  if (key === currentMoneyKey && moneyFmt) return;
  currentMoneyKey = key;
  const opts = { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 };
  try {
    moneyFmt = new Intl.NumberFormat(locale, opts);
  } catch {
    moneyFmt = new Intl.NumberFormat('es-AR', { ...opts, currency: 'ARS' });
  }
  try {
    moneyFmtCompact = new Intl.NumberFormat(locale, {
      style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1,
    });
  } catch {
    moneyFmtCompact = moneyFmt;
  }
}

/** Formatea centavos como moneda. `compact` para números grandes en gráficos. */
export function money(cents, { locale = 'es-AR', currency = 'ARS', compact = false, cents: showCents = true } = {}) {
  ensureFormatters(locale, currency);
  const value = fromCents(cents);
  if (compact && Math.abs(value) >= 10000) return moneyFmtCompact.format(value);
  if (!showCents && Number.isInteger(value)) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(value);
    } catch { /* usa el formato normal */ }
  }
  return moneyFmt.format(value);
}

/* -------------------------------------------------------------- fechas */

/** Fecha local de hoy como YYYY-MM-DD (sin corrimientos por zona horaria). */
export function today() {
  return toDateKey(new Date());
}

export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function monthKey(dateKey) {
  return String(dateKey || '').slice(0, 7);
}

export function currentMonth() {
  return monthKey(today());
}

/** Convierte "YYYY-MM-DD" en Date local (evita el UTC de new Date(str)). */
export function parseDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addMonths(mKey, delta) {
  const [y, m] = mKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInMonth(mKey) {
  const [y, m] = mKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Día del mes acotado al último día real (31 en febrero → 28/29). */
export function clampDay(mKey, day) {
  return Math.min(Math.max(1, day || 1), daysInMonth(mKey));
}

export function capitalize(str) {
  const s = String(str || '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Agosto de 2026" — sólo la primera en mayúscula, como se escribe en español. */
export function monthLabel(mKey, locale = 'es-AR', style = 'long') {
  const [y, m] = mKey.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const fmt = new Intl.DateTimeFormat(locale, style === 'long'
    ? { month: 'long', year: 'numeric' }
    : { month: 'short' });
  return capitalize(fmt.format(d));
}

export function dateLabel(dateKey, locale = 'es-AR') {
  const d = parseDateKey(dateKey);
  const t = today();
  if (dateKey === t) return 'Hoy';
  const yest = toDateKey(new Date(Date.now() - 86400000));
  if (dateKey === yest) return 'Ayer';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, sameYear
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function daysBetween(aKey, bKey) {
  const a = parseDateKey(aKey);
  const b = parseDateKey(bKey);
  return Math.round((b - a) / 86400000);
}

/* ----------------------------------------------------------------- DOM */

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  kids.forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return node;
}

export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Descarga un archivo generado en el navegador.
 * Devuelve false si el entorno no permite descargar (la versión de muestra
 * corre dentro de una página que las bloquea), para que quien llama avise.
 */
export function download(filename, text, mime = 'application/json') {
  if (window.__nuestraCasaPreview) return false;
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export const SIN_DESCARGA = 'Las descargas andan en la app instalada, no en esta versión de muestra.';
