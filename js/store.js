/* Estado de la app: persistencia local, CRUD y notificación de cambios.
 *
 * Cada registro guarda `updatedAt` y `deleted`, así la sincronización puede
 * resolver conflictos por "gana el más reciente" y propagar borrados.
 */

import { uid, nowIso, currentMonth } from './util.js';

const KEY = 'pochohouse.v1';
const CONFIG_KEY = 'pochohouse.config.v1'; // no se sincroniza (claves y prefs del dispositivo)
const KEY_ANTERIOR = 'nuestracasa.v1';           // la app se llamaba así antes
const CONFIG_KEY_ANTERIOR = 'nuestracasa.config.v1';

/** Lee la clave nueva; si no está, rescata la del nombre anterior. */
function leerClave(nueva, vieja) {
  const actual = localStorage.getItem(nueva);
  if (actual !== null) return actual;
  const previa = localStorage.getItem(vieja);
  if (previa === null) return null;
  try { localStorage.setItem(nueva, previa); } catch { /* seguimos con lo leído */ }
  return previa;
}

export const COLLECTIONS = ['expenses', 'fixed', 'shopping', 'goals', 'settlements', 'categories', 'people', 'incomes'];

/* Somos siempre los mismos dos: ids fijos para que la sincronización y los
   gastos viejos apunten siempre a la misma persona. */
export const PEOPLE = [
  { id: 'posolo', name: 'Posolo', color: '#2a78d6' },
  { id: 'posola', name: 'Posola', color: '#eb6834' },
];

export const DEFAULT_CATEGORIES = [
  { key: 'expensas',     name: 'Expensas',      emoji: '🏢' },
  { key: 'luz',          name: 'Luz',           emoji: '💡' },
  { key: 'gas',          name: 'Gas',           emoji: '🔥' },
  { key: 'agua',         name: 'Agua',          emoji: '💧' },
  { key: 'internet',     name: 'Internet',      emoji: '🌐' },
  { key: 'celular',      name: 'Celular',       emoji: '📱' },
  { key: 'super',        name: 'Supermercado',  emoji: '🛒' },
  { key: 'comida',       name: 'Comida y delivery', emoji: '🍔' },
  { key: 'transporte',   name: 'Transporte',    emoji: '🚌' },
  { key: 'salud',        name: 'Salud',         emoji: '💊' },
  { key: 'hogar',        name: 'Hogar',         emoji: '🛋️' },
  { key: 'mascota',      name: 'Mascota',       emoji: '🐾' },
  { key: 'salidas',      name: 'Salidas',       emoji: '🎉' },
  { key: 'suscripciones', name: 'Suscripciones', emoji: '📺' },
  { key: 'regalos',      name: 'Regalos',       emoji: '🎁' },
  { key: 'otros',        name: 'Otros',         emoji: '📦' },
];

const PERSON_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#e87ba4', '#eda100'];

function freshState() {
  const ts = nowIso();
  const people = PEOPLE.map((p) => ({ ...p, updatedAt: ts, deleted: false }));
  const categories = DEFAULT_CATEGORIES.map((c) => ({
    id: c.key,
    name: c.name,
    emoji: c.emoji,
    budgetCents: 0,
    updatedAt: ts,
    deleted: false,
  }));
  return {
    version: 1,
    settings: {
      currency: 'UYU',
      locale: 'es-UY',
      // Cotización del dólar en centésimos: 4025 = 40,25 UYU por dólar.
      usdRateCents: 0,
      defaultPayer: people[0].id,
      defaultSplit: 'equal',
      homeName: 'PochoHouse',
      updatedAt: ts,
    },
    people,
    categories,
    expenses: [],
    fixed: [],
    shopping: [],
    goals: [],
    settlements: [],
    incomes: [],
  };
}

/* ----------------------------------------------------------- persistencia */

function readLocal() {
  try {
    const raw = leerClave(KEY, KEY_ANTERIOR);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.error('No se pudo leer el estado guardado', err);
    return null;
  }
}

function migrate(s) {
  if (!s || typeof s !== 'object') return null;
  s.version = s.version || 1;
  COLLECTIONS.forEach((c) => { if (!Array.isArray(s[c])) s[c] = []; });
  s.settings = { ...freshState().settings, ...(s.settings || {}) };
  if (!s.categories.length) s.categories = freshState().categories;

  /* Somos dos y fijos. Los datos viejos conservan sus ids (para no romper
     los gastos ya cargados) pero adoptan el nombre y el color que toca. */
  const alive = s.people.filter((p) => !p.deleted);
  if (alive.length < 2) {
    s.people = freshState().people;
  } else {
    alive.slice(0, 2).forEach((p, i) => {
      p.name = PEOPLE[i].name;
      p.color = p.color || PEOPLE[i].color;
    });
    alive.slice(2).forEach((p) => { p.deleted = true; p.updatedAt = nowIso(); });
  }
  return s;
}

export const state = readLocal() || freshState();

/* Config del dispositivo: no viaja en el backup ni en la nube. */
function readConfig() {
  try {
    return JSON.parse(leerClave(CONFIG_KEY, CONFIG_KEY_ANTERIOR)) || {};
  } catch {
    return {};
  }
}

export const config = {
  theme: 'auto',
  supabaseUrl: '',
  supabaseKey: '',
  anthropicKey: '',   // sólo para leer tickets; nunca sale de este navegador
  spaceId: '',
  meId: '',
  autoSync: true,
  lastSyncAt: '',
  ...readConfig(),
};

export function saveConfig(patch = {}) {
  Object.assign(config, patch);
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.error('No se pudo guardar la configuración', err);
  }
  return config;
}

/* ------------------------------------------------------ eventos y guardado */

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(detail) {
  listeners.forEach((fn) => {
    try { fn(detail); } catch (err) { console.error(err); }
  });
}

let saveTimer = null;
let storageFull = false;

export function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
}

export function flush() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageFull = false;
  } catch (err) {
    if (!storageFull) {
      storageFull = true;
      console.error('No hay espacio para guardar', err);
      emit({ type: 'storage-error' });
    }
  }
}

/** Guarda y avisa a la UI. `silent` evita el re-render (p. ej. durante sync). */
export function commit(detail = {}) {
  persist();
  if (!detail.silent) emit({ type: 'change', ...detail });
}

window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

/* Otra pestaña del mismo navegador tocó los datos: recargamos en memoria. */
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || !e.newValue) return;
  try {
    const incoming = migrate(JSON.parse(e.newValue));
    if (!incoming) return;
    Object.keys(state).forEach((k) => delete state[k]);
    Object.assign(state, incoming);
    emit({ type: 'change', external: true });
  } catch { /* ignoramos payloads corruptos */ }
});

/* -------------------------------------------------------------------- CRUD */

export function list(collection, { includeDeleted = false } = {}) {
  const arr = state[collection] || [];
  return includeDeleted ? arr : arr.filter((r) => !r.deleted);
}

export function get(collection, id) {
  return (state[collection] || []).find((r) => r.id === id) || null;
}

export function add(collection, data) {
  const record = { id: uid(), ...data, updatedAt: nowIso(), deleted: false };
  state[collection].push(record);
  commit({ collection, id: record.id, action: 'add' });
  return record;
}

export function update(collection, id, patch) {
  const record = get(collection, id);
  if (!record) return null;
  Object.assign(record, patch, { updatedAt: nowIso() });
  commit({ collection, id, action: 'update' });
  return record;
}

/** Borrado lógico: el registro queda como tumba para que la sync lo propague. */
export function remove(collection, id) {
  const record = get(collection, id);
  if (!record) return null;
  record.deleted = true;
  record.updatedAt = nowIso();
  commit({ collection, id, action: 'remove' });
  return record;
}

export function restore(collection, id) {
  return update(collection, id, { deleted: false });
}

export function setSettings(patch) {
  Object.assign(state.settings, patch, { updatedAt: nowIso() });
  commit({ collection: 'settings', action: 'update' });
  return state.settings;
}

/* ------------------------------------------------------------- accesos útiles */

export function people() {
  return list('people');
}

export function person(id) {
  return get('people', id) || { id, name: 'Alguien', color: '#898781' };
}

export function categories() {
  return list('categories');
}

export function category(id) {
  return get('categories', id) || { id, name: 'Otros', emoji: '📦', budgetCents: 0 };
}

export function nextPersonColor() {
  const used = new Set(people().map((p) => p.color));
  return PERSON_COLORS.find((c) => !used.has(c)) || PERSON_COLORS[0];
}

/* ------------------------------------------------------------------ sueldos */

/**
 * Guarda el líquido de una persona para un mes. El id es determinista para
 * que, si los dos cargan el mismo sueldo a la vez, no queden duplicados.
 */
export function setIncome(personId, month, amountCents) {
  const id = `${month}:${personId}`;
  const existing = get('incomes', id);
  if (existing) {
    Object.assign(existing, { amountCents, deleted: false, updatedAt: nowIso() });
    commit({ collection: 'incomes', id, action: 'update' });
    return existing;
  }
  const record = { id, month, personId, amountCents, updatedAt: nowIso(), deleted: false };
  state.incomes.push(record);
  commit({ collection: 'incomes', id, action: 'add' });
  return record;
}

/**
 * Líquido de una persona en un mes. Si ese mes no tiene nada cargado, se
 * arrastra el último sueldo conocido: normalmente cobran lo mismo y no hay
 * que volver a cargarlo todos los meses.
 */
export function incomeFor(personId, month) {
  const rows = list('incomes').filter((i) => i.personId === personId && i.month <= month);
  if (!rows.length) return { amountCents: 0, month: null, inherited: false };
  const exact = rows.find((i) => i.month === month);
  if (exact) return { amountCents: exact.amountCents, month, inherited: false };
  const last = rows.sort((a, b) => b.month.localeCompare(a.month))[0];
  return { amountCents: last.amountCents, month: last.month, inherited: true };
}

/** Quién soy yo en este dispositivo (para los atajos "pagué yo"). */
export function me() {
  const found = config.meId && get('people', config.meId);
  return found && !found.deleted ? found : people()[0];
}

/* --------------------------------------------------------- import / export */

export function exportData() {
  return JSON.stringify({
    app: 'pochohouse',
    version: state.version,
    exportedAt: nowIso(),
    data: {
      settings: state.settings,
      people: state.people,
      categories: state.categories,
      expenses: state.expenses,
      fixed: state.fixed,
      shopping: state.shopping,
      goals: state.goals,
      settlements: state.settlements,
    },
  }, null, 2);
}

/**
 * Importa un backup. `mode: 'merge'` conserva lo local y agrega lo que falte
 * (gana el `updatedAt` más nuevo); `mode: 'replace'` pisa todo.
 */
export function importData(json, { mode = 'merge' } = {}) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const data = parsed.data || parsed;
  if (!data || typeof data !== 'object') throw new Error('El archivo no tiene el formato esperado.');

  let count = 0;
  if (mode === 'replace') {
    COLLECTIONS.forEach((c) => {
      if (Array.isArray(data[c])) { state[c] = data[c]; count += data[c].length; }
    });
    if (data.settings) state.settings = { ...state.settings, ...data.settings };
  } else {
    COLLECTIONS.forEach((c) => {
      if (!Array.isArray(data[c])) return;
      const byId = new Map(state[c].map((r) => [r.id, r]));
      data[c].forEach((incoming) => {
        if (!incoming || !incoming.id) return;
        const mine = byId.get(incoming.id);
        if (!mine) {
          state[c].push({ deleted: false, updatedAt: nowIso(), ...incoming });
          count += 1;
        } else if ((incoming.updatedAt || '') > (mine.updatedAt || '')) {
          Object.assign(mine, incoming);
          count += 1;
        }
      });
    });
  }
  commit({ action: 'import' });
  return count;
}

export function resetAll() {
  const fresh = freshState();
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, fresh);
  commit({ action: 'reset' });
}

/** Datos de ejemplo para ver la app con contenido antes de cargar lo real. */
export function seedDemo() {
  const [a, b] = people();
  const m = currentMonth();
  const day = (d) => `${m}-${String(d).padStart(2, '0')}`;
  setIncome(a.id, m, 145000000);
  setIncome(b.id, m, 132000000);
  const rows = [
    ['Expensas', 78000, 'expensas', b.id, 3, 'equal'],
    ['Edenor', 32400, 'luz', a.id, 8, 'equal'],
    ['Internet fibra', 29900, 'internet', b.id, 5, 'equal'],
    ['Compra grande del mes', 186500, 'super', a.id, 6, 'equal'],
    ['Verdulería', 14200, 'super', b.id, 11, 'equal'],
    ['Cena aniversario', 62000, 'salidas', a.id, 12, 'equal'],
    ['Nafta', 45000, 'transporte', b.id, 9, 'single'],
    ['Veterinaria', 38000, 'mascota', a.id, 14, 'equal'],
  ];
  rows.forEach(([desc, amount, cat, payer, d, splitMode]) => {
    add('expenses', {
      date: day(d),
      description: desc,
      amountCents: amount * 100,
      categoryId: cat,
      paidBy: payer,
      splitMode,
      splitTo: splitMode === 'single' ? payer : null,
      splitPct: null,
      note: '',
    });
  });
  [
    ['Expensas', 78000, 'expensas', 3, b.id],
    ['Internet fibra', 29900, 'internet', 5, b.id],
    ['Netflix', 9900, 'suscripciones', 20, a.id],
  ].forEach(([name, amount, cat, dayOfMonth, payer]) => {
    add('fixed', {
      name, amountCents: amount * 100, categoryId: cat, dayOfMonth,
      paidBy: payer, splitMode: 'equal', splitTo: null, splitPct: null, active: true,
    });
  });
  ['Leche', 'Pan', 'Café', 'Huevos', 'Papel higiénico', 'Detergente'].forEach((name) => {
    add('shopping', { name, qty: 1, unit: '', estPriceCents: 0, done: false, staple: true, lastPriceCents: 0 });
  });
  add('goals', { name: 'Vacaciones', targetCents: 150000000, deadline: '', contributions: [] });
}
