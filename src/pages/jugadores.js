import { supabase } from '../lib/supabaseClient.js';
import { apiFetch } from '../lib/api.ts';
import { puede } from '../lib/perfiles.js';
import { formatMoney, currency } from '../lib/currency.ts';
import { listarJugadores, historialJugador, historialBans, fechaCorta } from '../lib/players.js';

export function renderJugadores(container, { profile, ir }) {
  mostrarLista(container, { profile, ir });
}

/* =========================================================
   Vista de lista + buscador
   ========================================================= */
function mostrarLista(container, ctx, filtro = '') {
  container.innerHTML = `
    <section class="card">
      <h2>Jugadores</h2>
      <div class="search-row">
        <input id="filtro-jugadores" placeholder="Buscar por ID o nombre" autocomplete="off" value="${escapeHtml(filtro)}" />
        <button id="btn-filtrar">Buscar</button>
      </div>
      <div id="lista-jugadores"><p class="hint">Cargando...</p></div>
    </section>
  `;

  const inputFiltro = container.querySelector('#filtro-jugadores');
  const refrescar = () => cargarLista(container, ctx, inputFiltro.value);

  container.querySelector('#btn-filtrar').addEventListener('click', refrescar);
  inputFiltro.addEventListener('keydown', (e) => { if (e.key === 'Enter') refrescar(); });

  refrescar();
}

async function cargarLista(container, ctx, filtro) {
  const listaEl = container.querySelector('#lista-jugadores');
  if (!listaEl) return;
  listaEl.innerHTML = '<p class="hint">Buscando...</p>';

  const jugadores = await listarJugadores({ filtro });

  if (!jugadores.length) {
    listaEl.innerHTML = '<p class="hint">No hay jugadores que coincidan.</p>';
    return;
  }

  listaEl.innerHTML = `
    <div class="tabla-scroll"><table class="tabla">
      <thead><tr><th>ID</th><th>Usuario</th><th>Saldo</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        ${jugadores.map((j) => `
          <tr>
            <td class="mono">#${j.player_number}</td>
            <td>${escapeHtml(j.display_name || j.username)}<small class="hint">@${escapeHtml(j.username)}</small></td>
            <td class="mono">${formatMoney(j.balance)}</td>
            <td>${badgesBan(j)}</td>
            <td><button class="secundario ver-perfil" data-id="${j.id}">Ver perfil</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;

  listaEl.querySelectorAll('.ver-perfil').forEach((btn) => {
    btn.addEventListener('click', () => abrirPerfil(container, btn.dataset.id, ctx, filtro));
  });
}

function badgesBan(j) {
  if (j.ban_permanente) return '<span class="badge badge-danger">Ban permanente</span>';
  const badges = [];
  if (j.ban_recargas) badges.push('<span class="badge badge-warn">Sin recargas</span>');
  if (j.ban_retiros) badges.push('<span class="badge badge-warn">Sin retiros</span>');
  return badges.join(' ') || '<span class="badge badge-ok">Activo</span>';
}

/* =========================================================
   Vista de perfil (ocupa toda la pantalla)
   ========================================================= */
async function abrirPerfil(container, playerId, ctx, filtroPrevio = '') {
  const { profile, ir } = ctx;
  container.innerHTML = '<section class="card"><p class="hint">Cargando perfil...</p></section>';

  const [
    { data: j },
    movimientos,
    bans,
    { data: verifs },
    { data: resumenArr },
    { data: rondas },
    { data: cargas },
    { data: retiros },
    { data: ticket },
    { data: notas },
    { data: cashbackDisp },
    { data: vipNiveles },
    { data: refDe },
    { data: refResumen },
    { data: hitosProg },
  ] = await Promise.all([
    supabase.from('players').select('*').eq('id', playerId).single(),
    historialJugador(playerId),
    historialBans(playerId),
    supabase.from('verificaciones').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
    supabase.rpc('resumen_jugador', { p_player_id: playerId }),
    supabase.from('game_rounds').select('game_slug, bet, win, balance_before, balance_after, created_at')
      .eq('player_id', playerId).order('created_at', { ascending: false }).limit(20),
    supabase.from('deposit_requests').select('id, amount, estado, created_at, resuelto_por')
      .eq('player_id', playerId).order('created_at', { ascending: false }).limit(10),
    supabase.from('withdrawal_requests').select('id, amount, estado, created_at, resuelto_por')
      .eq('player_id', playerId).order('created_at', { ascending: false }).limit(10),
    supabase.from('soporte_tickets').select('id, estado, motivo, ultimo_mensaje_at')
      .eq('player_id', playerId).in('estado', ['abierto', 'en_curso'])
      .order('ultimo_mensaje_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('player_notas').select('*').eq('player_id', playerId).order('created_at', { ascending: false }),
    supabase.from('cashback_periodos').select('id, monto, periodo_inicio, periodo_fin')
      .eq('player_id', playerId).eq('estado', 'disponible')
      .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('vip_niveles').select('id, nombre, color, orden, umbral_cargado, cashback_pct, giro_multiplicador')
      .order('orden', { ascending: true }),
    supabase.from('referidos')
      .select('estado, pagado_at, referidor:players!referidos_referidor_id_fkey(player_number, display_name, username)')
      .eq('referido_id', playerId).maybeSingle(),
    supabase.rpc('referidos_resumen', { p_player_id: playerId }),
    supabase.from('player_hitos')
      .select('cargas_contadas, hitos_completados, ultima_carga_at, bono_hitos(nombre, cada_cargas, min_por_carga, activo)')
      .eq('player_id', playerId),
  ]);

  if (!j) {
    container.innerHTML = `
      <button class="secundario" id="volver">← Volver a jugadores</button>
      <section class="card"><p class="hint error">No se encontró el jugador.</p></section>
    `;
    container.querySelector('#volver').addEventListener('click', () => mostrarLista(container, ctx, filtroPrevio));
    return;
  }

  const r = (Array.isArray(resumenArr) ? resumenArr[0] : resumenArr) || {};
  const verifs2 = verifs || [];
  const cargasList = cargas || [];
  const retirosList = retiros || [];

  const balance = Number(j.balance || 0);
  const retenido = Number(j.balance_retenido || 0);
  const piso = Math.min(Number(j.bono_por_descontar || 0), balance);
  const retirable = j.retiro_bloqueado ? 0 : Math.max(0, balance - piso);

  const cargado = Number(r.cargado || 0);
  const retirado = Number(r.retirado || 0);
  const bono = Number(r.bono || 0);
  const apostado = Number(r.apostado || 0);
  const ganado = Number(r.ganado || 0);
  const resultadoJuego = apostado - ganado;
  const cajaNeta = cargado - retirado;

  const cargaPend = cargasList.find((c) => c.estado === 'pendiente');
  const retiroPend = retirosList.find((c) => c.estado === 'pendiente');
  const verifPend = verifs2[0]?.estado === 'pendiente';

  const puedeOperativo = puede(profile, 'ban_operativo');
  const puedePermanente = puede(profile, 'ban_permanente');
  const puedeAnular = puede(profile, 'gestionar_staff');
  const puedeImpersonar = puede(profile, 'impersonar_jugador');
  const puedeVerificar = puede(profile, 'crear_jugador');
  const wa = whatsapp(j.telefono);

  container.innerHTML = `
    <button class="secundario" id="volver" style="margin-bottom:14px">← Volver a jugadores</button>

    <section class="card perfil">
      <div class="perfil-header">
        <div>
          <h2>${escapeHtml(j.display_name || j.username)}</h2>
          <p class="hint">
            ID #${j.player_number} · @${escapeHtml(j.username)} · alta ${fechaCorta(j.created_at)}
            ${j.created_by === 'autorregistro' ? ' por Autorregistro' : j.created_by ? ` por ${escapeHtml(j.created_by)}` : ''}
          </p>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
            ${VER_BADGE[j.estado_verificacion || 'sin_verificar'] || ''}
            ${badgesBan(j)}
            ${j.retiro_bloqueado ? '<span class="badge badge-warn">Retiro bloqueado</span>' : ''}
          </div>
        </div>
        <div class="perfil-saldo">
          <small class="hint">Saldo disponible</small>
          <strong class="balance">${formatMoney(balance)}</strong>
        </div>
      </div>

      <div class="saldo-desglose">
        <div><span>En proceso de retiro</span><span>${formatMoney(retenido)}</span></div>
        <div><span>No retirable (bono)</span><span>${formatMoney(piso)}</span></div>
        <div class="total"><span>Retirable ahora</span><strong>${formatMoney(retirable)}</strong></div>
      </div>

      <div class="acciones perfil-acciones">
        ${puede(profile, 'cargar') ? '<button id="pa-cargar">Cargar fichas</button>' : ''}
        ${puede(profile, 'retirar') ? '<button id="pa-retirar" class="secundario">Retirar fichas</button>' : ''}
        ${puede(profile, 'password_jugador') ? '<button id="pa-pass" class="secundario">Resetear contraseña</button>' : ''}
        ${puedeImpersonar ? '<button id="pa-impersonar" class="secundario">Entrar como jugador</button>' : ''}
        ${wa ? `<a class="btn-como-boton" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div>
      <p id="pa-msg" class="hint"></p>

      ${cargaPend || retiroPend || verifPend || ticket ? `
        <div class="perfil-alertas">
          ${cargaPend ? alerta('warn', `<b>Carga pendiente</b> — ${formatMoney(cargaPend.amount)} declarados ${fechaCorta(cargaPend.created_at)}`, 'sol-carga', 'Ver solicitud') : ''}
          ${retiroPend ? alerta('warn', `<b>Retiro pendiente</b> — ${formatMoney(retiroPend.amount)} desde ${fechaCorta(retiroPend.created_at)}`, 'sol-retiro', 'Ver solicitud') : ''}
          ${verifPend && j.created_by === 'autorregistro' ? alerta('warn', '<b>Verificación pendiente</b> — subió fotos y falta revisarlas', 'ir-verif', 'Revisar') : ''}
          ${ticket ? alerta('info', `<b>Reclamo abierto</b> en soporte — ${escapeHtml(ticket.motivo || 'otro')}`, 'ir-soporte', 'Abrir chat') : ''}
        </div>
      ` : ''}

      <div class="perfil-grid">

        <div class="perfil-card">
          <h3>Resumen financiero</h3>
          ${finRow('Total cargado', formatMoney(cargado))}
          ${finRow('Total retirado', formatMoney(retirado))}
          ${finRow('Bono recibido', formatMoney(bono))}
          ${finRow('Apostado en juegos', formatMoney(apostado))}
          ${finRow('Ganado en juegos', formatMoney(ganado))}
          ${finRow('Resultado de juego (casino)', signo(resultadoJuego), true)}
          ${finRow('Caja neta del jugador', signo(cajaNeta), true)}
        </div>

        <div class="perfil-card">
          <h3>Datos de registro</h3>
          <dl class="kv">
            <dt>Documento</dt><dd class="mono">${escapeHtml(j.documento || '—')}</dd>
            <dt>Teléfono</dt><dd class="mono">${escapeHtml(j.telefono || '—')}</dd>
            <dt>Correo</dt><dd>${escapeHtml(j.email || '—')}</dd>
            <dt>Nacimiento</dt><dd>${j.fecha_nacimiento ? `${fechaSola(j.fecha_nacimiento)} · ${edad(j.fecha_nacimiento)} años` : '—'}</dd>
            <dt>Origen</dt><dd>${j.created_by === 'autorregistro' ? 'Autorregistro (portal)' : escapeHtml(j.created_by || '—')}</dd>
            ${j.registro_ip ? `<dt>IP de registro</dt><dd class="mono hint">${escapeHtml(j.registro_ip)}</dd>` : ''}
          </dl>
        </div>

        <div class="perfil-card" id="card-verif">
          <h3>Verificación de identidad</h3>
          ${bloqueVerif(j, verifs2, puedeVerificar, puede(profile, 'crear_jugador'))}
        </div>

        <div class="perfil-card">
          <h3>Bono de registro</h3>
          ${bono > 0 ? `
            <dl class="kv">
              <dt>Monto</dt><dd>${formatMoney(bono)}</dd>
              <dt>Estado</dt><dd>${j.retiro_bloqueado
                ? '<span class="badge badge-warn">Activo — bloquea retiro</span>'
                : '<span class="badge badge-ok">Liberado</span>'}</dd>
              ${j.retiro_bloqueado ? `<dt>Para liberar</dt><dd>una carga aprobada ≥ ${formatMoney(bono)}</dd>` : ''}
              <dt>Piso no retirable</dt><dd>${formatMoney(piso)}</dd>
            </dl>
          ` : '<p class="hint">No recibió bono de registro.</p>'}
        </div>

        ${(vipNiveles || []).length ? seccionVip(j, vipNiveles, puede(profile, 'crear_jugador')) : ''}

        ${(refDe || Number(refResumen?.invitados) > 0) ? `
          <div class="perfil-card">
            <h3>Referidos</h3>
            ${refDe ? `<p class="hint" style="margin-bottom:6px">Lo invitó: <b style="color:var(--text)">${escapeHtml(refDe.referidor?.display_name || refDe.referidor?.username || '—')}${refDe.referidor?.player_number ? ` (#${refDe.referidor.player_number})` : ''}</b> · ${refDe.estado === 'pagado' ? 'bono pagado' : 'falta que cargue'}</p>` : ''}
            ${Number(refResumen?.invitados) > 0 ? `<p class="hint">Invitó a ${refResumen.invitados} · cargaron ${refResumen.pagados} · le pagamos ${formatMoney(refResumen.ganado)}</p>` : ''}
          </div>
        ` : ''}

        ${cashbackDisp ? `
          <div class="perfil-card">
            <h3>Cashback disponible</h3>
            <p style="font-size:20px;font-weight:600;color:var(--success);margin:0 0 2px">${formatMoney(cashbackDisp.monto)}</p>
            <p class="hint">Semana ${fechaSola(cashbackDisp.periodo_inicio)} – ${fechaSola(cashbackDisp.periodo_fin)}</p>
            <div class="acciones" style="margin-top:8px">
              ${puede(profile, 'cargar') ? '<button id="cb-dar-fichas">Dar en fichas</button>' : ''}
              <button class="secundario" id="cb-ir">Ver en Cashback</button>
            </div>
            <p id="cb-perfil-msg" class="hint"></p>
          </div>
        ` : ''}

        ${puede(profile, 'cargar') ? `
          <div class="perfil-card">
            <h3>Dar un bono</h3>
            <p class="hint" style="margin-top:0">Le entra al saldo. Con el modo avanzado de Billetera es pegajoso según el rollover que pongas.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
              <label class="field corto" style="margin:0">Monto (${currency.symbol})<input id="bn-monto" type="number" min="0" placeholder="5000" /></label>
              <label class="field corto" style="margin:0">Rollover (×)<input id="bn-roll" type="number" min="0" step="0.5" value="1" /></label>
            </div>
            <label class="field" style="margin-top:8px">Nota (la ve el jugador en sus movimientos)
              <input id="bn-nota" maxlength="60" placeholder="Bono de cortesía" />
            </label>
            <div class="acciones" style="margin-top:8px"><button id="bn-dar">Dar bono</button></div>
            <p id="bn-msg" class="hint"></p>
          </div>
        ` : ''}

        ${(hitosProg || []).filter((p) => p.bono_hitos?.activo).length ? `
          <div class="perfil-card">
            <h3>Hitos de carga</h3>
            <dl class="kv">
              ${(hitosProg || []).filter((p) => p.bono_hitos?.activo).map((p) => {
                const h = p.bono_hitos;
                return `<dt>${escapeHtml(h.nombre)}</dt><dd>${p.cargas_contadas}/${h.cada_cargas} cargas de ${formatMoney(h.min_por_carga)}+ · ${p.hitos_completados} logrado${p.hitos_completados === 1 ? '' : 's'}</dd>`;
              }).join('')}
            </dl>
          </div>
        ` : ''}

        <div class="perfil-card">
          <h3>Actividad</h3>
          <dl class="kv">
            <dt>Último ingreso</dt><dd>${r.ultimo_ingreso ? fechaCorta(r.ultimo_ingreso) : '—'}</dd>
            <dt>Última carga</dt><dd>${r.ultima_carga ? fechaCorta(r.ultima_carga) : '—'}</dd>
            <dt>Último retiro</dt><dd>${r.ultimo_retiro ? fechaCorta(r.ultimo_retiro) : '—'}</dd>
            <dt>Último giro</dt><dd>${r.ultimo_giro ? fechaCorta(r.ultimo_giro) : '—'}</dd>
            <dt>Giros totales</dt><dd>${Number(r.giros || 0)}</dd>
            <dt>Juego favorito</dt><dd>${escapeHtml(r.juego_top || '—')}</dd>
          </dl>
        </div>

        <div class="perfil-card">
          <h3>Notas internas</h3>
          <div id="notas-lista">
            ${(notas || []).length ? (notas || []).map((n) => `
              <div class="nota-item">
                ${escapeHtml(n.texto)}
                <div class="nota-meta">${escapeHtml(n.autor)} · ${fechaCorta(n.created_at)}</div>
              </div>
            `).join('') : '<p class="hint">Sin notas.</p>'}
          </div>
          <div class="nota-form">
            <input id="nota-texto" placeholder="Agregar una nota (solo la ve el staff)" maxlength="1000" />
            <button id="nota-add">Agregar</button>
          </div>
          <p id="nota-msg" class="hint"></p>
        </div>

        <div class="perfil-card full">
          <h3>Restricciones</h3>
          ${j.ban_motivo ? `<p class="hint">Último motivo: ${escapeHtml(j.ban_motivo)}</p>` : ''}
          <div class="bans-row">
            ${botonBan('recargas', 'Recargas', j.ban_recargas, puedeOperativo)}
            ${botonBan('retiros', 'Retiros', j.ban_retiros, puedeOperativo)}
            ${botonBan('permanente', 'Permanente', j.ban_permanente, puedePermanente)}
            <button class="secundario" id="cerrar-sesion" ${puedeOperativo ? '' : 'disabled'}>Cerrar su sesión</button>
          </div>
          <input id="ban-motivo" placeholder="Motivo (opcional)" autocomplete="off" style="margin-top:10px" />
          <p id="ban-msg" class="hint"></p>
        </div>

      </div>

      <h3 style="margin-top:22px">Historial de fichas</h3>
      ${movimientos.length ? `
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Saldo</th><th>Cajero</th><th>Motivo</th><th></th></tr></thead>
          <tbody>
            ${movimientos.map((m) => `
              <tr class="${m.anulada ? 'mov-anulado' : ''}">
                <td class="mono">${fechaCorta(m.created_at)}</td>
                <td>
                  <span class="badge ${m.type === 'carga' ? 'badge-ok' : 'badge-warn'}">${m.type}</span>
                  ${m.anulada ? '<small class="hint error">anulado</small>' : ''}
                  ${m.anula_a ? '<small class="hint">anulación</small>' : ''}
                </td>
                <td class="mono">${formatMoney(m.amount)}</td>
                <td class="mono hint">${formatMoney(m.balance_before)} → ${formatMoney(m.balance_after)}</td>
                <td class="hint">${escapeHtml(m.created_by)}</td>
                <td class="hint">${escapeHtml(m.note || '')}</td>
                <td>${puedeAnular && !m.anulada && !m.anula_a
                  ? `<button class="secundario mov-anular" data-tx="${m.id}" data-monto="${m.amount}">Anular</button>` : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      ` : '<p class="hint">Todavía no tiene movimientos.</p>'}

      <h3 style="margin-top:22px">Últimas rondas de juego</h3>
      ${(rondas || []).length ? `
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Juego</th><th>Apuesta</th><th>Ganó</th><th>Resultado</th><th>Saldo</th></tr></thead>
          <tbody>
            ${(rondas || []).map((g) => {
              const res = Number(g.win) - Number(g.bet);
              return `
                <tr>
                  <td class="mono">${fechaCorta(g.created_at)}</td>
                  <td>${escapeHtml(g.game_slug)}</td>
                  <td class="mono">${formatMoney(g.bet)}</td>
                  <td class="mono ${Number(g.win) > 0 ? 'gr-win' : 'hint'}">${formatMoney(g.win)}</td>
                  <td class="mono ${res >= 0 ? 'gr-win' : 'gr-lose'}">${res >= 0 ? '+' : '−'}${formatMoney(Math.abs(res))}</td>
                  <td class="mono hint">${formatMoney(g.balance_before)} → ${formatMoney(g.balance_after)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table></div>
        <p class="hint">${Number(r.giros || 0)} rondas en total · mostrando las últimas ${(rondas || []).length}.</p>
      ` : '<p class="hint">Todavía no jugó.</p>'}

      <h3 style="margin-top:22px">Solicitudes del portal</h3>
      ${[...cargasList.map((c) => ({ ...c, tipo: 'Carga' })), ...retirosList.map((c) => ({ ...c, tipo: 'Retiro' }))]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).length ? `
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Estado</th><th>Resuelto por</th></tr></thead>
          <tbody>
            ${[...cargasList.map((c) => ({ ...c, tipo: 'Carga' })), ...retirosList.map((c) => ({ ...c, tipo: 'Retiro' }))]
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map((s) => `
                <tr>
                  <td class="mono">${fechaCorta(s.created_at)}</td>
                  <td>${s.tipo}</td>
                  <td class="mono">${formatMoney(s.amount)}</td>
                  <td>${estadoBadge(s.estado)}</td>
                  <td class="hint">${escapeHtml(s.resuelto_por || '—')}</td>
                </tr>
              `).join('')}
          </tbody>
        </table></div>
      ` : '<p class="hint">Sin solicitudes desde el portal.</p>'}

      ${bans.length ? `
        <h3 style="margin-top:22px">Historial de restricciones</h3>
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Acción</th><th>Motivo</th><th>Por</th></tr></thead>
          <tbody>
            ${bans.map((b) => `
              <tr>
                <td class="mono">${fechaCorta(b.created_at)}</td>
                <td>${b.ban_tipo}</td>
                <td>${b.activo ? 'Aplicado' : 'Levantado'}</td>
                <td class="hint">${escapeHtml(b.motivo || '')}</td>
                <td class="hint">${escapeHtml(b.created_by)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      ` : ''}
    </section>
  `;

  const $ = (s) => container.querySelector(s);
  const recargarPerfil = () => abrirPerfil(container, playerId, ctx, filtroPrevio);

  $('#volver').addEventListener('click', () => mostrarLista(container, ctx, filtroPrevio));

  // --- acciones rápidas ---
  $('#pa-cargar')?.addEventListener('click', () => ir('cargas', { jugador: String(j.player_number) }));
  $('#pa-retirar')?.addEventListener('click', () => ir('retiros', { jugador: String(j.player_number) }));
  $('#pa-pass')?.addEventListener('click', () => ir('password', { jugador: j.username }));

  $('#pa-impersonar')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = $('#pa-msg');
    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Generando acceso...';

    const { ok, data, error } = await apiFetch('/api/jugadores?recurso=impersonar', { method: 'POST', body: { playerId } });
    btn.disabled = false;

    if (!ok) { msgEl.className = 'hint error'; msgEl.textContent = error; return; }
    window.open(data.url, '_blank', 'noopener');
    msgEl.textContent = 'Se abrió en una pestaña nueva. El enlace vence en 60 segundos.';
  });

  // --- vip ---
  $('#vip-forzar')?.addEventListener('click', async () => {
    const sel = $('#vip-nivel-sel');
    const msgEl = $('#vip-perfil-msg');
    msgEl.className = 'hint'; msgEl.textContent = 'Guardando...';
    const { ok, error } = await apiFetch('/api/config?recurso=vip&accion=forzar', {
      method: 'POST', body: { playerId, nivelId: sel.value || null },
    });
    if (!ok) { msgEl.className = 'hint error'; msgEl.textContent = error; return; }
    recargarPerfil();
  });
  $('#vip-ir')?.addEventListener('click', () => ir('vip'));

  // --- cashback ---
  $('#cb-ir')?.addEventListener('click', () => ir('cashback'));
  $('#cb-dar-fichas')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = $('#cb-perfil-msg');
    if (!window.confirm(`¿Dar ${formatMoney(cashbackDisp.monto)} de cashback en fichas?`)) return;

    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Acreditando...';

    const { ok, error } = await apiFetch('/api/config?recurso=cashback&accion=cobrar', {
      method: 'POST', body: { periodoId: cashbackDisp.id, modo: 'fichas' },
    });

    if (!ok) { btn.disabled = false; msgEl.className = 'hint error'; msgEl.textContent = error; return; }
    recargarPerfil();
  });

  // --- dar bono manual ---
  $('#bn-dar')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = $('#bn-msg');
    const monto = Number($('#bn-monto').value) || 0;
    const rollover = Number($('#bn-roll').value) || 0;
    const nota = $('#bn-nota').value.trim();
    if (monto <= 0) { msgEl.className = 'hint error'; msgEl.textContent = 'Poné un monto.'; return; }
    if (!window.confirm(`¿Dar ${formatMoney(monto)} de bono (rollover ${rollover}×)?`)) return;

    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Acreditando...';

    const { ok, error } = await apiFetch('/api/jugadores?recurso=bono', {
      method: 'POST', body: { playerId, monto, rollover, nota },
    });

    if (!ok) { btn.disabled = false; msgEl.className = 'hint error'; msgEl.textContent = error; return; }
    recargarPerfil();
  });

  // --- alertas ---
  $('#alrt-sol-carga')?.addEventListener('click', () => ir('solicitudes'));
  $('#alrt-sol-retiro')?.addEventListener('click', () => ir('solicitudes'));
  $('#alrt-ir-verif')?.addEventListener('click', () => $('#card-verif').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  $('#alrt-ir-soporte')?.addEventListener('click', () => ir('soporte', { ticketId: ticket?.id }));

  // --- notas ---
  $('#nota-add')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const texto = $('#nota-texto').value.trim();
    const msgEl = $('#nota-msg');
    if (!texto) return;

    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Guardando...';

    const { ok, error } = await apiFetch('/api/jugadores?recurso=notas', { method: 'POST', body: { playerId, texto } });
    btn.disabled = false;

    if (!ok) { msgEl.className = 'hint error'; msgEl.textContent = error; return; }
    recargarPerfil();
  });

  container.querySelector('#pf-tel-ok')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = container.querySelector('#pf-tel-msg');
    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Guardando...';
    const { ok, error } = await apiFetch('/api/jugadores?recurso=telefono', {
      method: 'POST',
      body: { playerId, telefono: container.querySelector('#pf-tel').value },
    });
    btn.disabled = false;
    if (!ok) { msgEl.className = 'hint error'; msgEl.textContent = error; return; }
    recargarPerfil();
  });

  // --- verificación: aprobar/rechazar ---
  container.querySelectorAll('[data-verif]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const accion = btn.dataset.verif;
      const msgEl = $('#verif-msg');
      let motivo = null;

      if (accion === 'rechazar') {
        motivo = window.prompt('Motivo del rechazo (lo ve el jugador):', '');
        if (motivo === null) return;
        if (!motivo.trim()) { msgEl.className = 'hint error'; msgEl.textContent = 'El motivo es obligatorio.'; return; }
      } else if (!window.confirm('¿Verificar a este jugador y habilitar el juego?')) {
        return;
      }

      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Guardando...';

      const { ok, error } = await apiFetch('/api/atencion?recurso=verificaciones', {
        method: 'POST', body: { verifId: btn.dataset.id, accion, motivo },
      });

      if (!ok) { btn.disabled = false; msgEl.className = 'hint error'; msgEl.textContent = error; return; }
      recargarPerfil();
    });
  });

  // --- cerrar sesión ---
  $('#cerrar-sesion')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = $('#ban-msg');
    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Cerrando sesión...';

    const res = await apiFetch('/api/jugadores?recurso=ban', { method: 'POST', body: { playerId, cerrarSesion: true } });
    btn.disabled = false;

    if (!res.ok) { msgEl.className = 'hint error'; msgEl.textContent = res.error; return; }
    msgEl.className = 'hint ok';
    msgEl.textContent = 'Sesión cerrada. Va a tener que entrar de nuevo.';
  });

  // --- bans ---
  container.querySelectorAll('[data-ban]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tipo = btn.dataset.ban;
      const activar = btn.dataset.activo === 'false';
      const msgEl = $('#ban-msg');
      const motivo = $('#ban-motivo').value.trim();

      msgEl.className = 'hint';
      msgEl.textContent = 'Guardando...';
      btn.disabled = true;

      const { ok, error } = await apiFetch('/api/jugadores?recurso=ban', {
        method: 'POST', body: { playerId, tipo, activo: activar, motivo },
      });
      btn.disabled = false;

      if (!ok) { msgEl.className = 'hint error'; msgEl.textContent = error; return; }
      recargarPerfil();
    });
  });

  // --- anular movimiento ---
  container.querySelectorAll('.mov-anular').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fila = btn.closest('tr');
      if (fila.nextElementSibling?.classList.contains('fila-anular')) { fila.nextElementSibling.remove(); return; }

      const panel = document.createElement('tr');
      panel.className = 'fila-anular';
      panel.innerHTML = `
        <td colspan="7">
          <div class="anular-caja">
            <p class="hint" style="margin:0 0 8px">
              Se va a crear un movimiento inverso de ${formatMoney(btn.dataset.monto)}. El original queda visible, marcado como anulado.
            </p>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input class="anular-motivo" placeholder="Motivo (obligatorio)" style="flex:1;min-width:180px" />
              <button class="anular-ok">Confirmar anulación</button>
              <button class="secundario anular-no">Cancelar</button>
            </div>
            <p class="anular-msg hint"></p>
          </div>
        </td>
      `;
      fila.after(panel);
      panel.querySelector('.anular-motivo').focus();
      panel.querySelector('.anular-no').addEventListener('click', () => panel.remove());

      panel.querySelector('.anular-ok').addEventListener('click', async (e) => {
        const boton = e.currentTarget;
        const motivo = panel.querySelector('.anular-motivo').value.trim();
        const msgEl = panel.querySelector('.anular-msg');

        if (!motivo) { msgEl.className = 'anular-msg hint error'; msgEl.textContent = 'Escribí el motivo.'; return; }

        boton.disabled = true;
        msgEl.className = 'anular-msg hint';
        msgEl.textContent = 'Anulando...';

        const res = await apiFetch('/api/caja?recurso=anular', { method: 'POST', body: { txId: btn.dataset.tx, motivo } });
        if (!res.ok) { boton.disabled = false; msgEl.className = 'anular-msg hint error'; msgEl.textContent = res.error; return; }
        recargarPerfil();
      });
    });
  });

  container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- helpers de render ---------- */

const VER_BADGE = {
  sin_verificar: '<span class="badge">Sin verificar</span>',
  pendiente: '<span class="badge badge-warn">Verificación pendiente</span>',
  verificado: '<span class="badge badge-ok">Verificado</span>',
  rechazado: '<span class="badge badge-danger">Verificación rechazada</span>',
};

const DOC_LABEL = { ci: 'CI', pasaporte: 'Pasaporte', dni: 'DNI', otro: 'Documento' };

function alerta(tipo, html, id, boton) {
  return `
    <div class="perfil-alerta ${tipo}">
      <div class="txt">${html}</div>
      <button id="alrt-${id}">${boton}</button>
    </div>
  `;
}

function finRow(lbl, val, destaca) {
  const clase = String(val).startsWith('+') ? 'gr-win' : String(val).startsWith('−') ? 'gr-lose' : '';
  return `
    <div class="fin-row ${destaca ? 'destaca' : ''}">
      <span class="hint">${lbl}</span>
      <span class="${destaca ? clase : ''}">${val}</span>
    </div>
  `;
}

function signo(n) {
  if (n > 0) return '+' + formatMoney(n);
  if (n < 0) return '−' + formatMoney(Math.abs(n));
  return formatMoney(0);
}

function estadoBadge(estado) {
  const map = {
    pendiente: '<span class="badge badge-warn">pendiente</span>',
    aprobado: '<span class="badge badge-ok">aprobado</span>',
    rechazado: '<span class="badge badge-danger">rechazado</span>',
    cancelado: '<span class="badge">cancelado</span>',
  };
  return map[estado] || `<span class="badge">${estado}</span>`;
}

function seccionVip(j, niveles, puedeForzar) {
  const ord = [...niveles].sort((a, b) => a.orden - b.orden);
  const actual = ord.find((n) => n.id === j.vip_nivel_id) || ord[0];
  if (!actual) return '';
  const cargado = Number(j.cargado_historico || 0);
  const sig = ord.find((n) => n.orden > actual.orden);
  const falta = sig ? Math.max(0, Number(sig.umbral_cargado) - cargado) : 0;

  return `
    <div class="perfil-card">
      <h3>Nivel VIP</h3>
      <p style="margin:0 0 4px">
        <span class="vip-gema-badge" style="--g:${actual.color}"><span class="vip-gema-mini"></span>${escapeHtml(actual.nombre)}</span>
        ${j.vip_nivel_forzado ? ' <small class="hint">forzado</small>' : ''}
      </p>
      <p class="hint">Cargado histórico ${formatMoney(cargado)}${sig ? ` · faltan ${formatMoney(falta)} para ${escapeHtml(sig.nombre)}` : ' · nivel máximo'}</p>
      <p class="hint">Cashback ${actual.cashback_pct}%${Number(actual.giro_multiplicador) > 1 ? ` · giro ×${actual.giro_multiplicador}` : ''}</p>
      <div class="acciones" style="margin-top:8px">
        ${puedeForzar ? `
          <select id="vip-nivel-sel" style="max-width:150px">
            <option value="">— auto —</option>
            ${ord.map((n) => `<option value="${n.id}" ${n.id === j.vip_nivel_forzado ? 'selected' : ''}>${escapeHtml(n.nombre)}</option>`).join('')}
          </select>
          <button id="vip-forzar">Aplicar</button>
        ` : ''}
        <button class="secundario" id="vip-ir">Ver en VIP</button>
      </div>
      <p id="vip-perfil-msg" class="hint"></p>
    </div>
  `;
}

function bloqueVerif(j, verifs, puedeResolver, puedeTel) {
  const estado = j.estado_verificacion || 'sin_verificar';
  const deCajero = j.created_by !== 'autorregistro';

  if (deCajero) {
    const form = puedeTel ? `
      <label class="field" style="margin-top:10px">Teléfono de WhatsApp
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="pf-tel" value="${escapeHtml(j.telefono || '')}" placeholder="595981123456" style="flex:1;min-width:160px" />
          <button type="button" id="pf-tel-ok">Guardar</button>
        </div>
      </label>
      <p id="pf-tel-msg" class="hint"></p>
    ` : '';
    return `
      <p>${VER_BADGE[estado] || VER_BADGE.sin_verificar}</p>
      <p class="hint">${j.telefono
        ? `Verificado por teléfono <span class="mono">${escapeHtml(j.telefono)}</span>. Carga por WhatsApp: no hace falta documento.`
        : 'Este jugador es de cartera. El teléfono de WhatsApp es su verificación: sin número no puede jugar.'}</p>
      ${form}
    `;
  }

  const ultima = verifs[0];

  const fotos = ultima ? `
    <div class="verif-fotos">
      ${[['Frente', ultima.url_frente], ['Dorso', ultima.url_dorso], ['Foto', ultima.url_persona]].map(([lbl, url]) => `
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener">
          <img src="${escapeHtml(url)}" alt="${lbl}" loading="lazy" />${lbl}
        </a>
      `).join('')}
    </div>
    <p class="hint">
      ${DOC_LABEL[ultima.doc_tipo] || 'Documento'} · enviado ${fechaCorta(ultima.created_at)}
      ${ultima.estado === 'rechazada' && ultima.motivo ? ` · rechazada: ${escapeHtml(ultima.motivo)}` : ''}
      ${ultima.resuelto_por ? ` · por ${escapeHtml(ultima.resuelto_por)}` : ''}
      ${verifs.length > 1 ? ` · ${verifs.length - 1} envío(s) anterior(es)` : ''}
    </p>
  ` : '<p class="hint">Todavía no subió fotos.</p>';

  const acciones = (ultima?.estado === 'pendiente' && puedeResolver) ? `
    <div class="acciones" style="margin-top:8px">
      <button data-verif="aprobar" data-id="${ultima.id}">Aprobar verificación</button>
      <button class="secundario" data-verif="rechazar" data-id="${ultima.id}">Rechazar</button>
    </div>
    <p id="verif-msg" class="hint"></p>
  ` : '';

  return `<p>${VER_BADGE[estado] || VER_BADGE.sin_verificar}</p>${fotos}${acciones}`;
}

function botonBan(tipo, etiqueta, activo, habilitado) {
  const clase = activo ? 'ban-activo' : 'secundario';
  return `
    <button class="${clase}" data-ban="${tipo}" data-activo="${activo}" ${habilitado ? '' : 'disabled'}>
      ${activo ? `Levantar ban de ${etiqueta.toLowerCase()}` : `Banear ${etiqueta.toLowerCase()}`}
    </button>
  `;
}

function whatsapp(telefono) {
  const d = String(telefono || '').replace(/\D/g, '');
  if (d.length < 6) return null;
  const intl = d.startsWith('595') ? d : d.startsWith('0') ? '595' + d.slice(1) : d;
  return `https://wa.me/${intl}`;
}

function fechaSola(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function edad(iso) {
  const nac = new Date(iso);
  const hoy = new Date();
  let e = hoy.getFullYear() - nac.getFullYear();
  const mes = hoy.getMonth() - nac.getMonth();
  if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) e--;
  return e;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
