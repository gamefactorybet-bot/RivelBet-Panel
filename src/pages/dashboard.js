import { supabase } from '../lib/supabaseClient.js';
import { formatMoney } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { updateCachedSettings } from '../lib/settings.js';
import { puede } from '../lib/perfiles.js';
import { ICONOS } from '../lib/iconos.js';
import { urlLogo } from '../lib/themes.js';
import { apiFetch } from '../lib/api.ts';
import { renderMovimiento } from './movimiento.js';
import { renderJugadores } from './jugadores.js';
import { renderCrearUsuario } from './crear-usuario.js';
import { renderCambiarPassword } from './cambiar-password.js';
import { renderStaff } from './staff.js';
import { renderSolicitudes } from './solicitudes.js';
import { renderVerificaciones } from './verificaciones.js';
import { renderCuentas } from './cuentas.js';
import { renderBanners } from './banners.js';
import { renderBonos } from './bonos.js';
import { renderBonoRegistro } from './bono-registro.js';
import { renderPromos } from './promos.js';
import { renderHitos } from './hitos.js';
import { renderOfertasCarga } from './ofertas-carga.js';
import { renderCashback } from './cashback.js';
import { renderBilletera } from './billetera.js';
import { renderVip } from './vip.js';
import { renderGiroDiario } from './giro-diario.js';
import { renderReferidos } from './referidos.js';
import { renderJuegos } from './juegos.js';
import { renderAnimaciones } from './Animaciones.tsx';
import { renderHistorial } from './historial.js';
import { renderCierre } from './cierre.js';
import { renderSoporte } from './soporte.js';
import { renderPersonalizacion } from './personalizacion.js';
import { renderFondos } from './fondos.js';

// Las secciones van agrupadas por área de trabajo. Con 10 items sueltos
// hay que leerlos todos para encontrar uno; agrupados, el ojo salta
// directo al grupo correcto.
const GRUPOS = [
  {
    titulo: 'Caja',
    items: [
      ['inicio', 'Inicio', 'ver_panel', 'inicio'],
      ['cargas', 'Cargas', 'cargar', 'cargar'],
      ['retiros', 'Retiros', 'retirar', 'retirar'],
      ['fondos', 'Fondos', 'asignar_fichas', 'fondos'],
      ['solicitudes', 'Solicitudes', 'atender', 'solicitudes'],
      ['soporte', 'Soporte', 'soporte', 'soporte'],
      ['cierre', 'Cierre de caja', 'ver_historial', 'cierre'],
      ['historial', 'Historial', 'ver_historial', 'historial'],
    ],
  },
  {
    titulo: 'Jugadores',
    items: [
      ['jugadores', 'Buscar jugador', 'ver_panel', 'jugadores'],
      ['verificaciones', 'Verificaciones', 'atender', 'verificacion'],
      ['crear-usuario', 'Crear usuario', 'crear_jugador', 'nuevoJugador'],
      ['password', 'Contraseñas', 'password_jugador', 'llave'],
    ],
  },
  {
    titulo: 'Administración',
    items: [
      ['cuentas', 'Cuentas bancarias', 'ver_casa', 'banco'],
      ['banners', 'Banners', 'ajustes', 'banner'],
      ['bonos', 'Bonos', 'ajustes', 'bono'],
      ['bono-registro', 'Bono de registro', 'ajustes', 'bono'],
      ['promos', 'Códigos promo', 'ajustes', 'bono'],
      ['hitos', 'Hitos de carga', 'ajustes', 'bono'],
      ['ofertas-carga', 'Ofertas de carga', 'ajustes', 'bono'],
      ['cashback', 'Cashback', 'ver_casa', 'cashback'],
      ['billetera', 'Billetera', 'ajustes', 'bono'],
      ['vip', 'Niveles VIP', 'ver_casa', 'vip'],
      ['giro-diario', 'Giro diario', 'ajustes', 'giro'],
      ['referidos', 'Referidos', 'ver_casa', 'referidos'],
      ['juegos', 'Juegos', 'ver_casa', 'juegos'],
      ['animaciones', 'Animaciones', 'ajustes', 'animaciones'],
      ['cajeros', 'Equipo', 'ver_staff', 'equipo'],
      ['ajustes', 'Ajustes', 'ajustes', 'ajustes'],
    ],
  },
];

export function renderDashboard(container, { session, profile, settings }) {
  // Cada grupo se filtra por permisos; los que quedan vacíos no se dibujan.
  const grupos = GRUPOS
    .map((g) => ({ ...g, items: g.items.filter(([, , permiso]) => puede(profile, permiso)) }))
    .filter((g) => g.items.length);

  const primera = grupos[0]?.items[0]?.[0] || 'inicio';
  let actual = primera;

  container.innerHTML = `
    <div class="dashboard">
      <div class="panel-shell">
        <div class="panel-main">
          <header class="topbar">
            <span class="marca">
              <img class="marca-logo" src="${urlLogo(settings)}" alt="" onerror="this.remove()" />
              ${settings?.casino_name || 'RivelBet'}
            </span>
            <span class="topbar-seccion" id="titulo-seccion"></span>
            <span class="topbar-fondo" id="topbar-fondo" hidden></span>
            <button class="icon-btn" id="btn-menu" aria-label="Abrir menú">${ICONOS.menu}</button>
          </header>
          <main id="vista"></main>
        </div>

        <aside class="panel-lateral" id="lateral">
          <div class="lateral-head">
            <div class="lateral-user">
              <div class="lateral-avatar">${(profile?.display_name || session.user.email).charAt(0).toUpperCase()}</div>
              <div class="lateral-user-txt">
                <strong>${escapeHtml(profile?.display_name ?? session.user.email)}</strong>
                <span>${etiquetaPerfil(profile)}</span>
              </div>
            </div>
            <button class="icon-btn solo-movil" id="btn-cerrar-menu" aria-label="Cerrar menú">${ICONOS.cerrar}</button>
            <button class="icon-btn solo-desktop" id="btn-colapsar" aria-label="Plegar menú">${ICONOS.colapsar}</button>
          </div>

          <nav class="lateral-nav">
            ${grupos.map((g) => `
              <div class="lateral-grupo">
                <p class="lateral-grupo-titulo">${g.titulo}</p>
                ${g.items.map(([key, label, , icono]) => `
                  <button class="lateral-item" data-seccion="${key}" title="${label}">
                    <span class="icono">${ICONOS[icono]}</span>
                    <span class="texto">${label}</span>
                  </button>
                `).join('')}
              </div>
            `).join('')}
          </nav>

          <button class="lateral-item lateral-salir" id="logout-btn" title="Cerrar sesión">
            <span class="icono">${ICONOS.salir}</span>
            <span class="texto">Cerrar sesión</span>
          </button>
        </aside>

        <div class="lateral-velo" id="velo"></div>
      </div>
    </div>
  `;

  const vista = container.querySelector('#vista');
  const lateral = container.querySelector('#lateral');
  const velo = container.querySelector('#velo');
  const shell = container.querySelector('.panel-shell');

  const abrirMenu = () => shell.classList.add('menu-abierto');
  const cerrarMenu = () => shell.classList.remove('menu-abierto');

  container.querySelector('#btn-menu').addEventListener('click', abrirMenu);
  container.querySelector('#btn-cerrar-menu').addEventListener('click', cerrarMenu);
  velo.addEventListener('click', cerrarMenu);

  // En escritorio el panel se pliega a solo íconos y la preferencia
  // queda guardada, porque un cajero que trabaja todo el día en una
  // pantalla chica no quiere volver a plegarlo cada vez que entra.
  const PLEGADO = 'panel_plegado';
  if (localStorage.getItem(PLEGADO) === '1') shell.classList.add('plegado');

  container.querySelector('#btn-colapsar').addEventListener('click', () => {
    const plegado = shell.classList.toggle('plegado');
    localStorage.setItem(PLEGADO, plegado ? '1' : '0');
  });

  container.querySelector('#logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });

  const ir = (key, opts) => {
    actual = key;

    container.querySelectorAll('.lateral-item[data-seccion]').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.seccion === key);
    });

    const item = grupos.flatMap((g) => g.items).find(([k]) => k === key);
    container.querySelector('#titulo-seccion').textContent = item ? item[1] : '';

    cerrarMenu();
    mostrarSeccion(vista, key, { session, profile, settings, container, ir }, opts);
  };

  container.querySelectorAll('.lateral-item[data-seccion]').forEach((btn) => {
    btn.addEventListener('click', () => ir(btn.dataset.seccion));
  });

  ir(primera);

  iniciarHeartbeatPanel(() => actual, ir);
  pintarFondoTopbar(container);
}

// Secciones que son listas y se pueden re-renderizar solas sin molestar.
// Soporte queda afuera: ya se refresca cada 6 s por su cuenta y volver a
// pintarla cerraría el chat abierto.
const SECCIONES_VIVAS = ['inicio', 'solicitudes', 'verificaciones', 'cashback'];
let heartbeatPanelReloj = null;
let heartbeatPanelVis = null;

/**
 * Auto-refresh del panel. Consulta staff_heartbeat cada ~15 s; si el
 * número cambió y la sección abierta es una lista, la vuelve a pintar.
 * Nunca refresca si hay un campo con foco (el cajero está escribiendo).
 */
function iniciarHeartbeatPanel(getActual, ir) {
  if (heartbeatPanelReloj) clearInterval(heartbeatPanelReloj);
  if (heartbeatPanelVis) document.removeEventListener('visibilitychange', heartbeatPanelVis);
  let version;

  const chequear = async () => {
    if (document.hidden) return;
    const foco = document.activeElement?.tagName;
    if (foco === 'INPUT' || foco === 'TEXTAREA' || foco === 'SELECT') return;

    const { data } = await supabase.from('staff_heartbeat').select('version').eq('id', true).maybeSingle();
    if (!data) return;

    if (version === undefined) { version = data.version; return; }
    if (data.version !== version) {
      version = data.version;
      if (SECCIONES_VIVAS.includes(getActual())) ir(getActual());
    }
  };

  heartbeatPanelReloj = setInterval(chequear, 15000);
  heartbeatPanelVis = () => { if (!document.hidden) chequear(); };
  document.addEventListener('visibilitychange', heartbeatPanelVis);
}

function mostrarSeccion(vista, key, ctx, opts) {
  switch (key) {
    case 'inicio': renderInicio(vista); break;
    case 'cargas': renderMovimiento(vista, { modo: 'carga', preseleccion: opts?.jugador }); break;
    case 'retiros': renderMovimiento(vista, { modo: 'retiro', preseleccion: opts?.jugador }); break;
    case 'solicitudes': renderSolicitudes(vista, { profile: ctx.profile }); break;
    case 'verificaciones': renderVerificaciones(vista, { profile: ctx.profile }); break;
    case 'soporte': renderSoporte(vista, { profile: ctx.profile, ticketId: opts?.ticketId }); break;
    case 'cierre': renderCierre(vista, { profile: ctx.profile }); break;
    case 'fondos': renderFondos(vista, { profile: ctx.profile }); break;
    case 'historial': renderHistorial(vista, { profile: ctx.profile }); break;
    case 'jugadores': renderJugadores(vista, { profile: ctx.profile, ir: ctx.ir }); break;
    case 'crear-usuario': renderCrearUsuario(vista); break;
    case 'password': renderCambiarPassword(vista, { preseleccion: opts?.jugador }); break;
    case 'cuentas': renderCuentas(vista, { profile: ctx.profile }); break;
    case 'banners': renderBanners(vista, { profile: ctx.profile }); break;
    case 'bonos': renderBonos(vista, { profile: ctx.profile }); break;
    case 'bono-registro': renderBonoRegistro(vista, { profile: ctx.profile }); break;
    case 'promos': renderPromos(vista, { profile: ctx.profile }); break;
    case 'hitos': renderHitos(vista, { profile: ctx.profile }); break;
    case 'ofertas-carga': renderOfertasCarga(vista, { profile: ctx.profile }); break;
    case 'cashback': renderCashback(vista, { profile: ctx.profile }); break;
    case 'billetera': renderBilletera(vista, { profile: ctx.profile }); break;
    case 'vip': renderVip(vista, { profile: ctx.profile }); break;
    case 'giro-diario': renderGiroDiario(vista, { profile: ctx.profile }); break;
    case 'referidos': renderReferidos(vista, { profile: ctx.profile }); break;
    case 'juegos': renderJuegos(vista, { profile: ctx.profile }); break;
    case 'animaciones': renderAnimaciones(vista, { profile: ctx.profile }); break;
    case 'cajeros': renderStaff(vista, { profile: ctx.profile }); break;
    case 'ajustes':
      renderPersonalizacion(vista, {
        profile: ctx.profile,
        settings: ctx.settings,
        onSaved: (saved) => {
          updateCachedSettings(saved);
          renderDashboard(ctx.container, {
            session: ctx.session,
            profile: ctx.profile,
            settings: saved,
          });
        },
      });
      break;
  }
}

function etiquetaPerfil(profile) {
  const NOMBRES = {
    dios: 'Dios admin', gerente: 'Gerente', caja: 'Cajero de caja',
    cajero: 'Cajero de mostrador', externo: 'Cajero externo',
    retiros: 'Solo retiros', consulta: 'Consulta',
  };
  return NOMBRES[profile?.perfil] || profile?.role || '';
}

async function pintarFondoTopbar(container) {
  const el = container.querySelector('#topbar-fondo');
  if (!el) return;
  const { ok, data } = await apiFetch('/api/caja?recurso=fondos');
  if (!ok || !data?.cajaConFondo) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = `Tus fichas ${formatMoney(data.mio || 0)}`;
}

async function renderInicio(vista) {
  vista.innerHTML = '<section class="card"><p class="hint">Cargando resumen...</p></section>';

  const desdeHoy = new Date();
  desdeHoy.setHours(0, 0, 0, 0);
  const hoy = desdeHoy.toISOString().slice(0, 10);

  const [{ data: jugadores }, { data: movimientosHoy }, fondosRes, cierreRes] = await Promise.all([
    supabase.from('players').select('balance, ban_permanente'),
    supabase
      .from('balance_transactions')
      .select('type, amount, created_by, created_at')
      .gte('created_at', desdeHoy.toISOString())
      .order('created_at', { ascending: false }),
    apiFetch('/api/caja?recurso=fondos'),
    apiFetch(`/api/caja?recurso=cierre&desde=${hoy}&hasta=${hoy}`),
  ]);

  const lista = jugadores || [];
  const movs = movimientosHoy || [];

  const saldoTotal = lista.reduce((a, j) => a + Number(j.balance), 0);
  const activos = lista.filter((j) => !j.ban_permanente).length;
  const cargasHoy = movs.filter((m) => m.type === 'carga').reduce((a, m) => a + Number(m.amount), 0);
  const retirosHoy = movs.filter((m) => m.type === 'retiro').reduce((a, m) => a + Number(m.amount), 0);
  const fondos = fondosRes.ok ? fondosRes.data : null;
  const plata = cierreRes.ok ? cierreRes.data?.plata : null;
  const fondosCajeros = (fondos?.fondos || []).reduce((a, f) => a + Number(f.fichas || 0), 0);

  vista.innerHTML = `
    <div class="stats">
      <div class="stat"><small class="hint">Fichas en jugadores</small><strong>${formatMoney(saldoTotal)}</strong></div>
      <div class="stat"><small class="hint">Jugadores activos</small><strong>${activos}</strong></div>
      ${plata ? `
        <div class="stat"><small class="hint">Plata entrada hoy</small><strong>${formatMoney(plata.entrada)}</strong></div>
        <div class="stat"><small class="hint">Plata salida hoy</small><strong>${formatMoney(plata.salida)}</strong></div>
      ` : `
        <div class="stat"><small class="hint">Cargado hoy</small><strong>${formatMoney(cargasHoy)}</strong></div>
        <div class="stat"><small class="hint">Retirado hoy</small><strong>${formatMoney(retirosHoy)}</strong></div>
      `}
    </div>
    ${fondos?.cajaConFondo ? `
      <div class="stats">
        ${fondos.boveda ? `
          <div class="stat"><small class="hint">Bóveda</small><strong>${formatMoney(fondos.boveda.fichas || 0)}</strong></div>
          <div class="stat"><small class="hint">Fondos de cajeros</small><strong>${formatMoney(fondosCajeros)}</strong></div>
        ` : ''}
        <div class="stat"><small class="hint">Tus fichas</small><strong>${formatMoney(fondos.mio || 0)}</strong></div>
      </div>
    ` : ''}

    <section class="card">
      <h3 style="margin-top:0">Movimientos de hoy</h3>
      ${movs.length ? `
        <div class="tabla-scroll">
          <table class="tabla">
            <thead><tr><th>Hora</th><th>Tipo</th><th>Monto</th><th>Cajero</th></tr></thead>
            <tbody>
              ${movs.slice(0, 25).map((m) => `
                <tr>
                  <td class="mono">${fechaCorta(m.created_at)}</td>
                  <td><span class="badge ${m.type === 'carga' ? 'badge-ok' : 'badge-warn'}">${m.type}</span></td>
                  <td class="mono">${formatMoney(m.amount)}</td>
                  <td class="hint">${m.created_by}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="hint">Todavía no hubo movimientos hoy.</p>'}
    </section>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
