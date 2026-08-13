/* Ajustes: personas, categorías, presupuestos, sincronización y backups. */

import { el, toCents, fromCents, randomCode, download, today, currentMonth, monthLabel, SIN_DESCARGA } from '../util.js';
import * as store from '../store.js';
import { toCsv } from '../calc.js';
import {
  fmt, listCard, listItem, field, input, segmented, footerButtons,
  openSheet, closeSheet, toast, confirmSheet, avatar,
} from '../ui.js';
import * as sync from '../sync.js';
import { applyTheme } from '../theme.js';
import { navigate } from '../router.js';
import { openIncomeForm } from './dashboard.js';


/* --------------------------------------------------------------- personas */

function openPersonColor(personObj) {
  let color = personObj.color;
  const colors = ['#2a78d6', '#eb6834', '#1baf7a', '#4a3aa7', '#e87ba4', '#eda100', '#008300', '#e34948'];
  const swatches = el('div', { class: 'chips' }, colors.map((c) => {
    const btn = el('button', {
      class: 'chip', type: 'button', 'aria-pressed': c === color, 'aria-label': `Color ${c}`,
      style: 'width:40px;height:40px;padding:0;justify-content:center',
      onclick: () => {
        color = c;
        [...swatches.children].forEach((x) => x.setAttribute('aria-pressed', String(x === btn)));
      },
    }, [el('span', { style: `width:20px;height:20px;border-radius:50%;background:${c};display:block` })]);
    return btn;
  }));

  openSheet(`Color de ${personObj.name}`, el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:14px' },
      'Es el color con el que aparece en los gráficos y en la barra de quién puso la plata.'),
    swatches,
    footerButtons('Guardar', () => {
      store.update('people', personObj.id, { color });
      closeSheet();
    }),
  ]));
}

/* ------------------------------------------------------------ categorías */

function openCategoryForm(existing = null) {
  const isEdit = Boolean(existing);
  const nameInput = input({ type: 'text', placeholder: 'Nombre', value: existing?.name || '' });
  const emojiInput = input({ type: 'text', maxlength: '4', placeholder: '📦', value: existing?.emoji || '📦', style: 'max-width:90px;text-align:center;font-size:22px' });
  const budgetInput = input({
    type: 'text', inputmode: 'decimal', placeholder: 'Sin límite',
    value: existing?.budgetCents ? String(fromCents(existing.budgetCents)).replace('.', ',') : '',
  });

  function save() {
    const name = nameInput.value.trim();
    if (!name) { toast('Falta el nombre.'); return; }
    const payload = { name, emoji: emojiInput.value.trim() || '📦', budgetCents: toCents(budgetInput.value) };
    if (isEdit) store.update('categories', existing.id, payload);
    else store.add('categories', payload);
    closeSheet();
  }

  async function del() {
    const used = store.list('expenses').some((e) => e.categoryId === existing.id);
    const ok = await confirmSheet('¿Borrar la categoría?',
      used ? 'Hay gastos con esta categoría: van a quedar como "Otros".' : 'No hay gastos usándola.',
      { confirmText: 'Borrar', danger: true });
    if (!ok) return;
    store.remove('categories', existing.id);
    toast('Categoría eliminada.');
  }

  openSheet(isEdit ? 'Editar categoría' : 'Nueva categoría', el('div', {}, [
    el('div', { class: 'row', style: 'gap:10px;align-items:flex-end;margin-bottom:13px' }, [
      el('div', { style: 'flex:none' }, [field('Icono', emojiInput)]),
      el('div', { class: 'grow' }, [field('Nombre', nameInput)]),
    ]),
    field('Presupuesto mensual', budgetInput, 'Dejalo vacío si no querés un tope para esta categoría.'),
    footerButtons('Guardar', save, {
      extra: isEdit ? el('button', { class: 'btn btn--danger', type: 'button', text: 'Borrar', onclick: del }) : null,
    }),
  ]));
}

/* --------------------------------------------------------- escaneo de tickets */

function openClaveForm() {
  const keyInput = input({
    type: 'password', placeholder: 'sk-ant-…', value: store.config.anthropicKey || '',
    autocapitalize: 'off', spellcheck: 'false', autocomplete: 'off',
  });
  const verBtn = el('button', {
    class: 'linkbtn', type: 'button', text: 'Ver la clave',
    onclick: () => {
      const oculta = keyInput.type === 'password';
      keyInput.type = oculta ? 'text' : 'password';
      verBtn.textContent = oculta ? 'Ocultar la clave' : 'Ver la clave';
    },
  });

  openSheet('Escaneo de tickets', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:14px' },
      'Para leer la foto de un ticket hace falta una clave de la API de Claude. Se saca en console.anthropic.com → API Keys, y se paga por lo que uses (leer un ticket cuesta centavos).'),
    field('Clave de la API', keyInput, 'Queda guardada sólo en este navegador. No se sincroniza ni se sube a ningún lado.'),
    el('div', { style: 'margin:-6px 0 12px' }, [verBtn]),
    el('p', { class: 'field__hint' },
      'Sin clave podés igual pegar el texto del ticket: lo lee la app sola, sin internet y sin costo.'),
    footerButtons('Guardar', () => {
      const clave = keyInput.value.trim();
      store.saveConfig({ anthropicKey: clave });
      closeSheet();
      toast(clave ? 'Listo, ya podés escanear tickets.' : 'Escaneo por foto desactivado.');
    }, { secondaryLabel: 'Cerrar' }),
  ]));
}

/* ---------------------------------------------------------- sincronización */

function openSyncForm() {
  const urlInput = input({ type: 'url', placeholder: 'https://xxxx.supabase.co', value: store.config.supabaseUrl, autocapitalize: 'off', spellcheck: 'false' });
  const keyInput = input({ type: 'text', placeholder: 'eyJhbGci…', value: store.config.supabaseKey, autocapitalize: 'off', spellcheck: 'false' });
  const spaceInput = input({ type: 'text', placeholder: 'código del hogar', value: store.config.spaceId, autocapitalize: 'off', spellcheck: 'false' });
  const statusEl = el('p', { class: 'field__hint' });

  const genBtn = el('button', {
    class: 'linkbtn', type: 'button', text: 'Generar código nuevo',
    onclick: () => { spaceInput.value = randomCode(16); },
  });

  async function save() {
    const url = urlInput.value.trim().replace(/\/+$/, '');
    const key = keyInput.value.trim();
    const spaceId = spaceInput.value.trim();

    if (!url && !key && !spaceId) {
      store.saveConfig({ supabaseUrl: '', supabaseKey: '', spaceId: '', lastSyncAt: '' });
      closeSheet();
      toast('Sincronización desactivada. Los datos siguen en este dispositivo.');
      return;
    }
    if (!url || !key || !spaceId) { toast('Completá los tres campos.'); return; }

    statusEl.textContent = 'Probando la conexión…';
    try {
      await sync.testConnection({ url, key, spaceId });
    } catch (err) {
      statusEl.textContent = `✗ ${err.message}`;
      return;
    }
    store.saveConfig({ supabaseUrl: url, supabaseKey: key, spaceId });
    statusEl.textContent = '✓ Conectado. Sincronizando…';
    const result = await sync.sync();
    closeSheet();
    toast(result.ok ? 'Listo, sincronización activada.' : `No se pudo sincronizar: ${result.message || ''}`);
  }

  openSheet('Sincronizar entre celulares', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:14px' },
      'Para que los dos vean lo mismo hace falta una base gratuita en Supabase. Está explicado paso a paso en el README del proyecto: se crea el proyecto, se pega un script SQL y listo.'),
    field('URL del proyecto', urlInput),
    field('Clave pública (anon key)', keyInput),
    field('Código del hogar', spaceInput, 'El mismo código en los dos celulares. Tratalo como una contraseña.'),
    el('div', { style: 'margin:-6px 0 12px' }, [genBtn]),
    statusEl,
    footerButtons('Guardar y conectar', save, {
      secondaryLabel: 'Cerrar',
    }),
  ]));
}

function openShareCode() {
  const { supabaseUrl, supabaseKey, spaceId } = store.config;
  const payload = btoa(JSON.stringify({ u: supabaseUrl, k: supabaseKey, s: spaceId }));
  const link = `${location.origin}${location.pathname}#/unir/${payload}`;
  const box = input({ type: 'text', value: link, readonly: true, onclick: (e) => e.target.select() });

  openSheet('Sumar el otro celular', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:12px' },
      'Mandale este enlace a tu pareja y que lo abra en su teléfono: queda configurado solo. Es un enlace con las claves adentro, no lo publiques.'),
    field('Enlace de invitación', box),
    el('button', {
      class: 'btn btn--primary btn--block', type: 'button', text: 'Copiar enlace',
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast('Enlace copiado.');
        } catch {
          box.select();
          toast('Copialo a mano (quedó seleccionado).');
        }
      },
    }),
    navigator.share ? el('button', {
      class: 'btn btn--block', type: 'button', text: 'Compartir…', style: 'margin-top:8px',
      onclick: () => navigator.share({ title: 'PochoHouse', url: link }).catch(() => {}),
    }) : null,
  ]));
}

/* ------------------------------------------------------------------ vista */

export function renderSettings(root) {
  const s = store.state.settings;

  /* --- personas (fijas: siempre los mismos dos) --- */
  root.append(listCard(
    store.people().map((p) => listItem({
      icon: avatar(p),
      title: p.name,
      subtitle: store.me().id === p.id ? 'Sos vos en este dispositivo' : 'Tocá para cambiarle el color',
      onClick: () => openPersonColor(p),
    })),
    { title: 'Quiénes viven acá' },
  ));

  /* --- quién sos --- */
  root.append(el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [el('h2', { class: 'card__title grow', text: 'En este dispositivo soy…' })]),
    segmented(
      store.people().map((p) => ({ value: p.id, label: p.name })),
      store.me().id,
      (v) => {
        store.saveConfig({ meId: v });
        store.setSettings({ defaultPayer: v });
        toast('Listo. Los gastos nuevos van a arrancar con vos como quien pagó.');
      },
    ),
    el('p', { class: 'field__hint', style: 'margin-top:8px', text: 'Sirve para que cada uno cargue gastos con un toque menos.' }),
  ]));

  /* --- sueldos del mes en curso --- */
  const mesActual = currentMonth();
  root.append(listCard([
    ...store.people().map((p) => {
      const ing = store.incomeFor(p.id, mesActual);
      return listItem({
        icon: avatar(p),
        title: p.name,
        subtitle: ing.amountCents
          ? (ing.inherited ? `Arrastrado de ${monthLabel(ing.inheritedFrom, s.locale)}` : 'Cargado para este mes')
          : 'Sin cargar',
        amount: ing.amountCents,
        onClick: () => openIncomeForm(mesActual),
      });
    }),
    el('p', { class: 'field__hint', style: 'padding:11px 15px 14px' },
      'El líquido que cobran, ya con el alquiler descontado. Se arrastra solo de un mes al otro.'),
  ], { title: `Sueldos de ${monthLabel(mesActual, s.locale)}` }));

  /* --- moneda y preferencias --- */
  root.append(el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [el('h2', { class: 'card__title grow', text: 'Preferencias' })]),
    field('Cotización del dólar', input({
      type: 'text', inputmode: 'decimal', placeholder: '40,00',
      value: s.usdRateCents ? String(s.usdRateCents / 100).replace('.', ',') : '',
      onchange: (e) => {
        store.setSettings({ usdRateCents: toCents(e.target.value) });
        toast('Cotización guardada.');
      },
    }), 'Las cuentas son en pesos uruguayos. Esto sirve para cargar un gasto en dólares.'),
    field('División por defecto', segmented([
      { value: 'equal', label: 'Mitad y mitad' },
      { value: 'single', label: 'Lo paga quien carga' },
    ], s.defaultSplit || 'equal', (v) => store.setSettings({ defaultSplit: v }))),
    field('Tema', segmented([
      { value: 'auto', label: 'Automático' },
      { value: 'light', label: 'Claro' },
      { value: 'dark', label: 'Oscuro' },
    ], store.config.theme || 'auto', (v) => { store.saveConfig({ theme: v }); applyTheme(v); })),
  ]));

  /* --- categorías y presupuestos --- */
  const cats = store.categories();
  root.append(listCard([
    ...cats.map((c) => listItem({
      icon: c.emoji,
      title: c.name,
      subtitle: c.budgetCents ? `Presupuesto: ${fmt(c.budgetCents)} por mes` : 'Sin presupuesto',
      onClick: () => openCategoryForm(c),
    })),
    el('div', { style: 'padding:12px 15px' }, [
      el('button', { class: 'btn btn--sm btn--block', type: 'button', text: '＋ Nueva categoría', onclick: () => openCategoryForm() }),
    ]),
  ], { title: 'Categorías y presupuestos', meta: `${cats.length}` }));

  /* --- sincronización --- */
  const configured = sync.isConfigured();
  const last = store.config.lastSyncAt
    ? new Date(store.config.lastSyncAt).toLocaleString(s.locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  root.append(el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('h2', { class: 'card__title grow', text: 'Sincronización' }),
      el('span', { class: `tag ${configured ? 'tag--good' : ''}`, text: configured ? 'Activada' : 'Sólo este dispositivo' }),
    ]),
    el('p', { class: 'muted small', style: 'margin-bottom:12px' },
      configured
        ? `Los datos se comparten con quien tenga el mismo código.${last ? ` Última vez: ${last}.` : ''}`
        : 'Ahora mismo los gastos viven sólo en este teléfono. Activá la sincronización para que tu pareja vea lo mismo desde el suyo.'),
    el('div', { class: 'stack' }, [
      el('button', {
        class: `btn ${configured ? '' : 'btn--primary'} btn--block`, type: 'button',
        text: configured ? 'Cambiar configuración' : 'Configurar sincronización',
        onclick: openSyncForm,
      }),
      configured ? el('button', { class: 'btn btn--block', type: 'button', text: '🔗 Sumar el otro celular', onclick: openShareCode }) : null,
      configured ? el('button', {
        class: 'btn btn--block', type: 'button', text: 'Sincronizar ahora',
        onclick: async (e) => {
          e.target.disabled = true;
          const r = await sync.sync();
          e.target.disabled = false;
          toast(r.ok ? `Al día (${r.pushed} enviados, ${r.pulled} revisados).` : `No se pudo: ${r.message || r.reason}`);
        },
      }) : null,
    ]),
  ]));

  /* --- escaneo de tickets --- */
  const claveCargada = Boolean(store.config.anthropicKey);
  root.append(el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [
      el('h2', { class: 'card__title grow', text: 'Escanear tickets' }),
      el('span', { class: `tag ${claveCargada ? 'tag--good' : ''}`, text: claveCargada ? 'Activado' : 'Sin configurar' }),
    ]),
    el('p', { class: 'muted small', style: 'margin-bottom:12px' },
      claveCargada
        ? 'Sacás una foto del ticket en Compras y se cargan todos los productos.'
        : 'Con una clave de Claude podés sacarle una foto al ticket del súper y que se carguen todos los productos solos.'),
    el('button', {
      class: `btn ${claveCargada ? '' : 'btn--primary'} btn--block`, type: 'button',
      text: claveCargada ? 'Cambiar la clave' : 'Configurar el escaneo',
      onclick: openClaveForm,
    }),
  ]));

  /* --- copias de seguridad --- */
  const fileInput = el('input', {
    type: 'file', accept: 'application/json', class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const n = store.importData(text, { mode: 'merge' });
        toast(`Importados ${n} registros.`);
      } catch (err) {
        toast(`No se pudo leer el archivo: ${err.message}`);
      }
      e.target.value = '';
    },
  });

  root.append(el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [el('h2', { class: 'card__title grow', text: 'Copias de seguridad' })]),
    el('p', { class: 'muted small', style: 'margin-bottom:12px', text: 'Guardá un archivo con todo por las dudas, o pasá los datos a otro teléfono sin usar la nube.' }),
    el('div', { class: 'stack' }, [
      el('button', {
        class: 'btn btn--block', type: 'button', text: '⬇ Descargar backup (JSON)',
        onclick: () => {
          const ok = download(`pochohouse-${today()}.json`, store.exportData());
          toast(ok ? 'Backup descargado.' : SIN_DESCARGA);
        },
      }),
      el('button', {
        class: 'btn btn--block', type: 'button', text: '⬆ Importar backup',
        onclick: () => fileInput.click(),
      }),
      el('button', {
        class: 'btn btn--block', type: 'button', text: '⬇ Exportar todo a CSV',
        onclick: () => {
          const ok = download(`gastos-completo-${today()}.csv`, toCsv(), 'text/csv');
          toast(ok ? 'CSV descargado.' : SIN_DESCARGA);
        },
      }),
      fileInput,
    ]),
  ]));

  /* --- zona peligrosa --- */
  root.append(el('section', { class: 'card' }, [
    el('div', { class: 'card__head' }, [el('h2', { class: 'card__title grow', text: 'Otras cosas' })]),
    el('div', { class: 'stack' }, [
      el('button', {
        class: 'btn btn--block', type: 'button', text: '🎯 Metas de ahorro', onclick: () => navigate('metas'),
      }),
      store.list('expenses').length === 0 ? el('button', {
        class: 'btn btn--block', type: 'button', text: '✨ Cargar datos de ejemplo',
        onclick: () => { store.seedDemo(); toast('Listo, mirá el resumen.'); navigate('resumen'); },
      }) : null,
      el('button', {
        class: 'btn btn--block btn--danger', type: 'button', text: 'Borrar todo y empezar de cero',
        onclick: async () => {
          const ok = await confirmSheet('¿Borrar todo?',
            'Se borran gastos, fijos, listas y metas de este dispositivo. Descargá un backup antes si no estás seguro.',
            { confirmText: 'Borrar todo', danger: true });
          if (!ok) return;
          store.resetAll();
          toast('Todo limpio.');
          navigate('resumen');
        },
      }),
    ]),
  ]));

  root.append(el('p', {
    class: 'muted small center',
    style: 'margin:18px 0 8px',
    text: 'PochoHouse · funciona sin internet · los datos son suyos',
  }));
}
