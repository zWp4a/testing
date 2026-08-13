/* Escanear un ticket: foto → productos → gasto cargado. */

import { el, toCents, fromCents, today, usdABase } from '../util.js';
import * as store from '../store.js';
import {
  fmt, fmtEn, field, input, segmented, footerButtons, openSheet, closeSheet, toast,
} from '../ui.js';
import { leerTicket, parsearTexto, tieneClave } from '../scan.js';
import { navigate } from '../router.js';

/* ------------------------------------------------------ elegir la entrada */

export function openScanForm() {
  const fileInput = el('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment', // en el celular abre la cámara directo
    class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await escanear(file);
    },
  });

  const conClave = tieneClave();

  const botonFoto = el('button', {
    class: `btn ${conClave ? 'btn--primary' : ''} btn--block`, type: 'button',
    text: '📷 Sacar foto del ticket',
    onclick: () => fileInput.click(),
  });

  const botonPegar = el('button', {
    class: `btn ${conClave ? '' : 'btn--primary'} btn--block`, type: 'button',
    text: '📝 Pegar el texto del ticket',
    onclick: openPegarTexto,
  });

  // Sin clave la foto no va a ningún lado: se ofrece primero lo que funciona.
  const body = el('div', {}, conClave ? [
    el('p', { class: 'muted small', style: 'margin-bottom:16px' },
      'Sacale una foto al ticket y se cargan todos los productos de una. Que se vean los renglones completos y sin sombras.'),
    botonFoto,
    fileInput,
    el('div', { class: 'divider' }),
    botonPegar,
    el('p', { class: 'field__hint', style: 'margin-top:8px' },
      'Pegar el texto no usa internet ni consume saldo, pero lee peor que la foto.'),
  ] : [
    el('p', { class: 'muted small', style: 'margin-bottom:16px' },
      'Copiá el texto del ticket desde la foto de tu celular y pegalo acá: la app lo lee sola, sin internet y sin costo.'),
    botonPegar,
    el('div', { class: 'divider' }),
    el('p', { class: 'field__hint', style: 'margin-bottom:10px' },
      'La foto directa carga todo de un toque, pero necesita una clave de Claude con saldo. Cuesta menos de un peso por ticket.'),
    el('button', {
      class: 'btn btn--block', type: 'button',
      text: 'Configurar el escaneo por foto',
      onclick: () => { closeSheet(); navigate('ajustes'); },
    }),
    fileInput,
  ]);

  openSheet('Escanear ticket', body);
}

async function escanear(file) {
  if (!tieneClave()) {
    toast('Configurá la clave de Claude en Ajustes para escanear por foto.');
    return;
  }

  openSheet('Leyendo el ticket…', el('div', { class: 'center', style: 'padding:26px 0' }, [
    el('div', { class: 'iconbtn is-spinning', style: 'font-size:30px;width:auto;height:auto' }, [
      el('span', { class: 'iconbtn__glyph', text: '⟳' }),
    ]),
    el('p', { class: 'muted small', style: 'margin-top:14px' },
      'Puede tardar hasta un minuto según la señal.'),
  ]));

  try {
    const leido = await leerTicket(file);
    if (!leido.productos.length) {
      openSheet('No se leyó nada', el('div', {}, [
        el('p', { class: 'muted small' },
          'No se encontraron productos en esa foto. Probá que entre el ticket completo, con buena luz y sin ángulo.'),
        footerButtons('Probar de nuevo', () => openScanForm(), { secondaryLabel: 'Cerrar' }),
      ]));
      return;
    }
    openRevision(leido);
  } catch (err) {
    openSheet('No se pudo leer', el('div', {}, [
      el('p', { class: 'muted small', text: err.message }),
      footerButtons('Probar de nuevo', () => openScanForm(), { secondaryLabel: 'Cerrar' }),
    ]));
  }
}

function openPegarTexto() {
  const area = el('textarea', {
    class: 'textarea',
    style: 'min-height:190px;font-family:ui-monospace,monospace;font-size:13px',
    placeholder: 'COCA COLA 1.5L      89,00\nPAN CASERO 2 x 45,00   90,00\n…',
  });

  openSheet('Pegar el texto del ticket', el('div', {}, [
    el('p', { class: 'muted small', style: 'margin-bottom:6px' },
      'Tu celular ya sabe leer el texto de una foto, gratis y sin cuenta:'),
    el('ul', { class: 'muted small', style: 'margin:0 0 14px;padding-left:20px;line-height:1.7' }, [
      el('li', {}, [el('strong', { text: 'iPhone' }), ': abrí la foto en Fotos, tocá el ícono de texto abajo a la derecha, ', el('em', { text: 'Seleccionar todo' }), ' y ', el('em', { text: 'Copiar' }), '.']),
      el('li', {}, [el('strong', { text: 'Android' }), ': abrí la foto y tocá ', el('strong', { text: 'Google Lens' }), ', después ', el('em', { text: 'Seleccionar todo' }), ' y ', el('em', { text: 'Copiar' }), '.']),
    ]),
    field('Texto del ticket', area),
    footerButtons('Leer', () => {
      const leido = parsearTexto(area.value);
      if (!leido.productos.length) {
        toast('No se reconoció ningún renglón con precio.');
        return;
      }
      openRevision(leido);
    }),
  ]));
}

/* ------------------------------------------------------------- revisión */

function openRevision(leido) {
  const roster = store.people();

  // Cada renglón se puede editar y desmarcar antes de confirmar.
  const filas = leido.productos.map((p) => ({ ...p, incluir: true }));

  let moneda = leido.moneda;
  let cotizacion = store.state.settings.usdRateCents || 0;
  let payer = store.me().id;
  let splitMode = 'equal';
  let sumarALista = true;

  const lista = el('div', { class: 'card card--flush', style: 'margin-bottom:12px' });
  const totalInput = input({
    class: 'input input--amount', type: 'text', inputmode: 'decimal',
    'aria-label': 'Total de la compra',
  });
  const resumen = el('p', { class: 'field__hint' });
  const cotizacionInput = input({
    type: 'text', inputmode: 'decimal', placeholder: '40,00',
    value: cotizacion ? String(cotizacion / 100).replace('.', ',') : '',
    oninput: (e) => { cotizacion = toCents(e.target.value); pintarResumen(); },
  });
  const cotizacionWrap = el('div');

  function sumaMarcada() {
    return filas.filter((f) => f.incluir).reduce((s, f) => s + f.precioCents, 0);
  }

  function totalEnPesos() {
    const escrito = toCents(totalInput.value);
    return moneda === 'USD' ? usdABase(escrito, cotizacion) : escrito;
  }

  function pintarResumen() {
    const marcados = filas.filter((f) => f.incluir).length;
    const suma = sumaMarcada();
    const total = totalEnPesos();
    const diferencia = total - (moneda === 'USD' ? usdABase(suma, cotizacion) : suma);

    resumen.replaceChildren(
      `${marcados} de ${filas.length} productos · suman ${moneda === 'USD' ? fmtEn(suma, 'USD') : fmt(suma)}`,
      Math.abs(diferencia) > 100
        ? el('span', { style: 'display:block;margin-top:4px;color:var(--text-secondary)' },
          `El total que cargás difiere en ${fmt(Math.abs(diferencia))} — puede ser por descuentos o renglones que no se leyeron.`)
        : null,
    );

    cotizacionWrap.replaceChildren();
    if (moneda === 'USD') {
      cotizacionWrap.append(
        field('Cotización del dólar', cotizacionInput),
        el('p', { class: 'field__hint', style: 'margin-top:-8px' },
          cotizacion ? `Se guarda como ${fmt(total)} en pesos.` : 'Falta la cotización.'),
      );
    }
  }

  function pintarLista() {
    lista.replaceChildren();
    filas.forEach((f, i) => {
      const check = el('input', {
        type: 'checkbox', class: 'shop__check', checked: f.incluir,
        'aria-label': `Incluir ${f.nombre}`,
        onchange: () => { f.incluir = !f.incluir; pintarLista(); pintarResumen(); },
      });
      const nombreInput = el('input', {
        class: 'shop__name', value: f.nombre,
        style: 'border:none;background:none;width:100%;font:inherit;color:inherit;padding:0',
        oninput: (e) => { f.nombre = e.target.value; },
      });
      const precioInput = el('input', {
        class: 'shop__price', inputmode: 'decimal',
        value: String(fromCents(f.precioCents)).replace('.', ','),
        style: 'border:none;background:none;width:88px;text-align:right;font:inherit;color:inherit;padding:0',
        'aria-label': `Precio de ${f.nombre}`,
        oninput: (e) => { filas[i].precioCents = toCents(e.target.value); pintarResumen(); },
      });
      lista.append(el('div', { class: `shop__item${f.incluir ? '' : ' is-done'}` }, [
        check,
        el('span', { class: 'shop__body' }, [
          nombreInput,
          f.cantidad && f.cantidad !== 1
            ? el('span', { class: 'shop__meta', text: `${f.cantidad}` })
            : null,
        ]),
        precioInput,
      ]));
    });
  }

  function guardar() {
    const marcados = filas.filter((f) => f.incluir);
    if (!marcados.length) { toast('No quedó ningún producto marcado.'); return; }
    const totalPesos = totalEnPesos();
    if (totalPesos <= 0) { toast('Poné cuánto pagaste.'); return; }
    if (moneda === 'USD' && !cotizacion) { toast('Falta la cotización del dólar.'); return; }

    const fx = moneda === 'USD'
      ? { currency: 'USD', amountCents: toCents(totalInput.value), rateCents: cotizacion }
      : null;
    if (fx) store.setSettings({ usdRateCents: cotizacion });

    store.add('expenses', {
      date: leido.fecha || today(),
      description: leido.comercio || `Compra (${marcados.length} productos)`,
      amountCents: totalPesos,
      fx,
      categoryId: 'super',
      paidBy: payer,
      splitMode,
      splitTo: splitMode === 'single' ? payer : null,
      splitPct: null,
      note: marcados.map((f) => f.nombre).join(', ').slice(0, 500),
      createdAt: new Date().toISOString(),
    });

    if (sumarALista) {
      // Quedan tildados: ya están comprados, y su precio sirve de referencia.
      marcados.forEach((f) => {
        store.add('shopping', {
          name: f.nombre,
          qty: f.cantidad || 1,
          unit: '',
          estPriceCents: 0,
          done: true,
          staple: false,
          lastPriceCents: f.cantidad > 1 ? Math.round(f.precioCents / f.cantidad) : f.precioCents,
        });
      });
    }

    closeSheet();
    toast(`Ticket cargado: ${fmt(totalPesos)} en ${marcados.length} productos.`);
  }

  const listaBox = el('input', { type: 'checkbox', class: 'switch__box', checked: sumarALista, onchange: (e) => { sumarALista = e.target.checked; } });

  const body = el('div', {}, [
    leido.comercio
      ? el('p', { class: 'muted small', style: 'margin-bottom:12px', text: `Ticket de ${leido.comercio}${leido.fecha ? ` · ${leido.fecha}` : ''}` })
      : el('p', { class: 'muted small', style: 'margin-bottom:12px', text: 'Revisá los renglones y corregí lo que haya salido mal.' }),

    lista,
    resumen,
    el('div', { class: 'divider' }),

    field('Total que pagaste', totalInput),
    segmented([
      { value: 'UYU', label: '$ Pesos' },
      { value: 'USD', label: 'US$ Dólares' },
    ], moneda, (v) => { moneda = v; pintarResumen(); }),
    cotizacionWrap,

    el('div', { style: 'height:13px' }),
    field('¿Quién pagó?', segmented(roster.map((p) => ({ value: p.id, label: p.name })), payer, (v) => { payer = v; })),
    field('División', segmented([
      { value: 'equal', label: 'Mitad y mitad' },
      { value: 'single', label: 'Lo banca quien pagó' },
    ], 'equal', (v) => { splitMode = v; })),

    el('label', { class: 'field' }, [
      el('span', { class: 'switch' }, [
        el('span', {}, [
          el('span', { class: 'field__label', style: 'margin:0', text: 'Sumarlos a la lista de compras' }),
          el('span', { class: 'field__hint', style: 'margin-top:2px', text: 'Quedan como comprados y con su precio, para estimar la próxima.' }),
        ]),
        listaBox,
      ]),
    ]),

    footerButtons('Cargar el ticket', guardar, { secondaryLabel: 'Descartar' }),
  ]);

  pintarLista();
  totalInput.value = String(fromCents(leido.totalCents)).replace('.', ',');
  totalInput.addEventListener('input', pintarResumen);
  pintarResumen();

  openSheet(`${leido.productos.length} productos leídos`, body);
}
