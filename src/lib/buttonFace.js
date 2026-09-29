// Pinta imagen o Lottie adentro de los botones de acción.
// El tamaño vive en variables CSS; acá solo montamos la cara cuando
// no alcanza con un background-image.

import { crearInstancia, destruirInstancia } from '../player/lottieCache.ts';

const SELECTOR = [
  '.pt-recargar',
  '.pt-enviar',
  '.pt-gate button',
  '.pt-sidebar-btn',
  '.pt-promo-fila button',
  '.login-submit',
  '.ap-phone-header button',
].join(', ');

const lotties = new WeakMap();
let observando = false;
let syncing = false;
let debounce = 0;

export function syncButtonFaces() {
  if (syncing) return;
  syncing = true;
  try {
    pintar();
  } finally {
    syncing = false;
  }
  if (observando || typeof MutationObserver === 'undefined' || !document.body) return;
  observando = true;
  const obs = new MutationObserver(() => {
    clearTimeout(debounce);
    debounce = setTimeout(() => syncButtonFaces(), 40);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

function pintar() {
  const root = document.documentElement;
  const face = root.dataset.btnFace || 'color';
  const lottieUrl = root.dataset.btnLottie || '';
  const botones = document.querySelectorAll(SELECTOR);

  botones.forEach((btn) => {
    let skin = btn.querySelector(':scope > .btn-skin');

    if (face === 'lottie' && lottieUrl) {
      if (!skin) {
        skin = document.createElement('span');
        skin.className = 'btn-skin';
        skin.setAttribute('aria-hidden', 'true');
        btn.prepend(skin);
      }
      if (skin.dataset.lottieUrl !== lottieUrl) {
        const previa = lotties.get(skin);
        if (previa) destruirInstancia(previa);
        skin.innerHTML = '';
        skin.dataset.lottieUrl = lottieUrl;
        crearInstancia(skin, lottieUrl).then((inst) => {
          if (skin.dataset.lottieUrl !== lottieUrl) {
            destruirInstancia(inst);
            return;
          }
          lotties.set(skin, inst);
        });
      }
      return;
    }

    if (skin) {
      const previa = lotties.get(skin);
      if (previa) destruirInstancia(previa);
      skin.remove();
    }
  });
}
