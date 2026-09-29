import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { puede } from '../lib/perfiles.js';

let NIVELES = [];   // para el selector de "VIP mínimo" en el form

export function renderBonos(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');

  container.innerHTML = `
    <section class="card">
      <h2>Bonos por carga</h2>
      <p class="hint">
        El jugador ve el bono mientras escribe el monto. Al aprobar, el sistema lo
        recalcula sobre el monto que realmente entró y lo acredita solo.
      </p>
      <div id="bo-metricas"></div>
      <div id="bo-lista"><p class="hint">Cargando...</p></div>
      ${puedeEditar ? '<div class="acciones"><button id="bo-nuevo">Agregar bono</button></div>' : ''}
      <div id="bo-form"></div>
    </section>
  `;

  if (puedeEditar) {
    container.querySelector('#bo-nuevo').addEventListener('click', () => formulario(container, {}, puedeEditar));
  }

  apiFetch('/api/config?recurso=vip').then((r) => { if (r.ok) NIVELES = r.data.niveles || []; });
  cargarMetricas(container);
  cargar(container, puedeEditar);
}

async function cargarMetricas(container) {
  const el = container.querySelector('#bo-metricas');
  const { ok, data } = await apiFetch('/api/config?recurso=bonos&metricas=1');
  if (!ok || !data?.total) { el.innerHTML = ''; return; }
  const t = data.total;
  if (!Number(t.otorgados)) {
    el.innerHTML = '<p class="hint">Todavía no se otorgó ningún bono con rollover (solo cuenta en modo avanzado de Billetera).</p>';
    return;
  }
  const pct = (n) => t.otorgados ? Math.round(n / t.otorgados * 100) + '%' : '—';
  el.innerHTML = `
    <div class="gd-stats" style="display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 14px">
      <div class="gd-stat" style="flex:1;min-width:130px;background:var(--surface-alt-glass);border:1px solid var(--border-glass);border-radius:10px;padding:12px 14px">
        <small style="font-size:10.5px;text-transform:uppercase;color:var(--text-dim)">Otorgados</small>
        <strong style="display:block;font-size:19px">${t.otorgados}<span class="hint" style="font-size:12px"> · ${formatMoney(t.monto)}</span></strong>
      </div>
      <div class="gd-stat" style="flex:1;min-width:130px;background:var(--surface-alt-glass);border:1px solid var(--border-glass);border-radius:10px;padding:12px 14px">
        <small style="font-size:10.5px;text-transform:uppercase;color:var(--text-dim)">Liberados</small>
        <strong style="display:block;font-size:19px;color:var(--success)">${t.liberados}<span class="hint" style="font-size:12px"> · ${pct(t.liberados)}</span></strong>
      </div>
      <div class="gd-stat" style="flex:1;min-width:130px;background:var(--surface-alt-glass);border:1px solid var(--border-glass);border-radius:10px;padding:12px 14px">
        <small style="font-size:10.5px;text-transform:uppercase;color:var(--text-dim)">Perdidos (retiro anticipado)</small>
        <strong style="display:block;font-size:19px;color:var(--error)">${t.perdidos}<span class="hint" style="font-size:12px"> · ${pct(t.perdidos)}</span></strong>
      </div>
      <div class="gd-stat" style="flex:1;min-width:130px;background:var(--surface-alt-glass);border:1px solid var(--border-glass);border-radius:10px;padding:12px 14px">
        <small style="font-size:10.5px;text-transform:uppercase;color:var(--text-dim)">En curso</small>
        <strong style="display:block;font-size:19px">${t.activos}</strong>
      </div>
    </div>
    <p class="hint" style="margin:-6px 0 12px">
      Costo real que se llevó liberado: <b>${formatMoney(t.costo_perdido)}</b> ·
      forfeitado (no costó): <b>${formatMoney(t.costo_forfeit)}</b>.
      ${data.por_origen ? 'Por origen — ' + Object.entries(data.por_origen).map(([o, f]) =>
        `${o}: ${f.liberados}/${f.otorgados} lib`).join(' · ') : ''}
    </p>
  `;
}

async function cargar(container, puedeEditar) {
  const listaEl = container.querySelector('#bo-lista');
  const { ok, data, error } = await apiFetch('/api/config?recurso=bonos');

  if (!ok) {
    listaEl.innerHTML = `<p class="hint error">${error}</p>`;
    return;
  }

  const bonos = data.bonos || [];

  if (!bonos.length) {
    listaEl.innerHTML = '<p class="hint">Todavía no hay bonos. Las cargas se acreditan sin agregado.</p>';
    return;
  }

  listaEl.innerHTML = `
    <div class="tabla-scroll">
      <table class="tabla">
        <thead>
          <tr><th>Bono</th><th>Da</th><th>Tramo</th><th>Aplica a</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          ${bonos.map((b) => `
            <tr>
              <td>
                ${escapeHtml(b.nombre)}
                <small class="hint">orden ${b.orden}${vigencia(b)}</small>
              </td>
              <td class="mono">
                ${b.tipo === 'porcentaje' ? `${b.valor}%` : formatMoney(b.valor)}
                ${b.tope ? `<small class="hint">tope ${formatMoney(b.tope)}</small>` : ''}
              </td>
              <td class="mono hint">${tramo(b)}</td>
              <td>${b.aplica === 'primera'
                ? '<span class="badge badge-warn">Primera carga</span>'
                : '<span class="badge">Todas</span>'}</td>
              <td>${b.activo ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-danger">Inactivo</span>'}</td>
              <td>${puedeEditar ? `<button class="secundario bo-editar" data-id="${b.id}">Editar</button>` : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <p class="hint">
      Si un monto encaja en varios bonos, gana el de <strong>orden</strong> más bajo.
    </p>
  `;

  listaEl.querySelectorAll('.bo-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      formulario(container, bonos.find((b) => b.id === btn.dataset.id), puedeEditar);
    });
  });
}

function tramo(b) {
  if (!b.monto_max) return `desde ${formatMoney(b.monto_min)}`;
  return `${formatMoney(b.monto_min)} a ${formatMoney(b.monto_max)}`;
}

function vigencia(b) {
  if (!b.desde && !b.hasta) return '';
  const f = (iso) => new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
  if (b.desde && b.hasta) return ` · ${f(b.desde)} al ${f(b.hasta)}`;
  if (b.desde) return ` · desde ${f(b.desde)}`;
  return ` · hasta ${f(b.hasta)}`;
}

function formulario(container, bono, puedeEditar) {
  const formEl = container.querySelector('#bo-form');
  const esNuevo = !bono.id;
  let tipo = bono.tipo || 'porcentaje';

  const pintar = () => {
    formEl.innerHTML = `
      <div class="card" style="margin-top:16px">
        <h3 style="margin-top:0">${esNuevo ? 'Nuevo bono' : 'Editar bono'}</h3>

        <p class="form-grupo">Identificación</p>
        <label class="field">Nombre
          <input id="bo-nombre" value="${escapeHtml(bono.nombre || '')}" placeholder="Bono de bienvenida" />
        </label>
        <p class="hint">Este nombre lo ve el jugador cuando le aparece el bono.</p>

        <p class="form-grupo">Cuánto da</p>
        <div class="campos-fila">
          <label class="field">Tipo
            <select id="bo-tipo">
              <option value="porcentaje" ${tipo === 'porcentaje' ? 'selected' : ''}>Porcentaje del monto</option>
              <option value="fijo" ${tipo === 'fijo' ? 'selected' : ''}>Monto fijo</option>
            </select>
          </label>
          <label class="field">${tipo === 'porcentaje' ? 'Porcentaje (%)' : `Monto (${currency.symbol})`}
            <input id="bo-valor" type="number" min="0" step="${tipo === 'porcentaje' ? '0.5' : '1'}"
                   value="${bono.valor ?? ''}" placeholder="${tipo === 'porcentaje' ? '20' : '50000'}" />
          </label>
        </div>
        ${tipo === 'porcentaje' ? `
          <label class="field">Tope del bono
            <input id="bo-tope" type="number" min="0" value="${bono.tope ?? ''}" placeholder="sin tope" />
          </label>
          <p class="hint">Máximo que puede dar este bono, por más grande que sea la carga. Vacío = sin límite.</p>
        ` : ''}

        <p class="form-grupo">Cuándo aplica</p>
        <div class="campos-fila">
          <label class="field">Desde este monto
            <input id="bo-min" type="number" min="0" value="${bono.monto_min ?? 0}" />
          </label>
          <label class="field">Hasta este monto
            <input id="bo-max" type="number" min="0" value="${bono.monto_max ?? ''}" placeholder="sin techo" />
          </label>
        </div>

        <label class="field">Cargas alcanzadas
          <select id="bo-aplica">
            <option value="todas" ${bono.aplica !== 'primera' ? 'selected' : ''}>Todas las cargas</option>
            <option value="primera" ${bono.aplica === 'primera' ? 'selected' : ''}>Solo la primera del jugador</option>
          </select>
        </label>

        <div class="campos-fila">
          <label class="field corto">Orden
            <input id="bo-orden" type="number" value="${bono.orden ?? 0}" />
          </label>
          <label class="field">Vigente desde
            <input id="bo-desde" type="date" value="${fecha(bono.desde)}" />
          </label>
          <label class="field">Vigente hasta
            <input id="bo-hasta" type="date" value="${fecha(bono.hasta)}" />
          </label>
        </div>
        <p class="hint">Si un monto encaja en varios bonos, gana el de orden más bajo.</p>

        <div class="campos-fila" style="margin-top:8px">
          <label class="field corto">Rollover (×)
            <input id="bo-rollover" type="number" min="0" step="0.5" value="${bono.rollover ?? 1}" />
          </label>
          <label class="field corto">Tope de conversión (× — vacío = global)
            <input id="bo-topeconv" type="number" min="0" step="0.5" value="${bono.tope_conversion_mult ?? ''}" placeholder="global" />
          </label>
        </div>
        <p class="hint">Rollover: veces que hay que apostar el bono para liberarlo. Tope de conversión: por más que gane jugándolo, se lleva como máximo ×N el bono. Aplican solo con el modo avanzado de Billetera.</p>

        <p class="form-grupo">Segmentación (opcional)</p>
        <div class="campos-fila">
          <label class="field">VIP mínimo
            <select id="bo-vipmin">
              <option value="">Cualquier nivel</option>
              ${NIVELES.map((n) => `<option value="${n.id}" ${bono.vip_nivel_min === n.id ? 'selected' : ''}>${escapeHtml(n.nombre)}</option>`).join('')}
            </select>
          </label>
          <label class="field corto">Días sin cargar
            <input id="bo-dias" type="number" min="0" value="${bono.dias_sin_cargar ?? 0}" />
          </label>
        </div>
        <label class="st-permiso" style="max-width:260px;margin:6px 0">
          <input type="checkbox" id="bo-sindep" ${bono.solo_sin_deposito ? 'checked' : ''} />
          <span>Solo jugadores que nunca cargaron</span>
        </label>
        <div class="campos-fila">
          <label class="field corto">Tope de usos (0 = sin tope)
            <input id="bo-topeusos" type="number" min="0" value="${bono.tope_usos ?? 0}" />
          </label>
          <label class="field corto">Presupuesto (${currency.symbol}, 0 = sin tope)
            <input id="bo-presupuesto" type="number" min="0" value="${bono.presupuesto ?? 0}" />
          </label>
        </div>
        <div class="campos-fila">
          <label class="field corto">Solo en la carga N.° (desde)
            <input id="bo-cnmin" type="number" min="0" value="${bono.carga_num_min ?? 0}" />
          </label>
          <label class="field corto">…hasta la carga N.° (0 = sin límite)
            <input id="bo-cnmax" type="number" min="0" value="${bono.carga_num_max ?? 0}" />
          </label>
        </div>
        <p class="hint">Carga N: "2 a 2" = solo la segunda carga del jugador. "0 a 0" = cualquier carga.</p>
        <p class="hint">Días sin cargar → bono de reactivación. Presupuesto → se corta cuando lo repartido llega al monto. ${!bono.id ? '' : `Repartido hasta ahora: <b>${formatMoney(bono.repartido || 0)}</b> en ${bono.usos || 0} usos.`}</p>

        <label class="st-permiso" style="max-width:200px;margin-top:14px">
          <input type="checkbox" id="bo-activo" ${bono.activo !== false ? 'checked' : ''} />
          <span>Activo</span>
        </label>

        <div id="bo-simulador"></div>

        <div class="acciones">
          <button id="bo-guardar">Guardar</button>
          <button id="bo-cancelar" class="secundario">Cancelar</button>
          ${esNuevo ? '' : '<button id="bo-desactivar" class="secundario">Desactivar</button>'}
        </div>
        <p id="bo-msg" class="hint"></p>
      </div>
    `;

    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    const msgEl = formEl.querySelector('#bo-msg');

    formEl.querySelector('#bo-tipo').addEventListener('change', (e) => {
      tipo = e.target.value;
      // Guardamos lo tipeado antes de repintar, para no perderlo.
      bono = { ...bono, ...leer(formEl, tipo) };
      pintar();
    });

    // Simulador: muestra cuánto daría el bono con montos de ejemplo.
    const simular = () => {
      const v = Number(formEl.querySelector('#bo-valor').value);
      const min = Number(formEl.querySelector('#bo-min').value) || 0;
      const max = formEl.querySelector('#bo-max').value ? Number(formEl.querySelector('#bo-max').value) : null;
      const tope = formEl.querySelector('#bo-tope') ? Number(formEl.querySelector('#bo-tope').value) : null;
      const simEl = formEl.querySelector('#bo-simulador');

      if (!v) { simEl.innerHTML = ''; return; }

      const ejemplos = [min || (currency.decimals ? 1000 : 50000), (min || 0) * 2 || (currency.decimals ? 5000 : 200000)]
        .filter((m) => m > 0 && (!max || m <= max));

      if (!ejemplos.length) { simEl.innerHTML = ''; return; }

      simEl.innerHTML = `
        <p class="form-grupo">Cómo queda</p>
        <div class="stats">
          ${ejemplos.map((m) => {
            let b = tipo === 'porcentaje' ? Math.round(m * v / 100) : v;
            if (tipo === 'porcentaje' && tope) b = Math.min(b, tope);
            return `
              <div class="stat">
                <small class="hint">Carga ${formatMoney(m)}</small>
                <strong>${formatMoney(m + b)}</strong>
                <small class="hint">bono ${formatMoney(b)}</small>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    ['#bo-valor', '#bo-min', '#bo-max', '#bo-tope'].forEach((sel) => {
      const el = formEl.querySelector(sel);
      if (el) el.addEventListener('input', simular);
    });
    simular();

    formEl.querySelector('#bo-cancelar').addEventListener('click', () => { formEl.innerHTML = ''; });

    const btnDesactivar = formEl.querySelector('#bo-desactivar');
    if (btnDesactivar) {
      btnDesactivar.addEventListener('click', async () => {
        btnDesactivar.disabled = true;
        const { ok, error } = await apiFetch(`/api/config?recurso=bonos&id=${bono.id}`, { method: 'DELETE' });

        if (!ok) {
          btnDesactivar.disabled = false;
          msgEl.className = 'hint error';
          msgEl.textContent = error;
          return;
        }

        formEl.innerHTML = '';
        cargar(container, puedeEditar);
      });
    }

    formEl.querySelector('#bo-guardar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Guardando...';

      const { ok, error } = await apiFetch('/api/config?recurso=bonos', {
        method: 'POST',
        body: { id: bono.id, ...leer(formEl, tipo) },
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

function leer(formEl, tipo) {
  const val = (sel) => formEl.querySelector(sel)?.value ?? '';
  return {
    nombre: val('#bo-nombre'),
    tipo,
    valor: val('#bo-valor'),
    montoMin: val('#bo-min'),
    montoMax: val('#bo-max') || null,
    tope: val('#bo-tope') || null,
    aplica: val('#bo-aplica'),
    orden: val('#bo-orden'),
    rollover: val('#bo-rollover') === '' ? 1 : Number(val('#bo-rollover')),
    topeConversionMult: val('#bo-topeconv'),
    vipNivelMin: val('#bo-vipmin') || null,
    diasSinCargar: Number(val('#bo-dias')) || 0,
    soloSinDeposito: formEl.querySelector('#bo-sindep')?.checked || false,
    topeUsos: Number(val('#bo-topeusos')) || 0,
    presupuesto: Number(val('#bo-presupuesto')) || 0,
    cargaNumMin: Number(val('#bo-cnmin')) || 0,
    cargaNumMax: Number(val('#bo-cnmax')) || 0,
    activo: formEl.querySelector('#bo-activo')?.checked,
    desde: val('#bo-desde') || null,
    hasta: val('#bo-hasta') || null,
  };
}

function fecha(iso) {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
