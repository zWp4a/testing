/* Formulario de gasto: alta, edición, cuotas y división entre las personas. */

import { el, toCents, fromCents, today, uid, addMonths, clampDay, monthKey, usdABase } from '../util.js';
import * as store from '../store.js';
import { sharesOf } from '../calc.js';
import {
  fmt, field, input, select, segmented, footerButtons, openSheet, closeSheet,
  toast, confirmSheet, avatar,
} from '../ui.js';

function categoryPicker(selectedId, onChange) {
  const wrap = el('div', { class: 'chips' });
  store.categories().forEach((c) => {
    const chip = el('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': c.id === selectedId,
      onclick: () => {
        wrap.value = c.id;
        [...wrap.children].forEach((x) => x.setAttribute('aria-pressed', String(x === chip)));
        if (onChange) onChange(c.id);
      },
    }, [el('span', { 'aria-hidden': 'true', text: c.emoji }), el('span', { text: c.name })]);
    wrap.append(chip);
  });
  wrap.value = selectedId;
  return wrap;
}

function splitOptions(roster) {
  if (roster.length === 2) {
    return [
      { value: 'equal', label: 'Mitad y mitad' },
      { value: `single:${roster[0].id}`, label: `Solo ${roster[0].name}` },
      { value: `single:${roster[1].id}`, label: `Solo ${roster[1].name}` },
      { value: 'custom', label: 'Personalizado' },
    ];
  }
  return [
    { value: 'equal', label: 'Partes iguales' },
    { value: 'single', label: 'Una sola persona' },
    { value: 'custom', label: 'Personalizado' },
  ];
}

function splitValueOf(expense, roster) {
  if (expense.splitMode === 'single') {
    return roster.length === 2 ? `single:${expense.splitTo || expense.paidBy}` : 'single';
  }
  return expense.splitMode || 'equal';
}

/**
 * Abre la hoja del formulario.
 * @param {object|null} existing gasto a editar; null para uno nuevo
 * @param {object} defaults valores iniciales (fecha, categoría, monto…)
 */
export function openExpenseForm(existing = null, defaults = {}) {
  const roster = store.people();
  const isEdit = Boolean(existing);
  const base = existing || {
    date: defaults.date || today(),
    description: defaults.description || '',
    amountCents: defaults.amountCents || 0,
    categoryId: defaults.categoryId || store.categories()[0]?.id || 'otros',
    paidBy: defaults.paidBy || store.me().id,
    splitMode: defaults.splitMode || store.state.settings.defaultSplit || 'equal',
    splitTo: defaults.splitTo || null,
    splitPct: defaults.splitPct || null,
    note: defaults.note || '',
  };

  const draft = {
    date: base.date,
    description: base.description,
    amountCents: base.amountCents,
    categoryId: base.categoryId,
    paidBy: roster.some((p) => p.id === base.paidBy) ? base.paidBy : roster[0].id,
    splitMode: base.splitMode,
    splitTo: base.splitTo,
    splitPct: base.splitPct ? { ...base.splitPct } : null,
    note: base.note || '',
    installments: 1,
  };

  /* --- moneda: la base son pesos; un gasto puede venir en dólares --- */
  const fxPrevio = existing?.fx || null;
  let moneda = fxPrevio ? 'USD' : 'UYU';
  let cotizacion = fxPrevio?.rateCents || store.state.settings.usdRateCents || 0;

  const amountInput = input({
    class: 'input input--amount',
    type: 'text',
    inputmode: 'decimal',
    placeholder: '0,00',
    value: (() => {
      const cents = fxPrevio ? fxPrevio.amountCents : draft.amountCents;
      return cents ? String(fromCents(cents)).replace('.', ',') : '';
    })(),
    'aria-label': 'Monto',
  });

  const cotizacionInput = input({
    type: 'text', inputmode: 'decimal', placeholder: '40,00',
    value: cotizacion ? String(cotizacion / 100).replace('.', ',') : '',
    oninput: (e) => { cotizacion = toCents(e.target.value); renderMoneda(); renderPreview(); },
  });

  const monedaWrap = el('div', { style: 'margin-top:8px' });
  const monedaSeg = segmented([
    { value: 'UYU', label: '$ Pesos' },
    { value: 'USD', label: 'US$ Dólares' },
  ], moneda, (v) => { moneda = v; renderMoneda(); renderPreview(); });

  /** Cuánto vale el gasto en pesos, sea cual sea la moneda con que se cargó. */
  function montoEnPesos() {
    const escrito = toCents(amountInput.value);
    return moneda === 'USD' ? usdABase(escrito, cotizacion) : escrito;
  }

  function renderMoneda() {
    monedaWrap.replaceChildren();
    if (moneda !== 'USD') return;
    monedaWrap.append(
      field('Cotización del dólar', cotizacionInput,
        'Cuántos pesos vale un dólar. Se guarda para la próxima vez.'),
      el('p', { class: 'field__hint', style: 'margin-top:-8px' },
        cotizacion
          ? `Se guarda como ${fmt(montoEnPesos())} en pesos.`
          : 'Poné la cotización para poder convertirlo a pesos.'),
    );
  }

  const descInput = input({
    type: 'text',
    placeholder: 'Ej: Supermercado, luz, salida…',
    value: draft.description,
    autocomplete: 'off',
    enterkeyhint: 'done',
  });

  const dateInput = input({ type: 'date', value: draft.date });

  const payerSeg = segmented(
    roster.map((p) => ({ value: p.id, label: p.name })),
    draft.paidBy,
    (v) => { draft.paidBy = v; renderPreview(); },
  );

  const catPicker = categoryPicker(draft.categoryId, (v) => { draft.categoryId = v; });

  const customWrap = el('div', { class: 'stack', style: 'margin-top:4px' });
  const splitSeg = segmented(splitOptions(roster), splitValueOf(draft, roster), (v) => {
    if (v === 'equal') { draft.splitMode = 'equal'; draft.splitTo = null; }
    else if (v === 'custom') {
      draft.splitMode = 'custom';
      if (!draft.splitPct) {
        const even = Math.round(100 / roster.length);
        draft.splitPct = {};
        roster.forEach((p, i) => {
          draft.splitPct[p.id] = i === roster.length - 1 ? 100 - even * (roster.length - 1) : even;
        });
      }
    } else if (v.startsWith('single:')) { draft.splitMode = 'single'; draft.splitTo = v.slice(7); }
    else { draft.splitMode = 'single'; draft.splitTo = draft.splitTo || draft.paidBy; }
    renderCustom();
    renderPreview();
  });

  function renderCustom() {
    customWrap.replaceChildren();
    if (draft.splitMode === 'custom') {
      roster.forEach((p) => {
        const pctInput = input({
          type: 'number', min: '0', max: '100', step: '1', inputmode: 'numeric',
          value: draft.splitPct?.[p.id] ?? 0,
          style: 'max-width:110px',
          oninput: (e) => {
            draft.splitPct = draft.splitPct || {};
            draft.splitPct[p.id] = Number(e.target.value) || 0;
            renderPreview();
          },
        });
        customWrap.append(el('div', { class: 'row' }, [
          avatar(p),
          el('span', { class: 'grow', text: p.name }),
          pctInput,
          el('span', { class: 'muted', text: '%' }),
        ]));
      });
    } else if (draft.splitMode === 'single' && roster.length > 2) {
      customWrap.append(select(
        roster.map((p) => ({ value: p.id, label: `Lo banca ${p.name}` })),
        draft.splitTo || draft.paidBy,
        { onchange: (e) => { draft.splitTo = e.target.value; renderPreview(); } },
      ));
    }
  }

  const preview = el('div', { class: 'card', style: 'background:var(--surface-2);box-shadow:none;margin:0' });

  function currentAmount() {
    return montoEnPesos();
  }

  function renderPreview() {
    const total = currentAmount();
    const per = draft.installments > 1 ? Math.round(total / draft.installments) : total;
    const shares = sharesOf({ ...draft, amountCents: per, paidBy: draft.paidBy }, roster);
    preview.replaceChildren(
      el('div', { class: 'row row--between', style: 'margin-bottom:8px' }, [
        el('span', { class: 'small muted', text: draft.installments > 1 ? `Cada cuota (${draft.installments} en total)` : 'Cómo se reparte' }),
        el('span', { class: 'small num', style: 'font-weight:640', text: fmt(per) }),
      ]),
      ...roster.map((p) => {
        const owes = shares[p.id] || 0;
        const isPayer = p.id === draft.paidBy;
        return el('div', { class: 'row', style: 'padding:3px 0' }, [
          avatar(p),
          el('span', { class: 'grow small', text: p.name + (isPayer ? ' · pagó' : '') }),
          el('span', { class: 'small num', style: 'font-weight:600', text: fmt(owes) }),
        ]);
      }),
    );
  }

  amountInput.addEventListener('input', renderPreview);

  /* --- cuotas (sólo al crear) --- */
  const cuotasInput = input({
    type: 'number', min: '1', max: '60', step: '1', inputmode: 'numeric', value: '1',
    oninput: (e) => {
      draft.installments = Math.max(1, Math.min(60, Number(e.target.value) || 1));
      renderPreview();
    },
  });

  function save() {
    const total = currentAmount();
    if (total <= 0) {
      amountInput.focus();
      toast('Poné un monto mayor a cero.');
      return;
    }
    draft.description = descInput.value.trim() || store.category(draft.categoryId).name;
    draft.date = dateInput.value || today();

    if (draft.splitMode === 'custom') {
      const sum = Object.values(draft.splitPct || {}).reduce((s, n) => s + (Number(n) || 0), 0);
      if (sum <= 0) { toast('Los porcentajes tienen que sumar más de cero.'); return; }
    }
    if (moneda === 'USD' && !cotizacion) {
      toast('Falta la cotización del dólar.');
      return;
    }

    const fx = moneda === 'USD'
      ? { currency: 'USD', amountCents: toCents(amountInput.value), rateCents: cotizacion }
      : null;
    if (fx) store.setSettings({ usdRateCents: cotizacion });

    const payload = {
      date: draft.date,
      description: draft.description,
      categoryId: draft.categoryId,
      fx,
      paidBy: draft.paidBy,
      splitMode: draft.splitMode,
      splitTo: draft.splitMode === 'single' ? (draft.splitTo || draft.paidBy) : null,
      splitPct: draft.splitMode === 'custom' ? draft.splitPct : null,
      note: draft.note,
    };

    if (isEdit) {
      store.update('expenses', existing.id, { ...payload, amountCents: total });
      closeSheet();
      toast('Gasto actualizado.');
      return;
    }

    const n = draft.installments;
    if (n > 1) {
      const groupId = uid();
      const per = Math.floor(total / n);
      const extra = total - per * n; // el resto va en la primera cuota
      for (let i = 0; i < n; i += 1) {
        const m = addMonths(monthKey(draft.date), i);
        const day = clampDay(m, Number(draft.date.slice(8, 10)));
        store.add('expenses', {
          ...payload,
          date: `${m}-${String(day).padStart(2, '0')}`,
          description: `${draft.description} (${i + 1}/${n})`,
          amountCents: per + (i === 0 ? extra : 0),
          installment: { groupId, n: i + 1, of: n },
          createdAt: new Date().toISOString(),
        });
      }
      closeSheet();
      toast(`Cargado en ${n} cuotas de ${fmt(per)}.`);
      return;
    }

    const created = store.add('expenses', { ...payload, amountCents: total, createdAt: new Date().toISOString() });
    closeSheet();
    toast(`${fmt(total)} en ${store.category(draft.categoryId).name}.`, {
      action: 'Deshacer',
      onAction: () => { store.remove('expenses', created.id); toast('Gasto eliminado.'); },
    });
  }

  async function del() {
    const ok = await confirmSheet('¿Borrar este gasto?', `Se elimina "${existing.description}" de ${fmt(existing.amountCents)}.`, {
      confirmText: 'Borrar', danger: true,
    });
    if (!ok) return;
    store.remove('expenses', existing.id);
    toast('Gasto eliminado.', {
      action: 'Deshacer',
      onAction: () => store.restore('expenses', existing.id),
    });
  }

  const body = el('div', {}, [
    field('Monto', amountInput),
    monedaSeg,
    monedaWrap,
    el('div', { style: 'height:13px' }),
    field('Descripción', descInput),
    el('div', { class: 'grid-2', style: 'margin-bottom:13px' }, [
      field('Fecha', dateInput),
      !isEdit ? field('Cuotas', cuotasInput, '1 = pago único') : null,
    ]),
    field('Categoría', catPicker),
    field('¿Quién pagó?', payerSeg),
    field('División', splitSeg),
    customWrap,
    el('div', { style: 'margin:12px 0' }, [preview]),
    field('Nota (opcional)', el('textarea', {
      class: 'textarea',
      placeholder: 'Detalle, número de factura, lo que sirva…',
      oninput: (e) => { draft.note = e.target.value; },
    }, draft.note)),
    footerButtons(isEdit ? 'Guardar' : 'Agregar gasto', save, {
      extra: isEdit ? el('button', { class: 'btn btn--danger', type: 'button', text: 'Borrar', onclick: del }) : null,
    }),
  ]);

  renderCustom();
  renderMoneda();
  renderPreview();
  openSheet(isEdit ? 'Editar gasto' : 'Nuevo gasto', body);
  if (!isEdit) setTimeout(() => amountInput.focus(), 60);
}
