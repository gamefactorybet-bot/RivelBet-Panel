import { playerFetch } from './api.ts';

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

/**
 * Sube el comprobante directo a Cloudinary desde el navegador, usando
 * una firma que emite nuestro servidor.
 *
 * El archivo nunca pasa por nuestras funciones serverless: eso evita el
 * límite de tamaño de request de Vercel y hace la subida más rápida
 * desde un celular.
 */
export async function subirComprobante(archivo, onProgreso, tipo) {
  if (!TIPOS_OK.includes(archivo.type)) {
    throw new Error('Tiene que ser una imagen o un PDF.');
  }

  if (archivo.size > MAX_BYTES) {
    throw new Error('El archivo es muy pesado (máximo 8 MB).');
  }

  const ruta = tipo === 'verificacion'
    ? '/api/player-caja?recurso=cloudinary&tipo=verificacion'
    : '/api/player-caja?recurso=cloudinary';

  const { ok, data: firma, error } = await playerFetch(ruta);
  if (!ok) throw new Error(error);

  const form = new FormData();
  form.append('file', archivo);
  form.append('folder', firma.folder);

  // El servidor decide el modo según lo que esté configurado.
  if (firma.modo === 'firmado') {
    form.append('api_key', firma.apiKey);
    form.append('timestamp', firma.timestamp);
    form.append('signature', firma.signature);
  } else {
    form.append('upload_preset', firma.preset);
  }

  // XMLHttpRequest en vez de fetch porque es el único que reporta
  // progreso de subida, y en 4G eso importa.
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', firma.url);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgreso?.(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ url: res.secure_url, publicId: res.public_id });
        } else {
          reject(new Error(res.error?.message || 'No se pudo subir el comprobante.'));
        }
      } catch {
        reject(new Error('Respuesta inesperada al subir el comprobante.'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Falló la conexión al subir el comprobante.')));
    xhr.addEventListener('abort', () => reject(new Error('Subida cancelada.')));

    xhr.send(form);
  });
}
