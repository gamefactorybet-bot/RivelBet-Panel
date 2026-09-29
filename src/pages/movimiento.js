import { supabase } from '../lib/supabaseClient.js';
import { apiFetch } from '../lib/api.ts';
import { formatMoney } from '../lib/currency.ts';
import { buscarJugador, historialJugador, fechaCorta } from '../lib/players.js';

let fondoCache = null;

/**
 * Pantalla genérica de movimiento. Se usa dos veces:
 * - modo 'carga'  -> apartado Cargas
 * - modo 'retiro' -> apartado Retiros
 * Comparten toda la lógica; solo cambia el texto y el tipo enviado.
 */
export function renderMovimiento(container, { modo, preseleccion } = {}) {
  const esCarga = modo === 'carga';
  const titulo = esCarga ? 'Cargar fichas' : 'Retirar fichas';
  const accion = esCarga ? 'Cargar' : 'Retirar';

  apiFetch('/api/caja?recurso=fondos').then(({ ok, data }) => {
    fondoCache = ok ? data : null;
    const chip = container.querySelector('#mov-fondo');
    if (!chip || !fondoCache?.cajaConFondo) return;
    chip.hidden = false;
    chip.textContent = esCarga
      ? `Tus fichas: ${formatMoney(fondoCache.mio || 0)} — solo podés cargar hasta ese monto`
      : `Tus fichas: ${formatMoney(fondoCache.mio || 0)} — lo que retires vuelve a tu fondo`;
  });

  container.innerHTML = `
    <section class="card">
      <h2>${titulo}</h2>
      <p class="hint" id="mov-fondo" hidden></p>
      <div class="search-row">
        <input id="mov-buscar" placeholder="ID o nombre de usuario" autocomplete="off" />
        <button id="mov-btn-buscar">Buscar</button>
      </div>
      <div id="mov-resultado"></div>
    </section>
  `;

  const input = container.querySelector('#mov-buscar');
  const buscar = () => cargarJugador(container, input.value, modo, accion);

  container.querySelector('#mov-btn-buscar').addEventListener('click', buscar);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscar();
  });

  // Cuando se llega acá desde el perfil de un jugador, ya viene con el
  // jugador puesto y buscado.
  if (preseleccion) {
    input.value = String(preseleccion);
    buscar();
  }
}

async function cargarJugador(container, texto, modo, accion) {
  const resultEl = container.querySelector('#mov-resultado');
  if (!String(texto).trim()) return;

  resultEl.innerHTML = '<p class="hint">Buscando...</p>';

  const jugador = await buscarJugador(texto);

  if (!jugador) {
    resultEl.innerHTML = '<p class="hint error">No se encontró ningún jugador con ese ID o nombre.</p>';
    return;
  }

  // Bloqueos previos: la API los vuelve a validar, pero conviene
  // que el cajero lo vea antes de tipear el monto.
  let bloqueo = null;
  if (jugador.ban_permanente) {
    bloqueo = 'Este jugador tiene ban permanente. No se pueden hacer movimientos.';
  } else if (modo === 'carga' && jugador.ban_recargas) {
    bloqueo = 'Este jugador tiene ban de recargas.';
  } else if (modo === 'retiro' && jugador.ban_retiros) {
    bloqueo = 'Este jugador tiene ban de retiros.';
  }

  const movimientos = await historialJugador(jugador.id, 8);

  resultEl.innerHTML = `
    <div class="player-card">
      <div class="perfil-header">
        <div>
          <strong>${jugador.display_name || jugador.username}</strong>
          <p class="hint">ID #${jugador.player_number} · @${jugador.username}</p>
        </div>
        <div class="perfil-saldo">
          <small class="hint">Saldo actual</small>
          <strong class="balance">${formatMoney(jugador.balance)}</strong>
        </div>
      </div>

      ${bloqueo ? `<p class="aviso-ban">${bloqueo}</p>` : `
        <div class="movimiento-row">
          <input id="mov-monto" type="number" min="0" step="0.01" placeholder="Monto" />
          <input id="mov-motivo" placeholder="Motivo (opcional)" autocomplete="off" />
          <button id="mov-confirmar">${accion} fichas</button>
        </div>
      `}
      <p id="mov-msg" class="hint"></p>

      ${movimientos.length ? `
        <h3>Últimos movimientos</h3>
        <div class="tabla-scroll"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Cajero</th></tr></thead>
          <tbody>
            ${movimientos.map((m) => `
              <tr>
                <td class="mono">${fechaCorta(m.created_at)}</td>
                <td><span class="badge ${m.type === 'carga' ? 'badge-ok' : 'badge-warn'}">${m.type}</span></td>
                <td class="mono">${formatMoney(m.amount)}</td>
                <td class="hint">${m.created_by}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div>
      ` : ''}
    </div>
  `;

  if (bloqueo) return;

  container.querySelector('#mov-confirmar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const monto = Number(container.querySelector('#mov-monto').value);
    const motivo = container.querySelector('#mov-motivo').value.trim();
    const msgEl = container.querySelector('#mov-msg');

    if (!monto || monto <= 0) {
      msgEl.className = 'hint error';
      msgEl.textContent = 'Ingresá un monto válido.';
      return;
    }

    msgEl.className = 'hint';
    msgEl.textContent = 'Procesando...';
    btn.disabled = true;

    const { ok, data: body, error } = await apiFetch('/api/caja?recurso=movimiento', {
      method: 'POST',
      body: { playerId: jugador.id, type: modo, amount: monto, note: motivo },
    });
    btn.disabled = false;

    if (!ok) {
      msgEl.className = 'hint error';
      msgEl.textContent = error;
      return;
    }

    // Recargamos la ficha del jugador para mostrar el saldo nuevo
    // y el movimiento recién hecho en el historial.
    cargarJugador(container, texto, modo, accion);
  });
}
