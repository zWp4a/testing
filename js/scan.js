/* Lectura de tickets: de una foto (o del texto pegado) a una lista de productos.
 *
 * La foto se manda a la API de Claude, que devuelve los renglones ya
 * ordenados. Requiere una clave propia, que se carga en Ajustes y queda
 * guardada sólo en este navegador — nunca se sube al repositorio ni viaja
 * con la sincronización.
 *
 * Sin clave, el pegado de texto sigue funcionando: se parsea acá mismo, sin
 * red y sin costo. Es el camino gratis, y el parser de abajo está hecho para
 * aguantar lo que escupen Live Text (iPhone) y Google Lens (Android).
 */

import { config } from './store.js';
import { toCents } from './util.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

/* Lado largo máximo de la foto que mandamos. Los tickets tienen letra chica:
   bajar de acá empieza a costar renglones mal leídos. */
const LADO_MAXIMO = 2000;

/* ------------------------------------------------------------- modelos */

/* `usdPorTicket` es una estimación con un ticket típico de supermercado:
   la foto pesa unos 2.500 tokens de entrada y la lista de productos otros
   1.200 de salida. Sirve para mostrar el costo en Ajustes, no para facturar.

   `efecto` marca los modelos que aceptan `output_config.effort`. Si alguno
   deja de aceptarlo, el reintento de `leerTicket` lo resuelve solo. */
export const MODELOS = [
  {
    id: 'claude-haiku-4-5',
    nombre: 'Rápido',
    detalle: 'El más barato y el más rápido. Alcanza para un ticket bien sacado.',
    usdPorTicket: 0.009,
    efecto: false,
  },
  {
    id: 'claude-sonnet-5',
    nombre: 'Equilibrado',
    detalle: 'Se defiende mejor con letra chica y renglones cortados.',
    usdPorTicket: 0.017,
    efecto: true,
  },
  {
    id: 'claude-opus-5',
    nombre: 'El que mejor lee',
    detalle: 'Para tickets arrugados, borrosos o muy largos.',
    usdPorTicket: 0.043,
    efecto: true,
  },
];

export const MODELO_POR_DEFECTO = 'claude-haiku-4-5';

export function modeloActual() {
  return MODELOS.find((m) => m.id === config.scanModel)
    || MODELOS.find((m) => m.id === MODELO_POR_DEFECTO);
}

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

/* Cuando el modelo no acepta el esquema, hay que pedirle el JSON a mano. */
const INSTRUCCIONES_JSON = [
  INSTRUCCIONES,
  '',
  'Respondé únicamente con un objeto JSON, sin texto alrededor ni bloques de código, con esta forma:',
  '{"comercio": "", "fecha": "YYYY-MM-DD", "moneda": "UYU", "total": 0,',
  ' "productos": [{"nombre": "", "cantidad": 1, "precioTotal": 0}]}',
].join('\n');

/* Se prueba de arriba hacia abajo. Cada escalón saca un parámetro que algún
   modelo podría no aceptar, así un 400 por parámetro no deja al usuario sin
   escáner en el medio del súper. */
const INTENTOS = [
  { efecto: true, esquema: true },
  { efecto: false, esquema: true },
  { efecto: false, esquema: false },
];

function armarCuerpo(modelo, imagen, intento) {
  const cuerpo = {
    model: modelo.id,
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imagen.mediaType, data: imagen.base64 } },
        { type: 'text', text: intento.esquema ? INSTRUCCIONES : INSTRUCCIONES_JSON },
      ],
    }],
  };

  const salida = {};
  if (intento.esquema) salida.format = { type: 'json_schema', schema: ESQUEMA };
  if (intento.efecto && modelo.efecto) salida.effort = 'low';
  if (Object.keys(salida).length) cuerpo.output_config = salida;

  return cuerpo;
}

/* Un 400 por un parámetro que este modelo no conoce se puede reintentar sin
   él; uno por falta de saldo o por la imagen, no. */
function esProblemaDeParametro(status, detalle) {
  if (status !== 400) return false;
  return /unexpected|unsupported|not supported|unrecognized|unknown|extra input|invalid[^.]*(parameter|field|argument)|output_config|effort|json_schema|schema/i
    .test(detalle);
}

/**
 * Manda la foto a Claude y devuelve los productos leídos.
 * @returns {Promise<{comercio, fecha, moneda, totalCents, sumaCents, productos}>}
 */
export async function leerTicket(file) {
  if (!tieneClave()) throw new Error('Falta la clave de Claude. Se carga en Ajustes.');

  const modelo = modeloActual();
  const imagen = await prepararImagen(file);

  let ultimoError = 'No se pudo leer el ticket.';

  for (let i = 0; i < INTENTOS.length; i += 1) {
    const intento = INTENTOS[i];

    // Saltea los escalones que no cambian nada para este modelo.
    if (intento.efecto && !modelo.efecto) continue;

    const res = await pedir(armarCuerpo(modelo, imagen, intento));

    if (res.ok) return normalizar(await leerRespuesta(res, intento));

    const detalle = await detalleDelError(res);
    ultimoError = mensajeDeError(res.status, detalle);

    if (!esProblemaDeParametro(res.status, detalle) || i === INTENTOS.length - 1) {
      throw new Error(ultimoError);
    }
  }

  throw new Error(ultimoError);
}

async function pedir(cuerpo) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    return await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicKey,
        'anthropic-version': '2023-06-01',
        // Sin esto el navegador no puede llamar a la API directamente.
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(cuerpo),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('El ticket tardó demasiado. Probá con una foto más nítida.');
    throw new Error('No se pudo conectar. Revisá que tengas internet.');
  } finally {
    clearTimeout(timer);
  }
}

async function leerRespuesta(res, intento) {
  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('La foto no se pudo procesar. Probá sacándola de nuevo, sólo del ticket.');
  }
  const texto = (data.content || []).find((b) => b.type === 'text')?.text;
  if (!texto) throw new Error('La respuesta vino vacía. Probá de nuevo.');

  const json = intento.esquema ? texto : recortarJson(texto);
  try {
    return JSON.parse(json);
  } catch {
    throw new Error('No se entendió la respuesta. Probá con otra foto.');
  }
}

/* Sin esquema el modelo puede envolver el JSON en explicaciones o en ```json. */
function recortarJson(texto) {
  const enBloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  const crudo = enBloque ? enBloque[1] : texto;
  const desde = crudo.indexOf('{');
  const hasta = crudo.lastIndexOf('}');
  return desde >= 0 && hasta > desde ? crudo.slice(desde, hasta + 1) : crudo;
}

async function detalleDelError(res) {
  try {
    const cuerpo = await res.json();
    return cuerpo?.error?.message || '';
  } catch {
    return '';
  }
}

function mensajeDeError(status, detalle) {
  if (status === 401) return 'La clave de Claude no es válida. Revisala en Ajustes.';
  if (status === 403) return 'La clave no tiene permiso para usar este modelo. Probá con otro en Ajustes.';
  if (status === 404) return 'Ese modelo no está disponible con tu clave. Elegí otro en Ajustes.';
  if (status === 400 && /credit|balance|saldo/i.test(detalle)) return 'La cuenta de Claude no tiene saldo.';
  if (status === 429) return 'Demasiados pedidos seguidos. Esperá un minuto y probá de nuevo.';
  if (status >= 500) return 'La API de Claude está caída. Probá en un rato.';
  return `No se pudo leer el ticket (error ${status})${detalle ? `: ${detalle.slice(0, 120)}` : ''}.`;
}

/* --------------------------------------------- pegar el texto del ticket */

/* Renglones que no son productos. Ojo: "descuento" solo sí es un producto
   (con precio negativo); lo que se ignora es el resumen de descuentos. */
const RUIDO = new RegExp([
  '^(sub\\s*-?\\s*total|total|iva|i\\.v\\.a|impuesto|imesi|redondeo)',
  '^(efectivo|contado|cambio|vuelto|su vuelto|entregado|recibido)',
  '^(tarjeta|d[ée]bito|cr[ée]dito|visa|master|oca|cabal|lider|midinero|abitab|redpagos|transferencia)',
  '^(forma de pago|medio de pago|abonado|paga con|pagado con)',
  '^(cuf|rut|r\\.u\\.t|dgi|cae|nro|n[°º]|caja|cajero|vendedor|terminal|suc|sucursal)',
  '^(ticket|e-?ticket|factura|comprobante|documento|serie|fecha|hora)',
  '^(gracias|vuelva|lo atendi|atendi[óo]|conserve|consulte|www\\.|http)',
  '^(socio|cliente|c[ée]dula|puntos|saldo|acumul)',
  '^(ahorro|total ahorrado|ahorraste|descuento total|total descuento)',
  '^(cantidad de|art[íi]culos|items|unidades)\\b',
].join('|'), 'i');

/* Formatos que aparecen en un ticket uruguayo: 1.234,56 · 89,00 · 1,234.56 · 12 */
const NUMERO = /-?\d{1,3}(?:\.\d{3})+,\d{1,2}|-?\d+,\d{1,2}|-?\d{1,3}(?:,\d{3})+\.\d{1,2}|-?\d+\.\d{1,2}|-?\d+/g;

/* "2 x 45,00" · "0,532 kg x 395,00".
   El precio unitario tiene que traer centavos: así "PROMO 2x1" no se confunde
   con una cantidad. */
const CANTIDAD = /(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilos?|grs?|g|lts?|l|un|u|c\/u)?\s*[x×*]\s*(\d[\d.]*[.,]\d{2})/i;

const CODIGO_SOLO = /^\d{7,}$/;

/* Fecha y hora del encabezado: nunca son un producto. */
const FECHA_U_HORA = /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}:\d{2}/;

function limpiarNombre(txt) {
  return String(txt)
    .replace(/^\d{6,}\s+/, '')        // código de barras adelante del nombre
    .replace(/^[\s.·*|>-]+/, '')      // viñetas y basura de OCR
    .replace(/[\s.·*|,>-]+$/, '')     // colgajos al final
    .replace(/\s+/g, ' ')
    .trim();
}

/** Interpreta un renglón suelto. `precioCents` en 0 significa "sin precio acá". */
function leerRenglon(linea) {
  const base = linea.replace(/[$]/g, ' ').replace(/\s+/g, ' ').trim();

  // Muchos tickets cierran el renglón con la letra del IVA: "89,00 A".
  const limpia = base.replace(
    /\s+[A-Za-z]{1,2}$/,
    (marca, donde) => (/\d$/.test(base.slice(0, donde)) ? '' : marca),
  );

  const numeros = [...limpia.matchAll(NUMERO)];
  if (!numeros.length) return { nombre: limpiarNombre(limpia), cantidad: 1, precioCents: 0 };

  const ultimo = numeros[numeros.length - 1];

  // El precio cierra el renglón. Si después del número sigue habiendo texto,
  // ese número es parte del nombre ("Leche 1L", "Av. Italia 2345 - Centro").
  if (ultimo.index + ultimo[0].length !== limpia.length) {
    return { nombre: limpiarNombre(limpia), cantidad: 1, precioCents: 0 };
  }

  const cant = limpia.match(CANTIDAD);

  let cantidad = 1;
  let precioCents;
  let corte;

  if (cant) {
    cantidad = Number(cant[1].replace(',', '.')) || 1;
    const finCantidad = cant.index + cant[0].length;
    precioCents = ultimo.index >= finCantidad
      // "2 x 45,00   90,00": el último número ya es el total del renglón.
      ? toCents(ultimo[0])
      // "2 x 45,00" solo: hay que multiplicar.
      : Math.round(toCents(cant[2]) * cantidad);
    corte = cant.index;
  } else {
    precioCents = toCents(ultimo[0]);
    corte = ultimo.index;
  }

  let nombre = limpiarNombre(limpia.slice(0, corte));

  // "2 LECHE" sin la x: el número de adelante es la cantidad.
  if (cantidad === 1) {
    const conCantidad = nombre.match(/^(\d{1,2})\s+(.{2,})$/);
    if (conCantidad) {
      cantidad = Number(conCantidad[1]) || 1;
      nombre = conCantidad[2];
    }
  }

  return { nombre, cantidad, precioCents };
}

function buscarTotal(lineas) {
  let total = 0;
  lineas.forEach((linea) => {
    if (!/^total\b/i.test(linea)) return;
    if (/ahorr|descuent|art[íi]cul|item|unidad/i.test(linea)) return;
    const numeros = [...linea.replace(/[$]/g, ' ').matchAll(NUMERO)];
    if (numeros.length) total = toCents(numeros[numeros.length - 1][0]);
  });
  return total;
}

function buscarFecha(lineas) {
  for (const linea of lineas) {
    const m = linea.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (!m) continue;
    const [, d, mes, anioCrudo] = m;
    const anio = anioCrudo.length === 2 ? `20${anioCrudo}` : anioCrudo;
    const iso = `${anio}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
    if (Number(mes) >= 1 && Number(mes) <= 12 && Number(d) >= 1 && Number(d) <= 31) return iso;
  }
  return '';
}

function buscarComercio(lineas) {
  for (const linea of lineas.slice(0, 6)) {
    if (RUIDO.test(linea) || CODIGO_SOLO.test(linea)) continue;
    const letras = (linea.match(/[a-záéíóúñ]/gi) || []).length;
    // Un encabezado es casi todo letras; un renglón de producto trae precio.
    if (letras >= 3 && letras / linea.length > 0.6) return linea.trim();
  }
  return '';
}

/**
 * Salida de emergencia sin clave ni internet: los celulares copian el texto de
 * una foto (Live Text en iPhone, Google Lens en Android) y acá se interpreta.
 *
 * Aguanta las formas habituales de un ticket uruguayo: el nombre y el precio
 * en renglones distintos, códigos de barras sueltos, cantidades por peso y
 * descuentos en negativo.
 */
export function parsearTexto(texto) {
  const lineas = String(texto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);

  const productos = [];
  let pendiente = '';   // nombre leído que todavía espera su precio

  lineas.forEach((linea) => {
    if (RUIDO.test(linea)) { pendiente = ''; return; }
    if (CODIGO_SOLO.test(linea)) return;   // código de barras en su propio renglón
    if (FECHA_U_HORA.test(linea)) return;  // ya la levanta buscarFecha

    const r = leerRenglon(linea);

    if (!r.precioCents) {
      // Renglón sin precio: probablemente el nombre, y el precio viene abajo.
      if (r.nombre.length >= 2) pendiente = r.nombre;
      return;
    }

    const nombre = r.nombre.length >= 2 ? r.nombre : pendiente;
    pendiente = '';
    if (nombre.length < 2) return;

    productos.push({ nombre, cantidad: r.cantidad, precioTotal: r.precioCents / 100 });
  });

  const total = buscarTotal(lineas);

  return normalizar({
    comercio: buscarComercio(lineas),
    fecha: buscarFecha(lineas),
    moneda: 'UYU',
    total: total ? total / 100 : productos.reduce((s, p) => s + p.precioTotal, 0),
    productos,
  });
}

/* ---------------------------------------------------------- normalización */

/* Los tickets vienen en mayúscula de imprenta y en la lista quedan a los
   gritos. Si el nombre ya viene escrito normal, se respeta tal cual; una
   minúscula suelta ("2x1") no alcanza para considerarlo bien escrito. */
function presentarNombre(nombre) {
  const letras = (nombre.match(/[a-záéíóúñ]/gi) || []).length;
  const mayusculas = (nombre.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
  if (!letras || mayusculas / letras < 0.8) return nombre;
  return nombre
    .toLowerCase()
    .replace(/(^|\s)([a-záéíóúñ])/g, (_, sep, letra) => sep + letra.toUpperCase())
    .replace(/\b(\d+[a-z]{1,3})\b/gi, (medida) => medida.toUpperCase());
}

function normalizar(leido) {
  const productos = (Array.isArray(leido.productos) ? leido.productos : [])
    .map((p) => ({
      nombre: presentarNombre(String(p.nombre || '').trim().slice(0, 80)),
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
