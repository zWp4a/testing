/* Estado de la app: persistencia local, CRUD y notificación de cambios.
 *
 * Cada registro guarda `updatedAt` y `deleted`, así la sincronización puede
 * resolver conflictos por "gana el más reciente" y propagar borrados.
 */

import { uid, nowIso, currentMonth } from './util.js';

const KEY = 'nuestracasa.v1';
const CONFIG_KEY = 'nuestracasa.config.v1'; // no se sincroniza (claves y prefs del dispositivo)

export const COLLECTIONS = ['expenses', 'fixed', 'shopping', 'goals', 'settlements', 'categories', 'people'];

export const DEFAULT_CATEGORIES = [
  { key: 'alquiler',     name: 'Alquiler',      emoji: '🏠' },
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
  const people = [
    { id: uid(), name: 'Yo', color: PERSON_COLORS[0], updatedAt: ts, deleted: false },
    { id: uid(), name: 'Mi pareja', color: PERSON_COLORS[1], updatedAt: ts, deleted: false },
  ];
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
      currency: 'ARS',
      locale: 'es-AR',
      defaultPayer: people[0].id,
      defaultSplit: 'equal',
      homeName: 'Nuestra Casa',
      updatedAt: ts,
    },
    people,
    categories,
    expenses: [],
    fixed: [],
    shopping: [],
    goals: [],
    settlements: [],
  };
}

/* ----------------------------------------------------------- persistencia */

function readLocal() {
  try {
    const raw = localStorage.getItem(KEY);
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
  if (!s.people.length) s.people = freshState().people;
  if (!s.categories.length) s.categories = freshState().categories;
  return s;
}

export const state = readLocal() || freshState();

/* Config del dispositivo: no viaja en el backup ni en la nube. */
function readConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch {
    return {};
  }
}

export const config = {
  theme: 'auto',
  supabaseUrl: '',
  supabaseKey: '',
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

/** Quién soy yo en este dispositivo (para los atajos "pagué yo"). */
export function me() {
  const found = config.meId && get('people', config.meId);
  return found && !found.deleted ? found : people()[0];
}

/* --------------------------------------------------------- import / export */

export function exportData() {
  return JSON.stringify({
    app: 'nuestra-casa',
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
  const rows = [
    ['Alquiler', 450000, 'alquiler', a.id, 1, 'equal'],
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
    ['Alquiler', 450000, 'alquiler', 1, a.id],
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
