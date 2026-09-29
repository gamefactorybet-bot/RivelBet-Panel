import { apiFetch } from '../lib/api.ts';
import { supabase } from '../lib/supabaseClient.js';
import { formatMoney } from '../lib/currency.ts';
import { puede } from '../lib/perfiles.js';

const FILTROS = [
  ['', 'Todo'],
  ['cargas', 'Cargas'],
  ['retiros', 'Retiros'],
  ['rechazos', 'Rechazos'],
  ['bans', 'Bans'],
  ['jugadores', 'Jugadores'],
  ['staff', 'Staff'],
];

// Color del punto según lo que pasó: verde entra plata, ámbar sale,
// rojo hay un problema, gris es administrativo.
const COLORES = {
  carga: 'var(--success)',
  retiro: 'var(--accent)',
  rechazo: 'var(--error)',
  ban: 'var(--error)',
  jugador: 'var(--text-dim)',
  staff: 'var(--text-dim)',
};

const ESTILOS = `
<style>
  .hi-filtros { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .hi-chip {
    background: var(--surface-alt-glass); border: 1px solid var(--border);
    border-radius: 999px; padding: 6px 13px; font-size: 12px;
    color: var(--text-dim); font-weight: 400;
  }
  .hi-chip.on { border-color: var(--accent); color: var(--accent); font-weight: 500; }
  .hi-busca { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; align-items: flex-end; }
  .hi-busca .field { margin-bottom: 0; }
  .hi-busca .field.ancho { flex: 1; min-width: 170px; }
  .hi-busca .field.fecha { width: 150px; }

  .hi-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
  .hi-tabla th {
    text-align: left; font-weight: 500; color: var(--text-dim);
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em;
    padding: 6px 8px; border-bottom: 1px solid var(--border);
  }
  .hi-tabla td { padding: 9px 8px; border-bottom: 1px solid var(--border-glass); vertical-align: middle; }
  .hi-ev { display: flex; align-items: flex-start; gap: 8px; }
  .hi-pt { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .hi-sub { display: block; color: var(--text-dim); font-size: 11px; margin-top: 1px; }
  .hi-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .hi-pos { color: var(--success); }
  .hi-neg { color: var(--accent); }
  .hi-tag {
    font-size: 10px; border: 1px solid var(--border); border-radius: 999px;
    padding: 1px 7px; color: var(--text-dim); margin-left: 5px;
  }
  .hi-pager { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .hi-pager .hi-cuenta { font-size: 13px; color: var(--text-dim); min-width: 130px; text-align: center; }
</style>
`;

export function renderHistorial(container, { profile }) {
  if (!puede(profile, 'ver_historial')) {
    container.innerHTML = '<section class="card"><p class="hint">No tenés permiso para ver el historial.</p></section>';
    return;
  }

  // Arranca acotado al último mes. Sin rango, la vista tiene que armar
  // el conjunto completo de siete tablas antes de paginar; con fecha,
  // Postgres usa los índices y descarta la mayoría sin leerla.
  const haceUnMes = new Date();
  haceUnMes.setMonth(haceUnMes.getMonth() - 1);
  const desdeDefecto = haceUnMes.toISOString().slice(0, 10);

  const estado = { filtro: '', q: '', desde: desdeDefecto, hasta: '', pagina: 1 };

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <h2 style="margin:0">Historial de eventos</h2>
        <span class="hint">todo lo que pasó, en un solo lugar</span>
        <button class="secundario" id="hi-csv" style="margin-left:auto">Exportar CSV</button>
      </div>

      <div class="hi-filtros" style="margin-top:14px">
        ${FILTROS.map(([key, label]) => `
          <button class="hi-chip ${key === '' ? 'on' : ''}" data-filtro="${key}">${label}</button>
        `).join('')}
      </div>

      <div class="hi-busca">
        <label class="field ancho">Buscar
          <input id="hi-q" placeholder="Jugador, cajero o ID" autocomplete="off" />
        </label>
        <label class="field fecha">Desde
          <input id="hi-desde" type="date" value="${desdeDefecto}" />
        </label>
        <label class="field fecha">Hasta
          <input id="hi-hasta" type="date" />
        </label>
        <button class="secundario" id="hi-limpiar">Limpiar</button>
      </div>

      <div id="hi-lista"><p class="hint">Cargando...</p></div>
    </section>
  `;

  const refrescar = () => cargar(container, estado, refrescar);

  container.querySelectorAll('[data-filtro]').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-filtro]').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      estado.filtro = btn.dataset.filtro;
      estado.pagina = 1;
      refrescar();
    });
  });

  // Buscar con pausa: no le pegamos a la API en cada tecla.
  let reloj;
  container.querySelector('#hi-q').addEventListener('input', (e) => {
    clearTimeout(reloj);
    reloj = setTimeout(() => {
      estado.q = e.target.value.trim();
      estado.pagina = 1;
      refrescar();
    }, 400);
  });

  ['#hi-desde', '#hi-hasta'].forEach((sel) => {
    container.querySelector(sel).addEventListener('change', (e) => {
      estado[sel === '#hi-desde' ? 'desde' : 'hasta'] = e.target.value;
      estado.pagina = 1;
      refrescar();
    });
  });

  container.querySelector('#hi-limpiar').addEventListener('click', () => {
    Object.assign(estado, { filtro: '', q: '', desde: desdeDefecto, hasta: '', pagina: 1 });
    container.querySelector('#hi-q').value = '';
    container.querySelector('#hi-desde').value = desdeDefecto;
    container.querySelector('#hi-hasta').value = '';
    container.querySelectorAll('[data-filtro]').forEach((b) => b.classList.toggle('on', b.dataset.filtro === ''));
    refrescar();
  });

  container.querySelector('#hi-csv').addEventListener('click', () => exportar(estado));

  refrescar();
}

function query(estado, extra = {}) {
  const p = new URLSearchParams();
  if (estado.filtro) p.set('filtro', estado.filtro);
  if (estado.q) p.set('q', estado.q);
  if (estado.desde) p.set('desde', estado.desde);
  if (estado.hasta) p.set('hasta', estado.hasta);
  Object.entries(extra).forEach(([k, v]) => p.set(k, v));
  return p.toString();
}

async function cargar(container, estado, refrescar) {
  const listaEl = container.querySelector('#hi-lista');
  listaEl.innerHTML = '<p class="hint">Cargando...</p>';

  const { ok, data, error } = await apiFetch(`/api/caja?recurso=historial&${query(estado, { pagina: estado.pagina })}`);

  if (!ok) {
    listaEl.innerHTML = `<p class="hint error">${error}</p>`;
    return;
  }

  const eventos = data.eventos || [];

  if (!eventos.length) {
    listaEl.innerHTML = '<p class="hint">No hay eventos con esos filtros.</p>';
    return;
  }

  listaEl.innerHTML = `
    <div class="tabla-scroll">
      <table class="hi-tabla">
        <thead>
          <tr><th>Evento</th><th>Quién</th><th class="hi-num">Monto</th><th class="hi-num">Cuándo</th></tr>
        </thead>
        <tbody>
          ${eventos.map(fila).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (data.paginas > 1) {
    const desde = (estado.pagina - 1) * data.porPagina + 1;
    const hasta = Math.min(estado.pagina * data.porPagina, data.total);

    listaEl.insertAdjacentHTML('beforeend', `
      <div class="hi-pager">
        <button class="secundario hi-prev" ${estado.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
        <span class="hi-cuenta">${desde}-${hasta} de ${data.total.toLocaleString('es-PY')}</span>
        <button class="secundario hi-next" ${estado.pagina >= data.paginas ? 'disabled' : ''}>Siguiente</button>
      </div>
    `);

    const prev = listaEl.querySelector('.hi-prev');
    const next = listaEl.querySelector('.hi-next');

    if (!prev.disabled) prev.addEventListener('click', () => { estado.pagina -= 1; refrescar(); });
    if (!next.disabled) next.addEventListener('click', () => { estado.pagina += 1; refrescar(); });
  }
}

function fila(e) {
  const color = COLORES[e.categoria] || 'var(--text-dim)';
  const entra = e.categoria === 'carga';
  const mueveSaldo = e.categoria === 'carga' || e.categoria === 'retiro';

  const sujeto = [
    e.sujeto ? escapeHtml(e.sujeto) : null,
    e.player_number ? `ID #${e.player_number}` : null,
    e.detalle ? escapeHtml(recortar(e.detalle)) : null,
  ].filter(Boolean).join(' · ');

  return `
    <tr>
      <td>
        <div class="hi-ev">
          <span class="hi-pt" style="background:${color}"></span>
          <div>
            ${escapeHtml(e.evento)}${e.origen ? `<span class="hi-tag">${escapeHtml(e.origen)}</span>` : ''}
            ${sujeto ? `<span class="hi-sub">${sujeto}</span>` : ''}
          </div>
        </div>
      </td>
      <td>${escapeHtml(cortarMail(e.actor))}</td>
      <td class="hi-num ${mueveSaldo ? (entra ? 'hi-pos' : 'hi-neg') : ''}">
        ${e.monto != null ? `${mueveSaldo ? (entra ? '+' : '−') : ''}${formatMoney(e.monto)}` : '—'}
        ${e.saldo != null ? `<span class="hi-sub">saldo ${formatMoney(e.saldo)}</span>` : ''}
      </td>
      <td class="hi-num">
        ${hora(e.fecha)}
        <span class="hi-sub">${dia(e.fecha)}</span>
      </td>
    </tr>
  `;
}

/** Descarga el CSV con los mismos filtros que se ven en pantalla. */
async function exportar(estado) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const res = await fetch(`/api/caja?recurso=historial&${query(estado, { formato: 'csv' })}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) return;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `historial-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function dia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const mismoDia = (a, b) => a.toDateString() === b.toDateString();

  if (mismoDia(d, hoy)) return 'hoy';
  if (mismoDia(d, ayer)) return 'ayer';
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function cortarMail(txt) {
  const s = String(txt ?? '—');
  return s.includes('@') ? s.split('@')[0] : s;
}

function recortar(txt, max = 60) {
  const s = String(txt);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
