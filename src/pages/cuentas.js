import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { puede } from '../lib/perfiles.js';

const MODOS = {
  monto:  { nombre: 'Por monto', ayuda: 'Le toca a la cuenta que menos recibió. Desempata la que se usó menos veces.' },
  turnos: { nombre: 'Por turnos', ayuda: 'Rota en orden, una después de la otra, sin mirar los montos.' },
  manual: { nombre: 'Sin rotación', ayuda: 'El jugador ve todas las cuentas y elige a cuál transferir.' },
};

const ESTILOS = `
<style>
  .ct-rot { background: var(--surface-alt-glass); border-radius: var(--radius); padding: 14px; margin-bottom: 16px; }
  .ct-modos { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
  .ct-modo {
    flex: 1; min-width: 140px; text-align: left;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 10px 12px; color: var(--text); font-weight: 400;
  }
  .ct-modo.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .ct-modo strong { display: block; font-size: 13px; font-weight: 500; }
  .ct-modo small { display: block; font-size: 11px; color: var(--text-dim); margin-top: 2px; }
  .ct-fila { display: flex; align-items: center; gap: 12px; padding: 11px 10px; border-radius: var(--radius);
             border: 1px solid var(--border); background: var(--surface-alt-glass); margin-bottom: 8px; }
  .ct-fila.siguiente { border-color: var(--accent); }
  .ct-nom { flex: 1; min-width: 0; }
  .ct-nom strong { display: block; font-size: 14px; font-weight: 500; }
  .ct-nom span { font-size: 12px; color: var(--text-dim); }
  .ct-barra { height: 4px; border-radius: 999px; background: var(--bg); overflow: hidden; margin-top: 6px; max-width: 260px; }
  .ct-barra i { display: block; height: 100%; background: var(--accent); }
  .ct-mon { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ct-mon strong { display: block; font-size: 14px; font-weight: 500; }
  .ct-mon span { font-size: 11px; color: var(--text-dim); }
  .ct-sig { font-size: 10px; border-radius: 999px; padding: 3px 9px; background: var(--accent); color: var(--accent-text); font-weight: 500; }
  .ct-tope { font-size: 11px; color: var(--error); }
</style>
`;

const TIPOS_DOC = ['CI', 'DNI', 'RUC', 'CUIT'];

export function renderCuentas(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Cuentas para recibir cargas</h2>
      <p class="hint">Estas son las cuentas que ve el jugador cuando toca Recargar. Solo se muestran las activas.</p>
      <div id="cu-rotacion"></div>
      <div id="cu-lista"><p class="hint">Cargando...</p></div>
      ${puedeEditar ? '<div class="acciones"><button id="cu-nueva">Agregar cuenta</button></div>' : ''}
      <div id="cu-form"></div>
    </section>
  `;

  if (puedeEditar) {
    container.querySelector('#cu-nueva').addEventListener('click', () => {
      formulario(container, {}, puedeEditar);
    });
  }

  cargar(container, puedeEditar);
  cargarRotacion(container, puedeEditar);
}

/* ---------------------------------------------------------
   Configuración de rotación
   --------------------------------------------------------- */
async function cargarRotacion(container, puedeEditar) {
  const rotEl = container.querySelector('#cu-rotacion');
  const { ok, data } = await apiFetch('/api/config?recurso=cuentas-stats');

  if (!ok) { rotEl.innerHTML = ''; return; }

  const { modo, reinicio } = data;

  rotEl.innerHTML = `
    <div class="ct-rot">
      <p class="form-grupo" style="margin-top:0">Rotación</p>
      <div class="ct-modos">
        ${Object.entries(MODOS).map(([key, m]) => `
          <button class="ct-modo ${key === modo ? 'on' : ''}" data-modo="${key}" ${puedeEditar ? '' : 'disabled'}>
            <strong>${m.nombre}</strong>
            <small>${m.ayuda}</small>
          </button>
        `).join('')}
      </div>

      ${modo !== 'manual' ? `
        <label class="field" style="max-width:220px;margin-bottom:0">Reiniciar contadores
          <select id="cu-reinicio" ${puedeEditar ? '' : 'disabled'}>
            <option value="diario" ${reinicio === 'diario' ? 'selected' : ''}>Cada día</option>
            <option value="mensual" ${reinicio === 'mensual' ? 'selected' : ''}>Cada mes</option>
            <option value="nunca" ${reinicio === 'nunca' ? 'selected' : ''}>Nunca (histórico)</option>
          </select>
        </label>
        <p class="hint" style="margin-bottom:0">
          Sin reinicio, una cuenta nueva se lleva todas las cargas hasta emparejar con las viejas.
        </p>
      ` : ''}
      <p id="cu-rot-msg" class="hint"></p>
    </div>
  `;

  if (!puedeEditar) return;

  const guardar = async (body) => {
    const msgEl = rotEl.querySelector('#cu-rot-msg');
    msgEl.className = 'hint';
    msgEl.textContent = 'Guardando...';

    const res = await apiFetch('/api/config?recurso=settings', { method: 'POST', body });

    if (!res.ok) {
      msgEl.className = 'hint error';
      msgEl.textContent = res.error;
      return;
    }

    cargarRotacion(container, puedeEditar);
    cargar(container, puedeEditar);
  };

  rotEl.querySelectorAll('[data-modo]').forEach((btn) => {
    btn.addEventListener('click', () => guardar({ rotacionModo: btn.dataset.modo }));
  });

  const selReinicio = rotEl.querySelector('#cu-reinicio');
  if (selReinicio) {
    selReinicio.addEventListener('change', (e) => guardar({ rotacionReinicio: e.target.value }));
  }
}

async function cargar(container, puedeEditar) {
  const listaEl = container.querySelector('#cu-lista');
  const { ok, data, error } = await apiFetch('/api/config?recurso=cuentas');

  if (!ok) {
    listaEl.innerHTML = `<p class="hint error">${error}</p>`;
    return;
  }

  const cuentas = data.cuentas || [];

  if (!cuentas.length) {
    listaEl.innerHTML = '<p class="hint">Todavía no hay cuentas cargadas. El jugador no va a poder recargar hasta que agregues una.</p>';
    return;
  }

  // Traemos cuánto recibió cada una para mostrarlo al lado
  const { data: st } = await apiFetch('/api/config?recurso=cuentas-stats');
  const stats = {};
  (st?.stats || []).forEach((s) => { stats[s.account_id] = s; });
  const siguienteId = st?.siguienteId;
  const conRotacion = st?.modo && st.modo !== 'manual';

  const maxRecibido = Math.max(1, ...Object.values(stats).map((s) => Number(s.recibido) || 0));

  listaEl.innerHTML = cuentas.map((c) => {
    const s = stats[c.id] || { recibido: 0, usos: 0 };
    const recibido = Number(s.recibido) || 0;
    const lleno = c.tope_periodo && recibido >= Number(c.tope_periodo);

    return `
      <div class="ct-fila ${c.id === siguienteId ? 'siguiente' : ''}">
        <div class="ct-nom">
          <strong class="${c.activa ? '' : 'inactivo'}">${escapeHtml(c.banco)} · ${escapeHtml(c.titular)}</strong>
          <span>
            ${escapeHtml(c.numero_cuenta)}${c.alias ? ` · ${escapeHtml(c.alias)}` : ''}
            ${conRotacion ? ` · ${s.usos} cargas` : ''}
          </span>
          ${conRotacion ? `<div class="ct-barra"><i style="width:${Math.round(recibido / maxRecibido * 100)}%"></i></div>` : ''}
          ${lleno ? '<span class="ct-tope">Llegó a su techo del período</span>' : ''}
        </div>

        ${conRotacion ? `
          <div class="ct-mon">
            <strong>${formatMoney(recibido)}</strong>
            <span>${c.tope_periodo ? `de ${formatMoney(c.tope_periodo)}` : 'recibido'}</span>
          </div>
        ` : ''}

        ${c.id === siguienteId ? '<span class="ct-sig">Siguiente</span>' : ''}
        ${c.activa ? '' : '<span class="badge badge-danger">Inactiva</span>'}
        ${puedeEditar ? `<button class="secundario cu-editar" data-id="${c.id}">Editar</button>` : ''}
      </div>
    `;
  }).join('');

  listaEl.querySelectorAll('.cu-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      formulario(container, cuentas.find((c) => c.id === btn.dataset.id), puedeEditar);
    });
  });
}

function formulario(container, cuenta, puedeEditar) {
  const formEl = container.querySelector('#cu-form');
  const esNueva = !cuenta.id;

  formEl.innerHTML = `
    <div class="card" style="margin-top:16px">
      <h3 style="margin-top:0">${esNueva ? 'Nueva cuenta' : 'Editar cuenta'}</h3>

      <p class="form-grupo">Datos de la cuenta</p>
      <label class="field">Banco
        <input id="cu-banco" value="${escapeHtml(cuenta.banco || '')}" placeholder="Banco Itaú" />
      </label>
      <label class="field">Titular
        <input id="cu-titular" value="${escapeHtml(cuenta.titular || '')}" placeholder="Nombre completo" />
      </label>
      <label class="field">Número de cuenta
        <input id="cu-numero" value="${escapeHtml(cuenta.numero_cuenta || '')}" placeholder="123456789" />
      </label>
      <label class="field">Alias
        <input id="cu-alias" value="${escapeHtml(cuenta.alias || '')}" placeholder="opcional" />
      </label>

      <p class="form-grupo">Documento del titular</p>
      <div class="fondo-bloque">
        <label class="st-permiso" style="max-width:none">
          <input type="checkbox" id="cu-mostrar-doc" ${cuenta.mostrar_documento ? 'checked' : ''} />
          <span>Mostrarle el documento al jugador</span>
        </label>
        <div class="campos-fila" style="margin-top:10px">
          <label class="field corto">Tipo
          <select id="cu-doc-tipo">
            <option value="">Tipo</option>
            ${TIPOS_DOC.map((t) => `<option value="${t}" ${cuenta.documento_tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          </label>
          <label class="field">Número
            <input id="cu-doc" value="${escapeHtml(cuenta.documento || '')}" placeholder="Número de documento" />
          </label>
        </div>
      </div>

      <p class="form-grupo">Rotación</p>
      <label class="field">Techo del período
        <input id="cu-tope" type="number" min="0" value="${cuenta.tope_periodo ?? ''}"
               placeholder="sin techo" />
      </label>
      <p class="hint">Al llegar a este monto, la cuenta sale de la rotación hasta el próximo reinicio.</p>

      <div class="campos-fila" style="align-items:flex-end">
        <label class="field corto">Orden
          <input id="cu-orden" type="number" value="${cuenta.orden ?? 0}" />
        </label>
        <label class="st-permiso" style="margin-bottom:14px;flex:0 0 auto">
          <input type="checkbox" id="cu-activa" ${cuenta.activa !== false ? 'checked' : ''} />
          <span>Activa</span>
        </label>
      </div>

      <div class="acciones">
        <button id="cu-guardar">Guardar</button>
        <button id="cu-cancelar" class="secundario">Cancelar</button>
      </div>
      <p id="cu-msg" class="hint"></p>
    </div>
  `;

  formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  formEl.querySelector('#cu-cancelar').addEventListener('click', () => {
    formEl.innerHTML = '';
  });

  formEl.querySelector('#cu-guardar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = formEl.querySelector('#cu-msg');

    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Guardando...';

    const { ok, error } = await apiFetch('/api/config?recurso=cuentas', {
      method: 'POST',
      body: {
        id: cuenta.id,
        banco: formEl.querySelector('#cu-banco').value,
        titular: formEl.querySelector('#cu-titular').value,
        numeroCuenta: formEl.querySelector('#cu-numero').value,
        alias: formEl.querySelector('#cu-alias').value,
        documento: formEl.querySelector('#cu-doc').value,
        documentoTipo: formEl.querySelector('#cu-doc-tipo').value,
        mostrarDocumento: formEl.querySelector('#cu-mostrar-doc').checked,
        orden: formEl.querySelector('#cu-orden').value,
        activa: formEl.querySelector('#cu-activa').checked,
        topePeriodo: formEl.querySelector('#cu-tope').value || null,
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
    cargarRotacion(container, puedeEditar);
  });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
