import { apiFetch } from '../lib/api.ts';
import { formatMoney } from '../lib/currency.ts';
import { puede } from '../lib/perfiles.js';
import { fechaCorta } from '../lib/players.js';

const ESTILOS = `
<style>
  .fo-boveda {
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
    background: var(--surface-alt); border-radius: var(--radius);
    padding: 16px 18px; margin: 12px 0 18px;
  }
  .fo-boveda strong { font-size: 26px; font-variant-numeric: tabular-nums; }
  .fo-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
  .fo-card {
    border: 1px solid var(--border); border-radius: var(--radius);
    background: var(--surface-alt-glass); padding: 14px;
  }
  .fo-card .nom { font-weight: 600; font-size: 14px; }
  .fo-card .mail { font-size: 12px; color: var(--text-dim); }
  .fo-card .saldo { font-size: 20px; font-variant-numeric: tabular-nums; margin: 8px 0; }
  .fo-acc { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .fo-acc input { width: 110px; }
  .fo-modo { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; border-radius: 999px; padding: 2px 10px; }
  .fo-modo.on { color: var(--success); border: 1px solid color-mix(in srgb, var(--success) 40%, transparent); }
  .fo-modo.off { color: var(--text-dim); border: 1px solid var(--border); }
</style>
`;

const TIPO_TXT = {
  fabricar: 'Fabricó',
  asignar: 'Asignó',
  devolver: 'Devolvió',
  carga_caja: 'Carga de caja',
  retiro_caja: 'Retiro de caja',
  carga_boveda: 'Salió de bóveda',
  retiro_boveda: 'Volvió a bóveda',
};

export function renderFondos(container, { profile }) {
  const puedeVer = puede(profile, 'asignar_fichas') || puede(profile, 'fabricar_fichas');
  if (!puedeVer) {
    container.innerHTML = '<section class="card"><p class="hint">No tenés permiso para ver los fondos.</p></section>';
    return;
  }

  const puedeFabricar = puede(profile, 'fabricar_fichas');
  const puedeAsignar = puede(profile, 'asignar_fichas');

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Fondos de cajero</h2>
      <p class="hint">
        Las fichas no son plata. El admin las fabrica en la bóveda y se las da a
        cada cajero. El cajero solo puede cargar a un jugador con las que tiene.
        El dinero real se anota cuando el jugador transfiere o cuando se paga un retiro.
      </p>
      <div id="fo-cfg"><p class="hint">Cargando...</p></div>
    </section>
  `;

  cargar();

  async function cargar() {
    const el = container.querySelector('#fo-cfg');
    const { ok, data, error } = await apiFetch('/api/caja?recurso=fondos');
    if (!ok) { el.innerHTML = `<p class="hint error">${error}</p>`; return; }

    const on = Boolean(data.cajaConFondo);
    const boveda = data.boveda || { fichas: 0, fabricadas: 0 };
    const lista = (data.fondos || []).filter((f) => f.active).sort((a, b) => b.fichas - a.fichas);
    const movs = data.movimientos || [];

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
        <span class="fo-modo ${on ? 'on' : 'off'}">${on ? 'Caja con fondo activa' : 'Modo libre (como hoy)'}</span>
        ${puedeFabricar ? `
          <label style="display:inline-flex;gap:8px;align-items:center;font-size:13px">
            <input type="checkbox" id="fo-flag" ${on ? 'checked' : ''} />
            Exigir fondo para cargar
          </label>
        ` : ''}
      </div>
      ${puedeFabricar ? `
        <p class="hint" style="margin-top:-4px">
          Encendelo recién después de fabricar un stock y asignárselo a los cajeros.
          Si lo prendés con fondos en 0, nadie puede cargar.
        </p>
      ` : ''}

      <div class="fo-boveda">
        <span>Bóveda</span>
        <strong>${formatMoney(boveda.fichas)}</strong>
        <span class="hint">fabricadas en total ${formatMoney(boveda.fabricadas)}</span>
      </div>

      ${puedeFabricar ? `
        <div class="fo-acc" style="margin-bottom:18px">
          <input id="fo-fab-monto" type="number" min="0" placeholder="Fabricar" />
          <input id="fo-fab-nota" placeholder="Motivo (opcional)" />
          <button id="fo-fab">Fabricar fichas</button>
        </div>
      ` : ''}

      <h3>Cajeros</h3>
      <div class="fo-grid">
        ${lista.map((f) => {
          const revendedor = f.perfil === 'externo' && f.externoModo !== 'comisionista';
          const comisionista = f.perfil === 'externo' && f.externoModo === 'comisionista';
          const etiqueta = comisionista ? 'comisionista' : revendedor ? 'revendedor' : (f.perfil || '');
          return `
          <div class="fo-card" data-id="${f.staffId}" data-revendedor="${revendedor ? '1' : ''}">
            <div class="nom">${escapeHtml(f.nombre)}</div>
            <div class="mail">${escapeHtml(f.email)} · ${escapeHtml(etiqueta)}</div>
            <div class="saldo">${formatMoney(f.fichas)}</div>
            ${comisionista ? `
              <p class="hint" style="margin:0">No compra fichas. Sus jugadores recargan a la casa (${Number(f.comisionPct) || 0}%).</p>
            ` : puedeAsignar ? `
              ${revendedor ? `
                <p class="hint" style="margin:4px 0 8px">Pagó en plata + margen. Las fichas extra son para que revenda. El retiro de sus jugadores lo paga él.</p>
                <div class="fo-acc">
                  <input class="fo-pago" type="number" min="0" placeholder="Pagó" />
                  <input class="fo-margen" type="number" min="0" max="500" step="0.5" value="50" placeholder="%" style="width:70px" />
                  <span class="hint fo-prev" style="align-self:center"></span>
                </div>
              ` : ''}
              <div class="fo-acc">
                ${revendedor ? '<input class="fo-monto" type="number" min="0" placeholder="Devolver fichas" />' : '<input class="fo-monto" type="number" min="0" placeholder="Monto" />'}
                <button class="fo-asig">${revendedor ? 'Acreditar lote' : 'Asignar'}</button>
                <button class="secundario fo-dev">Devolver</button>
              </div>
            ` : ''}
          </div>`;
        }).join('') || '<p class="hint">No hay cajeros.</p>'}
      </div>

      ${movs.length ? `
        <h3 style="margin-top:22px">Últimos movimientos de fichas</h3>
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Quién</th><th>Nota</th></tr></thead>
          <tbody>
            ${movs.map((m) => `
              <tr>
                <td class="mono">${fechaCorta(m.created_at)}</td>
                <td>${TIPO_TXT[m.tipo] || m.tipo}</td>
                <td class="mono">${formatMoney(m.amount)}</td>
                <td class="hint">${escapeHtml(m.created_by)}</td>
                <td class="hint">${escapeHtml(m.note || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      ` : ''}
      <p id="fo-msg" class="hint"></p>
    `;

    const msg = el.querySelector('#fo-msg');
    const aviso = (okMsg, err) => {
      msg.className = err ? 'hint error' : 'hint ok';
      msg.textContent = err || okMsg;
    };

    el.querySelector('#fo-flag')?.addEventListener('change', async (e) => {
      const r = await apiFetch('/api/caja?recurso=fondos&accion=config', {
        method: 'POST', body: { cajaConFondo: e.target.checked },
      });
      if (!r.ok) { e.target.checked = !e.target.checked; aviso('', r.error); return; }
      cargar();
    });

    el.querySelector('#fo-fab')?.addEventListener('click', async () => {
      const amount = Number(el.querySelector('#fo-fab-monto').value);
      const note = el.querySelector('#fo-fab-nota').value.trim();
      const r = await apiFetch('/api/caja?recurso=fondos&accion=fabricar', {
        method: 'POST', body: { amount, note },
      });
      if (!r.ok) { aviso('', r.error); return; }
      cargar();
    });

    el.querySelectorAll('.fo-card').forEach((card) => {
      const staffId = card.dataset.id;
      const esRev = card.dataset.revendedor === '1';
      const pagoEl = card.querySelector('.fo-pago');
      const margenEl = card.querySelector('.fo-margen');
      const prevEl = card.querySelector('.fo-prev');
      const montoEl = card.querySelector('.fo-monto');

      const actualizarPrev = () => {
        if (!prevEl || !pagoEl) return;
        const pago = Number(pagoEl.value);
        const margen = Number(margenEl?.value);
        if (!(pago > 0) || !Number.isFinite(margen)) { prevEl.textContent = ''; return; }
        const fichas = Math.round(pago * (1 + margen / 100));
        prevEl.textContent = `→ ${formatMoney(fichas)} en fichas`;
      };
      pagoEl?.addEventListener('input', actualizarPrev);
      margenEl?.addEventListener('input', actualizarPrev);

      card.querySelector('.fo-asig')?.addEventListener('click', async () => {
        const body = { staffId };
        if (esRev) {
          body.amount = Number(pagoEl?.value);
          body.margenPct = Number(margenEl?.value);
        } else {
          body.amount = Number(montoEl?.value);
        }
        const r = await apiFetch('/api/caja?recurso=fondos&accion=asignar', {
          method: 'POST', body,
        });
        if (!r.ok) { aviso('', r.error); return; }
        cargar();
      });
      card.querySelector('.fo-dev')?.addEventListener('click', async () => {
        const amount = Number(montoEl?.value);
        const r = await apiFetch('/api/caja?recurso=fondos&accion=devolver', {
          method: 'POST', body: { staffId, amount },
        });
        if (!r.ok) { aviso('', r.error); return; }
        cargar();
      });
    });
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
