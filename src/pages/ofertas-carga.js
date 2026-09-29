import { apiFetch } from '../lib/api.ts';
import { formatMoney } from '../lib/currency.ts';
import { subirImagen, subirVideoBanner } from '../lib/subir-imagen.js';
import { puede } from '../lib/perfiles.js';

let NIVELES = [];

export function renderOfertasCarga(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');
  container.innerHTML = `
    <style>
      .bn-fila { display:flex; align-items:center; gap:12px; padding:10px; border-radius:var(--radius); background:var(--surface-alt-glass); border:1px solid var(--border); }
      .bn-thumb { width:96px; height:54px; flex-shrink:0; border-radius:6px; overflow:hidden; background:var(--bg); border:1px solid var(--border); }
      .bn-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
      .bn-datos { flex:1; min-width:0; }
      .bn-datos strong { display:block; font-size:14px; font-weight:500; }
      .bn-datos span { font-size:12px; color:var(--text-dim); }
      .bn-drop { display:flex; flex-direction:column; align-items:center; gap:4px; padding:22px; border-radius:var(--radius); border:1px dashed var(--border); background:var(--surface-alt-glass); color:var(--text-dim); font-size:13px; cursor:pointer; }
      .bn-preview img { width:100%; display:block; aspect-ratio:21/9; object-fit:cover; border-radius:10px; }
      .bn-barra { height:5px; background:var(--surface-alt); border-radius:999px; overflow:hidden; margin-top:10px; }
      .bn-barra span { display:block; height:100%; background:var(--accent); }
    </style>
    <section class="card">
      <h2>Ofertas de carga</h2>
      <p class="hint">Carrusel en Recargar. El jugador elige una. El reloj arranca cuando usa esa promo (carga aprobada), no con cualquier carga. No se acumula con un código.</p>
      <div id="of-lista"><p class="hint">Cargando...</p></div>
      ${puedeEditar ? '<div class="acciones"><button id="of-nuevo">Agregar oferta</button></div>' : ''}
      <div id="of-form"></div>
    </section>
  `;
  if (puedeEditar) container.querySelector('#of-nuevo').addEventListener('click', () => formulario(container, {}, puedeEditar));
  apiFetch('/api/config?recurso=vip').then((r) => { if (r.ok) NIVELES = r.data.niveles || []; });
  cargar(container, puedeEditar);
}

async function cargar(container, puedeEditar) {
  const listaEl = container.querySelector('#of-lista');
  const { ok, data, error } = await apiFetch('/api/config?recurso=ofertas-carga');
  if (!ok) { listaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }
  const ofertas = data.ofertas || [];
  if (!ofertas.length) {
    listaEl.innerHTML = '<p class="hint">Todavía no hay ofertas. Agregá una para que aparezca arriba de Recargar.</p>';
    return;
  }
  listaEl.innerHTML = ofertas.map((o) => `
    <div class="bn-fila" style="margin-bottom:8px">
      <div class="bn-thumb">${o.imagen_url ? `<img src="${o.imagen_url}" alt="" />` : ''}</div>
      <div class="bn-datos">
        <strong>${escapeHtml(o.nombre)} ${o.activo ? '' : '· inactiva'}</strong>
        <span>
          carga mín. ${formatMoney(o.monto_min)} · bono ${o.bono_tipo === 'porcentaje' ? o.bono_valor + '%' : formatMoney(o.bono_valor)}
          · rollover ${Number(o.rollover) || 0}× · cada ${o.enfriamiento_minutos} min
        </span>
      </div>
      ${puedeEditar ? `<button class="secundario of-editar" data-id="${o.id}">Editar</button>` : ''}
    </div>
  `).join('');
  listaEl.querySelectorAll('.of-editar').forEach((btn) => {
    btn.addEventListener('click', () => formulario(container, ofertas.find((x) => x.id === btn.dataset.id), puedeEditar));
  });
}

function formulario(container, oferta, puedeEditar) {
  const formEl = container.querySelector('#of-form');
  let imagen = oferta.imagen_url ? { url: oferta.imagen_url } : null;
  let video = oferta.video_url ? { url: oferta.video_url } : null;

  const pintar = () => {
    formEl.innerHTML = `
      <div class="card" style="margin-top:16px">
        <h3 style="margin-top:0">${oferta.id ? 'Editar oferta' : 'Nueva oferta'}</h3>
        <label class="field">Nombre interno<input id="of-nombre" value="${escapeHtml(oferta.nombre || '')}" /></label>
        <label class="field">Título en la carta<input id="of-titulo" value="${escapeHtml(oferta.titulo || '')}" placeholder="Cargá 50.000 y llevate 10.000" /></label>
        <label class="field">Subtítulo<input id="of-sub" value="${escapeHtml(oferta.subtitulo || '')}" placeholder="Sin rollover" /></label>
        <p class="form-grupo">Imagen</p>
        ${imagen ? `<div class="bn-preview"><img src="${imagen.url}" alt="" /></div><button class="secundario" id="of-quitar-img">Quitar imagen</button>` : `
          <label class="bn-drop"><input type="file" id="of-file-img" accept="image/*" hidden /><strong>Subir imagen</strong><small>Ideal 1200×600, PNG.</small></label>`}
        <div id="of-prog-img"></div>
        <p class="form-grupo">Video (opcional, ~3s)</p>
        ${video ? `<video src="${video.url}" muted playsinline style="width:100%;max-width:360px;border-radius:10px"></video><div class="acciones"><button class="secundario" id="of-quitar-vid">Quitar video</button></div>` : `
          <label class="bn-drop"><input type="file" id="of-file-vid" accept="video/mp4,video/webm" hidden /><strong>Subir clip</strong><small>MP4/WebM, sin audio.</small></label>`}
        <div id="of-prog-vid"></div>
        <div class="vp-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <label class="field">Carga mínima<input id="of-min" type="number" min="1" value="${oferta.monto_min || ''}" /></label>
          <label class="field">Tipo de bono
            <select id="of-tipo">
              <option value="fijo" ${oferta.bono_tipo !== 'porcentaje' ? 'selected' : ''}>Fijo</option>
              <option value="porcentaje" ${oferta.bono_tipo === 'porcentaje' ? 'selected' : ''}>Porcentaje</option>
            </select>
          </label>
          <label class="field">Valor del bono<input id="of-valor" type="number" min="0" step="0.01" value="${oferta.bono_valor || ''}" /></label>
          <label class="field">Rollover (0 = sin)<input id="of-roll" type="number" min="0" step="0.5" value="${oferta.rollover ?? 0}" /></label>
          <label class="field">Enfriamiento (minutos)<input id="of-enfr" type="number" min="0" value="${oferta.enfriamiento_minutos ?? 60}" /></label>
          <p class="hint" style="grid-column:1/-1;margin:0">Ej. 360 = 6 horas. El tiempo corre desde que esa oferta se le acreditó, no desde cualquier carga.</p>
          <label class="field">Orden<input id="of-orden" type="number" value="${oferta.orden ?? 0}" /></label>
          <label class="field">VIP mínimo
            <select id="of-vip-min"><option value="">Todos</option>${NIVELES.map((n) => `<option value="${n.id}" ${oferta.vip_nivel_min === n.id ? 'selected' : ''}>${escapeHtml(n.nombre)}</option>`).join('')}</select>
          </label>
          <label class="field">VIP máximo
            <select id="of-vip-max"><option value="">Sin techo</option>${NIVELES.map((n) => `<option value="${n.id}" ${oferta.vip_nivel_max === n.id ? 'selected' : ''}>${escapeHtml(n.nombre)}</option>`).join('')}</select>
          </label>
        </div>
        <label class="field" style="margin-top:10px"><input type="checkbox" id="of-activo" ${oferta.activo !== false ? 'checked' : ''} /> Activa</label>
        <p id="of-msg" class="hint"></p>
        <div class="acciones">
          <button id="of-guardar" ${puedeEditar ? '' : 'disabled'}>Guardar</button>
          <button class="secundario" id="of-cancelar">Cancelar</button>
          ${oferta.id ? '<button class="secundario" id="of-borrar">Desactivar</button>' : ''}
        </div>
      </div>
    `;

    formEl.querySelector('#of-file-img')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const prog = formEl.querySelector('#of-prog-img');
      prog.innerHTML = '<div class="bn-barra"><span style="width:0%"></span></div>';
      try { imagen = await subirImagen(f, { carpeta: 'ofertas', onProgreso: (p) => { prog.querySelector('span').style.width = p + '%'; } }); pintar(); }
      catch (err) { prog.innerHTML = `<p class="hint error">${err.message}</p>`; }
    });
    formEl.querySelector('#of-quitar-img')?.addEventListener('click', () => { imagen = null; pintar(); });
    formEl.querySelector('#of-file-vid')?.addEventListener('change', async (e) => {
      const f = e.target.files?.[0]; if (!f) return;
      const prog = formEl.querySelector('#of-prog-vid');
      prog.innerHTML = '<div class="bn-barra"><span style="width:0%"></span></div>';
      try { video = await subirVideoBanner(f, { onProgreso: (p) => { prog.querySelector('span').style.width = p + '%'; } }); pintar(); }
      catch (err) { prog.innerHTML = `<p class="hint error">${err.message}</p>`; }
    });
    formEl.querySelector('#of-quitar-vid')?.addEventListener('click', () => { video = null; pintar(); });
    formEl.querySelector('#of-cancelar').addEventListener('click', () => { formEl.innerHTML = ''; });
    formEl.querySelector('#of-borrar')?.addEventListener('click', async () => {
      await apiFetch(`/api/config?recurso=ofertas-carga&id=${oferta.id}`, { method: 'DELETE' });
      formEl.innerHTML = '';
      cargar(container, puedeEditar);
    });
    formEl.querySelector('#of-guardar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const msg = formEl.querySelector('#of-msg');
      btn.disabled = true;
      const { ok, error } = await apiFetch('/api/config?recurso=ofertas-carga', {
        method: 'POST',
        body: {
          id: oferta.id,
          nombre: formEl.querySelector('#of-nombre').value,
          titulo: formEl.querySelector('#of-titulo').value,
          subtitulo: formEl.querySelector('#of-sub').value,
          imagenUrl: imagen?.url || null,
          videoUrl: video?.url || null,
          montoMin: formEl.querySelector('#of-min').value,
          bonoTipo: formEl.querySelector('#of-tipo').value,
          bonoValor: formEl.querySelector('#of-valor').value,
          rollover: formEl.querySelector('#of-roll').value,
          enfriamientoMinutos: formEl.querySelector('#of-enfr').value,
          vipNivelMin: formEl.querySelector('#of-vip-min').value || null,
          vipNivelMax: formEl.querySelector('#of-vip-max').value || null,
          orden: formEl.querySelector('#of-orden').value,
          activo: formEl.querySelector('#of-activo').checked,
        },
      });
      btn.disabled = false;
      if (!ok) { msg.className = 'hint error'; msg.textContent = error; return; }
      formEl.innerHTML = '';
      cargar(container, puedeEditar);
    });
  };
  pintar();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
