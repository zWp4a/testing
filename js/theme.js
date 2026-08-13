/* Tema claro / oscuro / automático. */

import { config } from './store.js';

const meta = () => document.querySelectorAll('meta[name="theme-color"]');

// Si la página venía con un tema puesto desde afuera, "automático" lo respeta
// en vez de borrarlo: sólo limpiamos la marca que puso la propia app.
let stampedByApp = false;

export function applyTheme(mode = config.theme || 'auto') {
  const root = document.documentElement;
  if (mode === 'auto') {
    if (stampedByApp) root.removeAttribute('data-theme');
    stampedByApp = false;
  } else {
    root.setAttribute('data-theme', mode);
    stampedByApp = true;
  }

  // La barra del navegador en el celular tiene que acompañar al tema elegido.
  const effective = mode === 'auto' ? (root.getAttribute('data-theme') || 'auto') : mode;
  const dark = effective === 'dark'
    || (effective === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  meta().forEach((m) => m.setAttribute('content', dark ? '#0d0d0d' : '#fcfcfb'));
}

export function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(config.theme || 'auto') + 1) % order.length];
  return next;
}

export function themeLabel(mode) {
  return { auto: 'Automático', light: 'Claro', dark: 'Oscuro' }[mode] || 'Automático';
}
