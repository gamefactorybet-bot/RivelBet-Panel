import { apiFetch } from '../lib/api.ts';
import { formatMoney } from '../lib/currency.ts';
import { puede } from '../lib/perfiles.js';

const ESTILOS = `
<style>
  .cc-filtros { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 16px; }
  .cc-filtros .field { margin-bottom: 0; width: 155px; }
  .cc-rapidos { display: flex; gap: 6px; }
  .cc-rapidos button { padding: 9px 13px; font-size: 12px; }
  .cc-total {
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
    background: var(--surface-alt); border-radius: var(--radius);
    padding: 14px 16px; margin-top: 14px;
  }
  .cc-total strong { font-size: 22px; font-variant-numeric: tabular-nums; }
  .cc-total span { font-size: 12px; color: var(--text-dim); }
  .cc-pos { color: var(--success); }
  .cc-neg { color: var(--error); }
</style>
`;

export function renderCierre(container, { profile }) {
  if (!puede(profile, 'ver_historial')) {
    container.innerHTML = '<section class="card"><p class="hint">No tenés permiso para ver el cierre de caja.</p></section>';
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const estado = { desde: hoy, hasta: hoy };

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Cierre de caja</h2>
      <p class="hint">La plata que realmente entró y salió (depósitos aprobados y retiros pagados), aparte de las fichas que movió cada cajero.</p>

      <div class="cc-filtros">
        <label class="field">Desde
          <input id="cc-desde" type="date" value="${hoy}" />
        </label>
        <label class="field">Hasta
          <input id="cc-hasta" type="date" value="${hoy}" />
        </label>
        <div class="cc-rapidos">
          <button class="secundario" data-rango="hoy">Hoy</button>
          <button class="secundario" data-rango="ayer">Ayer</button>
          <button class="secundario" data-rango="semana">7 días</button>
          <button class="secundario" data-rango="mes">Mes</button>
        </div>
      </div>

      <div id="cc-tabla"><p class="hint">Cargando...</p></div>
    </section>
  `;

  const refrescar = () => cargar(container, estado);

  ['#cc-desde', '#cc-hasta'].forEach((sel) => {
    container.querySelector(sel).addEventListener('change', (e) => {
      estado[sel === '#cc-desde' ? 'desde' : 'hasta'] = e.target.value;
      refrescar();
    });
  });

  container.querySelectorAll('[data-rango]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hoyD = new Date();
      const desde = new Date();
      let hasta = hoyD;

      if (btn.dataset.rango === 'ayer') {
        desde.setDate(hoyD.getDate() - 1);
        hasta = new Date(desde);
      }
      if (btn.dataset.rango === 'semana') desde.setDate(hoyD.getDate() - 6);
      if (btn.dataset.rango === 'mes') desde.setDate(hoyD.getDate() - 29);

      estado.desde = desde.toISOString().slice(0, 10);
      estado.hasta = hasta.toISOString().slice(0, 10);
      container.querySelector('#cc-desde').value = estado.desde;
      container.querySelector('#cc-hasta').value = estado.hasta;
      refrescar();
    });
  });

  refrescar();
}

async function cargar(container, estado) {
  const tablaEl = container.querySelector('#cc-tabla');
  tablaEl.innerHTML = '<p class="hint">Cargando...</p>';

  const { ok, data, error } = await apiFetch(
    `/api/caja?recurso=cierre&desde=${estado.desde}&hasta=${estado.hasta}`
  );

  if (!ok) { tablaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

  const filas = data.cierre || [];
  const juegos = data.juegos || { giros: 0, apostado: 0, pagado: 0, margen: 0 };
  const plata = data.plata || null;
  const fichas = data.fichas || [];

  if (!filas.length && !juegos.giros && !plata) {
    tablaEl.innerHTML = '<p class="hint">No hubo movimientos en el período.</p>';
    return;
  }

  const totalNeto = filas.reduce((a, f) => a + Number(f.neto), 0);

  tablaEl.innerHTML = `
    ${plata ? `
      <h3 style="margin-top:0">Plata (banco y efectivo)</h3>
      <div class="stats">
        <div class="stat"><small class="hint">Entró</small><strong class="cc-pos">${formatMoney(plata.entrada)}</strong><small class="hint">${plata.entrada_cantidad} depósitos</small></div>
        <div class="stat"><small class="hint">Salió</small><strong class="cc-neg">${formatMoney(plata.salida)}</strong><small class="hint">${plata.salida_cantidad} retiros pagados</small></div>
        <div class="stat"><small class="hint">Neto</small><strong class="${Number(plata.neto) >= 0 ? 'cc-pos' : 'cc-neg'}">${formatMoney(plata.neto)}</strong></div>
      </div>
      <p class="hint">Esto es dinero real. Las fichas de abajo no son plata.</p>
    ` : ''}

    ${filas.length ? `
      <div class="tabla-scroll">
        <table class="tabla">
          <thead>
            <tr>
              <th>Cajero</th>
              <th class="mono">Cargas</th>
              <th class="mono">Retiros</th>
              <th class="mono">Anulaciones</th>
              <th class="mono">Neto</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map((f) => `
              <tr>
                <td>${escapeHtml(cortarMail(f.cajero))}</td>
                <td class="mono">
                  ${formatMoney(f.cargas_monto)}
                  <small class="hint">${f.cargas_cantidad} operaciones</small>
                </td>
                <td class="mono">
                  ${formatMoney(f.retiros_monto)}
                  <small class="hint">${f.retiros_cantidad} operaciones</small>
                </td>
                <td class="mono ${Number(f.anulaciones) ? 'hint error' : 'hint'}">${f.anulaciones}</td>
                <td class="mono ${Number(f.neto) >= 0 ? 'cc-pos' : 'cc-neg'}">
                  ${formatMoney(f.neto)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="cc-total">
        <span>Fichas netas por cajero (cargas menos retiros, libro viejo)</span>
        <strong class="${totalNeto >= 0 ? 'cc-pos' : 'cc-neg'}">${formatMoney(totalNeto)}</strong>
      </div>
    ` : '<p class="hint">Sin movimientos de caja en el período.</p>'}

    ${fichas.length ? `
      <h3>Fichas de fondos</h3>
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Cajero</th><th class="mono">Asignadas</th><th class="mono">Devueltas</th><th class="mono">Entregadas</th><th class="mono">Recuperadas</th></tr></thead>
        <tbody>
          ${fichas.map((f) => `
            <tr>
              <td>${escapeHtml(f.nombre || f.staff_id || '—')}</td>
              <td class="mono">${formatMoney(f.asignadas)}</td>
              <td class="mono">${formatMoney(f.devueltas)}</td>
              <td class="mono">${formatMoney(f.entregadas)}</td>
              <td class="mono">${formatMoney(f.recuperadas)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table></div>
    ` : ''}

    ${juegos.giros ? `
      <h3>Juegos</h3>
      <div class="stats">
        <div class="stat"><small class="hint">Giros</small><strong>${juegos.giros.toLocaleString('es-PY')}</strong></div>
        <div class="stat"><small class="hint">Apostado</small><strong>${formatMoney(juegos.apostado)}</strong></div>
        <div class="stat"><small class="hint">Pagado</small><strong>${formatMoney(juegos.pagado)}</strong></div>
        <div class="stat">
          <small class="hint">Margen</small>
          <strong class="${juegos.margen >= 0 ? 'cc-pos' : 'cc-neg'}">${formatMoney(juegos.margen)}</strong>
          <small class="hint">${juegos.apostado ? ((juegos.pagado / juegos.apostado) * 100).toFixed(1) + '% de retorno' : ''}</small>
        </div>
      </div>
      <p class="hint">
        El margen de juegos no es efectivo: son fichas que los jugadores todavía tienen o ya retiraron.
      </p>
    ` : ''}
  `;
}

function cortarMail(txt) {
  const s = String(txt ?? '—');
  return s.includes('@') ? s.split('@')[0] : s;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
