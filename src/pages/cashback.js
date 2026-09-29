import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { puede } from '../lib/perfiles.js';

const ESTILOS = `
  <style>
    .cb-tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); margin:16px 0 12px; }
    .cb-tabs button { background:transparent; border:none; border-bottom:2px solid transparent; color:var(--text-dim);
      padding:8px 14px; font-size:13px; font-family:inherit; border-radius:0; }
    .cb-tabs button.is-active { color:var(--accent); border-bottom-color:var(--accent); font-weight:500; }
    .cb-filtros { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
    .cb-filtros input, .cb-filtros select { background:var(--surface-alt); border:1px solid var(--border); color:var(--text);
      border-radius:8px; padding:8px 11px; font-size:13px; font-family:inherit; }
    .cb-filtros input { flex:1; min-width:180px; }
    .cb-monto { color:var(--success); font-weight:600; }
    .cb-neg { color:var(--error); }
    .cb-acc { display:flex; gap:6px; }
    .cb-acc button { font-size:11.5px; font-family:inherit; padding:6px 11px; border-radius:7px; white-space:nowrap; }
    .cb-pager { display:flex; align-items:center; gap:12px; margin-top:12px; }
    .cb-pager span { font-size:13px; color:var(--text-dim); }
    .cb-pago { border:1px dashed var(--border); border-radius:10px; padding:14px; margin-top:10px; background:var(--surface-alt); max-width:460px; }
    .cb-pago h4 { margin:0 0 4px; font-size:14px; }
    .cb-subtabs { display:flex; gap:5px; margin:10px 0; }
    .cb-subtabs button { background:var(--surface); border:1px solid var(--border); border-radius:999px; padding:5px 12px;
      font-size:12px; color:var(--text-dim); font-family:inherit; }
    .cb-subtabs button.is-active { border-color:var(--accent); color:var(--accent); }
  </style>
`;

const ALIAS_TIPOS = ['ci', 'telefono', 'correo', 'ruc'];

export function renderCashback(container, { profile }) {
  const puedeConfig = puede(profile, 'ajustes');
  const puedeCobrar = puede(profile, 'cargar');

  let estado = 'disponible';
  let pagina = 1;
  let buscar = '';
  let ordenar = 'monto';

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Cashback</h2>
      <p class="hint">
        Al cerrar el período, cada jugador que perdió plata neta jugando recibe un %
        de vuelta. Solo cuentas verificadas y con carga aprobada.
      </p>
      <div id="cb-config"></div>
    </section>

    <section class="card">
      <div class="cb-tabs" id="cb-tabs">
        <button class="is-active" data-estado="disponible">Disponibles</button>
        <button data-estado="cobrado">Cobrados</button>
        <button data-estado="vencido">Vencidos</button>
      </div>
      <div class="cb-filtros">
        <input id="cb-buscar" placeholder="Buscar jugador por ID o usuario" autocomplete="off" />
        <select id="cb-ordenar">
          <option value="monto">Ordenar: mayor cashback</option>
          <option value="viejo">Más viejo primero</option>
        </select>
      </div>
      <div id="cb-lista"><p class="hint">Cargando...</p></div>
      <div id="cb-pager"></div>
    </section>
  `;

  const tabsEl = container.querySelector('#cb-tabs');
  tabsEl.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      estado = b.dataset.estado;
      pagina = 1;
      tabsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
      cargarLista();
    });
  });

  const buscarEl = container.querySelector('#cb-buscar');
  buscarEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { buscar = buscarEl.value.trim(); pagina = 1; cargarLista(); } });
  container.querySelector('#cb-ordenar').addEventListener('change', (e) => { ordenar = e.target.value; cargarLista(); });

  cargarConfig(container, puedeConfig, () => cargarLista());
  cargarLista();

  async function cargarLista() {
    const listaEl = container.querySelector('#cb-lista');
    listaEl.innerHTML = '<p class="hint">Cargando...</p>';

    const params = new URLSearchParams({ recurso: 'cashback', lista: '1', estado, pagina, ordenar });
    if (buscar) params.set('buscar', buscar);

    const { ok, data, error } = await apiFetch(`/api/config?${params}`);
    if (!ok) { listaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

    const tabDisp = tabsEl.querySelector('[data-estado="disponible"]');
    tabDisp.textContent = data.disponibles > 0 ? `Disponibles (${data.disponibles})` : 'Disponibles';

    const items = data.cashbacks || [];
    if (!items.length) {
      listaEl.innerHTML = `<p class="hint">${estado === 'disponible' ? 'Nadie tiene cashback disponible.' : 'Nada por acá.'}</p>`;
      container.querySelector('#cb-pager').innerHTML = '';
      return;
    }

    listaEl.innerHTML = `
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Jugador</th><th>Semana</th><th>Apostado</th><th>Ganado</th><th>Pérdida</th><th>Cashback</th><th></th></tr></thead>
        <tbody>
          ${items.map((c) => {
            const p = c.players || {};
            return `
              <tr data-id="${c.id}">
                <td>${escapeHtml(p.display_name || p.username || '')}<small class="hint">#${p.player_number ?? '—'} · @${escapeHtml(p.username || '')}</small></td>
                <td class="hint mono">${fSola(c.periodo_inicio)}–${fSola(c.periodo_fin)}</td>
                <td class="mono">${formatMoney(c.apostado)}</td>
                <td class="mono">${formatMoney(c.ganado)}</td>
                <td class="mono cb-neg">−${formatMoney(c.perdida)}</td>
                <td class="mono cb-monto">${formatMoney(c.monto)}</td>
                <td>${c.estado === 'disponible' && puedeCobrar ? `
                  <div class="cb-acc">
                    <button class="cb-fichas" data-id="${c.id}">En fichas</button>
                    <button class="secundario cb-retiro" data-id="${c.id}" data-nombre="${escapeHtml(p.display_name || p.username || '')}">Pagar retiro</button>
                  </div>
                ` : c.estado === 'cobrado' ? `<span class="badge badge-ok">${c.modo === 'retiro' ? 'Retiro' : 'Fichas'}</span> <small class="hint">${fechaCorta(c.cobrado_at)}</small>`
                  : '<span class="badge">Vencido</span>'}</td>
              </tr>
              <tr class="cb-pago-fila" data-para="${c.id}" hidden><td colspan="7"></td></tr>
            `;
          }).join('')}
        </tbody>
      </table></div>
    `;

    listaEl.querySelectorAll('.cb-fichas').forEach((btn) => {
      btn.addEventListener('click', () => cobrar(btn.dataset.id, { modo: 'fichas' }));
    });
    listaEl.querySelectorAll('.cb-retiro').forEach((btn) => {
      btn.addEventListener('click', () => abrirPagoRetiro(listaEl, btn.dataset.id, btn.dataset.nombre));
    });

    const totalPag = data.paginas || 1;
    container.querySelector('#cb-pager').innerHTML = totalPag > 1 ? `
      <div class="cb-pager">
        <button class="secundario" id="cb-prev" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
        <span>Página ${pagina} de ${totalPag}</span>
        <button class="secundario" id="cb-next" ${pagina >= totalPag ? 'disabled' : ''}>Siguiente</button>
      </div>
    ` : '';
    container.querySelector('#cb-prev')?.addEventListener('click', () => { pagina--; cargarLista(); });
    container.querySelector('#cb-next')?.addEventListener('click', () => { pagina++; cargarLista(); });
  }

  function abrirPagoRetiro(listaEl, id, nombre) {
    const fila = listaEl.querySelector(`.cb-pago-fila[data-para="${id}"]`);
    if (!fila.hidden) { fila.hidden = true; return; }
    listaEl.querySelectorAll('.cb-pago-fila').forEach((f) => { f.hidden = true; });
    fila.hidden = false;

    let metodo = 'alias';
    let aliasTipo = 'ci';

    const pintar = () => {
      fila.querySelector('td').innerHTML = `
        <div class="cb-pago">
          <h4>Pagar cashback de ${escapeHtml(nombre)} como retiro</h4>
          <p class="hint">Se crea una solicitud en Solicitudes. Al aprobarla, transferís y queda pagado.</p>
          <div class="cb-subtabs">
            <button data-m="alias" class="${metodo === 'alias' ? 'is-active' : ''}">Alias</button>
            <button data-m="cuenta" class="${metodo === 'cuenta' ? 'is-active' : ''}">Cuenta bancaria</button>
          </div>
          ${metodo === 'alias' ? `
            <div class="campos-fila">
              <label class="field">Tipo
                <select id="cb-alias-tipo">
                  ${ALIAS_TIPOS.map((t) => `<option value="${t}" ${t === aliasTipo ? 'selected' : ''}>${t.toUpperCase()}</option>`).join('')}
                </select>
              </label>
              <label class="field">Dato del alias<input id="cb-alias-valor" autocomplete="off" /></label>
            </div>
          ` : `
            <div class="campos-fila">
              <label class="field">Banco<input id="cb-banco" autocomplete="off" /></label>
              <label class="field">Nº de cuenta<input id="cb-numero" autocomplete="off" /></label>
            </div>
            <div class="campos-fila">
              <label class="field">Titular<input id="cb-titular" autocomplete="off" /></label>
              <label class="field">Documento<input id="cb-doc" autocomplete="off" /></label>
            </div>
          `}
          <div class="acciones">
            <button id="cb-pago-ok">Crear solicitud de pago</button>
            <button class="secundario" id="cb-pago-no">Cancelar</button>
          </div>
          <p class="cb-pago-msg hint"></p>
        </div>
      `;

      fila.querySelectorAll('.cb-subtabs button').forEach((b) => {
        b.addEventListener('click', () => { metodo = b.dataset.m; pintar(); });
      });
      fila.querySelector('#cb-alias-tipo')?.addEventListener('change', (e) => { aliasTipo = e.target.value; });
      fila.querySelector('#cb-pago-no').addEventListener('click', () => { fila.hidden = true; });
      fila.querySelector('#cb-pago-ok').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const msg = fila.querySelector('.cb-pago-msg');
        const body = { modo: 'retiro', metodoTipo: metodo };

        if (metodo === 'alias') {
          body.aliasTipo = fila.querySelector('#cb-alias-tipo').value;
          body.aliasValor = fila.querySelector('#cb-alias-valor').value.trim();
          if (!body.aliasValor) { msg.className = 'cb-pago-msg hint error'; msg.textContent = 'Completá el alias.'; return; }
        } else {
          body.banco = fila.querySelector('#cb-banco').value.trim();
          body.numeroCuenta = fila.querySelector('#cb-numero').value.trim();
          body.titular = fila.querySelector('#cb-titular').value.trim();
          body.documento = fila.querySelector('#cb-doc').value.trim();
          if (!body.banco || !body.numeroCuenta || !body.titular || !body.documento) {
            msg.className = 'cb-pago-msg hint error'; msg.textContent = 'Completá todos los datos.'; return;
          }
        }

        btn.disabled = true;
        msg.className = 'cb-pago-msg hint';
        msg.textContent = 'Creando...';
        await cobrar(id, body);
      });
    };

    pintar();
  }

  async function cobrar(id, body) {
    const { ok, error } = await apiFetch('/api/config?recurso=cashback&accion=cobrar', {
      method: 'POST', body: { periodoId: id, ...body },
    });
    if (!ok) { window.alert(error); return; }
    cargarLista();
  }
}

async function cargarConfig(container, puedeEditar, onCambio) {
  const el = container.querySelector('#cb-config');
  const { ok, data, error } = await apiFetch('/api/config?recurso=cashback');
  if (!ok) { el.innerHTML = `<p class="hint error">${error}</p>`; return; }

  el.innerHTML = `
    <div class="campos-fila" style="margin-top:10px">
      <label class="st-permiso" style="max-width:180px">
        <input type="checkbox" id="cb-activo" ${data.activo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} />
        <span>Activo</span>
      </label>
      <label class="field corto">% de la pérdida
        <input id="cb-pct" type="number" min="1" max="100" step="0.5" value="${data.porcentaje}" ${puedeEditar ? '' : 'disabled'} />
      </label>
      <label class="field">Período
        <select id="cb-periodo" ${puedeEditar ? '' : 'disabled'}>
          <option value="semanal" ${data.periodo === 'semanal' ? 'selected' : ''}>Semanal (lun–dom)</option>
          <option value="mensual" ${data.periodo === 'mensual' ? 'selected' : ''}>Mensual</option>
          <option value="diario" ${data.periodo === 'diario' ? 'selected' : ''}>Diario</option>
        </select>
      </label>
      <label class="field">Mínimo apostado (${currency.symbol})
        <input id="cb-min" type="number" min="0" value="${data.min_apostado}" ${puedeEditar ? '' : 'disabled'} />
      </label>
      <label class="field corto">Vence a los (días)
        <input id="cb-vence" type="number" min="0" value="${data.vence_dias}" ${puedeEditar ? '' : 'disabled'} />
      </label>
      <label class="field corto">Rollover (×)
        <input id="cb-rollover" type="number" min="0" step="0.5" value="${data.rollover ?? 0}" ${puedeEditar ? '' : 'disabled'} />
      </label>
    </div>
    <p class="hint" style="margin:2px 0 0">El rollover del cashback aplica solo con el modo avanzado de Billetera. 0 = sale libre, como hoy.</p>
    ${puedeEditar ? `
      <div class="acciones">
        <button id="cb-guardar">Guardar</button>
        <button class="secundario" id="cb-cerrar">Cerrar el período ahora</button>
      </div>
      <p id="cb-cfg-msg" class="hint"></p>
    ` : ''}
  `;

  if (!puedeEditar) return;

  const msg = el.querySelector('#cb-cfg-msg');

  el.querySelector('#cb-guardar').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    msg.className = 'hint'; msg.textContent = 'Guardando...';
    const { ok, error } = await apiFetch('/api/config?recurso=cashback&accion=config', {
      method: 'POST',
      body: {
        activo: el.querySelector('#cb-activo').checked,
        porcentaje: Number(el.querySelector('#cb-pct').value),
        periodo: el.querySelector('#cb-periodo').value,
        minApostado: Number(el.querySelector('#cb-min').value) || 0,
        venceDias: Number(el.querySelector('#cb-vence').value) || 0,
        rollover: Number(el.querySelector('#cb-rollover').value) || 0,
      },
    });
    e.currentTarget.disabled = false;
    if (!ok) { msg.className = 'hint error'; msg.textContent = error; return; }
    msg.className = 'hint ok'; msg.textContent = 'Guardado.';
  });

  el.querySelector('#cb-cerrar').addEventListener('click', async (e) => {
    if (!window.confirm('¿Cerrar el período de cashback ahora? Se calcula el cashback de todos los que califican.')) return;
    e.currentTarget.disabled = true;
    msg.className = 'hint'; msg.textContent = 'Cerrando período...';
    const { ok, data, error } = await apiFetch('/api/config?recurso=cashback&accion=cerrar', { method: 'POST', body: {} });
    e.currentTarget.disabled = false;
    if (!ok) { msg.className = 'hint error'; msg.textContent = error; return; }
    msg.className = 'hint ok'; msg.textContent = `Listo. ${data.cerrados || 0} cashback(s) nuevo(s).`;
    onCambio?.();
  });
}

function fSola(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
