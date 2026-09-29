import { playerFetch } from './api.ts';
import { formatMoney } from '../lib/currency.ts';
import { urlLogo } from '../lib/themes.js';

/**
 * Pantalla de autorregistro. Misma estética que el login (clases
 * .login-*). El jugador se crea solo, con sus datos de contacto y su
 * documento; el bono, si está activo, se acredita al confirmar.
 *
 *  - onEntrar(token, datosSesion): igual que el login, entra al portal.
 *  - onVolver(): vuelve a la pantalla de login.
 */
export function renderPlayerRegistro(container, settings, onEntrar, onVolver) {
  const nombre = settings?.casino_name || 'RivelBet';
  const bono = settings?.bono_registro;
  const hayBono = bono?.activo && Number(bono.monto) > 0;
  const edadMin = Number(bono?.edad_minima) || 18;

  const ref = settings?.referidos;
  const refActivo = ref?.activo && Number(ref.bono_referido) > 0;
  // ?ref=CODIGO en la URL autocompleta el campo.
  let refInicial = '';
  try { refInicial = new URL(window.location.href).searchParams.get('ref') || ''; } catch { /* nada */ }

  container.innerHTML = `
    <div class="login-screen" oncontextmenu="return false">
      <div class="login-fondo"></div>
      <div class="login-velo"></div>

      <div class="login-contenido">
        <div class="login-marca">
          <img class="login-logo" src="${urlLogo(settings)}" alt="${escapeHtml(nombre)}" draggable="false" onerror="this.remove()" />
          <h1 class="login-titulo">Crear cuenta</h1>
          <p class="login-bajada">${escapeHtml(nombre)}</p>
        </div>

        ${hayBono ? `
          <div class="rg-bono">
            ${bono.banner_url
              ? `<img src="${escapeHtml(bono.banner_url)}" alt="" class="rg-bono-img" draggable="false" onerror="this.style.display='none'" />`
              : `<div class="rg-bono-art"><span>${formatMoney(bono.monto)}</span></div>`
            }
            <div class="rg-bono-txt">
              <strong>${escapeHtml(bono.titulo || 'Registrate y llevate tu bono')}</strong>
              <span>${escapeHtml(bono.subtitulo || 'Verificá tu identidad y empezá a jugar')}</span>
            </div>
          </div>
        ` : ''}

        <form id="rg-form" class="login-card">
          <div class="login-campo">
            <label for="rg-user">Usuario</label>
            <input id="rg-user" required autocomplete="username" placeholder="cómo vas a entrar" />
          </div>

          <div class="login-campo">
            <label for="rg-pass">Contraseña</label>
            <div class="login-pass">
              <input id="rg-pass" type="password" required autocomplete="new-password" placeholder="mínimo 4 caracteres" />
              <button type="button" id="rg-ojo" class="login-ojo">Ver</button>
            </div>
          </div>

          <div class="login-campo">
            <label for="rg-doc">Número de documento</label>
            <input id="rg-doc" required inputmode="numeric" placeholder="1.234.567" />
          </div>

          <div class="login-campo">
            <label for="rg-tel">Teléfono</label>
            <input id="rg-tel" required inputmode="tel" placeholder="0981 234 567" />
          </div>

          <div class="login-campo">
            <label for="rg-mail">Correo electrónico</label>
            <input id="rg-mail" type="email" required autocomplete="email" placeholder="nombre@correo.com" />
          </div>

          <div class="login-campo">
            <label for="rg-nac">Fecha de nacimiento</label>
            <input id="rg-nac" type="date" required />
          </div>

          ${refActivo ? `
            <div class="login-campo">
              <label for="rg-ref">Código de referido (opcional)</label>
              <input id="rg-ref" autocomplete="off" placeholder="lo de un amigo" value="${escapeHtml(refInicial)}" style="text-transform:uppercase" />
              <p class="rg-fine" style="margin:4px 0 0">Si te invitó alguien, al hacer tu primera carga los dos ganan ${formatMoney(ref.bono_referido)}.</p>
            </div>
          ` : ''}

          <p class="rg-fine">
            Tenés que ser mayor de ${edadMin} años. Después vas a subir 3 fotos
            (documento y una foto tuya) para verificar la cuenta y poder jugar.
          </p>

          <p id="rg-error" class="login-error" hidden></p>

          <button type="submit" id="rg-btn" class="login-submit">
            Crear cuenta${hayBono ? ` y recibir ${formatMoney(bono.monto)}` : ''}
          </button>
        </form>

        <button type="button" id="rg-volver" class="login-submit secundario" style="margin-top:10px">
          Ya tengo cuenta
        </button>
        <p class="login-legal">Solo para mayores de ${edadMin} años. El juego puede causar adicción. Un menor no puede jugar: la verificación lo impide.</p>
      </div>
    </div>
  `;

  const $ = (sel) => container.querySelector(sel);
  const inputPass = $('#rg-pass');
  const errorEl = $('#rg-error');
  const btn = $('#rg-btn');

  // Tope del selector de fecha: hoy menos la edad mínima. No impide
  // trampear (el servidor revalida), pero guía.
  const tope = new Date();
  tope.setFullYear(tope.getFullYear() - edadMin);
  $('#rg-nac').max = tope.toISOString().slice(0, 10);

  $('#rg-ojo').addEventListener('click', (e) => {
    const oculto = inputPass.type === 'password';
    inputPass.type = oculto ? 'text' : 'password';
    e.currentTarget.textContent = oculto ? 'Ocultar' : 'Ver';
    inputPass.focus();
  });

  $('#rg-volver').addEventListener('click', () => onVolver());

  $('#rg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const cuerpo = {
      username: $('#rg-user').value.trim(),
      password: inputPass.value,
      documento: $('#rg-doc').value.trim(),
      telefono: $('#rg-tel').value.trim(),
      email: $('#rg-mail').value.trim(),
      fechaNacimiento: $('#rg-nac').value || null,
      codigoReferido: $('#rg-ref')?.value.trim().toUpperCase() || null,
    };

    if (!cuerpo.fechaNacimiento) {
      return mostrarError('Ingresá tu fecha de nacimiento.');
    }

    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';

    const { ok, data, error } = await playerFetch('/api/player-sesion?recurso=registro', {
      method: 'POST',
      conToken: false,
      body: cuerpo,
    });

    if (!ok) {
      btn.disabled = false;
      btn.textContent = hayBono ? `Crear cuenta y recibir ${formatMoney(bono.monto)}` : 'Crear cuenta';
      return mostrarError(error);
    }

    await onEntrar(data.token, data);
  });

  function mostrarError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    errorEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  $('#rg-user').focus();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
