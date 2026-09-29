import { supabase } from '../lib/supabaseClient.js';
import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';

// Los estilos van acá adentro (scoped por el prefijo .cu-) para que
// esta pantalla no dependa de tocar styles.css.
const ESTILOS = `
<style>
  .cu-card { max-width: 560px; }
  .cu-head { border-bottom: 1px solid var(--border); padding-bottom: 14px; margin-bottom: 20px; }
  .cu-head h2 { margin: 0 0 4px; }
  .cu-grupo { margin-bottom: 24px; }
  .cu-grupo-titulo {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: 0 0 12px;
    font-weight: 500;
  }
  .cu-campo { margin-bottom: 14px; }
  .cu-campo:last-child { margin-bottom: 0; }
  .cu-label {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: 5px;
  }
  .cu-opcional { font-size: 11px; font-weight: 400; color: var(--text-dim); }
  .cu-campo input {
    width: 100%;
    background: var(--surface-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    padding: 11px 12px;
    font-size: 15px;
  }
  .cu-campo input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .cu-ayuda { display: block; font-size: 12px; color: var(--text-dim); margin-top: 5px; }
  .cu-ayuda.ok { color: var(--success); }
  .cu-ayuda.error { color: var(--error); }
  .cu-monto { position: relative; }
  .cu-monto .cu-simbolo {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-dim);
    font-size: 15px;
    pointer-events: none;
  }
  .cu-monto input { padding-left: 34px; font-variant-numeric: tabular-nums; }
  .cu-pass { display: flex; gap: 8px; }
  .cu-pass input { flex: 1; }
  .cu-pie {
    display: flex;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--border);
    padding-top: 18px;
    margin-top: 4px;
  }
  .cu-pie button { padding: 12px 24px; font-size: 15px; }
  .cu-resultado {
    border-left: 3px solid var(--success);
    background: var(--surface-alt);
    padding: 12px 14px;
    margin-top: 16px;
    border-radius: 0;
  }
  .cu-resultado strong { display: block; font-size: 15px; margin-bottom: 2px; }
  .cu-resultado small { color: var(--text-dim); font-size: 12px; }
</style>
`;

export function renderCrearUsuario(container) {
  container.innerHTML = `
    ${ESTILOS}
    <section class="card cu-card">
      <div class="cu-head">
        <h2>Crear usuario</h2>
        <p class="hint">El teléfono de WhatsApp es su verificación: con eso ya puede jugar. El documento queda para los que se registran solos en el portal.</p>
      </div>

      <div class="cu-grupo">
        <p class="cu-grupo-titulo">Identificación</p>

        <div class="cu-campo">
          <label class="cu-label" for="nuevo-username">Nombre de usuario</label>
          <input id="nuevo-username" autocomplete="off" placeholder="juanperez" />
          <small id="username-estado" class="cu-ayuda">Letras, números, punto y guión bajo. Mínimo 3 caracteres.</small>
        </div>

        <div class="cu-campo">
          <label class="cu-label" for="nuevo-display">
            Nombre para mostrar
            <span class="cu-opcional">opcional</span>
          </label>
          <input id="nuevo-display" autocomplete="off" placeholder="Juan Pérez" />
        </div>

        <div class="cu-campo">
          <label class="cu-label" for="nuevo-tel">Teléfono de WhatsApp</label>
          <input id="nuevo-tel" type="tel" inputmode="tel" autocomplete="off" placeholder="595981123456" />
          <small class="cu-ayuda">El mismo número con el que te escribe, con código de país. Es único: no puede haber dos usuarios con el mismo.</small>
        </div>
      </div>

      <div class="cu-grupo">
        <p class="cu-grupo-titulo">Acceso</p>

        <div class="cu-campo">
          <label class="cu-label" for="nueva-password">Contraseña inicial</label>
          <div class="cu-pass">
            <input id="nueva-password" type="text" autocomplete="off" placeholder="mínimo 6 caracteres" />
            <button id="btn-generar" class="secundario" type="button">Generar</button>
          </div>
          <small class="cu-ayuda">Queda cifrada al guardar. Anotala antes de crear el usuario.</small>
        </div>
      </div>

      <div class="cu-grupo">
        <p class="cu-grupo-titulo">Fichas</p>

        <div class="cu-campo">
          <label class="cu-label" for="nuevo-saldo">
            Saldo inicial
            <span class="cu-opcional">opcional</span>
          </label>
          <div class="cu-monto">
            <span class="cu-simbolo">${currency.symbol}</span>
            <input id="nuevo-saldo" type="number" min="0" step="${currency.decimals ? '0.01' : '1'}" value="0" />
          </div>
          <small class="cu-ayuda">Si ponés un monto, queda asentado en el historial como carga inicial.</small>
        </div>
      </div>

      <div class="cu-pie">
        <button id="btn-crear-usuario">Crear usuario</button>
        <span id="crear-msg" class="hint"></span>
      </div>

      <div id="crear-resultado"></div>
    </section>
  `;

  const inputUser = container.querySelector('#nuevo-username');
  const inputPass = container.querySelector('#nueva-password');
  const estadoEl = container.querySelector('#username-estado');
  const msgEl = container.querySelector('#crear-msg');
  const resultadoEl = container.querySelector('#crear-resultado');
  const btn = container.querySelector('#btn-crear-usuario');

  container.querySelector('#btn-generar').addEventListener('click', () => {
    inputPass.value = generarPassword();
    inputPass.focus();
    inputPass.select();
  });

  // Chequeo en vivo con debounce: avisa si el usuario ya existe
  // antes de que el cajero llene el resto del formulario.
  let timer;
  inputUser.addEventListener('input', () => {
    clearTimeout(timer);
    const valor = inputUser.value.trim().toLowerCase();

    if (valor.length < 3) {
      estadoEl.className = 'cu-ayuda';
      estadoEl.textContent = 'Letras, números, punto y guión bajo. Mínimo 3 caracteres.';
      return;
    }

    estadoEl.className = 'cu-ayuda';
    estadoEl.textContent = 'Verificando...';

    timer = setTimeout(async () => {
      const { ok, data: body } = await apiFetch(
        `/api/jugadores?recurso=verificar&username=${encodeURIComponent(valor)}`
      );

      if (!ok) {
        estadoEl.className = 'cu-ayuda';
        estadoEl.textContent = '';
        return;
      }

      estadoEl.className = body.disponible ? 'cu-ayuda ok' : 'cu-ayuda error';
      estadoEl.textContent = body.disponible ? 'Disponible' : 'Ese usuario ya existe';
    }, 400);
  });

  btn.addEventListener('click', async () => {
    msgEl.className = 'hint';
    msgEl.textContent = 'Creando...';
    btn.disabled = true;
    resultadoEl.innerHTML = '';

    const passwordUsada = inputPass.value;

    const { ok, data: body, error } = await apiFetch('/api/jugadores?recurso=crear', {
      method: 'POST',
      body: {
        username: inputUser.value,
        displayName: container.querySelector('#nuevo-display').value.trim(),
        telefono: container.querySelector('#nuevo-tel').value.trim(),
        password: passwordUsada,
        saldoInicial: container.querySelector('#nuevo-saldo').value,
      },
    });

    btn.disabled = false;

    if (!ok) {
      msgEl.className = 'hint error';
      msgEl.textContent = error;
      return;
    }

    msgEl.textContent = '';

    // Mostramos la contraseña una última vez: es el único momento en que
    // se puede leer, después queda solo el hash.
    resultadoEl.innerHTML = `
      <div class="cu-resultado">
        <strong>Usuario #${body.player.player_number} · @${body.player.username}</strong>
        <small>
          Teléfono ${escapeHtml(body.player.telefono || '')} · saldo inicial ${formatMoney(body.player.balance)} · contraseña
          <span class="mono">${escapeHtml(passwordUsada)}</span> — anotala, no se puede volver a ver.
        </small>
      </div>
    `;

    inputUser.value = '';
    inputPass.value = '';
    container.querySelector('#nuevo-display').value = '';
    container.querySelector('#nuevo-tel').value = '';
    container.querySelector('#nuevo-saldo').value = '0';
    estadoEl.className = 'cu-ayuda';
    estadoEl.textContent = 'Letras, números, punto y guión bajo. Mínimo 3 caracteres.';
    inputUser.focus();
  });
}

function generarPassword() {
  // Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda dictar sin errores.
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
