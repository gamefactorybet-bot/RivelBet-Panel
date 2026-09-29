import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { subirImagen } from '../lib/subir-imagen.js';
import { puede } from '../lib/perfiles.js';

// Hitos de carga: "cada N cargas de >= X -> bono", con escalón lineal,
// ventana opcional, rango VIP y banner en el portal. Todo pasa por
// sumar_bono_billetera -> respeta el modo avanzado de billetera.

const ESTILOS = `
  <style>
    .hi-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px 16px; margin:6px 0 4px; }
    .hi-form label { display:block; font-size:10.5px; letter-spacing:0.03em; text-transform:uppercase; color:var(--text-dim); margin-bottom:5px; font-weight:500; }
    .hi-form input, .hi-form select, .hi-form textarea { width:100%; background:var(--surface-alt-glass); border:1px solid var(--border-glass); color:var(--text);
      border-radius:8px; padding:9px 11px; font-size:13px; font-family:ui-monospace,monospace; }
    .hi-form textarea { font-family:inherit; resize:vertical; min-height:44px; }
    .hi-grp { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--accent); margin:16px 0 8px; }
    .hi-badge { font-size:10.5px; border-radius:999px; padding:1px 8px; border:1px solid var(--border); color:var(--text-dim); }
    .hi-badge.ok { color:var(--success); border-color:color-mix(in srgb,var(--success) 40%,transparent); }
    .hi-up { display:flex; align-items:center; gap:10px; flex-wrap:wrap; border:1px dashed var(--border-strong,var(--border)); border-radius:9px; padding:9px 11px; background:var(--surface-alt-glass); }
    .hi-up img { width:52px; height:24px; object-fit:cover; border-radius:4px; border:1px solid var(--border); }
  </style>
`;

let NIVELES = [];

export function renderHitos(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');
  let editando = null;

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Hitos de carga</h2>
      <p class="hint">
        Premio por racha: cada N cargas de un mínimo, un bono que sube en cada hito.
        Podés dirigirlo a un rango de niveles VIP y ponerle un banner en el portal.
        El rollover y el tope de conversión aplican solo con el modo avanzado de Billetera.
      </p>
      ${puedeEditar ? '<div class="acciones"><button id="hi-nuevo">Nuevo hito</button></div>' : ''}
      <div id="hi-form-box"></div>
    </section>
    <section class="card">
      <h3 style="margin-top:0">Hitos</h3>
      <div id="hi-lista"><p class="hint">Cargando...</p></div>
    </section>
  `;

  apiFetch('/api/config?recurso=vip').then((r) => { if (r.ok) NIVELES = r.data.niveles || []; });

  if (puedeEditar) {
    container.querySelector('#hi-nuevo').addEventListener('click', () => { editando = {}; pintarForm(); });
  }

  cargar();

  async function cargar() {
    const el = container.querySelector('#hi-lista');
    const { ok, data, error } = await apiFetch('/api/config?recurso=hitos');
    if (!ok) { el.innerHTML = `<p class="hint error">${error}</p>`; return; }
    const items = data.hitos || [];
    if (!items.length) { el.innerHTML = '<p class="hint">Todavía no hay hitos.</p>'; return; }

    el.innerHTML = `
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Hito</th><th>Cada</th><th>Mínimo</th><th>Premio</th><th>Rollover</th><th>Tope conv.</th><th>VIP</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${items.map((h) => `
            <tr>
              <td>${escapeHtml(h.nombre)}${h.banner_url ? ' <span class="hi-badge">banner</span>' : ''}${h.ventana_dias ? `<small class="hint">racha ${h.ventana_dias}d</small>` : ''}</td>
              <td class="mono">${h.cada_cargas}</td>
              <td class="mono">${formatMoney(h.min_por_carga)}</td>
              <td class="mono">${h.tipo === 'porcentaje' ? `${h.valor}%${h.valor_incremento ? ` +${h.valor_incremento}` : ''}${h.valor_max ? ` (máx ${h.valor_max}%)` : ''}` : formatMoney(h.valor)}</td>
              <td class="mono">${h.rollover}×</td>
              <td class="mono">${h.tope_conversion_mult != null ? `${h.tope_conversion_mult}×` : '—'}</td>
              <td class="hint">${rangoVip(h)}</td>
              <td>${h.activo ? '<span class="hi-badge ok">Activo</span>' : '<span class="hi-badge">Inactivo</span>'}</td>
              <td>${puedeEditar ? `<button class="secundario hi-editar" data-id="${h.id}">Editar</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;
    el.querySelectorAll('.hi-editar').forEach((b) => {
      b.addEventListener('click', () => { editando = items.find((x) => x.id === b.dataset.id) || {}; pintarForm(); });
    });
  }

  function pintarForm() {
    const box = container.querySelector('#hi-form-box');
    if (!editando) { box.innerHTML = ''; return; }
    const h = editando;
    let bannerUrl = h.banner_url || null;
    let bannerPublicId = h.banner_public_id || null;

    const opcionesVip = (sel) => `<option value="">${sel === 'max' ? 'Sin techo' : 'Cualquier nivel'}</option>` +
      NIVELES.map((n) => `<option value="${n.id}"${(sel === 'min' ? h.vip_nivel_min : h.vip_nivel_max) === n.id ? ' selected' : ''}>${escapeHtml(n.nombre)}</option>`).join('');

    const dibujar = () => {
      box.innerHTML = `
        <div class="card" style="margin-top:12px;background:var(--surface-alt-glass)">
          <h3 style="margin-top:0">${h.id ? 'Editar hito' : 'Nuevo hito'}</h3>

          <div class="hi-grp">Identificación</div>
          <div class="hi-form">
            <div style="grid-column:1/-1"><label>Nombre</label><input id="hi-nombre" value="${escapeHtml(h.nombre || '')}" placeholder="Racha Ballena" /></div>
          </div>

          <div class="hi-grp">Cuándo se dispara</div>
          <div class="hi-form">
            <div><label>Cada cuántas cargas</label><input id="hi-cada" type="number" min="1" value="${h.cada_cargas ?? 15}" /></div>
            <div><label>Mínimo por carga (${currency.symbol})</label><input id="hi-min" type="number" min="0" value="${h.min_por_carga ?? 0}" /></div>
            <div><label>Ventana (días, 0 = sin ventana)</label><input id="hi-ventana" type="number" min="0" value="${h.ventana_dias ?? 0}" /></div>
          </div>

          <div class="hi-grp">El premio</div>
          <div class="hi-form">
            <div><label>Tipo</label><select id="hi-tipo"><option value="porcentaje"${h.tipo !== 'fijo' ? ' selected' : ''}>% de la carga</option><option value="fijo"${h.tipo === 'fijo' ? ' selected' : ''}>Monto fijo</option></select></div>
            <div><label>Valor del 1er hito</label><input id="hi-valor" type="number" min="0" value="${h.valor ?? 30}" /></div>
            <div><label>Sube por hito</label><input id="hi-incr" type="number" min="0" value="${h.valor_incremento ?? 0}" /></div>
            <div><label>Tope del valor</label><input id="hi-vmax" type="number" min="0" value="${h.valor_max ?? ''}" placeholder="sin techo" /></div>
            <div><label>Tope del bono (${currency.symbol})</label><input id="hi-tope" type="number" min="0" value="${h.tope ?? ''}" placeholder="sin tope" /></div>
            <div><label>Máx. hitos por jugador</label><input id="hi-topeh" type="number" min="0" value="${h.tope_hitos ?? 0}" /></div>
          </div>

          <div class="hi-grp">Liberación</div>
          <div class="hi-form">
            <div><label>Rollover — ×N del bono</label><input id="hi-roll" type="number" min="0" step="0.5" value="${h.rollover ?? 1}" /></div>
            <div><label>Tope de conversión — ×N (vacío = global)</label><input id="hi-topeconv" type="number" min="0" step="0.5" value="${h.tope_conversion_mult ?? ''}" placeholder="usa el global" /></div>
          </div>

          <div class="hi-grp">A qué VIP va dirigido</div>
          <div class="hi-form">
            <div><label>Desde el nivel</label><select id="hi-vipmin">${opcionesVip('min')}</select></div>
            <div><label>Hasta el nivel</label><select id="hi-vipmax">${opcionesVip('max')}</select></div>
          </div>

          <div class="hi-grp">Banner en el portal</div>
          <div class="hi-form">
            <div style="grid-column:1/-1"><label>Imagen</label>
              <div class="hi-up">
                ${bannerUrl ? `<img src="${escapeHtml(bannerUrl)}" alt="" />` : ''}
                <button type="button" id="hi-bfile-btn">${bannerUrl ? 'Cambiar' : 'Agregar'} imagen</button>
                <input type="file" id="hi-bfile" accept="image/*" hidden />
                ${bannerUrl ? '<button type="button" class="secundario" id="hi-bquitar">Quitar</button>' : ''}
                <span class="hint" id="hi-bprog"></span>
              </div>
            </div>
            <div style="grid-column:1/-1"><label>Título</label><input id="hi-btitulo" value="${escapeHtml(h.banner_titulo || '')}" maxlength="60" /></div>
            <div style="grid-column:1/-1"><label>Texto</label><textarea id="hi-btexto" maxlength="120">${escapeHtml(h.banner_texto || '')}</textarea></div>
          </div>

          <label class="st-permiso" style="max-width:160px;margin:12px 0">
            <input type="checkbox" id="hi-activo" ${h.activo !== false ? 'checked' : ''} /><span>Activo</span>
          </label>
          <div class="acciones">
            <button id="hi-guardar">Guardar</button>
            <button class="secundario" id="hi-cancelar">Cancelar</button>
            ${h.id ? '<button class="secundario" id="hi-borrar">Desactivar</button>' : ''}
          </div>
          <p id="hi-msg" class="hint"></p>
        </div>
      `;

      box.querySelector('#hi-cancelar').addEventListener('click', () => { editando = null; pintarForm(); });
      box.querySelector('#hi-borrar')?.addEventListener('click', async () => {
        if (!window.confirm('¿Desactivar este hito?')) return;
        const r = await apiFetch(`/api/config?recurso=hitos&id=${h.id}`, { method: 'DELETE' });
        if (r.ok) { editando = null; pintarForm(); cargar(); }
      });

      const fileBtn = box.querySelector('#hi-bfile-btn');
      const fileEl = box.querySelector('#hi-bfile');
      fileBtn.addEventListener('click', () => fileEl.click());
      fileEl.addEventListener('change', async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        const prog = box.querySelector('#hi-bprog');
        prog.textContent = 'Subiendo...';
        try {
          const img = await subirImagen(archivo, { carpeta: 'hitos', onProgreso: (p) => { prog.textContent = `Subiendo ${p}%`; } });
          bannerUrl = img.url;
          bannerPublicId = img.publicId || null;
          dibujar();
        } catch (err) { prog.innerHTML = `<span class="error">${err.message}</span>`; }
      });
      box.querySelector('#hi-bquitar')?.addEventListener('click', () => { bannerUrl = null; bannerPublicId = null; dibujar(); });

      box.querySelector('#hi-guardar').addEventListener('click', async (e) => {
        const msg = box.querySelector('#hi-msg');
        e.currentTarget.disabled = true;
        msg.className = 'hint'; msg.textContent = 'Guardando...';
        const v = (s) => box.querySelector(s).value;
        const r = await apiFetch('/api/config?recurso=hitos', {
          method: 'POST',
          body: {
            id: h.id,
            nombre: v('#hi-nombre'),
            activo: box.querySelector('#hi-activo').checked,
            cadaCargas: Number(v('#hi-cada')) || 1,
            minPorCarga: Number(v('#hi-min')) || 0,
            ventanaDias: Number(v('#hi-ventana')) || 0,
            tipo: v('#hi-tipo'),
            valor: Number(v('#hi-valor')) || 0,
            valorIncremento: Number(v('#hi-incr')) || 0,
            valorMax: v('#hi-vmax'),
            tope: v('#hi-tope'),
            topeHitos: Number(v('#hi-topeh')) || 0,
            rollover: Number(v('#hi-roll')) || 0,
            topeConversionMult: v('#hi-topeconv'),
            vipNivelMin: v('#hi-vipmin') || null,
            vipNivelMax: v('#hi-vipmax') || null,
            bannerUrl, bannerPublicId,
            bannerTitulo: v('#hi-btitulo'),
            bannerTexto: v('#hi-btexto'),
          },
        });
        e.currentTarget.disabled = false;
        msg.className = r.ok ? 'hint ok' : 'hint error';
        msg.textContent = r.ok ? 'Guardado.' : r.error;
        if (r.ok) { editando = null; pintarForm(); cargar(); }
      });
    };
    dibujar();
  }
}

function rangoVip(h) {
  if (!h.vip_nivel_min && !h.vip_nivel_max) return 'todos';
  const nom = (id) => (NIVELES.find((n) => n.id === id) || {}).nombre || '?';
  if (h.vip_nivel_min && h.vip_nivel_max) return h.vip_nivel_min === h.vip_nivel_max ? `solo ${nom(h.vip_nivel_min)}` : `${nom(h.vip_nivel_min)}–${nom(h.vip_nivel_max)}`;
  if (h.vip_nivel_min) return `${nom(h.vip_nivel_min)}+`;
  return `hasta ${nom(h.vip_nivel_max)}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
