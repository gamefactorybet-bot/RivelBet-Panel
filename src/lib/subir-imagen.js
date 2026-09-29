import { apiFetch } from './api.ts';

const MAX_BYTES_IMAGEN = 10 * 1024 * 1024;
const TIPOS_IMAGEN_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

const MAX_BYTES_ANIMACION = 3 * 1024 * 1024;

/**
 * Sube un archivo a Cloudinary desde el panel, con firma del servidor.
 * El archivo va directo a Cloudinary: no pasa por las funciones
 * serverless, así no choca con el límite de tamaño de request.
 */
function subirACloudinary(archivo, { carpeta, tipo, onProgreso }) {
  return apiFetch(`/api/config?recurso=cloudinary&carpeta=${encodeURIComponent(carpeta)}&tipo=${tipo}`)
    .then(({ ok, data: firma, error }) => {
      if (!ok) throw new Error(error);

      const form = new FormData();
      form.append('file', archivo);
      form.append('folder', firma.folder);

      if (firma.modo === 'firmado') {
        form.append('api_key', firma.apiKey);
        form.append('timestamp', firma.timestamp);
        form.append('signature', firma.signature);
      } else {
        form.append('upload_preset', firma.preset);
      }

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
              resolve({ url: res.secure_url, publicId: res.public_id, ancho: res.width, alto: res.height });
            } else {
              reject(new Error(res.error?.message || 'No se pudo subir el archivo.'));
            }
          } catch {
            reject(new Error('Respuesta inesperada de Cloudinary.'));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Falló la conexión al subir el archivo.')));
        xhr.send(form);
      });
    });
}

/** Sube una imagen (portadas, banners, logos). */
export async function subirImagen(archivo, { carpeta = 'banners', onProgreso } = {}) {
  if (!TIPOS_IMAGEN_OK.includes(archivo.type)) {
    throw new Error('Tiene que ser una imagen (JPG, PNG, WEBP, GIF o AVIF).');
  }

  if (archivo.size > MAX_BYTES_IMAGEN) {
    throw new Error('La imagen es muy pesada (máximo 10 MB).');
  }

  return subirACloudinary(archivo, { carpeta, tipo: 'image', onProgreso });
}

/**
 * Sube el .json de una animación Lottie. Va como recurso "raw" en
 * Cloudinary: para ellos un .json no es una imagen.
 */
export async function subirAnimacion(archivo, { onProgreso } = {}) {
  const esJson = archivo.type === 'application/json' || archivo.name?.toLowerCase().endsWith('.json');
  if (!esJson) {
    throw new Error('Tiene que ser un archivo .json exportado de Lottie.');
  }

  if (archivo.size > MAX_BYTES_ANIMACION) {
    throw new Error('El archivo es muy pesado (máximo 3 MB) — revisá que sea Lottie y no un video de más.');
  }

  return subirACloudinary(archivo, { carpeta: 'animaciones', tipo: 'raw', onProgreso });
}

const MAX_BYTES_VIDEO = 2 * 1024 * 1024;
const MAX_BYTES_VIDEO_BANNER = 4 * 1024 * 1024;
const TIPOS_VIDEO_OK = ['video/mp4', 'video/webm', 'video/quicktime'];

/** Clip corto para la portada (2s, sin audio). */
export async function subirVideo(archivo, { carpeta = 'juegos', onProgreso, maxBytes = MAX_BYTES_VIDEO, hint = '~2 segundos' } = {}) {
  if (!TIPOS_VIDEO_OK.includes(archivo.type) && !/\.(mp4|webm|mov)$/i.test(archivo.name || '')) {
    throw new Error('Tiene que ser MP4 o WebM.');
  }
  if (archivo.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`El video es muy pesado (máximo ${mb} MB). Comprimilo a ${hint} sin audio.`);
  }
  return subirACloudinary(archivo, { carpeta, tipo: 'video', onProgreso });
}

/** Clip del banner (~3s). El cuadro es más grande que una portada. */
export function subirVideoBanner(archivo, opts = {}) {
  return subirVideo(archivo, {
    carpeta: 'banners',
    maxBytes: MAX_BYTES_VIDEO_BANNER,
    hint: '~3 segundos',
    ...opts,
  });
}
