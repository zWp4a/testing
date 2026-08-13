/* Lectura de tickets: de una foto (o del texto pegado) a una lista de productos.
 *
 * La foto se manda a la API de Claude, que devuelve los renglones ya
 * ordenados. Requiere una clave propia, que se carga en Ajustes y queda
 * guardada sólo en este navegador — nunca se sube al repositorio ni viaja
 * con la sincronización.
 *
 * Sin clave, el pegado de texto sigue funcionando: se parsea acá mismo, sin
 * red y sin costo.
 */

import { config } from './store.js';
import { toCents } from './util.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODELO = 'claude-opus-5';

/* Lado largo máximo de la foto que mandamos. Los tickets tienen letra chica:
   bajar de acá empieza a costar renglones mal leídos. */
const LADO_MAXIMO = 2000;

export function tieneClave() {
  return Boolean(config.anthropicKey);
}

/* ------------------------------------------------------------- la imagen */

/**
 * Reduce la foto antes de mandarla: una foto de celular pesa varios MB y
 * tarda una eternidad en subir por datos móviles.
 * @returns {Promise<{base64: string, mediaType: string}>}
 */
export function prepararImagen(file) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la foto.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no parece una imagen.'));
      img.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala);
        const h = Math.round(img.height * escala);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------ la llamada */

const ESQUEMA = {
  type: 'object',
  properties: {
    comercio: { type: 'string', description: 'Nombre del comercio, o cadena vacía si no se ve.' },
    fecha: { type: 'string', description: 'Fecha del ticket en formato YYYY-MM-DD, o cadena vacía.' },
    moneda: { type: 'string', enum: ['UYU', 'USD'], description: 'Moneda del ticket.' },
    total: { type: 'number', description: 'Total pagado según el ticket. 0 si no se ve.' },
    productos: {
      type: 'array',
      description: 'Un elemento por renglón de producto del ticket.',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string', description: 'Nombre del producto tal como figura, en minúsculas salvo la inicial.' },
          cantidad: { type: 'number', description: 'Unidades o kilos. 1 si el ticket no lo aclara.' },
          precioTotal: { type: 'number', description: 'Lo que se pagó por ese renglón.' },
        },
        required: ['nombre', 'cantidad', 'precioTotal'],
        additionalProperties: false,
      },
    },
  },
  required: ['comercio', 'fecha', 'moneda', 'total', 'productos'],
  additionalProperties: false,
};

const INSTRUCCIONES = [
  'Esta es la foto de un ticket de compra, casi siempre de un supermercado de Uruguay.',
  'Extraé todos los renglones de productos con su precio.',
  '',
  'Tené en cuenta:',
  '- Los precios usan coma decimal (1.234,56 son mil doscientos treinta y cuatro con 56).',
  '- Devolvé los números como números, sin símbolos de moneda ni separadores de miles.',
  '- "precioTotal" es lo que se pagó por ese renglón, no el precio unitario.',
  '- Los renglones de descuento, ahorro o promoción van con precioTotal negativo.',
  '- No incluyas subtotales, IVA, medios de pago, ni el total general en la lista de productos.',
  '- Si un renglón está borroso o cortado, incluilo igual con lo que se llegue a leer.',
  '- Si la foto no es un ticket, devolvé la lista de productos vacía y total 0.',
].join('\n');

/**
 * Manda la foto a Claude y devuelve los productos leídos.
 * @returns {Promise<{comercio, fecha, moneda, total, productos}>}
 */
export async function leerTicket(file) {
  if (!tieneClave()) throw new Error('Falta la clave de Claude. Se carga en Ajustes.');

  const { base64, mediaType } = await prepararImagen(file);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
        // Sin esto el navegador no puede llamar a la API directamente.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8000,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: ESQUEMA },
        },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: INSTRUCCIONES },
          ],
        }],
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('El ticket tardó demasiado. Probá con una foto más nítida.');
    throw new Error('No se pudo conectar. Revisá que tengas internet.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(await describirError(res));

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('La foto no se pudo procesar. Probá sacándola de nuevo, sólo del ticket.');
  }
  const texto = (data.content || []).find((b) => b.type === 'text')?.text;
  if (!texto) throw new Error('La respuesta vino vacía. Probá de nuevo.');

  let leido;
  try {
    leido = JSON.parse(texto);
  } catch {
    throw new Error('No se entendió la respuesta. Probá con otra foto.');
  }
  return normalizar(leido);
}

async function describirError(res) {
  let detalle = '';
  try {
    const cuerpo = await res.json();
    detalle = cuerpo?.error?.message || '';
  } catch { /* sin cuerpo legible */ }

  if (res.status === 401) return 'La clave de Claude no es válida. Revisala en Ajustes.';
  if (res.status === 403) return 'La clave no tiene permiso para usar este modelo.';
  if (res.status === 400 && /credit|balance/i.test(detalle)) return 'La cuenta de Claude no tiene saldo.';
  if (res.status === 429) return 'Demasiados pedidos seguidos. Esperá un minuto y probá de nuevo.';
  if (res.status >= 500) return 'La API de Claude está caída. Probá en un rato.';
  return `No se pudo leer el ticket (error ${res.status})${detalle ? `: ${detalle.slice(0, 120)}` : ''}.`;
}

/* --------------------------------------------- pegar el texto del ticket */

/**
 * Salida de emergencia sin clave ni internet: muchos celulares copian el texto
 * de una foto. Cada renglón se lee como "producto ... precio".
 */
export function parsearTexto(texto) {
  const productos = [];
  const ignorar = /^(sub\s*total|total|iva|efectivo|cambio|vuelto|tarjeta|débito|debito|crédito|credito|cuf|rut|caj|ticket|gracias|nro|n°)/i;

  String(texto || '').split(/\r?\n/).forEach((renglonCrudo) => {
    const renglon = renglonCrudo.trim();
    if (renglon.length < 3) return;
    if (ignorar.test(renglon)) return;

    // El precio es el último número del renglón.
    const numeros = renglon.match(/-?\d{1,3}(?:[.\s]\d{3})*,\d{2}|-?\d+[.,]\d{2}|-?\d+/g);
    if (!numeros || !numeros.length) return;
    const precio = toCents(numeros[numeros.length - 1]);
    if (!precio) return;

    let nombre = renglon.slice(0, renglon.lastIndexOf(numeros[numeros.length - 1])).trim();
    nombre = nombre.replace(/[x*·|-]+\s*$/i, '').trim();

    // "2 x 45,00" al final del nombre: el primer número es la cantidad.
    let cantidad = 1;
    const conCantidad = nombre.match(/^(\d+(?:[.,]\d+)?)\s*[xX]?\s+(.+)$/);
    if (conCantidad) {
      cantidad = Number(conCantidad[1].replace(',', '.')) || 1;
      nombre = conCantidad[2].trim();
    }
    if (nombre.length < 2) return;

    productos.push({
      nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase(),
      cantidad,
      precioTotal: precio / 100,
    });
  });

  return normalizar({
    comercio: '',
    fecha: '',
    moneda: 'UYU',
    total: productos.reduce((s, p) => s + p.precioTotal, 0),
    productos,
  });
}

/* ---------------------------------------------------------- normalización */

function normalizar(leido) {
  const productos = (Array.isArray(leido.productos) ? leido.productos : [])
    .map((p) => ({
      nombre: String(p.nombre || '').trim().slice(0, 80),
      cantidad: Number(p.cantidad) > 0 ? Number(p.cantidad) : 1,
      precioCents: Math.round(Number(p.precioTotal || 0) * 100),
    }))
    .filter((p) => p.nombre);

  const sumado = productos.reduce((s, p) => s + p.precioCents, 0);
  const declarado = Math.round(Number(leido.total || 0) * 100);

  return {
    comercio: String(leido.comercio || '').trim().slice(0, 60),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(leido.fecha || '') ? leido.fecha : '',
    moneda: leido.moneda === 'USD' ? 'USD' : 'UYU',
    // Si el total del ticket no se leyó, la suma de los renglones sirve igual.
    totalCents: declarado > 0 ? declarado : sumado,
    sumaCents: sumado,
    productos,
  };
}
