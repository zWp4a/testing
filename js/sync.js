/* Sincronización opcional vía Supabase (REST, sin SDK).
 *
 * Modelo: una sola tabla `records` con (space_id, kind, id, data, updated_at,
 * deleted). Cada dispositivo sube lo que cambió y baja lo que no tiene.
 * Los conflictos se resuelven por `updated_at`: gana la edición más reciente.
 *
 * Sin configurar nada, la app funciona 100% local. Esto sólo se activa cuando
 * cargan URL + clave + código de espacio en Ajustes.
 */

import { state, config, saveConfig, COLLECTIONS, commit, flush } from './store.js';
import { nowIso } from './util.js';

const listeners = new Set();
let running = false;

export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(status, detail = {}) {
  listeners.forEach((fn) => {
    try { fn({ status, ...detail }); } catch (err) { console.error(err); }
  });
}

export function isConfigured() {
  return Boolean(config.supabaseUrl && config.supabaseKey && config.spaceId);
}

export function syncState() {
  if (!isConfigured()) return 'off';
  if (running) return 'syncing';
  if (!navigator.onLine) return 'offline';
  return config.lastSyncAt ? 'ok' : 'pending';
}

function endpoint(path) {
  const base = String(config.supabaseUrl).replace(/\/+$/, '');
  return `${base}/rest/v1/${path}`;
}

function headers(extra = {}) {
  return {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** Aplana el estado a filas sincronizables. */
function localRows() {
  const rows = [];
  COLLECTIONS.forEach((kind) => {
    (state[kind] || []).forEach((r) => {
      rows.push({
        space_id: config.spaceId,
        kind,
        id: r.id,
        data: r,
        updated_at: r.updatedAt || nowIso(),
        deleted: Boolean(r.deleted),
      });
    });
  });
  rows.push({
    space_id: config.spaceId,
    kind: 'settings',
    id: 'settings',
    data: state.settings,
    updated_at: state.settings.updatedAt || nowIso(),
    deleted: false,
  });
  return rows;
}

/** Mezcla una fila remota en el estado local si es más nueva. */
function mergeRow(row) {
  if (row.kind === 'settings') {
    const remote = row.data || {};
    if ((remote.updatedAt || row.updated_at || '') > (state.settings.updatedAt || '')) {
      Object.assign(state.settings, remote, { updatedAt: remote.updatedAt || row.updated_at });
      return true;
    }
    return false;
  }
  if (!COLLECTIONS.includes(row.kind)) return false;
  const coll = state[row.kind];
  const incoming = { ...(row.data || {}), id: row.id, updatedAt: row.data?.updatedAt || row.updated_at, deleted: Boolean(row.deleted) };
  const idx = coll.findIndex((r) => r.id === row.id);
  if (idx === -1) {
    coll.push(incoming);
    return true;
  }
  const mine = coll[idx];
  if ((incoming.updatedAt || '') > (mine.updatedAt || '')) {
    coll[idx] = incoming;
    return true;
  }
  return false;
}

async function request(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(describeError(res.status, text));
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function describeError(status, text) {
  if (status === 401 || status === 403) return 'La clave no es válida o le faltan permisos (revisá la anon key y las policies).';
  if (status === 404) return 'No se encontró la tabla "records". ¿Corriste el script SQL en Supabase?';
  if (status === 400 && /column|schema/i.test(text)) return 'La tabla existe pero no tiene las columnas esperadas. Volvé a correr el script SQL.';
  return `Error ${status}: ${String(text).slice(0, 160) || 'sin detalle'}`;
}

/**
 * Ciclo completo: baja lo nuevo del servidor y sube lo que cambió acá.
 * @param {object} opts silent = no dispara re-render si no hubo cambios
 */
export async function sync({ silent = false } = {}) {
  if (!isConfigured()) return { ok: false, reason: 'not-configured' };
  if (running) return { ok: false, reason: 'busy' };
  if (!navigator.onLine) {
    emit('offline');
    return { ok: false, reason: 'offline' };
  }

  running = true;
  emit('syncing');
  flush();

  try {
    /* 1) Bajar todo lo del espacio (los volúmenes acá son chicos: un hogar). */
    const pullUrl = `${endpoint('records')}?space_id=eq.${encodeURIComponent(config.spaceId)}&select=kind,id,data,updated_at,deleted`;
    const res = await request(pullUrl, { method: 'GET', headers: headers() });
    const remote = await res.json();

    let changed = false;
    const remoteById = new Map();
    remote.forEach((row) => {
      remoteById.set(`${row.kind}:${row.id}`, row);
      if (mergeRow(row)) changed = true;
    });

    /* 2) Subir lo que falta o es más nuevo acá. */
    const toPush = localRows().filter((row) => {
      const there = remoteById.get(`${row.kind}:${row.id}`);
      if (!there) return true;
      return (row.updated_at || '') > (there.updated_at || '');
    });

    for (let i = 0; i < toPush.length; i += 100) {
      const chunk = toPush.slice(i, i + 100);
      await request(endpoint('records'), {
        method: 'POST',
        headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify(chunk),
      });
    }

    saveConfig({ lastSyncAt: nowIso() });
    if (changed) commit({ silent: false, action: 'sync' });
    else if (!silent) commit({ silent: true });

    emit('ok', { pulled: remote.length, pushed: toPush.length });
    return { ok: true, pulled: remote.length, pushed: toPush.length, changed };
  } catch (err) {
    console.error('Sync falló', err);
    emit('error', { message: err.message });
    return { ok: false, reason: 'error', message: err.message };
  } finally {
    running = false;
  }
}

/** Prueba la conexión sin escribir nada. */
export async function testConnection({ url, key, spaceId }) {
  const base = String(url).replace(/\/+$/, '');
  const res = await fetch(`${base}/rest/v1/records?space_id=eq.${encodeURIComponent(spaceId)}&select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(describeError(res.status, text));
  }
  return true;
}

/* -------------------------------------------------- disparadores automáticos */

let debounceTimer = null;

export function scheduleSync(delay = 2500) {
  if (!isConfigured() || !config.autoSync) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => sync({ silent: true }), delay);
}

export function startAutoSync() {
  if (!isConfigured()) return;
  sync({ silent: true });

  // Al volver a la app y al recuperar conexión, nos ponemos al día.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300);
  });
  window.addEventListener('online', () => scheduleSync(500));

  // Red de seguridad por si la otra persona carga algo mientras mirás la pantalla.
  setInterval(() => {
    if (document.visibilityState === 'visible') sync({ silent: true });
  }, 60000);
}
