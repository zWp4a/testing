/* Primer arranque: quién sos, moneda y los sueldos del mes. */

import { el, toCents, currentMonth, monthLabel } from '../util.js';
import * as store from '../store.js';
import {
  field, input, segmented, footerButtons, openSheet, closeSheet, toast, avatar,
} from '../ui.js';
import { navigate } from '../router.js';


export function openOnboarding() {
  const roster = store.people();
  const mes = currentMonth();
  let meId = roster[0].id;

  const demoBox = input({ type: 'checkbox', class: 'switch__box', checked: Boolean(window.__pochoHousePreview) });

  const sueldos = new Map();
  const camposSueldo = roster.map((p) => {
    const box = input({
      class: 'input input--amount', type: 'text', inputmode: 'decimal',
      placeholder: '0,00', 'aria-label': `Líquido de ${p.name}`,
    });
    sueldos.set(p.id, box);
    return el('div', { style: 'margin-bottom:12px' }, [
      el('div', { class: 'row', style: 'margin-bottom:6px' }, [
        avatar(p),
        el('span', { class: 'field__label', style: 'margin:0', text: p.name }),
      ]),
      box,
    ]);
  });

  function finish() {
    store.setSettings({ defaultPayer: meId });
    store.saveConfig({ meId, onboarded: true });
    roster.forEach((p) => {
      const cents = toCents(sueldos.get(p.id).value);
      if (cents > 0) store.setIncome(p.id, mes, cents);
    });
    if (demoBox.checked) store.seedDemo();
    closeSheet();
    toast('¡Listo! Cargá el primer gasto con el botón ＋.', { ms: 5000 });
    navigate('resumen');
  }

  function skip() {
    store.saveConfig({ meId, onboarded: true });
    closeSheet();
  }

  openSheet('Bienvenidos 🏡', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:16px' },
      'Acá van los gastos de la casa. Cargan lo que cobran, se descuentan los gastos y siempre tienen a mano cuánto les queda a cada uno y a los dos.'),

    field('¿Quién sos en este teléfono?', segmented(
      roster.map((p) => ({ value: p.id, label: p.name })),
      meId,
      (v) => { meId = v; },
    ), 'Sirve para que cargues gastos con un toque menos.'),

    el('div', { class: 'divider' }),
    el('p', { class: 'field__label', text: `Sueldo líquido de ${monthLabel(mes, store.state.settings.locale)}` }),
    el('p', { class: 'field__hint', style: 'margin:-2px 0 12px' },
      'Lo que cobran de bolsillo, ya con el alquiler descontado. Se puede cargar después.'),
    ...camposSueldo,

    el('label', { class: 'field' }, [
      el('span', { class: 'switch' }, [
        el('span', {}, [
          el('span', { class: 'field__label', style: 'margin:0', text: 'Cargar datos de ejemplo' }),
          el('span', { class: 'field__hint', style: 'margin-top:2px', text: 'Para ver cómo queda. Después se borra desde Ajustes.' }),
        ]),
        demoBox,
      ]),
    ]),

    el('p', { class: 'field__hint', style: 'margin-bottom:4px' },
      'Todo se guarda en tu teléfono. Para que los dos vean lo mismo, activá la sincronización en Ajustes.'),
    footerButtons('Empezar', finish, { secondaryLabel: 'Después', onSecondary: skip }),
  ]));
}
