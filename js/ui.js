/* Piezas de interfaz reutilizables: hoja modal, avisos, gráficos y formularios. */

import { el, clear, money, initials, monthLabel, addMonths, currentMonth } from './util.js';
import { state } from './store.js';

/* ------------------------------------------------------------------ dinero */

export function fmt(cents, opts = {}) {
  return money(cents, {
    locale: state.settings.locale || 'es-AR',
    currency: state.settings.currency || 'ARS',
    ...opts,
  });
}

export function fmtShort(cents) {
  return fmt(cents, { compact: true, cents: false });
}

/* ------------------------------------------------------------- hoja modal */

const sheetEl = document.getElementById('sheet');
const sheetTitle = document.getElementById('sheet-title');
const sheetBody = document.getElementById('sheet-body');
let lastFocus = null;
let onSheetClose = null;

export function openSheet(title, content, { onClose = null } = {}) {
  lastFocus = document.activeElement;
  onSheetClose = onClose;
  // Los avisos de la acción anterior no deben quedar flotando sobre la hoja.
  dismissToasts();
  sheetTitle.textContent = title;
  clear(sheetBody);
  sheetBody.append(content);
  sheetEl.hidden = false;
  document.body.style.overflow = 'hidden';
  const focusable = sheetBody.querySelector('input:not([type=hidden]), select, textarea, button');
  // En móvil, enfocar de una abre el teclado y tapa el formulario.
  if (focusable && window.matchMedia('(min-width: 700px)').matches) focusable.focus();
}

export function closeSheet() {
  if (sheetEl.hidden) return;
  sheetEl.hidden = true;
  clear(sheetBody);
  document.body.style.overflow = '';
  const cb = onSheetClose;
  onSheetClose = null;
  if (lastFocus && lastFocus.isConnected) lastFocus.focus();
  if (cb) cb();
}

sheetEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-close-sheet]')) closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !sheetEl.hidden) closeSheet();
});

/* ---------------------------------------------------------------- avisos */

const toastsEl = document.getElementById('toasts');

export function dismissToasts() {
  toastsEl.replaceChildren();
}

export function toast(message, { action = null, onAction = null, ms = 3800 } = {}) {
  const node = el('div', { class: 'toast', role: 'status' }, [el('span', { class: 'grow', text: message })]);
  if (action && onAction) {
    node.append(el('button', {
      class: 'toast__action',
      type: 'button',
      text: action,
      onclick: () => { node.remove(); onAction(); },
    }));
  }
  toastsEl.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .2s ease';
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 220);
  }, ms);
  return node;
}

export function confirmSheet(title, message, { confirmText = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const body = el('div', {}, [
      el('p', { class: 'muted', text: message, style: 'margin-bottom:6px' }),
      el('div', { class: 'sheet__footer' }, [
        el('button', {
          class: 'btn', type: 'button', text: 'Cancelar',
          onclick: () => { decided = true; closeSheet(); resolve(false); },
        }),
        el('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button', text: confirmText,
          onclick: () => { decided = true; closeSheet(); resolve(true); },
        }),
      ]),
    ]);
    openSheet(title, body, { onClose: () => { if (!decided) resolve(false); } });
  });
}

/* -------------------------------------------------------------- personas */

export function avatar(personObj, { large = false } = {}) {
  const otros = (state.people || []).filter((p) => !p.deleted).map((p) => p.name);
  return el('span', {
    class: `who${large ? ' who--lg' : ''}`,
    style: `background:${personObj.color || '#898781'}`,
    title: personObj.name,
    'aria-hidden': 'true',
  }, initials(personObj.name, otros));
}

/* ------------------------------------------------------------ formularios */

export function field(label, control, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field__label', text: label }),
    control,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
}

export function input(attrs = {}) {
  return el('input', { class: 'input', ...attrs });
}

export function select(options, value, attrs = {}) {
  const node = el('select', { class: 'select', ...attrs });
  options.forEach((o) => {
    node.append(el('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  });
  return node;
}

/**
 * Grupo de opciones tipo segmento. onChange recibe el valor elegido.
 * Devuelve el nodo; leer el valor con `node.value`.
 */
export function segmented(options, value, onChange) {
  const node = el('div', { class: 'seg', role: 'group' });
  node.value = value;
  options.forEach((o) => {
    const btn = el('button', {
      class: 'seg__opt',
      type: 'button',
      'aria-pressed': String(o.value) === String(value),
      text: o.label,
      onclick: () => {
        node.value = o.value;
        [...node.children].forEach((c) => c.setAttribute('aria-pressed', String(c === btn)));
        if (onChange) onChange(o.value);
      },
    });
    node.append(btn);
  });
  return node;
}

export function switchRow(label, checked, onChange, hint) {
  const box = el('input', { class: 'switch__box', type: 'checkbox', checked, onchange: (e) => onChange(e.target.checked) });
  return el('label', { class: 'field' }, [
    el('span', { class: 'switch' }, [
      el('span', {}, [
        el('span', { class: 'field__label', text: label, style: 'margin:0' }),
        hint ? el('span', { class: 'field__hint', text: hint, style: 'margin-top:2px' }) : null,
      ]),
      box,
    ]),
  ]);
}

export function footerButtons(primaryLabel, onPrimary, { secondaryLabel = 'Cancelar', onSecondary = closeSheet, extra = null } = {}) {
  return el('div', { class: 'sheet__footer' }, [
    extra,
    el('button', { class: 'btn', type: 'button', text: secondaryLabel, onclick: onSecondary }),
    el('button', { class: 'btn btn--primary', type: 'button', text: primaryLabel, onclick: onPrimary }),
  ]);
}

/* --------------------------------------------------------------- vacíos */

export function emptyState(icon, title, text, actionLabel, onAction) {
  return el('div', { class: 'empty' }, [
    el('span', { class: 'empty__ico', 'aria-hidden': 'true', text: icon }),
    el('p', { class: 'empty__title', text: title }),
    el('p', { class: 'empty__text', text }),
    actionLabel ? el('button', {
      class: 'btn btn--primary', type: 'button', text: actionLabel,
      style: 'margin-top:14px', onclick: onAction,
    }) : null,
  ]);
}

/* ------------------------------------------------------------ selector mes */

export function monthNav(mKey, onChange) {
  const isFuture = mKey >= addMonths(currentMonth(), 1);
  return el('div', { class: 'monthnav' }, [
    el('button', {
      class: 'monthnav__btn', type: 'button', 'aria-label': 'Mes anterior', text: '‹',
      onclick: () => onChange(addMonths(mKey, -1)),
    }),
    el('button', {
      class: 'monthnav__label',
      type: 'button',
      style: 'border:none;background:none;font:inherit;font-weight:620;cursor:pointer',
      text: monthLabel(mKey, state.settings.locale),
      title: 'Volver al mes actual',
      onclick: () => onChange(currentMonth()),
    }),
    el('button', {
      class: 'monthnav__btn', type: 'button', 'aria-label': 'Mes siguiente', text: '›',
      disabled: isFuture,
      onclick: () => onChange(addMonths(mKey, 1)),
    }),
  ]);
}

/* -------------------------------------------------------------- gráficos */

/**
 * Barras horizontales para una sola serie (gasto por categoría).
 * Una serie = sin leyenda; cada barra lleva su etiqueta y su valor al lado.
 */
export function barList(rows, { max = null, formatValue = fmt } = {}) {
  const top = max || Math.max(1, ...rows.map((r) => r.value));
  return el('div', { class: 'bars' }, rows.map((r) => el('div', {}, [
    el('div', { class: 'bar__head' }, [
      el('span', { class: 'bar__name grow', text: r.label }),
      el('span', { class: 'bar__val', text: formatValue(r.value) }),
    ]),
    el('div', {
      class: 'bar__track',
      role: 'img',
      'aria-label': `${r.label}: ${formatValue(r.value)}`,
    }, [
      el('div', {
        class: `bar__fill${r.level ? ` bar__fill--${r.level}` : ''}`,
        style: `width:${Math.max(2, Math.round((r.value / top) * 100))}%`,
      }),
    ]),
  ])));
}

/** Barras verticales de tendencia mensual (una serie, mes actual destacado). */
export function trendChart(series, { currentKey = null } = {}) {
  const top = Math.max(1, ...series.map((s) => s.total));
  const chart = el('div', { class: 'trend' }, series.map((s) => el('div', {
    class: `trend__col${s.month === currentKey ? ' trend__col--current' : ''}`,
  }, [
    el('div', { class: 'trend__barwrap' }, [
      // Un mes sin gastos se dibuja en cero: una barra mínima mentiría.
      el('div', {
        class: 'trend__bar',
        style: `height:${s.total > 0 ? Math.max(3, Math.round((s.total / top) * 100)) : 0}%`,
        role: 'img',
        'aria-label': `${monthLabel(s.month, state.settings.locale)}: ${fmt(s.total)}`,
        title: `${monthLabel(s.month, state.settings.locale)}: ${fmt(s.total)}`,
      }),
    ]),
    el('span', { class: 'trend__lbl', text: monthLabel(s.month, state.settings.locale, 'short').replace('.', '') }),
  ])));
  return el('div', {}, [chart, el('div', { class: 'trend__axis' })]);
}

/** Barra proporcional de cuánto puso cada persona. */
export function splitBar(entries) {
  const total = entries.reduce((s, e) => s + e.value, 0) || 1;
  return el('div', {}, [
    el('div', { class: 'splitbar' }, entries.map((e) => el('span', {
      class: 'splitbar__seg',
      style: `width:${(e.value / total) * 100}%;background:${e.color}`,
      title: `${e.label}: ${fmt(e.value)}`,
    }))),
    el('div', { class: 'legend' }, entries.map((e) => el('span', { class: 'legend__item' }, [
      el('span', { class: 'legend__swatch', style: `background:${e.color}`, 'aria-hidden': 'true' }),
      el('span', { text: `${e.label} · ${fmt(e.value)}` }),
    ]))),
  ]);
}

/* ----------------------------------------------------------------- listas */

export function listCard(children, { title = null, meta = null, action = null } = {}) {
  const card = el('section', { class: 'card card--flush' });
  if (title) {
    card.append(el('div', {
      class: 'card__head',
      style: 'padding:14px 15px 10px;margin:0;border-bottom:1px solid var(--border)',
    }, [
      el('h2', { class: 'card__title grow', text: title }),
      meta ? el('span', { class: 'card__meta', text: meta }) : null,
      action,
    ]));
  }
  const body = el('div', {});
  (Array.isArray(children) ? children : [children]).forEach((c) => c && body.append(c));
  card.append(body);
  return card;
}

/**
 * Fila de lista. Si hay acción propia (`trailing`) y además la fila es
 * clickeable, el botón va sólo en el contenido: un botón dentro de otro
 * es HTML inválido y confunde a los lectores de pantalla.
 */
export function listItem({ icon, title, subtitle, amount, amountClass = '', trailing = null, onClick = null, tag = null }) {
  const content = [
    icon ? el('span', { class: 'list__ico', 'aria-hidden': 'true' }, icon) : null,
    el('span', { class: 'list__body' }, [
      el('span', { class: 'list__title' }, [
        title,
        tag ? el('span', { class: `tag tag--${tag.level}`, text: tag.text, style: 'margin-left:7px' }) : null,
      ]),
      subtitle ? el('span', { class: 'list__sub', text: subtitle }) : null,
    ]),
    amount !== undefined && amount !== null
      ? el('span', { class: `list__amount ${amountClass}`, text: typeof amount === 'string' ? amount : fmt(amount) })
      : null,
  ];

  if (onClick && trailing) {
    return el('div', { class: 'list__item' }, [
      el('button', { class: 'list__hit', type: 'button', onclick: onClick }, content),
      trailing,
    ]);
  }

  return el(onClick ? 'button' : 'div', {
    class: 'list__item',
    type: onClick ? 'button' : null,
    onclick: onClick,
  }, [...content, trailing]);
}
