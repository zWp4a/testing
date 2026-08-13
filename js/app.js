/* Arranque de la app: rutas, tema, sincronización y service worker. */

import * as store from './store.js';
import { defineRoute, render, navigate, parseHash, buildHash, current } from './router.js';
import { applyTheme, cycleTheme } from './theme.js';
import { toast, closeSheet } from './ui.js';
import * as sync from './sync.js';
import { fixedStatus } from './calc.js';
import { currentMonth, today } from './util.js';

import { renderDashboard } from './views/dashboard.js';
import { renderExpenses } from './views/expenses.js';
import { renderFixed } from './views/fixed.js';
import { renderShopping } from './views/shopping.js';
import { renderGoals } from './views/goals.js';
import { renderSettings } from './views/settings.js';
import { openExpenseForm } from './views/expense-form.js';

/* ------------------------------------------------------------------ rutas */

defineRoute('resumen', renderDashboard);
defineRoute('gastos', renderExpenses);
defineRoute('fijos', renderFixed);
defineRoute('compras', renderShopping);
defineRoute('metas', renderGoals);
defineRoute('ajustes', renderSettings);

/* Enlace de invitación: #/unir/<base64 con url, clave y código> */
defineRoute('unir', (root, params, segments) => {
  const payload = segments[0];
  let cfg = null;
  try {
    cfg = JSON.parse(atob(decodeURIComponent(payload || '')));
  } catch {
    cfg = null;
  }
  if (!cfg || !cfg.u || !cfg.k || !cfg.s) {
    toast('El enlace de invitación no es válido.');
    navigate('resumen');
    return;
  }
  store.saveConfig({ supabaseUrl: cfg.u, supabaseKey: cfg.k, spaceId: cfg.s });
  sync.sync().then((r) => {
    toast(r.ok ? '¡Listo! Ya están conectados.' : `No se pudo conectar: ${r.message || ''}`);
    navigate('resumen');
  });
  root.append(Object.assign(document.createElement('div'), {
    className: 'card center muted',
    textContent: 'Conectando con el hogar compartido…',
  }));
});

/* ------------------------------------------------------------------- tema */

applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((store.config.theme || 'auto') === 'auto') applyTheme('auto');
});

document.getElementById('btn-theme').addEventListener('click', () => {
  const next = cycleTheme();
  store.saveConfig({ theme: next });
  applyTheme(next);
  toast(`Tema: ${{ auto: 'automático', light: 'claro', dark: 'oscuro' }[next]}`);
});

/* ------------------------------------------------------------- botón + */

document.getElementById('btn-fab').addEventListener('click', () => {
  const route = current();
  if (route && route.name === 'compras') {
    document.querySelector('.quickadd .input')?.focus();
    return;
  }
  const month = route?.params?.month;
  const isPast = month && month !== currentMonth();
  openExpenseForm(null, isPast ? { date: `${month}-01` } : {});
});

/* ------------------------------------------------------- sincronización UI */

const syncBtn = document.getElementById('btn-sync');

function paintSyncButton(status) {
  syncBtn.classList.toggle('is-spinning', status === 'syncing');
  const labels = {
    off: 'Sincronización desactivada',
    ok: 'Al día · tocá para sincronizar',
    syncing: 'Sincronizando…',
    offline: 'Sin conexión: se guarda igual',
    error: 'Hubo un problema al sincronizar',
    pending: 'Tocá para sincronizar',
  };
  syncBtn.title = labels[status] || labels.off;
  syncBtn.setAttribute('aria-label', syncBtn.title);
  syncBtn.style.color = status === 'error' ? 'var(--critical)'
    : status === 'ok' ? 'var(--good)'
      : '';
  syncBtn.style.opacity = status === 'off' ? '.45' : '1';
}

sync.onSyncChange(({ status, message }) => {
  paintSyncButton(status);
  if (status === 'error' && document.visibilityState === 'visible' && message) {
    console.warn('Sync:', message);
  }
});

syncBtn.addEventListener('click', async () => {
  if (!sync.isConfigured()) {
    navigate('ajustes');
    toast('Configurá la sincronización para compartir los gastos.');
    return;
  }
  const r = await sync.sync();
  toast(r.ok ? 'Datos al día.' : `No se pudo sincronizar: ${r.message || r.reason}`);
});

paintSyncButton(sync.syncState());

/* ------------------------------------------------------- estado -> pantalla */

let rerenderTimer = null;
store.subscribe((detail) => {
  if (detail.type === 'storage-error') {
    toast('No hay espacio para guardar. Descargá un backup y borrá datos viejos.', { ms: 8000 });
    return;
  }
  if (detail.silent) return;
  clearTimeout(rerenderTimer);
  rerenderTimer = setTimeout(() => {
    render();
    sync.scheduleSync();
  }, 16);
});

/* ------------------------------------------------------------ primer uso */

function firstRunIfNeeded() {
  if (store.config.onboarded) return;
  const hasData = store.list('expenses').length || store.list('fixed').length;
  if (hasData) { store.saveConfig({ onboarded: true }); return; }
  import('./views/onboarding.js').then((m) => m.openOnboarding());
}

/* --------------------------------------------------------------- arranque */

/* ------------------------------------------- atajos del ícono del celular */

/* El manifest abre la app con ?nuevo=1 o ?escanear=1. Se ejecuta la acción una
   sola vez y se limpia el hash, para que un re-dibujo no la vuelva a abrir. */
function accionDeAtajo() {
  const { name, params } = parseHash();
  if (!params.nuevo && !params.escanear) return;

  const limpio = { ...params };
  delete limpio.nuevo;
  delete limpio.escanear;
  history.replaceState(null, '', buildHash(name, limpio));

  if (params.escanear) {
    import('./views/scan-form.js').then((m) => m.openScanForm());
  } else {
    openExpenseForm();
  }
}

/* ------------------------------------------------- aviso de vencimientos */

/* Sin servidor no hay notificación con la app cerrada. Lo que sí podemos es
   avisar al abrirla, una vez por día, y marcar el ícono con un contador. */
function avisarVencimientos() {
  const { rows } = fixedStatus(currentMonth());
  const urgentes = rows.filter((r) => r.status === 'overdue' || r.status === 'due-soon');

  if (navigator.setAppBadge) {
    const badge = urgentes.length
      ? navigator.setAppBadge(urgentes.length)
      : navigator.clearAppBadge();
    Promise.resolve(badge).catch(() => { /* el navegador no lo permite */ });
  }

  if (!urgentes.length) return;
  if (store.config.lastNudgeAt === today()) return;   // ya avisamos hoy
  store.saveConfig({ lastNudgeAt: today() });

  const vencidos = urgentes.filter((r) => r.status === 'overdue').length;
  toast(
    vencidos
      ? `${vencidos} fijo${vencidos > 1 ? 's' : ''} vencido${vencidos > 1 ? 's' : ''} sin pagar.`
      : `${urgentes.length} fijo${urgentes.length > 1 ? 's' : ''} vence${urgentes.length > 1 ? 'n' : ''} en estos días.`,
    { action: 'Ver', onAction: () => navigate('fijos'), ms: 7000 },
  );
}

// replaceState en vez de asignar el hash: asignarlo dispara un hashchange
// que cerraría de inmediato la hoja de bienvenida.
if (!location.hash) history.replaceState(null, '', '#/resumen');
render();
firstRunIfNeeded();
accionDeAtajo();
avisarVencimientos();

if (sync.isConfigured() && parseHash().name !== 'unir') sync.startAutoSync();

window.addEventListener('online', () => paintSyncButton(sync.syncState()));
window.addEventListener('offline', () => paintSyncButton('offline'));

/* Atajos de teclado en la compu. */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    openExpenseForm();
  }
});

/* Service worker: la app abre aunque no haya señal.
   La versión de archivo único no lleva manifest y tampoco service worker. */
if (document.querySelector('link[rel="manifest"]')
    && 'serviceWorker' in navigator
    && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW no registrado', err));
  });
}

// Cerramos la hoja modal al navegar con el botón "atrás" del teléfono.
window.addEventListener('hashchange', closeSheet);
