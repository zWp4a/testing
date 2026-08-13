/* Tema claro / oscuro / automático. */

import { config } from './store.js';

const meta = () => document.querySelectorAll('meta[name="theme-color"]');

export function applyTheme(mode = config.theme || 'auto') {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);

  // La barra del navegador en el celular tiene que acompañar al tema elegido.
  const dark = mode === 'dark'
    || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
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
