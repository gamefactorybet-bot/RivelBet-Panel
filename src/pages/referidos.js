import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { puede } from '../lib/perfiles.js';

const ESTILOS = `
  <style>
    .rf-cfg { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px 16px; margin:8px 0 14px; }
    .rf-cfg label { display:block; font-size:10.5px; letter-spacing:0.03em; text-transform:uppercase; color:var(--text-dim); margin-bottom:5px; font-weight:500; }
    .rf-cfg input { width:100%; background:var(--surface-alt-glass); border:1px solid var(--border-glass); color:var(--text);
      border-radius:8px; padding:9px 11px; font-size:13px; font-family:ui-monospace,monospace; }
    .rf-badge { font-size:10.5px; border-radius:999px; padding:1px 8px; border:1px solid var(--border); color:var(--text-dim); }
    .rf-badge.ok { color:var(--success); border-color:color-mix(in srgb,var(--success) 40%,transparent); }
    .rf-badge.wait { color:var(--accent); border-color:color-mix(in srgb,var(--accent) 40%,transparent); }
  </style>
`;

export function renderReferidos(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');
  let pagina = 1;

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Referidos</h2>
      <p class="hint">
        El bono se paga cuando el invitado hace su primera carga aprobada, arriba del mínimo.
        Así cada referido pagado metió plata real.
      </p>
      <div id="rf-cfg"></div>
    </section>
    <section class="card">
      <h3 style="margin-top:0">Referidos</h3>
      <div id="rf-lista"><p class="hint">Cargando...</p></div>
      <div id="rf-pager"></div>
    </section>
  `;

  cargarCfg(container, puedeEditar);
  cargarLista();

  async function cargarLista() {
    const listaEl = container.querySelector('#rf-lista');
    const { ok, data, error } = await apiFetch(`/api/config?recurso=referidos&lista=1&pagina=${pagina}`);
    if (!ok) { listaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

    const items = data.referidos || [];
    if (!items.length) {
      listaEl.innerHTML = '<p class="hint">Todavía no hay referidos.</p>';
      container.querySelector('#rf-pager').innerHTML = '';
      return;
    }

    listaEl.innerHTML = `
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Invitó</th><th>Invitado</th><th>Registro</th><th>Estado</th></tr></thead>
        <tbody>
          ${items.map((r) => {
            const a = r.referidor || {};
            const b = r.referido || {};
            return `
              <tr>
                <td>${escapeHtml(a.display_name || a.username || '—')}<small class="hint">#${a.player_number ?? '—'}</small></td>
                <td>${escapeHtml(b.display_name || b.username || '—')}<small class="hint">#${b.player_number ?? '—'}</small></td>
                <td class="hint mono">${fechaCorta(r.created_at)}</td>
                <td>${r.estado === 'pagado'
                  ? `<span class="rf-badge ok">Pagado${r.pagado_at ? ' · ' + fechaCorta(r.pagado_at) : ''}</span>`
                  : '<span class="rf-badge wait">Registrado, falta cargar</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table></div>
    `;

    const totalPag = data.paginas || 1;
    container.querySelector('#rf-pager').innerHTML = totalPag > 1 ? `
      <div class="acciones" style="margin-top:12px">
        <button class="secundario" id="rf-prev" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
        <span class="hint">Página ${pagina} de ${totalPag}</span>
        <button class="secundario" id="rf-next" ${pagina >= totalPag ? 'disabled' : ''}>Siguiente</button>
      </div>
    ` : '';
    container.querySelector('#rf-prev')?.addEventListener('click', () => { pagina--; cargarLista(); });
    container.querySelector('#rf-next')?.addEventListener('click', () => { pagina++; cargarLista(); });
  }
}

async function cargarCfg(container, puedeEditar) {
  const el = container.querySelector('#rf-cfg');
  const { ok, data, error } = await apiFetch('/api/config?recurso=referidos');
  if (!ok) { el.innerHTML = `<p class="hint error">${error}</p>`; return; }

  el.innerHTML = `
    <label class="st-permiso" style="max-width:170px;margin-bottom:6px">
      <input type="checkbox" id="rf-activo" ${data.activo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} />
      <span>Activo</span>
    </label>
    <div class="rf-cfg">
      <div><label>Bono al que invita (${currency.symbol})</label><input id="rf-bdor" type="number" min="0" value="${data.bono_referidor}" ${puedeEditar ? '' : 'disabled'} /></div>
      <div><label>Bono al invitado (${currency.symbol})</label><input id="rf-bido" type="number" min="0" value="${data.bono_referido}" ${puedeEditar ? '' : 'disabled'} /></div>
      <div><label>Carga mínima del invitado (${currency.symbol})</label><input id="rf-min" type="number" min="0" value="${data.min_carga}" ${puedeEditar ? '' : 'disabled'} /></div>
      <div><label>Tope por jugador (0 = sin tope)</label><input id="rf-tope" type="number" min="0" value="${data.tope}" ${puedeEditar ? '' : 'disabled'} /></div>
      <div><label>Rollover del bono (×)</label><input id="rf-rollover" type="number" min="0" step="0.5" value="${data.rollover ?? 1}" ${puedeEditar ? '' : 'disabled'} /><small class="hint">Aplica solo con el modo avanzado de Billetera.</small></div>
    </div>
    ${puedeEditar ? `<div class="acciones"><button id="rf-guardar">Guardar</button></div><p id="rf-cfg-msg" class="hint"></p>` : ''}
  `;

  if (!puedeEditar) return;

  el.querySelector('#rf-guardar').addEventListener('click', async (e) => {
    const msg = el.querySelector('#rf-cfg-msg');
    e.currentTarget.disabled = true;
    msg.className = 'hint'; msg.textContent = 'Guardando...';
    const r = await apiFetch('/api/config?recurso=referidos', {
      method: 'POST',
      body: {
        activo: el.querySelector('#rf-activo').checked,
        bonoReferidor: Number(el.querySelector('#rf-bdor').value) || 0,
        bonoReferido: Number(el.querySelector('#rf-bido').value) || 0,
        minCarga: Number(el.querySelector('#rf-min').value) || 0,
        tope: Number(el.querySelector('#rf-tope').value) || 0,
        rollover: Number(el.querySelector('#rf-rollover').value) || 0,
      },
    });
    e.currentTarget.disabled = false;
    msg.className = r.ok ? 'hint ok' : 'hint error';
    msg.textContent = r.ok ? 'Guardado.' : r.error;
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
