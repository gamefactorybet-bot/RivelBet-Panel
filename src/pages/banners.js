import { apiFetch } from '../lib/api.ts';
import { subirImagen, subirVideoBanner } from '../lib/subir-imagen.js';
import { puede } from '../lib/perfiles.js';

const ESTILOS = `
<style>
  .bn-lista { display: flex; flex-direction: column; gap: 10px; }
  .bn-fila {
    display: flex; align-items: center; gap: 12px;
    padding: 10px; border-radius: var(--radius);
    background: var(--surface-alt-glass); border: 1px solid var(--border);
  }
  .bn-thumb {
    width: 96px; height: 54px; flex-shrink: 0;
    border-radius: 6px; overflow: hidden; background: var(--bg);
    border: 1px solid var(--border);
  }
  .bn-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .bn-datos { flex: 1; min-width: 0; }
  .bn-datos strong { display: block; font-size: 14px; font-weight: 500; }
  .bn-datos span { font-size: 12px; color: var(--text-dim); }
  .bn-drop {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 26px; border-radius: var(--radius);
    border: 1px dashed var(--border); background: var(--surface-alt-glass);
    color: var(--text-dim); font-size: 13px; cursor: pointer;
  }
  .bn-drop:hover { border-color: var(--accent); color: var(--accent); }
  .bn-preview { position: relative; border-radius: var(--radius); overflow: hidden; margin-bottom: 12px; }
  .bn-preview img { width: 100%; display: block; aspect-ratio: 21/9; object-fit: cover; }
  .bn-barra { height: 5px; background: var(--surface-alt); border-radius: 999px; overflow: hidden; margin-top: 10px; }
  .bn-barra span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }
  .bn-o { display: flex; align-items: center; gap: 10px; margin: 12px 0; }
  .bn-o::before, .bn-o::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  .bn-o span { font-size: 12px; color: var(--text-dim); }
</style>
`;

export function renderBanners(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Banners del portal</h2>
      <p class="hint">Se muestran arriba de todo en la pantalla del jugador. Si hay más de uno, rotan solos.</p>
      <div id="bn-lista"><p class="hint">Cargando...</p></div>
      ${puedeEditar ? '<div class="acciones"><button id="bn-nuevo">Agregar banner</button></div>' : ''}
      <div id="bn-form"></div>
    </section>
  `;

  if (puedeEditar) {
    container.querySelector('#bn-nuevo').addEventListener('click', () => formulario(container, {}, puedeEditar));
  }

  cargar(container, puedeEditar);
}

async function cargar(container, puedeEditar) {
  const listaEl = container.querySelector('#bn-lista');
  const { ok, data, error } = await apiFetch('/api/config?recurso=banners');

  if (!ok) {
    listaEl.innerHTML = `<p class="hint error">${error}</p>`;
    return;
  }

  const banners = data.banners || [];

  if (!banners.length) {
    listaEl.innerHTML = '<p class="hint">Todavía no hay banners. El portal muestra uno por defecto mientras tanto.</p>';
    return;
  }

  listaEl.innerHTML = `
    <div class="bn-lista">
      ${banners.map((b) => `
        <div class="bn-fila">
          <div class="bn-thumb"><img src="${b.imagen_url}" alt="" loading="lazy" /></div>
          <div class="bn-datos">
            <strong>${escapeHtml(b.titulo || 'Sin título')}</strong>
            <span>
              orden ${b.orden}
              ${b.link_url ? ' · con enlace' : ''}
              ${b.video_url ? ' · con video' : ''}
              ${vigencia(b)}
            </span>
          </div>
          ${b.activo ? '' : '<span class="badge badge-danger">Inactivo</span>'}
          ${puedeEditar ? `<button class="secundario bn-editar" data-id="${b.id}">Editar</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;

  listaEl.querySelectorAll('.bn-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      formulario(container, banners.find((b) => b.id === btn.dataset.id), puedeEditar);
    });
  });
}

function vigencia(b) {
  if (!b.desde && !b.hasta) return '';
  const f = (iso) => new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
  if (b.desde && b.hasta) return ` · del ${f(b.desde)} al ${f(b.hasta)}`;
  if (b.desde) return ` · desde ${f(b.desde)}`;
  return ` · hasta ${f(b.hasta)}`;
}

function formulario(container, banner, puedeEditar) {
  const formEl = container.querySelector('#bn-form');
  const esNuevo = !banner.id;

  let imagen = banner.imagen_url
    ? { url: banner.imagen_url, publicId: banner.imagen_public_id }
    : null;
  let video = banner.video_url ? { url: banner.video_url } : null;

  const pintar = () => {
    formEl.innerHTML = `
      <div class="card" style="margin-top:16px">
        <h3 style="margin-top:0">${esNuevo ? 'Nuevo banner' : 'Editar banner'}</h3>

        <p class="form-grupo">Imagen</p>
        ${imagen ? `
          <div class="bn-preview"><img src="${imagen.url}" alt="" /></div>
          <div class="acciones" style="margin-bottom:14px">
            <button class="secundario" id="bn-quitar">Cambiar imagen</button>
          </div>
        ` : `
          <label class="bn-drop">
            <input type="file" id="bn-file" accept="image/*" hidden />
            <strong style="font-weight:500">Subir imagen</strong>
            <small>Ideal 1200×600 px (2:1) o 1200×525 px (16:7), según el formato que elijas abajo. PNG transparente para efecto de relieve.</small>
          </label>
          <div class="bn-o"><span>o</span></div>
          <label class="field">Pegar una URL
            <input id="bn-url" placeholder="https://..." autocomplete="off" />
          </label>
        `}
        <div id="bn-progreso"></div>

        <p class="form-grupo">Video corto (opcional)</p>
        <p class="hint">3 segundos, sin audio, MP4 o WebM. La imagen queda de fondo; el clip solo corre en el banner que se está viendo. Ideal menos de 800 KB.</p>
        ${video ? `
          <div class="bn-preview" style="max-width:360px">
            <video src="${video.url}" muted playsinline style="width:100%;aspect-ratio:2/1;object-fit:cover;border-radius:10px;display:block"></video>
          </div>
          <div class="acciones" style="margin-bottom:14px">
            <button class="secundario" id="bn-quitar-video">Quitar video</button>
          </div>
        ` : `
          <label class="bn-drop">
            <input type="file" id="bn-file-video" accept="video/mp4,video/webm,video/quicktime" hidden />
            <strong style="font-weight:500">Subir clip del banner</strong>
            <small>MP4 o WebM, ~3s, sin audio.</small>
          </label>
        `}
        <div id="bn-prog-video"></div>

        <p class="form-grupo">Formato del cuadro</p>
        <div class="opciones-pill">
          <label class="${banner.formato !== '16-7' ? 'is-activa' : ''}">
            <input type="radio" name="bn-formato" value="2-1" ${banner.formato !== '16-7' ? 'checked' : ''} />
            Estándar (2:1)
          </label>
          <label class="${banner.formato === '16-7' ? 'is-activa' : ''}">
            <input type="radio" name="bn-formato" value="16-7" ${banner.formato === '16-7' ? 'checked' : ''} />
            Panorámico (16:7)
          </label>
        </div>
        <p class="hint">2:1 es el más nuevo y deja menos aire vacío. 16:7 es más ancho y bajo — el que se usaba antes.</p>

        <p class="form-grupo">Ajuste de la imagen</p>
        <div class="opciones-pill">
          <label class="${banner.ajuste !== 'cover' ? 'is-activa' : ''}">
            <input type="radio" name="bn-ajuste" value="contain" ${banner.ajuste !== 'cover' ? 'checked' : ''} />
            Completa, sin recortar
          </label>
          <label class="${banner.ajuste === 'cover' ? 'is-activa' : ''}">
            <input type="radio" name="bn-ajuste" value="cover" ${banner.ajuste === 'cover' ? 'checked' : ''} />
            Rellenar el cuadro (puede recortar)
          </label>
        </div>
        <p class="hint">
          "Completa" nunca corta la imagen, pero si no es 2:1 exacto puede dejar un poco de
          aire en los costados. "Rellenar" ocupa todo el cuadro sin aire, pero recorta los
          bordes si la imagen no calza justo — no usar con PNG transparente ni logos sueltos.
        </p>

        <p class="form-grupo">Texto sobre la imagen</p>
        <label class="field">Título
          <input id="bn-titulo" value="${escapeHtml(banner.titulo || '')}" placeholder="Bono de bienvenida" />
        </label>
        <label class="field">Subtítulo
          <input id="bn-subtitulo" value="${escapeHtml(banner.subtitulo || '')}" placeholder="Duplicamos tu primera carga" />
        </label>
        <p class="hint">Los dos son opcionales. Si los dejás vacíos se muestra solo la imagen.</p>

        <p class="form-grupo">Comportamiento</p>
        <label class="field">Enlace al tocarlo
          <input id="bn-link" value="${escapeHtml(banner.link_url || '')}" placeholder="https://" />
        </label>
        <div class="campos-fila">
          <label class="field corto">Orden
            <input id="bn-orden" type="number" value="${banner.orden ?? 0}" />
          </label>
          <label class="field">Desde
            <input id="bn-desde" type="date" value="${fecha(banner.desde)}" />
          </label>
          <label class="field">Hasta
            <input id="bn-hasta" type="date" value="${fecha(banner.hasta)}" />
          </label>
        </div>
        <p class="hint">Las fechas sirven para programar una promo. Vacías, el banner se muestra siempre.</p>

        <label class="st-permiso" style="max-width:200px;margin-top:14px">
          <input type="checkbox" id="bn-activo" ${banner.activo !== false ? 'checked' : ''} />
          <span>Activo</span>
        </label>

        <div class="acciones">
          <button id="bn-guardar">Guardar</button>
          <button id="bn-cancelar" class="secundario">Cancelar</button>
          ${esNuevo ? '' : '<button id="bn-borrar" class="secundario">Borrar</button>'}
        </div>
        <p id="bn-msg" class="hint"></p>
      </div>
    `;

    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const msgEl = formEl.querySelector('#bn-msg');

    const inputFile = formEl.querySelector('#bn-file');
    if (inputFile) {
      inputFile.addEventListener('change', async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;

        const progresoEl = formEl.querySelector('#bn-progreso');
        progresoEl.innerHTML = '<div class="bn-barra"><span style="width:0%"></span></div>';
        const barra = progresoEl.querySelector('span');

        try {
          imagen = await subirImagen(archivo, { onProgreso: (p) => { barra.style.width = p + '%'; } });
          pintar();
        } catch (err) {
          progresoEl.innerHTML = `<p class="hint error">${err.message}</p>`;
        }
      });

      formEl.querySelector('#bn-url').addEventListener('change', (e) => {
        const valor = e.target.value.trim();
        if (valor) {
          imagen = { url: valor, publicId: null };
          pintar();
        }
      });
    }

    const btnQuitar = formEl.querySelector('#bn-quitar');
    if (btnQuitar) btnQuitar.addEventListener('click', () => { imagen = null; pintar(); });

    formEl.querySelector('#bn-file-video')?.addEventListener('change', async (e) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;
      const prog = formEl.querySelector('#bn-prog-video');
      prog.innerHTML = '<div class="bn-barra"><span style="width:0%"></span></div>';
      const barra = prog.querySelector('span');
      try {
        video = await subirVideoBanner(archivo, { onProgreso: (p) => { barra.style.width = p + '%'; } });
        pintar();
      } catch (err) {
        prog.innerHTML = `<p class="hint error">${err.message}</p>`;
      }
    });
    formEl.querySelector('#bn-quitar-video')?.addEventListener('click', () => { video = null; pintar(); });

    formEl.querySelector('#bn-cancelar').addEventListener('click', () => { formEl.innerHTML = ''; });

    const btnBorrar = formEl.querySelector('#bn-borrar');
    if (btnBorrar) {
      btnBorrar.addEventListener('click', async () => {
        if (!confirm('¿Borrar este banner?')) return;
        btnBorrar.disabled = true;

        const { ok, error } = await apiFetch(`/api/config?recurso=banners&id=${banner.id}`, { method: 'DELETE' });

        if (!ok) {
          btnBorrar.disabled = false;
          msgEl.className = 'hint error';
          msgEl.textContent = error;
          return;
        }

        formEl.innerHTML = '';
        cargar(container, puedeEditar);
      });
    }

    formEl.querySelector('#bn-guardar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;

      if (!imagen) {
        msgEl.className = 'hint error';
        msgEl.textContent = 'Subí una imagen o pegá una URL.';
        return;
      }

      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Guardando...';

      const { ok, error } = await apiFetch('/api/config?recurso=banners', {
        method: 'POST',
        body: {
          id: banner.id,
          imagenUrl: imagen.url,
          imagenPublicId: imagen.publicId,
          titulo: formEl.querySelector('#bn-titulo').value,
          subtitulo: formEl.querySelector('#bn-subtitulo').value,
          linkUrl: formEl.querySelector('#bn-link').value,
          orden: formEl.querySelector('#bn-orden').value,
          activo: formEl.querySelector('#bn-activo').checked,
          desde: formEl.querySelector('#bn-desde').value || null,
          hasta: formEl.querySelector('#bn-hasta').value || null,
          ajuste: formEl.querySelector('input[name="bn-ajuste"]:checked')?.value || 'contain',
          formato: formEl.querySelector('input[name="bn-formato"]:checked')?.value || '2-1',
          videoUrl: video?.url || null,
        },
      });

      btn.disabled = false;

      if (!ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = error;
        return;
      }

      formEl.innerHTML = '';
      cargar(container, puedeEditar);
    });
  };

  pintar();
}

function fecha(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
