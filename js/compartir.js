/* Mandar cosas por WhatsApp (o lo que tengas) sin sacar captura de pantalla.
 *
 * Usa la hoja de compartir del sistema cuando existe — en el celular es la
 * que abre WhatsApp, Telegram o el mail. Si no está, copia al portapapeles,
 * que es lo mismo pero con un paso más.
 */

/**
 * @returns {Promise<'compartido'|'copiado'|'cancelado'|'no'>}
 */
export async function compartir(texto, titulo = 'PochoHouse') {
  if (navigator.share) {
    try {
      await navigator.share({ title: titulo, text: texto });
      return 'compartido';
    } catch (err) {
      // Cerrar la hoja de compartir no es un error que valga la pena avisar.
      if (err.name === 'AbortError') return 'cancelado';
    }
  }

  try {
    await navigator.clipboard.writeText(texto);
    return 'copiado';
  } catch {
    return 'no';
  }
}

/** Mensaje para el toast, según lo que se haya podido hacer. */
export function avisoDeCompartir(resultado) {
  return {
    compartido: 'Listo, se compartió.',
    copiado: 'Copiado: pegalo donde quieras.',
    cancelado: '',
    no: 'No se pudo compartir desde este navegador.',
  }[resultado];
}
