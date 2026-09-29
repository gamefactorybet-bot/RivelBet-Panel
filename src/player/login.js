import { playerFetch } from './api.ts';
import { formatMoney } from '../lib/currency.ts';
import { urlLogo } from '../lib/themes.js';

export function renderPlayerLogin(container, settings, onEntrar, avisoInicial, onRegistro) {
  const nombre = settings?.casino_name || 'RivelBet';
  const bono = settings?.bono_registro;
  const hayBono = onRegistro && bono?.activo && Number(bono.monto) > 0;

  container.innerHTML = `
    <div class="login-screen" oncontextmenu="return false">
      <div class="login-fondo"></div>
      <div class="login-velo"></div>

      <div class="login-contenido">
        <div class="login-marca">
          <img class="login-logo" src="${urlLogo(settings)}" alt="${escapeHtml(nombre)}" draggable="false" onerror="this.remove()" />
          <h1 class="login-titulo">${escapeHtml(nombre)}</h1>
          <p class="login-bajada">Portal</p>
        </div>

        <form id="pl-form" class="login-card">
          <div class="login-campo">
            <label for="pl-user">Usuario</label>
            <input id="pl-user" required autocomplete="username" placeholder="tu usuario" />
          </div>

          <div class="login-campo">
            <label for="pl-pass">Contraseña</label>
            <div class="login-pass">
              <input id="pl-pass" type="password" required autocomplete="current-password" placeholder="••••••••" />
              <button type="button" id="pl-ojo" class="login-ojo">Ver</button>
            </div>
          </div>

          <p id="pl-error" class="login-error" ${avisoInicial ? '' : 'hidden'}>${escapeHtml(avisoInicial || '')}</p>

          <button type="submit" id="pl-btn" class="login-submit">Entrar</button>
        </form>

        ${onRegistro ? `
          <button type="button" id="pl-registro" class="login-submit secundario" style="margin-top:10px">
            Crear cuenta${hayBono ? ` y llevate ${formatMoney(bono.monto)}` : ''}
          </button>
        ` : ''}

        <p class="login-pie">¿Problemas para entrar? Consultá con tu cajero.</p>
        <p class="login-legal">Solo para mayores de 18 años. El juego puede causar adicción. Verificamos la identidad antes de jugar.</p>
      </div>
    </div>
  `;

  if (onRegistro) {
    container.querySelector('#pl-registro').addEventListener('click', () => onRegistro());
  }

  const inputPass = container.querySelector('#pl-pass');
  const errorEl = container.querySelector('#pl-error');
  const btn = container.querySelector('#pl-btn');

  container.querySelector('#pl-ojo').addEventListener('click', (e) => {
    const oculto = inputPass.type === 'password';
    inputPass.type = oculto ? 'text' : 'password';
    e.currentTarget.textContent = oculto ? 'Ocultar' : 'Ver';
    inputPass.focus();
  });

  container.querySelector('#pl-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Entrando...';

    const { ok, data, error } = await playerFetch('/api/player-sesion', {
      method: 'POST',
      conToken: false,
      body: {
        username: container.querySelector('#pl-user').value.trim(),
        password: inputPass.value,
      },
    });

    if (!ok) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      errorEl.textContent = error;
      errorEl.hidden = false;
      inputPass.value = '';
      inputPass.focus();
      return;
    }

    // Mandamos data completo (no solo el token): así entrar() puede
    // pintar el portal directo, sin un segundo pedido a esta misma
    // función — ese segundo pedido, justo pegado al de login, era el
    // que se colgaba y dejaba el botón en "Entrando..." para siempre.
    await onEntrar(data.token, data);
  });

  container.querySelector('#pl-user').focus();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
