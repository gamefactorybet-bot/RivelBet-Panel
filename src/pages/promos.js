import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { puede } from '../lib/perfiles.js';

// Códigos promocionales. Free bet (el jugador canja y le cae el bono) o
// match sobre depósito (mete el código al recargar). Todo con su rollover.

const ESTILOS = `
  <style>
    .pr-form { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px 16px; margin:10px 0 4px; }
    .pr-form label { display:block; font-size:10.5px; letter-spacing:0.03em; text-transform:uppercase; color:var(--text-dim); margin-bottom:5px; font-weight:500; }
    .pr-form input, .pr-form select { width:100%; background:var(--surface-alt-glass); border:1px solid var(--border-glass); color:var(--text);
      border-radius:8px; padding:9px 11px; font-size:13px; font-family:ui-monospace,monospace; }
    .pr-cod { font-family:ui-monospace,monospace; font-weight:600; letter-spacing:0.04em; }
    .pr-badge { font-size:10.5px; border-radius:999px; padding:1px 8px; border:1px solid var(--border); color:var(--text-dim); }
    .pr-badge.ok { color:var(--success); border-color:color-mix(in srgb,var(--success) 40%,transparent); }
    .pr-badge.off { color:var(--text-faint); }
  </style>
`;

export function renderPromos(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');
  let editando = null;

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Códigos promocionales</h2>
      <p class="hint">
        <b>Free bet</b>: el jugador canjea el código desde su cuenta y le cae el bono.
        <b>Match sobre depósito</b>: mete el código al recargar y se le suma al aprobar la carga
        (reemplaza al bono automático). El rollover aplica solo con el modo avanzado de Billetera.
      </p>
      ${puedeEditar ? '<div class="acciones"><button id="pr-nuevo">Nuevo código</button></div>' : ''}
      <div id="pr-form-box"></div>
    </section>
    <section class="card">
      <h3 style="margin-top:0">Códigos</h3>
      <div id="pr-lista"><p class="hint">Cargando...</p></div>
    </section>
  `;

  if (puedeEditar) {
    container.querySelector('#pr-nuevo').addEventListener('click', () => { editando = {}; pintarForm(); });
  }

  cargar();

  async function cargar() {
    const el = container.querySelector('#pr-lista');
    const { ok, data, error } = await apiFetch('/api/config?recurso=promos');
    if (!ok) { el.innerHTML = `<p class="hint error">${error}</p>`; return; }

    const items = data.promos || [];
    if (!items.length) { el.innerHTML = '<p class="hint">Todavía no hay códigos.</p>'; return; }

    el.innerHTML = `
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Código</th><th>Da</th><th>Tipo</th><th>Rollover</th><th>Usos</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
        <tbody>
          ${items.map((p) => `
            <tr>
              <td class="pr-cod">${escapeHtml(p.codigo)}${p.descripcion ? `<small class="hint">${escapeHtml(p.descripcion)}</small>` : ''}</td>
              <td class="mono">${p.tipo === 'porcentaje' ? `${p.valor}%` : formatMoney(p.valor)}${p.tope ? `<small class="hint">tope ${formatMoney(p.tope)}</small>` : ''}</td>
              <td>${p.requiere_carga ? 'Match carga' : 'Free bet'}</td>
              <td class="mono">${p.rollover}×</td>
              <td class="mono">${p.usos}${p.tope_usos ? ` / ${p.tope_usos}` : ''}</td>
              <td class="hint mono">${vigencia(p)}</td>
              <td>${p.activo ? '<span class="pr-badge ok">Activo</span>' : '<span class="pr-badge off">Inactivo</span>'}</td>
              <td>${puedeEditar ? `<button class="secundario pr-editar" data-id="${p.id}">Editar</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    `;

    el.querySelectorAll('.pr-editar').forEach((b) => {
      b.addEventListener('click', () => { editando = items.find((x) => x.id === b.dataset.id) || {}; pintarForm(); });
    });
  }

  function pintarForm() {
    const box = container.querySelector('#pr-form-box');
    if (!editando) { box.innerHTML = ''; return; }
    const p = editando;
    box.innerHTML = `
      <div class="card" style="margin-top:12px;background:var(--surface-alt-glass)">
        <h3 style="margin-top:0">${p.id ? 'Editar código' : 'Nuevo código'}</h3>
        <div class="pr-form">
          <div><label>Código</label><input id="pr-codigo" value="${escapeHtml(p.codigo || '')}" placeholder="NAVIDAD50" ${p.id ? 'disabled' : ''} /></div>
          <div style="grid-column:1/-1"><label>Descripción (interna)</label><input id="pr-desc" value="${escapeHtml(p.descripcion || '')}" placeholder="Campaña de fin de año" /></div>
          <div><label>Tipo de valor</label>
            <select id="pr-tipo">
              <option value="fijo" ${p.tipo !== 'porcentaje' ? 'selected' : ''}>Monto fijo</option>
              <option value="porcentaje" ${p.tipo === 'porcentaje' ? 'selected' : ''}>Porcentaje de la carga</option>
            </select>
          </div>
          <div><label>Valor</label><input id="pr-valor" type="number" min="0" value="${p.valor ?? ''}" /></div>
          <div><label>Tope del bono (%)</label><input id="pr-tope" type="number" min="0" value="${p.tope ?? ''}" placeholder="sin tope" /></div>
          <div><label>Rollover (×)</label><input id="pr-rollover" type="number" min="0" step="0.5" value="${p.rollover ?? 1}" /></div>
          <div><label>Modo</label>
            <select id="pr-modo">
              <option value="match" ${p.requiere_carga !== false ? 'selected' : ''}>Match sobre depósito</option>
              <option value="free" ${p.requiere_carga === false ? 'selected' : ''}>Free bet (sin cargar)</option>
            </select>
          </div>
          <div><label>Carga mínima (${currency.symbol})</label><input id="pr-min" type="number" min="0" value="${p.min_carga ?? 0}" /></div>
          <div><label>Tope de usos (0 = sin tope)</label><input id="pr-topeusos" type="number" min="0" value="${p.tope_usos ?? 0}" /></div>
          <div><label>Tope de conversión (× — vacío = global)</label><input id="pr-topeconv" type="number" min="0" step="0.5" value="${p.tope_conversion_mult ?? ''}" placeholder="global" /></div>
          <div><label>Solo en la carga N.° (desde)</label><input id="pr-cnmin" type="number" min="0" value="${p.carga_num_min ?? 0}" /></div>
          <div><label>…hasta la carga N.° (0 = sin límite)</label><input id="pr-cnmax" type="number" min="0" value="${p.carga_num_max ?? 0}" /></div>
          <div><label>Vigente desde</label><input id="pr-desde" type="date" value="${fechaInput(p.desde)}" /></div>
          <div><label>Vigente hasta</label><input id="pr-hasta" type="date" value="${fechaInput(p.hasta)}" /></div>
        </div>
        <label class="st-permiso" style="max-width:160px;margin:10px 0">
          <input type="checkbox" id="pr-activo" ${p.activo !== false ? 'checked' : ''} /><span>Activo</span>
        </label>
        <div class="acciones">
          <button id="pr-guardar">Guardar</button>
          <button class="secundario" id="pr-cancelar">Cancelar</button>
          ${p.id ? '<button class="secundario" id="pr-borrar">Desactivar</button>' : ''}
        </div>
        <p id="pr-msg" class="hint"></p>
      </div>
    `;

    box.querySelector('#pr-cancelar').addEventListener('click', () => { editando = null; pintarForm(); });

    box.querySelector('#pr-borrar')?.addEventListener('click', async () => {
      if (!window.confirm('¿Desactivar este código?')) return;
      const r = await apiFetch(`/api/config?recurso=promos&id=${p.id}`, { method: 'DELETE' });
      if (r.ok) { editando = null; pintarForm(); cargar(); }
    });

    box.querySelector('#pr-guardar').addEventListener('click', async (e) => {
      const msg = box.querySelector('#pr-msg');
      e.currentTarget.disabled = true;
      msg.className = 'hint'; msg.textContent = 'Guardando...';
      const r = await apiFetch('/api/config?recurso=promos', {
        method: 'POST',
        body: {
          id: p.id,
          codigo: box.querySelector('#pr-codigo').value,
          descripcion: box.querySelector('#pr-desc').value,
          tipo: box.querySelector('#pr-tipo').value,
          valor: Number(box.querySelector('#pr-valor').value) || 0,
          tope: box.querySelector('#pr-tope').value ? Number(box.querySelector('#pr-tope').value) : null,
          rollover: Number(box.querySelector('#pr-rollover').value) || 0,
          requiereCarga: box.querySelector('#pr-modo').value === 'match',
          minCarga: Number(box.querySelector('#pr-min').value) || 0,
          topeUsos: Number(box.querySelector('#pr-topeusos').value) || 0,
          topeConversionMult: box.querySelector('#pr-topeconv').value,
          cargaNumMin: Number(box.querySelector('#pr-cnmin').value) || 0,
          cargaNumMax: Number(box.querySelector('#pr-cnmax').value) || 0,
          desde: box.querySelector('#pr-desde').value || null,
          hasta: box.querySelector('#pr-hasta').value || null,
          activo: box.querySelector('#pr-activo').checked,
        },
      });
      e.currentTarget.disabled = false;
      msg.className = r.ok ? 'hint ok' : 'hint error';
      msg.textContent = r.ok ? 'Guardado.' : r.error;
      if (r.ok) { editando = null; pintarForm(); cargar(); }
    });
  }
}

function vigencia(p) {
  const f = (d) => fechaCorta(d).split(' ')[0];
  if (!p.desde && !p.hasta) return 'siempre';
  if (p.desde && p.hasta) return `${f(p.desde)}–${f(p.hasta)}`;
  if (p.desde) return `desde ${f(p.desde)}`;
  return `hasta ${f(p.hasta)}`;
}

function fechaInput(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
