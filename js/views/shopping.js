/* Lista de compras compartida: se marca en el súper y se cierra como gasto. */

import { el, toCents, fromCents, today } from '../util.js';
import * as store from '../store.js';
import { shoppingSummary } from '../calc.js';
import {
  fmt, emptyState, field, input, select, segmented, footerButtons,
  openSheet, closeSheet, toast, confirmSheet,
} from '../ui.js';
import { openScanForm } from './scan-form.js';

function itemPrice(item) {
  return (item.estPriceCents || item.lastPriceCents || 0) * (item.qty || 1);
}

function openItemForm(existing) {
  const draft = { ...existing };
  const nameInput = input({ type: 'text', value: draft.name });
  const qtyInput = input({ type: 'number', min: '0', step: '0.5', inputmode: 'decimal', value: draft.qty || 1 });
  const unitInput = input({ type: 'text', placeholder: 'kg, l, paq…', value: draft.unit || '' });
  const priceInput = input({
    type: 'text', inputmode: 'decimal', placeholder: '0,00',
    value: draft.estPriceCents ? String(fromCents(draft.estPriceCents)).replace('.', ',') : '',
  });
  const stapleBox = input({ type: 'checkbox', class: 'switch__box', checked: draft.staple });

  function save() {
    const name = nameInput.value.trim();
    if (!name) { toast('Falta el nombre.'); return; }
    store.update('shopping', existing.id, {
      name,
      qty: Number(qtyInput.value) || 1,
      unit: unitInput.value.trim(),
      estPriceCents: toCents(priceInput.value),
      staple: stapleBox.checked,
    });
    closeSheet();
  }

  async function del() {
    const ok = await confirmSheet('¿Sacarlo de la lista?', `Se elimina "${existing.name}".`, { confirmText: 'Sacar', danger: true });
    if (!ok) return;
    store.remove('shopping', existing.id);
    toast('Producto eliminado.', { action: 'Deshacer', onAction: () => store.restore('shopping', existing.id) });
  }

  openSheet('Editar producto', el('div', {}, [
    field('Producto', nameInput),
    el('div', { class: 'grid-2', style: 'margin-bottom:13px' }, [
      field('Cantidad', qtyInput),
      field('Unidad', unitInput),
    ]),
    field('Precio estimado (por unidad)', priceInput,
      existing.lastPriceCents ? `La última vez salió ${fmt(existing.lastPriceCents)}.` : 'Opcional: sirve para estimar el total.'),
    el('label', { class: 'field' }, [
      el('span', { class: 'switch' }, [
        el('span', {}, [
          el('span', { class: 'field__label', style: 'margin:0', text: 'Producto habitual' }),
          el('span', { class: 'field__hint', style: 'margin-top:2px', text: 'Vuelve solo a la lista cuando empezás una compra nueva.' }),
        ]),
        stapleBox,
      ]),
    ]),
    footerButtons('Guardar', save, {
      extra: el('button', { class: 'btn btn--danger', type: 'button', text: 'Borrar', onclick: del }),
    }),
  ]));
}

/** Cierra la compra: crea el gasto con lo marcado y limpia la lista. */
function openCheckout(summary) {
  const roster = store.people();
  const marked = summary.done;
  if (!marked.length) { toast('Marcá primero lo que compraste.'); return; }

  const amountInput = input({
    class: 'input input--amount', type: 'text', inputmode: 'decimal',
    value: summary.cartCents ? String(fromCents(summary.cartCents)).replace('.', ',') : '',
    'aria-label': 'Total',
  });
  let payer = store.me().id;
  let splitMode = 'equal';
  const catSel = select(
    store.categories().map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` })),
    'super',
  );
  const clearBox = input({ type: 'checkbox', class: 'switch__box', checked: true });

  function save() {
    const cents = toCents(amountInput.value);
    if (cents <= 0) { toast('Poné cuánto pagaste.'); return; }
    store.add('expenses', {
      date: today(),
      description: `Compra (${marked.length} producto${marked.length === 1 ? '' : 's'})`,
      amountCents: cents,
      categoryId: catSel.value,
      paidBy: payer,
      splitMode,
      splitTo: splitMode === 'single' ? payer : null,
      splitPct: null,
      note: marked.map((i) => i.name).join(', ').slice(0, 500),
      createdAt: new Date().toISOString(),
    });

    // Guardamos el precio estimado como "último precio" para la próxima vuelta.
    marked.forEach((i) => {
      if (i.estPriceCents) store.update('shopping', i.id, { lastPriceCents: i.estPriceCents });
    });

    if (clearBox.checked) {
      marked.forEach((i) => {
        if (i.staple) store.update('shopping', i.id, { done: false });
        else store.remove('shopping', i.id);
      });
    }
    closeSheet();
    toast(`Compra de ${fmt(cents)} cargada como gasto.`);
  }

  openSheet('Cerrar la compra', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:12px', text: `${marked.length} producto${marked.length === 1 ? '' : 's'} marcado${marked.length === 1 ? '' : 's'}. El estimado era ${fmt(summary.cartCents)}.` }),
    field('Total que pagaste', amountInput),
    field('Categoría', catSel),
    field('¿Quién pagó?', segmented(roster.map((p) => ({ value: p.id, label: p.name })), payer, (v) => { payer = v; })),
    field('División', segmented([
      { value: 'equal', label: 'Mitad y mitad' },
      { value: 'single', label: 'Lo banca quien pagó' },
    ], 'equal', (v) => { splitMode = v; })),
    el('label', { class: 'field' }, [
      el('span', { class: 'switch' }, [
        el('span', {}, [
          el('span', { class: 'field__label', style: 'margin:0', text: 'Vaciar la lista' }),
          el('span', { class: 'field__hint', style: 'margin-top:2px', text: 'Los productos habituales vuelven destildados.' }),
        ]),
        clearBox,
      ]),
    ]),
    footerButtons('Cargar como gasto', save),
  ]));
}

export function renderShopping(root) {
  const summary = shoppingSummary();
  const { items, pending, done } = summary;

  /* --- alta rápida --- */
  const quick = input({
    type: 'text', placeholder: 'Agregar producto…', enterkeyhint: 'done', autocomplete: 'off',
    dataset: { focusKey: 'quickadd' },
    onkeydown: (e) => { if (e.key === 'Enter') addQuick(); },
  });
  function addQuick() {
    const name = quick.value.trim();
    if (!name) return;
    // "2 leche" o "leche x2" se entienden como cantidad + producto.
    let qty = 1;
    let label = name;
    const m1 = name.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
    const m2 = name.match(/^(.+?)\s*[xX]\s*(\d+(?:[.,]\d+)?)$/);
    if (m1) { qty = Number(m1[1].replace(',', '.')); label = m1[2]; }
    else if (m2) { label = m2[1]; qty = Number(m2[2].replace(',', '.')); }

    store.add('shopping', {
      name: label.charAt(0).toUpperCase() + label.slice(1),
      qty, unit: '', estPriceCents: 0, done: false, staple: false, lastPriceCents: 0,
    });
    quick.value = '';
    quick.focus();
  }

  root.append(el('button', {
    class: 'btn btn--block', type: 'button', style: 'margin-bottom:12px',
    text: '📷 Escanear ticket',
    onclick: openScanForm,
  }));

  const card = el('section', { class: 'card card--flush' }, [
    el('div', { class: 'quickadd' }, [
      quick,
      el('button', { class: 'btn btn--primary', type: 'button', text: 'Agregar', onclick: addQuick }),
    ]),
  ]);

  if (!items.length) {
    card.append(emptyState('🛒', 'Lista vacía',
      'Escribí arriba lo que falta en casa. Marcá los habituales para que vuelvan solos cada mes.'));
    root.append(card);
    return;
  }

  const renderRow = (item) => {
    const price = itemPrice(item);
    const check = el('input', {
      type: 'checkbox', class: 'shop__check', checked: item.done,
      'aria-label': `Marcar ${item.name}`,
      onchange: () => store.update('shopping', item.id, { done: !item.done }),
    });
    return el('div', { class: `shop__item${item.done ? ' is-done' : ''}` }, [
      check,
      el('button', {
        class: 'shop__body',
        type: 'button',
        style: 'background:none;border:none;text-align:left;font:inherit;color:inherit;padding:0',
        onclick: () => openItemForm(item),
      }, [
        el('span', { class: 'shop__name', text: item.name }),
        el('span', { class: 'shop__meta' }, [
          (item.qty && item.qty !== 1) || item.unit ? `${item.qty || 1}${item.unit ? ` ${item.unit}` : ''}` : '',
          item.staple ? ((item.qty && item.qty !== 1) || item.unit ? ' · habitual' : 'habitual') : '',
        ]),
      ]),
      price ? el('span', { class: 'shop__price', text: fmt(price) }) : null,
    ]);
  };

  if (pending.length) {
    card.append(el('div', { class: 'list__group', text: `Faltan (${pending.length})` }));
    pending.forEach((i) => card.append(renderRow(i)));
  }
  if (done.length) {
    card.append(el('div', { class: 'list__group row row--between' }, [
      el('span', { text: `En el carrito (${done.length})` }),
      el('span', { class: 'num', text: fmt(summary.cartCents) }),
    ]));
    done.forEach((i) => card.append(renderRow(i)));
  }

  root.append(card);

  root.append(el('section', { class: 'card' }, [
    el('div', { class: 'row row--between', style: 'margin-bottom:4px' }, [
      el('span', { class: 'muted small', text: 'Estimado de toda la lista' }),
      el('span', { class: 'num', style: 'font-weight:660;font-size:18px', text: fmt(summary.estimatedCents) }),
    ]),
    el('p', { class: 'field__hint', text: 'El estimado usa el precio que cargues en cada producto (o el de la última compra).' }),
  ]));

  root.append(el('div', { class: 'stack' }, [
    el('button', {
      class: 'btn btn--primary btn--block', type: 'button',
      text: `Cerrar compra y cargar gasto${summary.cartCents ? ` · ${fmt(summary.cartCents)}` : ''}`,
      disabled: !done.length,
      onclick: () => openCheckout(shoppingSummary()),
    }),
    el('div', { class: 'row', style: 'gap:8px' }, [
      el('button', {
        class: 'btn btn--sm grow', type: 'button', text: 'Destildar todo',
        onclick: () => {
          store.list('shopping').filter((i) => i.done).forEach((i) => store.update('shopping', i.id, { done: false }));
          toast('Lista destildada.');
        },
      }),
      el('button', {
        class: 'btn btn--sm grow', type: 'button', text: 'Nueva lista del mes',
        onclick: async () => {
          const ok = await confirmSheet('¿Empezar una lista nueva?',
            'Se borran los productos sueltos y quedan sólo los habituales, destildados.', { confirmText: 'Empezar' });
          if (!ok) return;
          store.list('shopping').forEach((i) => {
            if (i.staple) store.update('shopping', i.id, { done: false });
            else store.remove('shopping', i.id);
          });
          toast('Lista lista para el mes.');
        },
      }),
    ]),
  ]));
}
