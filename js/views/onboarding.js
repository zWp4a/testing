/* Primer arranque: nombres, moneda y (opcional) datos de ejemplo. */

import { el } from '../util.js';
import * as store from '../store.js';
import { field, input, select, footerButtons, openSheet, closeSheet, toast } from '../ui.js';
import { navigate } from '../router.js';

const CURRENCIES = [
  { value: 'ARS', label: 'Peso argentino ($)' },
  { value: 'USD', label: 'Dólar (US$)' },
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'CLP', label: 'Peso chileno' },
  { value: 'COP', label: 'Peso colombiano' },
  { value: 'MXN', label: 'Peso mexicano' },
  { value: 'UYU', label: 'Peso uruguayo' },
  { value: 'PEN', label: 'Sol peruano' },
  { value: 'BRL', label: 'Real brasileño' },
];

export function openOnboarding() {
  const roster = store.people();
  const meInput = input({ type: 'text', placeholder: 'Tu nombre', value: '', autocomplete: 'given-name' });
  const otherInput = input({ type: 'text', placeholder: 'El de tu pareja', value: '', autocomplete: 'off' });
  const currencySel = select(CURRENCIES, store.state.settings.currency);
  const demoBox = input({ type: 'checkbox', class: 'switch__box' });

  function finish() {
    const myName = meInput.value.trim() || 'Yo';
    const otherName = otherInput.value.trim() || 'Mi pareja';
    store.update('people', roster[0].id, { name: myName });
    store.update('people', roster[1].id, { name: otherName });
    store.setSettings({ currency: currencySel.value, defaultPayer: roster[0].id });
    store.saveConfig({ meId: roster[0].id, onboarded: true });
    if (demoBox.checked) store.seedDemo();
    closeSheet();
    toast(`¡Bienvenidos! Cargá el primer gasto con el botón ＋.`, { ms: 5000 });
    navigate('resumen');
  }

  function skip() {
    store.saveConfig({ onboarded: true });
    closeSheet();
  }

  openSheet('Bienvenidos 🏡', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:16px' },
      'Esto lleva la cuenta de los gastos de la casa entre los dos: quién pagó qué, cuánto le toca a cada uno y qué falta pagar este mes.'),
    el('div', { class: 'grid-2', style: 'margin-bottom:13px' }, [
      field('Vos sos', meInput),
      field('Y ella/él', otherInput),
    ]),
    field('Moneda', currencySel),
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
      'Todo se guarda en tu teléfono. Si querés que los dos vean lo mismo, activá la sincronización en Ajustes.'),
    footerButtons('Empezar', finish, { secondaryLabel: 'Después', onSecondary: skip }),
  ]));
}
