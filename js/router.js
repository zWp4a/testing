/* Enrutado por hash: #/gastos?month=2026-08 — funciona en GitHub Pages y offline. */

const routes = new Map();
let currentRoute = null;
let onRender = null;

export function defineRoute(name, render) {
  routes.set(name, render);
}

export function setRenderHook(fn) {
  onRender = fn;
}

export function parseHash(hash = location.hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = {};
  new URLSearchParams(query || '').forEach((v, k) => { params[k] = v; });
  return { name: parts[0] || 'resumen', segments: parts.slice(1), params };
}

export function buildHash(name, params = {}) {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  ).toString();
  return `#/${name}${q ? `?${q}` : ''}`;
}

export function navigate(name, params = {}) {
  const next = buildHash(name, params);
  if (location.hash === next) render();
  else location.hash = next;
}

export function current() {
  return currentRoute;
}

export function render() {
  const route = parseHash();
  // Un re-dibujo por un cambio de datos no debe mover la página: sólo
  // volvemos arriba cuando de verdad cambiaste de pantalla.
  const changedScreen = !currentRoute
    || currentRoute.name !== route.name
    || JSON.stringify(currentRoute.params) !== JSON.stringify(route.params);
  currentRoute = route;
  const view = routes.get(route.name) || routes.get('resumen');

  const root = document.getElementById('view');
  const keepScroll = window.scrollY;

  // Si estabas escribiendo en un campo marcado con data-focus-key, el
  // re-dibujo no te tiene que sacar el teclado ni el cursor de lugar.
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focusKey : null;
  const typed = focusKey ? active.value : null;
  const caret = focusKey && 'selectionStart' in active
    ? { start: active.selectionStart, end: active.selectionEnd }
    : null;

  root.replaceChildren();
  try {
    view(root, route.params, route.segments);
  } catch (err) {
    console.error('Error al dibujar la vista', err);
    root.append(Object.assign(document.createElement('div'), {
      className: 'card',
      textContent: 'Algo salió mal al mostrar esta pantalla. Probá recargar la página.',
    }));
  }

  // En la barra inferior, "Más" (ajustes) queda activo también en Metas.
  const fallback = { metas: 'ajustes' };
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const inBottomBar = a.classList.contains('tabbar__item');
    const matches = a.dataset.nav === route.name
      || (inBottomBar && fallback[route.name] === a.dataset.nav);
    if (matches) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  if (focusKey) {
    const again = root.querySelector(`[data-focus-key="${focusKey}"]`);
    if (again) {
      // Lo que estabas tecleando no se pierde aunque entre una sincronización.
      if (typed && !again.value) again.value = typed;
      again.focus({ preventScroll: true });
      if (caret && 'setSelectionRange' in again) {
        try { again.setSelectionRange(caret.start, caret.end); } catch { /* type sin selección */ }
      }
    }
  }

  if (onRender) onRender(route);
  if (changedScreen) window.scrollTo({ top: 0 });
  else window.scrollTo({ top: keepScroll });
}

window.addEventListener('hashchange', render);
