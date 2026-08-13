/* Adivinar la categoría de un gasto a partir de lo que escribiste.
 *
 * Dos fuentes, en este orden:
 *  1. Tu propio historial. Si ya cargaste "UTE" como Luz, la próxima "UTE"
 *     va a Luz aunque mi lista diga otra cosa. Aprende sin configurar nada.
 *  2. Una lista de comercios y servicios uruguayos, para que la primera vez
 *     tampoco tengas que elegir.
 *
 * Nunca pisa una categoría elegida a mano: el formulario sólo aplica la
 * sugerencia mientras no hayas tocado los chips.
 */

import { list, categories } from './store.js';

/* Palabras que no distinguen nada y sólo generan falsos positivos. */
const VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'en', 'con', 'para',
  'por', 'pago', 'pagar', 'compra', 'gasto', 'mes', 'cuota', 'este', 'esta',
]);

/* Comercios y servicios de acá. La clave es la categoría por defecto. */
const CONOCIDOS = {
  luz: ['ute'],
  agua: ['ose'],
  // Ojo: "Ancap" a secas es la estación de servicio; el gas de la cocina se
  // pide por marca (supergas, Acodike, Riogas).
  gas: ['acodike', 'riogas', 'supergas', 'garrafa'],
  internet: ['antel', 'dedicado', 'montecable', 'nuevo siglo', 'tcc', 'fibra', 'wifi'],
  celular: ['movistar', 'claro', 'recarga'],
  super: ['devoto', 'disco', 'tienda inglesa', 'ta-ta', 'tata', 'geant', 'geánt',
    'macromercado', 'kinko', 'super', 'almacen', 'almacén', 'verduleria', 'verdulería',
    'carniceria', 'carnicería', 'panaderia', 'panadería', 'feria'],
  comida: ['pedidosya', 'pedidos ya', 'rappi', 'delivery', 'mcdonalds', 'burger',
    'pizza', 'sushi', 'empanadas', 'chivito', 'rotiseria', 'rotisería'],
  transporte: ['stm', 'cutcsa', 'uber', 'cabify', 'boleto', 'nafta', 'combustible',
    'peaje', 'estacionamiento', 'ancap', 'taxi', 'omnibus', 'ómnibus', 'gasoil'],
  salud: ['farmashop', 'san roque', 'farmacia', 'mutualista', 'casmu', 'medica uruguaya',
    'médica uruguaya', 'summum', 'emergencia', 'ucm', 'semm', 'dentista', 'analisis', 'análisis'],
  hogar: ['sodimac', 'barraca', 'ferreteria', 'ferretería', 'mueble', 'colchon',
    'colchón', 'electrodomestico', 'electrodoméstico', 'divino', 'tiendamia'],
  mascota: ['veterinaria', 'veterinario', 'alimento perro', 'alimento gato',
    'balanceado', 'arena gato'],
  salidas: ['cine', 'teatro', 'bar', 'boliche', 'concierto', 'recital', 'entrada',
    'cumpleaños', 'cumpleanos', 'salida'],
  // Nada de "max" suelto: se cuela dentro de "maxikiosco" y de medio diccionario.
  suscripciones: ['netflix', 'spotify', 'disney', 'hbo', 'youtube', 'prime video',
    'icloud', 'google one', 'dropbox', 'suscripcion', 'suscripción', 'gimnasio', 'gym'],
  expensas: ['expensas', 'gastos comunes', 'administracion', 'administración'],
  regalos: ['regalo', 'cumple'],
};

/** Sin tildes, en minúscula y sin puntuación: para comparar peras con peras. */
export function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // saca las tildes ya separadas por NFD
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function palabrasUtiles(texto) {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length >= 3 && !VACIAS.has(p));
}

/** Sólo devuelve categorías que existan de verdad en este hogar. */
function existente(id) {
  return categories().some((c) => c.id === id) ? id : null;
}

/**
 * Busca en lo ya cargado. Gana la coincidencia exacta; si no hay, la más
 * reciente que comparta una palabra distintiva.
 */
function desdeElHistorial(palabras, textoNormalizado) {
  const previos = list('expenses')
    .filter((e) => e.description && e.categoryId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const exacto = previos.find((e) => normalizar(e.description) === textoNormalizado);
  if (exacto) return existente(exacto.categoryId);

  const parecido = previos.find((e) => {
    const suyas = new Set(palabrasUtiles(e.description));
    return palabras.some((p) => suyas.has(p));
  });
  return parecido ? existente(parecido.categoryId) : null;
}

function desdeLaListaConocida(textoNormalizado) {
  let mejor = null;
  Object.entries(CONOCIDOS).forEach(([categoria, marcas]) => {
    marcas.forEach((marca) => {
      if (!textoNormalizado.includes(normalizar(marca))) return;
      // Ante varias coincidencias gana la marca más larga: "tienda inglesa"
      // le gana a "super" dentro de "supermercado tienda inglesa".
      if (!mejor || marca.length > mejor.largo) mejor = { categoria, largo: marca.length };
    });
  });
  return mejor ? existente(mejor.categoria) : null;
}

/**
 * @returns {string|null} id de categoría sugerido, o null si no hay pista.
 */
export function sugerirCategoria(descripcion) {
  const texto = normalizar(descripcion);
  if (texto.length < 3) return null;

  // El historial necesita palabras con sustancia para no cruzar cualquier cosa;
  // la lista de marcas no, porque ahí las cortas ("Ta-Ta") son nombres propios.
  const palabras = palabrasUtiles(descripcion);
  const aprendida = palabras.length ? desdeElHistorial(palabras, texto) : null;

  return aprendida || desdeLaListaConocida(texto);
}
