import { apiFetch } from '../lib/api.ts';
import { puede } from '../lib/perfiles.js';

const TABS = [
  ['pendiente', 'Pendientes'],
  ['aprobada', 'Aprobadas'],
  ['rechazada', 'Rechazadas'],
];

const DOC_LABEL = { ci: 'CI', pasaporte: 'Pasaporte', dni: 'DNI', otro: 'Documento' };

const ESTILOS = `
  <style>
    .ve-tabs { display: flex; gap: 4px; margin: 14px 0 4px; border-bottom: 1px solid var(--border); }
    .ve-tab {
      background: transparent; border: none; border-bottom: 2px solid transparent;
      color: var(--text-dim); padding: 8px 14px; font-size: 13px; border-radius: 0;
    }
    .ve-tab.is-active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 500; }
    .ve-card {
      display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center;
      border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-top: 10px;
    }
    .ve-fotos { display: flex; gap: 6px; }
    .ve-foto {
      display: block; width: 68px; text-align: center;
      font-size: 10px; color: var(--text-dim); text-decoration: none;
    }
    .ve-foto img {
      width: 68px; height: 52px; object-fit: cover; border-radius: 6px;
      border: 1px solid var(--border); display: block; margin-bottom: 3px;
      background: var(--surface-alt);
    }
    .ve-foto:hover img { border-color: var(--accent); }
    .ve-datos strong { font-size: 14px; }
    .ve-datos .hint { margin: 3px 0 0; }
    .ve-acciones { display: flex; flex-direction: column; gap: 6px; align-items: stretch; }
    .ve-acciones button { padding: 7px 16px; font-size: 13px; white-space: nowrap; }
    .ve-pager { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
    .ve-pager span { font-size: 13px; color: var(--text-dim); }
    @media (max-width: 620px) {
      .ve-card { grid-template-columns: 1fr; }
      .ve-acciones { flex-direction: row; }
    }
  </style>
`;

export function renderVerificaciones(container, { profile }) {
  const puedeResolver = puede(profile, 'atender');

  let estado = 'pendiente';
  let pagina = 1;

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Verificaciones de identidad</h2>
      <p class="hint">
        El jugador sube tres fotos (frente y dorso del documento, y una foto suya).
        Aprobar habilita el juego; el bono, si tiene, ya se acreditó al registrarse.
      </p>
      <div class="ve-tabs" id="ve-tabs">
        ${TABS.map(([k, t]) => `
          <button class="ve-tab ${k === estado ? 'is-active' : ''}" data-estado="${k}">${t}</button>
        `).join('')}
      </div>
      <div id="ve-lista"><p class="hint">Cargando...</p></div>
      <div id="ve-paginacion"></div>
    </section>
  `;

  const tabsEl = container.querySelector('#ve-tabs');
  tabsEl.querySelectorAll('.ve-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado = btn.dataset.estado;
      pagina = 1;
      tabsEl.querySelectorAll('.ve-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
      cargar();
    });
  });

  async function cargar() {
    const listaEl = container.querySelector('#ve-lista');
    listaEl.innerHTML = '<p class="hint">Cargando...</p>';

    const { ok, data, error } = await apiFetch(
      `/api/atencion?recurso=verificaciones&estado=${estado}&pagina=${pagina}`
    );

    if (!ok) {
      listaEl.innerHTML = `<p class="hint error">${error}</p>`;
      return;
    }

    // Contador en la pestaña de pendientes
    const tabPend = tabsEl.querySelector('[data-estado="pendiente"]');
    tabPend.textContent = data.pendientes > 0 ? `Pendientes (${data.pendientes})` : 'Pendientes';

    const items = data.verificaciones || [];

    if (!items.length) {
      listaEl.innerHTML = `<p class="hint">${
        estado === 'pendiente' ? 'No hay verificaciones esperando revisión.' : 'Nada por acá.'
      }</p>`;
      container.querySelector('#ve-paginacion').innerHTML = '';
      return;
    }

    listaEl.innerHTML = items.map((v) => tarjeta(v, puedeResolver)).join('');

    listaEl.querySelectorAll('[data-accion]').forEach((btn) => {
      btn.addEventListener('click', () => resolver(btn.dataset.id, btn.dataset.accion, btn.dataset.nombre));
    });

    const totalPag = data.paginas || 1;
    container.querySelector('#ve-paginacion').innerHTML = totalPag > 1 ? `
      <div class="ve-pager">
        <button class="secundario" ${pagina <= 1 ? 'disabled' : ''} id="ve-prev">Anterior</button>
        <span>Página ${pagina} de ${totalPag}</span>
        <button class="secundario" ${pagina >= totalPag ? 'disabled' : ''} id="ve-next">Siguiente</button>
      </div>
    ` : '';

    const prev = container.querySelector('#ve-prev');
    const next = container.querySelector('#ve-next');
    if (prev) prev.addEventListener('click', () => { pagina--; cargar(); });
    if (next) next.addEventListener('click', () => { pagina++; cargar(); });
  }

  async function resolver(id, accion, nombre) {
    let motivo = null;

    if (accion === 'rechazar') {
      motivo = window.prompt(`Motivo del rechazo (lo ve ${nombre}):`, '');
      if (motivo === null) return;
      if (!motivo.trim()) { window.alert('El motivo es obligatorio.'); return; }
    } else if (!window.confirm(`Verificar a ${nombre} y habilitar el juego?`)) {
      return;
    }

    const { ok, error } = await apiFetch('/api/atencion?recurso=verificaciones', {
      method: 'POST',
      body: { verifId: id, accion, motivo },
    });

    if (!ok) { window.alert(error); return; }
    cargar();
  }

  cargar();
}

function tarjeta(v, puedeResolver) {
  const p = v.players || {};
  const nombre = p.display_name || p.username || 'jugador';
  const edad = p.fecha_nacimiento ? ` (${calcularEdad(p.fecha_nacimiento)} años)` : '';
  const fotos = [
    ['Frente', v.url_frente],
    ['Dorso', v.url_dorso],
    ['Foto', v.url_persona],
  ];

  return `
    <div class="ve-card">
      <div class="ve-fotos">
        ${fotos.map(([lbl, url]) => `
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="ve-foto">
            <img src="${escapeHtml(url)}" alt="${lbl}" loading="lazy" />
            <span>${lbl}</span>
          </a>
        `).join('')}
      </div>
      <div class="ve-datos">
        <strong>${escapeHtml(nombre)} · @${escapeHtml(p.username || '')}</strong>
        <div class="mono hint">
          ${DOC_LABEL[v.doc_tipo] || 'Doc'} ${escapeHtml(p.documento || '—')} · Tel ${escapeHtml(p.telefono || '—')}<br>
          ${escapeHtml(p.email || '—')} · ID #${p.player_number ?? '—'}${edad}
        </div>
        <div class="hint">${estadoTexto(v)}</div>
      </div>
      ${puedeResolver && v.estado === 'pendiente' ? `
        <div class="ve-acciones">
          <button data-accion="aprobar" data-id="${v.id}" data-nombre="${escapeHtml(nombre)}">Aprobar</button>
          <button class="secundario" data-accion="rechazar" data-id="${v.id}" data-nombre="${escapeHtml(nombre)}">Rechazar</button>
        </div>
      ` : `
        <div class="ve-acciones">
          <span class="badge ${v.estado === 'aprobada' ? 'badge-ok' : 'badge-danger'}">
            ${v.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
          </span>
        </div>
      `}
    </div>
  `;
}

function estadoTexto(v) {
  const cuando = new Date(v.created_at).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (v.estado === 'pendiente') return `Enviado ${cuando}`;
  if (v.estado === 'rechazada') return `Rechazada por ${v.resuelto_por || '—'} · ${escapeHtml(v.motivo || '')}`;
  return `Aprobada por ${v.resuelto_por || '—'}`;
}

function calcularEdad(fechaIso) {
  const nac = new Date(fechaIso);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nac.getFullYear();
  const m = hoy.getMonth() - nac.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
