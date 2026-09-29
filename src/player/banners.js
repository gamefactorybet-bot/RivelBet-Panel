import { playerFetch } from './api.ts';
import { urlBanner } from '../lib/imgUrl.js';

/**
 * Carrusel de banners. Si hay uno solo, no rota ni muestra puntos.
 * Con varios, avanza cada 6 segundos y se puede deslizar con el dedo.
 * Si no hay ninguno cargado, cae en el banner por defecto: la pantalla
 * nunca queda con un hueco.
 */
export async function montarBanners(contenedor, nombreCasino) {
  const { ok, data } = await playerFetch('/api/player-social?recurso=banners', { conToken: false });
  const banners = (ok && data.banners) || [];

  if (!banners.length) {
    contenedor.innerHTML = `
      <div class="pt-banner">
        <h2>La suerte<br>se viste de <em>rojo.</em></h2>
        <p>Tu próxima jugada empieza en ${escapeHtml(nombreCasino)}.</p>
      </div>
    `;
    return;
  }

  let indice = 0;

  contenedor.innerHTML = `
    <div class="pt-carrusel">
      <div class="pt-pista" id="pt-pista">
        ${banners.map((b) => `
          <div class="pt-slide ${b.ajuste === 'cover' ? 'pt-slide-cover' : ''} ${b.formato === '16-7' ? 'pt-slide-formato-16-7' : ''}" ${b.link_url ? `data-link="${escapeHtml(b.link_url)}"` : ''}>
            <img src="${urlBanner(b.imagen_url)}" alt="" draggable="false" loading="lazy" decoding="async" />
            ${b.video_url ? `<video class="pt-slide-video" data-src="${escapeHtml(b.video_url)}" muted playsinline loop preload="none" draggable="false"></video>` : ''}
            ${b.titulo || b.subtitulo ? `
              <div class="pt-slide-txt">
                ${b.titulo ? `<h2>${escapeHtml(b.titulo)}</h2>` : ''}
                ${b.subtitulo ? `<p>${escapeHtml(b.subtitulo)}</p>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
      ${banners.length > 1 ? `
        <div class="pt-puntos">
          ${banners.map((_, i) => `<button class="pt-punto ${i === 0 ? 'is-active' : ''}" data-i="${i}" aria-label="Banner ${i + 1}"></button>`).join('')}
        </div>
      ` : ''}
    </div>
  `;

  const pista = contenedor.querySelector('#pt-pista');
  const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const activarVideo = (i) => {
    contenedor.querySelectorAll('.pt-slide-video').forEach((v, n) => {
      if (n === i && !menosMovimiento && v.dataset.src) {
        if (!v.getAttribute('src')) v.src = v.dataset.src;
        v.muted = true;
        v.loop = true;
        const play = v.play();
        if (play) play.then(() => v.classList.add('is-on')).catch(() => {});
      } else {
        v.pause();
        v.currentTime = 0;
        v.classList.remove('is-on');
      }
    });
  };

  contenedor.querySelectorAll('[data-link]').forEach((slide) => {
    slide.addEventListener('click', () => window.open(slide.dataset.link, '_blank', 'noopener'));
  });

  activarVideo(0);

  if (banners.length < 2) return;

  const ir = (i) => {
    indice = (i + banners.length) % banners.length;
    pista.style.transform = `translateX(-${indice * 100}%)`;
    contenedor.querySelectorAll('.pt-punto').forEach((p, n) => {
      p.classList.toggle('is-active', n === indice);
    });
    activarVideo(indice);
  };

  contenedor.querySelectorAll('.pt-punto').forEach((btn) => {
    btn.addEventListener('click', () => {
      ir(Number(btn.dataset.i));
      reiniciar();
    });
  });

  let reloj = setInterval(() => ir(indice + 1), 6000);
  const reiniciar = () => {
    clearInterval(reloj);
    reloj = setInterval(() => ir(indice + 1), 6000);
  };

  // Deslizar con el dedo: los jugadores están en celular.
  let inicioX = null;
  pista.addEventListener('touchstart', (e) => { inicioX = e.touches[0].clientX; }, { passive: true });
  pista.addEventListener('touchend', (e) => {
    if (inicioX === null) return;
    const dif = e.changedTouches[0].clientX - inicioX;
    if (Math.abs(dif) > 45) {
      ir(indice + (dif < 0 ? 1 : -1));
      reiniciar();
    }
    inicioX = null;
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
