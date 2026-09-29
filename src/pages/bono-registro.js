import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { subirImagen } from '../lib/subir-imagen.js';
import { puede } from '../lib/perfiles.js';

const ESTILOS = `
  <style>
    .br-preview {
      border: 1px solid var(--accent); border-radius: 12px; overflow: hidden;
      max-width: 360px; background: var(--surface-alt); margin-top: 6px;
    }
    .br-preview .art {
      height: 110px; display: flex; align-items: center; justify-content: center;
      background:
        radial-gradient(120% 150% at 15% 0%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 60%),
        repeating-linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, transparent) 0 11px, transparent 11px 22px);
    }
    .br-preview .art img { width: 100%; height: 100%; object-fit: cover; }
    .br-preview .art strong { font-size: 24px; color: var(--accent); font-variant-numeric: tabular-nums; }
    .br-preview .cap { padding: 10px 13px; }
    .br-preview .cap strong { display: block; font-size: 13.5px; }
    .br-preview .cap span { font-size: 11.5px; color: var(--text-dim); }
    .br-barra { height: 5px; background: var(--surface-alt); border-radius: 999px; overflow: hidden; margin-top: 8px; }
    .br-barra span { display: block; height: 100%; background: var(--accent); transition: width .2s; }
  </style>
`;

export function renderBonoRegistro(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Bono de registro</h2>
      <p class="hint">
        Se acredita una sola vez, al crear la cuenta. El jugador no puede jugar ni
        retirar hasta verificar su identidad. Para retirar tiene que cargar, en una
        sola carga, al menos el valor del bono.
      </p>
      <div id="br-form"><p class="hint">Cargando...</p></div>
    </section>
  `;

  cargar(container, puedeEditar);
}

async function cargar(container, puedeEditar) {
  const formEl = container.querySelector('#br-form');
  const { ok, data, error } = await apiFetch('/api/config?recurso=bono-registro');

  if (!ok) {
    formEl.innerHTML = `<p class="hint error">${error}</p>`;
    return;
  }

  let bannerUrl = data.banner_url || null;

  const pintar = () => {
    formEl.innerHTML = `
      <label class="st-permiso" style="max-width:220px">
        <input type="checkbox" id="br-activo" ${data.activo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} />
        <span>Bono activo</span>
      </label>

      <p class="form-grupo">Cuánto da</p>
      <label class="field">Monto del bono (${currency.symbol})
        <input id="br-monto" type="number" min="0" step="${currency.decimals ? '0.01' : '1'}"
               value="${data.monto ?? ''}" placeholder="20000" ${puedeEditar ? '' : 'disabled'} />
      </label>

      <label class="field">Edad mínima
        <input id="br-edad" type="number" min="18" max="25" value="${data.edad_minima ?? 18}" ${puedeEditar ? '' : 'disabled'} />
      </label>

      <label class="field corto">Rollover (×)
        <input id="br-rollover" type="number" min="0" step="0.5" value="${data.rollover ?? 1}" ${puedeEditar ? '' : 'disabled'} />
      </label>
      <p class="hint">Veces que hay que apostar el bono para liberarlo. Aplica solo con el modo avanzado de Billetera; el candado de primera carga es aparte.</p>

      <p class="form-grupo">Banner que ve el jugador</p>
      <label class="field">Título
        <input id="br-titulo" value="${escapeHtml(data.titulo || '')}" maxlength="60" ${puedeEditar ? '' : 'disabled'} />
      </label>
      <label class="field">Subtítulo
        <input id="br-subtitulo" value="${escapeHtml(data.subtitulo || '')}" maxlength="90" ${puedeEditar ? '' : 'disabled'} />
      </label>

      ${puedeEditar ? `
        <label class="field">Imagen (opcional, recomendado 1200×525)
          <input id="br-file" type="file" accept="image/*" />
        </label>
        <div id="br-progreso"></div>
        ${bannerUrl ? '<button class="secundario" id="br-quitar" style="margin-bottom:12px">Quitar imagen</button>' : ''}
      ` : ''}

      <p class="form-grupo">Vista previa</p>
      <div class="br-preview" id="br-preview"></div>

      ${puedeEditar ? `
        <div class="acciones" style="margin-top:16px">
          <button id="br-guardar">Guardar</button>
        </div>
        <p id="br-msg" class="hint"></p>
      ` : '<p class="hint">Necesitás el permiso de ajustes para editar esto.</p>'}
    `;

    actualizarPreview();

    if (!puedeEditar) return;

    ['#br-monto', '#br-titulo', '#br-subtitulo'].forEach((sel) => {
      formEl.querySelector(sel).addEventListener('input', actualizarPreview);
    });

    const fileEl = formEl.querySelector('#br-file');
    fileEl.addEventListener('change', async (e) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;

      const progresoEl = formEl.querySelector('#br-progreso');
      progresoEl.innerHTML = '<div class="br-barra"><span style="width:0%"></span></div>';
      const barra = progresoEl.querySelector('span');

      try {
        const img = await subirImagen(archivo, { carpeta: 'bono-registro', onProgreso: (p) => { barra.style.width = p + '%'; } });
        bannerUrl = img.url;
        progresoEl.innerHTML = '';
        pintar();
      } catch (err) {
        progresoEl.innerHTML = `<p class="hint error">${err.message}</p>`;
      }
    });

    const quitar = formEl.querySelector('#br-quitar');
    if (quitar) quitar.addEventListener('click', () => { bannerUrl = null; pintar(); });

    formEl.querySelector('#br-guardar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const msgEl = formEl.querySelector('#br-msg');
      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Guardando...';

      const { ok, data: guardado, error } = await apiFetch('/api/config?recurso=bono-registro', {
        method: 'POST',
        body: {
          activo: formEl.querySelector('#br-activo').checked,
          monto: Number(formEl.querySelector('#br-monto').value) || 0,
          edadMinima: Number(formEl.querySelector('#br-edad').value) || 18,
          rollover: Number(formEl.querySelector('#br-rollover').value) || 0,
          titulo: formEl.querySelector('#br-titulo').value,
          subtitulo: formEl.querySelector('#br-subtitulo').value,
          bannerUrl,
        },
      });

      btn.disabled = false;

      if (!ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = error;
        return;
      }

      Object.assign(data, guardado);
      bannerUrl = guardado.banner_url || null;
      msgEl.className = 'hint';
      msgEl.textContent = 'Guardado.';
      pintar();
    });
  };

  function actualizarPreview() {
    const prev = formEl.querySelector('#br-preview');
    if (!prev) return;
    const monto = Number(formEl.querySelector('#br-monto')?.value) || data.monto || 0;
    const titulo = formEl.querySelector('#br-titulo')?.value ?? data.titulo ?? '';
    const subtitulo = formEl.querySelector('#br-subtitulo')?.value ?? data.subtitulo ?? '';
    prev.innerHTML = `
      <div class="art">
        ${bannerUrl ? `<img src="${escapeHtml(bannerUrl)}" alt="" />` : `<strong>${formatMoney(monto)}</strong>`}
      </div>
      <div class="cap">
        <strong>${escapeHtml(titulo)}</strong>
        <span>${escapeHtml(subtitulo)}</span>
      </div>
    `;
  }

  pintar();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
