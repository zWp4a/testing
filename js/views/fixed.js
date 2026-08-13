/* Gastos fijos: alquiler, expensas, servicios y suscripciones del mes. */

import { el, currentMonth, clampDay, toCents, fromCents, monthLabel } from '../util.js';
import * as store from '../store.js';
import { fixedStatus } from '../calc.js';
import {
  fmt, monthNav, listCard, listItem, emptyState, field, input, select, segmented,
  footerButtons, openSheet, closeSheet, toast, confirmSheet,
} from '../ui.js';
import { navigate } from '../router.js';

const STATUS_TAG = {
  paid: { level: 'good', text: 'Pagado' },
  overdue: { level: 'critical', text: 'Vencido' },
  'due-soon': { level: 'warning', text: 'Pronto' },
  pending: null,
};

export function openFixedForm(existing = null) {
  const roster = store.people();
  const isEdit = Boolean(existing);
  const draft = existing ? { ...existing } : {
    name: '',
    amountCents: 0,
    categoryId: 'expensas',
    dayOfMonth: 1,
    paidBy: store.me().id,
    splitMode: 'equal',
    splitTo: null,
    splitPct: null,
    active: true,
    variable: false,
  };

  const nameInput = input({ type: 'text', placeholder: 'Edenor, expensas, Netflix…', value: draft.name });
  const amountInput = input({
    class: 'input input--amount', type: 'text', inputmode: 'decimal',
    value: draft.amountCents ? String(fromCents(draft.amountCents)).replace('.', ',') : '',
    'aria-label': 'Monto',
  });
  const daySel = select(
    Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `Día ${i + 1}` })),
    draft.dayOfMonth,
    { onchange: (e) => { draft.dayOfMonth = Number(e.target.value); } },
  );
  const catSel = select(
    store.categories().map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` })),
    draft.categoryId,
    { onchange: (e) => { draft.categoryId = e.target.value; } },
  );
  const payerSeg = segmented(
    roster.map((p) => ({ value: p.id, label: p.name })),
    roster.some((p) => p.id === draft.paidBy) ? draft.paidBy : roster[0].id,
    (v) => { draft.paidBy = v; },
  );
  const splitSeg = segmented(
    roster.length === 2
      ? [
        { value: 'equal', label: 'Mitad y mitad' },
        { value: `single:${roster[0].id}`, label: `Solo ${roster[0].name}` },
        { value: `single:${roster[1].id}`, label: `Solo ${roster[1].name}` },
      ]
      : [{ value: 'equal', label: 'Partes iguales' }, { value: 'single', label: 'Una sola persona' }],
    draft.splitMode === 'single' && roster.length === 2 ? `single:${draft.splitTo}` : draft.splitMode,
    (v) => {
      if (v.startsWith('single')) {
        draft.splitMode = 'single';
        draft.splitTo = v.includes(':') ? v.slice(7) : draft.paidBy;
      } else {
        draft.splitMode = 'equal';
        draft.splitTo = null;
      }
    },
  );
  const variableBox = input({ type: 'checkbox', class: 'switch__box', checked: draft.variable });

  function save() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); toast('Ponele un nombre.'); return; }
    const payload = {
      name,
      amountCents: toCents(amountInput.value),
      categoryId: draft.categoryId,
      dayOfMonth: draft.dayOfMonth,
      paidBy: draft.paidBy,
      splitMode: draft.splitMode,
      splitTo: draft.splitTo,
      splitPct: null,
      active: true,
      variable: variableBox.checked,
    };
    if (isEdit) store.update('fixed', existing.id, payload);
    else store.add('fixed', payload);
    closeSheet();
    toast(isEdit ? 'Gasto fijo actualizado.' : 'Gasto fijo agregado.');
  }

  async function del() {
    const ok = await confirmSheet('¿Borrar el fijo?', `Se deja de recordar "${existing.name}". Los gastos ya cargados quedan.`, {
      confirmText: 'Borrar', danger: true,
    });
    if (!ok) return;
    store.remove('fixed', existing.id);
    toast('Gasto fijo eliminado.', { action: 'Deshacer', onAction: () => store.restore('fixed', existing.id) });
  }

  openSheet(isEdit ? 'Editar gasto fijo' : 'Nuevo gasto fijo', el('div', {}, [
    field('Nombre', nameInput),
    field('Monto habitual', amountInput, 'Si cambia todos los meses, activá "monto variable" abajo.'),
    el('div', { class: 'grid-2', style: 'margin-bottom:13px' }, [
      field('Vence', daySel),
      field('Categoría', catSel),
    ]),
    field('Suele pagarlo', payerSeg),
    field('División', splitSeg),
    el('label', { class: 'field' }, [
      el('span', { class: 'switch' }, [
        el('span', {}, [
          el('span', { class: 'field__label', style: 'margin:0', text: 'Monto variable' }),
          el('span', { class: 'field__hint', style: 'margin-top:2px', text: 'Para luz o gas: al marcarlo pagado te pide el importe real.' }),
        ]),
        variableBox,
      ]),
    ]),
    footerButtons(isEdit ? 'Guardar' : 'Agregar', save, {
      extra: isEdit ? el('button', { class: 'btn btn--danger', type: 'button', text: 'Borrar', onclick: del }) : null,
    }),
  ]));
}

/** Marca un fijo como pagado creando el gasto real del mes. */
function markPaid(row, mKey) {
  const f = row.fixed;
  const create = (cents, paidBy) => {
    store.add('expenses', {
      date: row.dueDate,
      description: f.name,
      amountCents: cents,
      categoryId: f.categoryId,
      paidBy,
      splitMode: f.splitMode || 'equal',
      splitTo: f.splitTo || null,
      splitPct: f.splitPct || null,
      note: '',
      fixedId: f.id,
      createdAt: new Date().toISOString(),
    });
    toast(`${f.name} marcado como pagado.`);
  };

  if (!f.variable && f.amountCents > 0) {
    create(f.amountCents, f.paidBy);
    return;
  }

  const roster = store.people();
  const amountInput = input({
    class: 'input input--amount', type: 'text', inputmode: 'decimal',
    value: f.amountCents ? String(fromCents(f.amountCents)).replace('.', ',') : '',
    'aria-label': 'Monto',
  });
  let payer = roster.some((p) => p.id === f.paidBy) ? f.paidBy : roster[0].id;
  openSheet(`Pagar ${f.name}`, el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:12px', text: `Vencimiento: ${row.dueDate.slice(8)} de ${monthLabel(mKey, store.state.settings.locale)}.` }),
    field('¿Cuánto vino?', amountInput),
    field('¿Quién pagó?', segmented(roster.map((p) => ({ value: p.id, label: p.name })), payer, (v) => { payer = v; })),
    footerButtons('Marcar pagado', () => {
      const cents = toCents(amountInput.value);
      if (cents <= 0) { toast('Poné el importe.'); return; }
      create(cents, payer);
      // Guardamos el último importe para que la próxima vez arranque cerca.
      store.update('fixed', f.id, { amountCents: cents });
      closeSheet();
    }),
  ]));
  setTimeout(() => amountInput.focus(), 60);
}

export function renderFixed(root, params) {
  const mKey = params.month || currentMonth();
  const { rows, pendingCents, pendingCount } = fixedStatus(mKey);
  const locale = store.state.settings.locale;

  root.append(monthNav(mKey, (m) => navigate('fijos', { month: m })));

  if (!rows.length) {
    root.append(el('section', { class: 'card' }, [
      emptyState('📅', 'Sin gastos fijos cargados',
        'Cargá las expensas y los servicios una vez y la app te los recuerda todos los meses.',
        'Agregar el primero', () => openFixedForm()),
    ]));
    return;
  }

  const paidCents = rows.filter((r) => r.expense).reduce((s, r) => s + (r.expense.amountCents || 0), 0);
  root.append(el('div', { class: 'tiles' }, [
    el('div', { class: 'tile' }, [
      el('p', { class: 'tile__label', text: 'Ya pagado' }),
      el('p', { class: 'tile__value', text: fmt(paidCents) }),
    ]),
    el('div', { class: 'tile' }, [
      el('p', { class: 'tile__label', text: 'Falta pagar' }),
      el('p', { class: 'tile__value', text: fmt(pendingCents) }),
      el('p', { class: 'tile__delta tile__delta--flat', text: `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}` }),
    ]),
  ]));

  const items = rows.map((r) => {
    const cat = store.category(r.fixed.categoryId);
    const paid = Boolean(r.expense);
    const action = paid
      ? el('button', {
        class: 'btn btn--sm btn--ghost', type: 'button', text: 'Deshacer',
        onclick: async (ev) => {
          ev.stopPropagation();
          const ok = await confirmSheet('¿Desmarcar el pago?', `Se borra el gasto de ${fmt(r.expense.amountCents)} de "${r.fixed.name}".`, { confirmText: 'Desmarcar', danger: true });
          if (ok) { store.remove('expenses', r.expense.id); toast('Marcado como pendiente otra vez.'); }
        },
      })
      : el('button', {
        class: 'btn btn--sm btn--primary', type: 'button', text: 'Pagar',
        onclick: (ev) => { ev.stopPropagation(); markPaid(r, mKey); },
      });

    return listItem({
      icon: cat.emoji,
      title: r.fixed.name,
      subtitle: paid
        ? `Pagó ${store.person(r.expense.paidBy).name} · ${fmt(r.expense.amountCents)}`
        : `Vence el ${clampDay(mKey, r.fixed.dayOfMonth)} · ${r.fixed.variable ? 'monto variable' : fmt(r.fixed.amountCents)}`,
      tag: STATUS_TAG[r.status],
      trailing: action,
      onClick: () => openFixedForm(r.fixed),
    });
  });

  root.append(listCard(items, {
    title: `Fijos de ${monthLabel(mKey, locale)}`,
    meta: `${rows.length} en total`,
  }));

  const pendientes = rows.filter((r) => !r.expense && !r.fixed.variable && r.fixed.amountCents > 0);
  root.append(el('div', { class: 'stack', style: 'margin-top:4px' }, [
    pendientes.length > 1 ? el('button', {
      class: 'btn btn--block', type: 'button',
      text: `Marcar todos los pendientes como pagados (${fmt(pendientes.reduce((s, r) => s + r.fixed.amountCents, 0))})`,
      onclick: async () => {
        const ok = await confirmSheet('¿Marcar todo como pagado?', `Se crean ${pendientes.length} gastos con los montos habituales.`, { confirmText: 'Sí, marcar' });
        if (!ok) return;
        pendientes.forEach((r) => markPaid(r, mKey));
        toast(`${pendientes.length} fijos cargados.`);
      },
    }) : null,
    el('button', { class: 'btn btn--block', type: 'button', text: '＋ Nuevo gasto fijo', onclick: () => openFixedForm() }),
  ]));
}
