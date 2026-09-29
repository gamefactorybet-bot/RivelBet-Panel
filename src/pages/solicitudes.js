import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { puede } from '../lib/perfiles.js';

const ESTILOS = `
<style>
  .sol-card {
    padding: 22px 24px 26px;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: calc(100vh - 108px);
  }
  .sol-kicker {
    font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--accent); margin: 0 0 4px;
  }
  .sol-card > h2 { margin: 0 0 6px; font-size: 26px; font-weight: 800; letter-spacing: -0.03em; }
  .sol-card > .hint { max-width: 62ch; margin: 0 0 18px; }
  .sol-toolbar { display: flex; align-items: stretch; gap: 14px; flex-wrap: wrap; margin: 0 0 16px; }
  .sol-tabs {
    display: flex; gap: 0; padding: 4px;
    background: var(--void); border: 1px solid var(--border); border-radius: 14px;
  }
  .sol-tab, button.sol-tab {
    background: transparent; border: none; box-shadow: none; filter: none;
    color: var(--text-dim); padding: 10px 18px; font-weight: 700; font-size: 14px; border-radius: 11px;
    height: auto; min-height: 0;
  }
  .sol-tab:hover { filter: none; color: var(--text); }
  .sol-tab b {
    display: inline-block; min-width: 20px; margin-left: 8px; padding: 1px 7px;
    border-radius: 999px; background: var(--accent); color: #fff; font-size: 11px; font-weight: 800;
  }
  .sol-tab.is-active, button.sol-tab.is-active {
    background: var(--primary-button-face); color: var(--accent-text);
  }
  .sol-tab.is-active b { background: rgba(0,0,0,.28); color: #fff; }
  .sol-estados {
    display: flex; gap: 0; margin-left: auto; padding: 4px;
    background: var(--surface-alt); border: 1px solid var(--border); border-radius: 12px;
  }
  .sol-estado, button.sol-estado, button.secundario.sol-estado {
    background: transparent; border: none; box-shadow: none; filter: none;
    color: var(--text-dim); padding: 8px 14px; font-size: 12.5px; font-weight: 600;
    height: auto; min-height: 0; border-radius: 9px;
  }
  .sol-estado:hover { filter: none; color: var(--text); }
  .sol-estado.is-sel, button.sol-estado.is-sel, button.secundario.sol-estado.is-sel {
    background: var(--surface); color: var(--text); border: none;
    box-shadow: 0 0 0 1px var(--border);
  }
  .sol-ops {
    display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; align-items: start;
    flex: 1; min-height: 0;
  }
  @media (max-width: 980px) { .sol-ops { grid-template-columns: 1fr; } }
  .sol-lista-cards { display: flex; flex-direction: column; gap: 10px; }
  .sol-item {
    display: flex; flex-wrap: wrap; gap: 10px 12px; align-items: center;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 14px; padding: 12px 14px; cursor: pointer;
  }
  .sol-item:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
  .sol-item.is-open {
    border-color: var(--accent);
    box-shadow: inset 3px 0 0 var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  }
  .sol-item-main { min-width: 0; flex: 1; }
  .sol-item-main strong { display: block; font-size: 15px; font-weight: 800; }
  .sol-id { color: var(--text-dim); font-variant-numeric: tabular-nums; font-size: 12px; margin-top: 2px; }
  .sol-hora { color: var(--text-dim); font-variant-numeric: tabular-nums; font-size: 12px; margin-top: 2px; }
  .sol-monto { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .sol-monto strong { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
  .sol-monto small { display: block; font-size: 11px; color: var(--text-dim); margin-top: 2px; }
  .sol-item .sol-ficha { margin: 2px 0 0; flex: 1 1 100%; }
  .sol-alerta {
    font-size: 11px; font-weight: 800; letter-spacing: 0.03em;
    color: var(--error);
    background: color-mix(in srgb, var(--error) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--error) 35%, transparent);
    border-radius: 999px; padding: 2px 8px; white-space: nowrap;
  }
  .sol-alerta-box {
    margin: 0 0 12px; padding: 10px 12px; border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--error) 35%, transparent);
    background: color-mix(in srgb, var(--error) 8%, transparent);
    font-size: 12.5px; color: var(--text);
  }
  .sol-alerta-box b { display: block; color: var(--error); margin-bottom: 4px; }
  .sol-botones { display: flex; gap: 6px; justify-content: flex-end; }
  .sol-botones button { padding: 8px 13px; font-size: 12.5px; font-weight: 700; height: auto; min-height: 0; }
  .sol-botones .sol-no { font-weight: 600; }
  .sol-comp {
    width: 34px; height: 51px; flex-shrink: 0; border-radius: 7px; overflow: hidden;
    border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
    color: var(--text-dim); font-size: 11px; padding: 0; background: var(--void);
  }
  .sol-comp:hover { border-color: var(--accent); }
  .sol-comp img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .sol-sin-comp { color: var(--text-dim); font-size: 11px; }
  .sol-comp-frame, button.sol-comp-frame {
    display: block; width: 100%; aspect-ratio: 2 / 3;
    margin: 0 0 14px; padding: 0; border: 1px solid var(--border);
    border-radius: 12px; overflow: hidden; background: #0b090d; cursor: zoom-in;
    height: auto; min-height: 0; box-shadow: none; filter: none;
  }
  .sol-comp-frame:hover { filter: none; border-color: var(--accent); }
  .sol-comp-frame img {
    width: 100%; height: 100%; object-fit: contain; display: block;
    background: #0b090d; cursor: zoom-in;
  }
  .sol-detalle {
    position: sticky; top: 12px;
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 16px; padding: 0; min-height: 280px;
    max-height: calc(100vh - 132px); overflow: auto;
  }
  .sol-detalle > .hint { padding: 22px 18px; }
  .sol-detalle h3 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.03em; }
  .sol-detalle-head {
    padding: 16px 18px 14px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, transparent), transparent);
    border-bottom: 1px solid var(--border);
  }
  .sol-detalle-monto {
    display: block; margin-top: 8px; font-size: 28px; font-weight: 800;
    font-variant-numeric: tabular-nums; letter-spacing: -0.03em;
  }
  .sol-detalle .sol-panel { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
  .sol-detalle .acciones button { height: auto; min-height: 40px; font-weight: 800; }
  .sol-detalle .sol-panel .acciones { margin-top: 0; }
  .sol-ficha {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
    background: var(--border); border: 1px solid var(--border);
    border-radius: 12px; overflow: hidden; margin: 0 0 14px;
  }
  .sol-ficha-row {
    display: flex; flex-direction: column; gap: 2px;
    background: var(--surface-alt); padding: 9px 11px; min-width: 0;
  }
  .sol-ficha-row.wide { grid-column: 1 / -1; }
  .sol-ficha-row span {
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--text-dim);
  }
  .sol-ficha-row b {
    font-size: 13.5px; font-weight: 700; word-break: break-word;
    font-variant-numeric: tabular-nums;
  }
  .sol-cobro { margin: 0 0 14px; }
  .sol-cobro-etiqueta {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
    color: var(--accent); margin-bottom: 8px;
  }
  .sol-cobro-etiqueta .punto { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
  .sol-cobro-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .sol-dato {
    display: flex; align-items: center; gap: 8px;
    background: var(--surface-alt); padding: 9px 10px;
  }
  .sol-dato-txt { flex: 1; min-width: 0; }
  .sol-dato-label { font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-dim); display: block; }
  .sol-dato-valor { font-size: 13.5px; font-weight: 500; word-break: break-word; font-variant-numeric: tabular-nums; }
  .sol-copy {
    flex-shrink: 0; background: transparent; border: 1px solid var(--border); color: var(--accent);
    border-radius: 7px; padding: 6px 9px; font-size: 11.5px; font-weight: 500;
  }
  .sol-copy:hover { border-color: var(--accent); }
  .sol-copy.copiado { border-color: var(--success); color: var(--success); }
  .sol-copy-todo { width: 100%; margin-top: 8px; }
  .sol-pager {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; margin-top: 12px; flex-wrap: wrap;
  }
  .sol-pager button { padding: 8px 14px; font-size: 13px; }
  .sol-pager button:disabled { opacity: 0.35; }
  .sol-pager .sol-pagina { font-size: 13px; color: var(--text-dim); min-width: 120px; text-align: center; }
  .sol-panel-comp { margin-bottom: 12px; }
  .sol-panel-campos { min-width: 0; }

  /* Visor a pantalla completa */
  .visor {
    position: fixed; inset: 0; z-index: 90;
    background: rgba(0,0,0,0.88);
    display: flex; align-items: center; justify-content: center;
    padding: 20px;
  }
  .visor img {
    max-width: 100%; max-height: 100%;
    object-fit: contain; border-radius: 8px;
    transition: transform 0.2s ease;
    cursor: zoom-in;
  }
  .visor img.ampliado { transform: scale(2); cursor: zoom-out; }
  .visor-barra {
    position: absolute; top: 14px; right: 14px;
    display: flex; gap: 8px;
  }
  .visor-barra a, .visor-barra button {
    background: rgba(255,255,255,0.12); border: none; color: #fff;
    border-radius: 8px; padding: 8px 13px; font-size: 13px;
    text-decoration: none; font-weight: 400;
  }
  .visor-barra a:hover, .visor-barra button:hover { background: rgba(255,255,255,0.22); }
  .visor-pie {
    position: absolute; bottom: 18px; left: 0; right: 0;
    text-align: center; color: rgba(255,255,255,0.65); font-size: 12px;
  }
</style>
`;

export function renderSolicitudes(container, { profile }) {
  const permisos = {
    carga: puede(profile, 'cargar'),
    retiro: puede(profile, 'retirar'),
  };

  let tipo = 'carga';
  let estado = 'pendiente';
  let pagina = 1;

  container.innerHTML = `
    ${ESTILOS}
    <section class="card sol-card">
      <p class="sol-kicker">Caja</p>
      <h2>Solicitudes</h2>
      <p class="hint">Mesa de caja: elegí la fila a la izquierda y resolvé a la derecha. En un retiro las fichas ya están retenidas; pagar cierra, rechazar las devuelve.</p>

      <div class="sol-toolbar">
        <div class="sol-tabs">
          <button class="sol-tab is-active" data-tipo="carga">Cargas</button>
          <button class="sol-tab" data-tipo="retiro">Retiros</button>
        </div>
        <div class="sol-estados">
          <button class="secundario sol-estado is-sel" data-estado="pendiente">Pendientes</button>
          <button class="secundario sol-estado" data-estado="aprobado">Aprobadas</button>
          <button class="secundario sol-estado" data-estado="rechazado">Rechazadas</button>
        </div>
      </div>

      <div class="sol-ops">
        <div>
          <div id="sol-lista"><p class="hint">Cargando...</p></div>
        </div>
        <aside class="sol-detalle" id="sol-detalle">
          <p class="hint" style="margin:0">Elegí una solicitud de la lista.</p>
        </aside>
      </div>
    </section>
  `;

  // Cambiar de página no debe reiniciarla; cambiar de pestaña sí.
  const refrescar = () => cargar(container, { tipo, estado, pagina, permisos, refrescar, irA });
  const irA = (n) => { pagina = n; refrescar(); };

  container.querySelectorAll('[data-tipo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-tipo]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      tipo = btn.dataset.tipo;
      pagina = 1;
      refrescar();
    });
  });

  container.querySelectorAll('.sol-estado').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.sol-estado').forEach((b) => b.classList.remove('is-sel'));
      btn.classList.add('is-sel');
      estado = btn.dataset.estado;
      pagina = 1;
      refrescar();
    });
  });

  refrescar();
}

async function cargar(container, { tipo, estado, pagina, permisos, refrescar, irA }) {
  const listaEl = container.querySelector('#sol-lista');
  listaEl.innerHTML = '<p class="hint">Cargando...</p>';

  const { ok, data, error } = await apiFetch(
    `/api/atencion?recurso=solicitudes&estado=${estado}&tipo=${tipo}&pagina=${pagina}`
  );

  if (!ok) {
    listaEl.innerHTML = `<p class="hint error">${error}</p>`;
    return;
  }

  const solicitudes = data.solicitudes || [];
  const esCarga = tipo === 'carga';
  const puedeResolver = permisos[tipo] && estado === 'pendiente';
  const detalleEl = container.querySelector('#sol-detalle');
  const nCarga = data.pendientes?.carga || 0;
  const nRetiro = data.pendientes?.retiro || 0;
  const tabCarga = container.querySelector('[data-tipo="carga"]');
  const tabRetiro = container.querySelector('[data-tipo="retiro"]');
  if (tabCarga) tabCarga.innerHTML = `Cargas${nCarga ? ` <b>${nCarga}</b>` : ''}`;
  if (tabRetiro) tabRetiro.innerHTML = `Retiros${nRetiro ? ` <b>${nRetiro}</b>` : ''}`;
  detalleEl.innerHTML = '<p class="hint" style="margin:0">Elegí una solicitud de la lista.</p>';

  if (!solicitudes.length) {
    listaEl.innerHTML = pagina > 1
      ? `<p class="hint">No hay más resultados.</p>
         <div class="sol-pager"><button class="sol-volver">Volver al inicio</button></div>`
      : `<p class="hint">No hay ${esCarga ? 'cargas' : 'retiros'} en este estado.</p>`;

    const volver = listaEl.querySelector('.sol-volver');
    if (volver) volver.addEventListener('click', () => irA(1));
    return;
  }

  listaEl.innerHTML = `
    <div class="sol-lista-cards">
      ${solicitudes.map((s) => {
        const j = s.players || {};
        return `
          <article class="sol-item" data-item="${s.id}">
            ${esCarga && s.comprobante_url
              ? `<button class="sol-comp" data-ver="${escapeHtml(s.comprobante_url)}" title="Ver comprobante">
                   <img src="${s.comprobante_url}" alt="" onerror="this.replaceWith(document.createTextNode('PDF'))" />
                 </button>`
              : ''}
            <div class="sol-item-main">
              <strong>${escapeHtml(j.display_name || j.username || 'Jugador')}</strong>
              <div class="sol-id">#${j.player_number} · ${fechaCorta(s.created_at)}</div>
              ${!esCarga && s.alerta_abuso ? '<span class="sol-alerta">posible abuso de bono</span>' : ''}
            </div>
            <div class="sol-monto">
              <strong>${formatMoney(s.amount)}</strong>
              ${Number(s.bono_monto) > 0
                ? `<small style="color:var(--success)">+ bono ${formatMoney(s.bono_monto)}</small>`
                : (esCarga
                  ? `<small>saldo ${formatMoney(j.balance)}</small>`
                  : `<small>${estado === 'pendiente' ? 'retenido' : escapeHtml(s.estado || '')}</small>`)}
            </div>
            ${bloqueFicha(s, esCarga)}
          </article>`;
      }).join('')}
    </div>
  `;

  if (data.paginas > 1) {
    const desde = (pagina - 1) * data.porPagina + 1;
    const hasta = Math.min(pagina * data.porPagina, data.total);

    listaEl.insertAdjacentHTML('beforeend', `
      <div class="sol-pager">
        <button class="secundario sol-prev" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
        <span class="sol-pagina">${desde}-${hasta} de ${data.total}</span>
        <button class="secundario sol-next" ${pagina >= data.paginas ? 'disabled' : ''}>Siguiente</button>
      </div>
    `);

    const prev = listaEl.querySelector('.sol-prev');
    const next = listaEl.querySelector('.sol-next');

    if (!prev.disabled) prev.addEventListener('click', () => irA(pagina - 1));
    if (!next.disabled) next.addEventListener('click', () => irA(pagina + 1));
  }

  /* --- Paneles en línea, sin prompt del navegador ---
     El prompt() es bloqueable por el navegador y ahí el clic no hace
     nada visible, así que la confirmación va dentro de la tarjeta. */

  const marcarFila = (id) => {
    listaEl.querySelectorAll('.sol-item').forEach((r) => r.classList.toggle('is-open', r.dataset.item === id));
  };

  const abrirPanel = (id, accion, monto) => {
    const solicitud = solicitudes.find((x) => x.id === id);
    if (!solicitud) return;
    const j = solicitud.players || {};
    const comprobante = esCarga ? solicitud.comprobante_url : null;
    const panel = detalleEl;

    marcarFila(id);
    panel.dataset.accion = accion || '';
    panel.hidden = false;

    const esAprobarCarga = accion === 'aprobar' && esCarga;

    panel.innerHTML = `
      <div class="sol-detalle-head">
        <h3>${escapeHtml(j.display_name || j.username || 'Jugador')}</h3>
        <p class="hint" style="margin:4px 0 0">ID #${j.player_number} · ${fechaCorta(solicitud.created_at)}</p>
        <strong class="sol-detalle-monto">${formatMoney(solicitud.amount)}</strong>
      </div>
      <div style="padding:14px 18px 18px">
      ${!esCarga && solicitud.alerta_abuso ? bloqueAlertaAbuso(solicitud) : ''}
      ${bloqueFicha(solicitud, esCarga)}

      <div class="sol-panel">
        <div class="sol-panel-comp">
          ${comprobante ? `
            <button type="button" class="sol-comp-frame" data-ver="${escapeHtml(comprobante)}" title="Ver comprobante">
              <img src="${comprobante}" alt="Comprobante"
                   onerror="this.replaceWith(document.createTextNode('PDF'))" />
            </button>
          ` : ''}
          <div class="sol-panel-campos">
            ${esAprobarCarga ? `
              <label class="field">Monto realmente transferido
                <input class="sol-monto-real" type="number" min="0"
                       step="${currency.decimals ? '0.01' : '1'}" value="${monto}" />
              </label>
              <p class="hint">El jugador declaró ${formatMoney(monto)}. Corregilo si transfirió otra cosa.</p>
            ` : ''}
            ${accion ? `
              <label class="field">${accion === 'rechazar' ? 'Motivo del rechazo' : 'Nota'}
                <input class="sol-nota" placeholder="${accion === 'rechazar' ? 'Lo ve el jugador' : 'opcional'}" />
              </label>
              ${!esCarga && accion === 'rechazar' ? '<p class="hint">Las fichas vuelven al saldo del jugador.</p>' : ''}
              ${!esCarga && accion === 'aprobar' ? '<p class="hint">Confirmás el pago. El saldo ya se había descontado.</p>' : ''}
            ` : ''}
          </div>
        </div>
        ${accion ? `
          <div class="acciones">
            <button class="sol-confirmar">${accion === 'rechazar' ? 'Confirmar rechazo' : (esCarga ? 'Acreditar' : 'Pagar')}</button>
            <button class="secundario sol-cancelar">Cerrar</button>
          </div>
          <p class="sol-msg hint"></p>
        ` : (puedeResolver ? `
          <div class="acciones">
            <button class="sol-ok" data-id="${id}" data-monto="${solicitud.amount}">${esCarga ? 'Acreditar' : 'Pagar'}</button>
            <button class="secundario sol-no" data-id="${id}">Rechazar</button>
          </div>
        ` : '')}
      </div>
      </div>
    `;

    const ficha = panel.querySelector('.sol-ficha');
    const texto = textoFicha(solicitud, esCarga);
    if (ficha && texto) {
      const btnTodo = document.createElement('button');
      btnTodo.className = 'secundario sol-copy-todo';
      btnTodo.textContent = esCarga ? 'Copiar datos' : 'Copiar datos de cobro';
      btnTodo.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(texto); } catch { /* */ }
        btnTodo.textContent = 'Copiado';
        setTimeout(() => { btnTodo.textContent = esCarga ? 'Copiar datos' : 'Copiar datos de cobro'; }, 1400);
      });
      ficha.after(btnTodo);
    }

    panel.querySelector('.sol-cancelar')?.addEventListener('click', () => {
      marcarFila('');
      panel.innerHTML = '<p class="hint" style="margin:0">Elegí una solicitud de la lista.</p>';
    });

    const inputMonto = panel.querySelector('.sol-monto-real');
    if (inputMonto) { inputMonto.focus(); inputMonto.select(); }

    panel.querySelectorAll('.sol-ok').forEach((btn) => {
      btn.addEventListener('click', () => abrirPanel(btn.dataset.id, 'aprobar', btn.dataset.monto));
    });
    panel.querySelectorAll('.sol-no').forEach((btn) => {
      btn.addEventListener('click', () => abrirPanel(btn.dataset.id, 'rechazar'));
    });
    panel.querySelectorAll('.sol-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(btn.dataset.copiar); } catch { /* */ }
        const original = btn.textContent;
        btn.classList.add('copiado');
        btn.textContent = 'Copiado';
        setTimeout(() => { btn.classList.remove('copiado'); btn.textContent = original; }, 1400);
      });
    });

    const btnConfirmar = panel.querySelector('.sol-confirmar');
    if (!btnConfirmar) return;
    btnConfirmar.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const msgEl = panel.querySelector('.sol-msg');
      const nota = panel.querySelector('.sol-nota').value.trim();
      const montoReal = inputMonto ? Number(inputMonto.value) : null;

      if (inputMonto && (!montoReal || montoReal <= 0)) {
        msgEl.className = 'sol-msg hint error';
        msgEl.textContent = 'Ingresá un monto válido.';
        return;
      }

      btn.disabled = true;
      msgEl.className = 'sol-msg hint';
      msgEl.textContent = 'Procesando...';

      const res = await apiFetch('/api/atencion?recurso=solicitudes', {
        method: 'POST',
        body: { requestId: id, accion, nota, tipo, montoReal },
      });

      if (!res.ok) {
        btn.disabled = false;
        msgEl.className = 'sol-msg hint error';
        msgEl.textContent = res.error;
        return;
      }

      refrescar();
    });
  };

  // El visor se abre desde la miniatura y desde la vista previa grande.
  const alClick = (e) => {
    const disparador = e.target.closest('[data-ver]');
    if (disparador) abrirVisor(disparador.dataset.ver);
  };
  listaEl.addEventListener('click', alClick);
  detalleEl.addEventListener('click', alClick);

  listaEl.querySelectorAll('.sol-item').forEach((fila) => {
    fila.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const s = solicitudes.find((x) => x.id === fila.dataset.item);
      abrirPanel(fila.dataset.item, null, s?.amount);
    });
  });

  // Copiar un dato de cobro puntual (valor crudo, sin separadores).
  listaEl.querySelectorAll('.sol-copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const valor = btn.dataset.copiar;
      try {
        await navigator.clipboard.writeText(valor);
      } catch {
        // Sin permiso de portapapeles: no hay mucho más para hacer acá.
      }
      const original = btn.textContent;
      btn.classList.add('copiado');
      btn.textContent = 'Copiado';
      setTimeout(() => {
        btn.classList.remove('copiado');
        btn.textContent = original;
      }, 1400);
    });
  });

  listaEl.querySelectorAll('.sol-ok').forEach((btn) => {
    btn.addEventListener('click', () => abrirPanel(btn.dataset.id, 'aprobar', btn.dataset.monto));
  });

  listaEl.querySelectorAll('.sol-no').forEach((btn) => {
    btn.addEventListener('click', () => abrirPanel(btn.dataset.id, 'rechazar'));
  });
}

/**
 * Visor de comprobantes a pantalla completa.
 * Un clic sobre la imagen la amplía al doble, que suele alcanzar para
 * leer el número de operación de una captura de celular.
 */
function abrirVisor(url) {
  const visor = document.createElement('div');
  visor.className = 'visor';
  visor.innerHTML = `
    <div class="visor-barra">
      <a href="${url}" target="_blank" rel="noopener">Abrir aparte</a>
      <button class="visor-cerrar">Cerrar</button>
    </div>
    <img src="${url}" alt="Comprobante" />
    <p class="visor-pie">Clic en la imagen para acercar · Esc para cerrar</p>
  `;

  document.body.appendChild(visor);

  const cerrar = () => {
    visor.remove();
    document.removeEventListener('keydown', alTeclado);
  };

  const alTeclado = (e) => { if (e.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', alTeclado);

  visor.querySelector('.visor-cerrar').addEventListener('click', cerrar);
  visor.addEventListener('click', (e) => { if (e.target === visor) cerrar(); });

  const img = visor.querySelector('img');
  img.addEventListener('click', () => img.classList.toggle('ampliado'));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const ALIAS_ETIQUETAS = { ci: 'CI', telefono: 'Teléfono', correo: 'Correo', ruc: 'RUC' };

// Solo agrupa de a miles si el valor es puramente numérico (CI,
// documento): un alias de teléfono o un RUC con guión se muestran tal
// cual, sin inventarles separadores.
function formatearMiles(valor) {
  const str = String(valor ?? '');
  return /^\d+$/.test(str) ? str.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : str;
}

function filasFicha(s, esCarga) {
  const filas = [];
  if (esCarga) {
    const cta = s.bank_accounts;
    if (cta?.banco) filas.push(['Banco', cta.banco]);
    if (cta?.titular) filas.push(['Titular', cta.titular]);
    if (cta?.alias) filas.push(['Alias', cta.alias]);
    if (s.nota_jugador) filas.push(['Nota', s.nota_jugador]);
  } else if (s.metodo_tipo === 'alias') {
    filas.push(['Cobra por', ALIAS_ETIQUETAS[s.alias_tipo] || 'Alias']);
    if (s.alias_valor) filas.push([ALIAS_ETIQUETAS[s.alias_tipo] || 'Dato', formatearMiles(s.alias_valor)]);
  } else {
    if (s.banco) filas.push(['Banco', s.banco]);
    if (s.numero_cuenta) filas.push(['Cuenta', s.numero_cuenta]);
    if (s.titular) filas.push(['Titular', s.titular]);
    if (s.documento) filas.push(['Documento', formatearMiles(s.documento)]);
  }
  if (s.estado && s.estado !== 'pendiente') {
    filas.push(['Estado', s.estado]);
    if (s.resuelto_por) filas.push(['Por', s.resuelto_por]);
  }
  if (s.nota_staff) filas.push(['Nota staff', s.nota_staff]);
  return filas;
}

const RAZONES_ABUSO = {
  sin_juego_post_bono: '0 jugadas desde la última carga con bono',
  bono_no_jugado: 'Apostó menos de 1× los bonos de este ciclo',
  cazador: 'Varias cargas con bono y casi no jugó',
  hit_and_run: 'Pidió el retiro al toque de una carga con bono',
};

function bloqueAlertaAbuso(s) {
  const d = s.alerta_abuso_detalle || {};
  const razones = (d.razones || []).map((r) => RAZONES_ABUSO[r] || r);
  return `
    <div class="sol-alerta-box">
      <b>Posible abuso de bono</b>
      En este ciclo: cargó ${formatMoney(d.cargado)} · bonos ${formatMoney(d.bonos)} · apostó ${formatMoney(d.apostado)}.
      ${razones.length ? `<div style="margin-top:6px">${razones.map((r) => `· ${escapeHtml(r)}`).join('<br>')}</div>` : ''}
    </div>
  `;
}

function bloqueFicha(s, esCarga) {
  const filas = filasFicha(s, esCarga);
  if (!filas.length) return '';
  return `
    <div class="sol-ficha">
      ${filas.map(([k, v], i) => `
        <div class="sol-ficha-row ${filas.length % 2 && i === filas.length - 1 ? 'wide' : ''}">
          <span>${escapeHtml(k)}</span>
          <b>${escapeHtml(v)}</b>
        </div>
      `).join('')}
    </div>
  `;
}

function textoFicha(s, esCarga) {
  return filasFicha(s, esCarga).map(([k, v]) => `${k}: ${v}`).join('\n');
}
