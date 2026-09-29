// Recorta imágenes de Cloudinary al tamaño de pantalla. Sin esto el
// celular baja portadas de 800px para pintarlas a 110.

const CLOUDINARY = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/upload\/)(.+)$/i;

export function urlOptimizada(url, { w } = {}) {
  if (!url || typeof url !== 'string') return url || '';
  const m = url.match(CLOUDINARY);
  if (!m || !w) return url;

  const rest = m[2];
  const first = rest.split('/')[0] || '';
  if (/(?:^|,)(?:f_|q_|w_|c_|h_|dpr_|g_)/.test(first)) return url;

  return `${m[1]}f_auto,q_auto,w_${w},c_limit/${rest}`;
}

export const urlPortada = (url) => urlOptimizada(url, { w: 360 });
export const urlBanner = (url) => urlOptimizada(url, { w: 1200 });
export const urlLogoChico = (url) => urlOptimizada(url, { w: 96 });
export const urlWordmark = (url) => urlOptimizada(url, { w: 480 });
