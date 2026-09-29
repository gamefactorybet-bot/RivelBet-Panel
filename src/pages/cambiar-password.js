import { supabase } from '../lib/supabaseClient.js';
import { apiFetch } from '../lib/api.ts';

export function renderCambiarPassword(container, { preseleccion } = {}) {
  container.innerHTML = `
    <section class="card">
      <h2>Cambiar contraseña de un usuario</h2>
      <p class="hint">Las contraseñas se guardan cifradas, así que no se pueden ver — solo se reemplazan por una nueva.</p>

      <div class="search-row">
        <input id="buscar-user" placeholder="Nombre de usuario" autocomplete="off" />
        <button id="btn-buscar-user">Buscar</button>
      </div>

      <div id="resultado-user"></div>
    </section>
  `;

  const btnBuscar = container.querySelector('#btn-buscar-user');
  const inputBuscar = container.querySelector('#buscar-user');

  btnBuscar.addEventListener('click', () => buscar(container));
  inputBuscar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscar(container);
  });

  if (preseleccion) {
    inputBuscar.value = String(preseleccion);
    buscar(container);
  }
}

async function buscar(container) {
  const username = container.querySelector('#buscar-user').value.trim().toLowerCase();
  const resultEl = container.querySelector('#resultado-user');

  if (!username) return;

  resultEl.innerHTML = '<p class="hint">Buscando...</p>';

  const { data: player } = await supabase
    .from('players')
    .select('id, username, display_name')
    .eq('username', username)
    .maybeSingle();

  if (!player) {
    resultEl.innerHTML = '<p class="hint error">No existe un usuario con ese nombre.</p>';
    return;
  }

  resultEl.innerHTML = `
    <div class="player-card">
      <p><strong>${player.display_name || player.username}</strong> (@${player.username})</p>

      <label class="field">
        Contraseña nueva
        <input id="pass-nueva" type="text" autocomplete="off" placeholder="mínimo 6 caracteres" />
      </label>

      <div class="acciones">
        <button id="btn-resetear">Cambiar contraseña</button>
      </div>
      <p id="pass-msg" class="hint"></p>
    </div>
  `;

  const msgEl = container.querySelector('#pass-msg');
  const btn = container.querySelector('#btn-resetear');

  btn.addEventListener('click', async () => {
    const nueva = container.querySelector('#pass-nueva').value;

    msgEl.className = 'hint';
    msgEl.textContent = 'Guardando...';
    btn.disabled = true;

    const { ok, data: body, error } = await apiFetch('/api/jugadores?recurso=password', {
      method: 'POST',
      body: { playerId: player.id, nuevaPassword: nueva },
    });
    btn.disabled = false;

    if (!ok) {
      msgEl.className = 'hint error';
      msgEl.textContent = error;
      return;
    }

    msgEl.className = 'hint ok';
    msgEl.textContent = `Contraseña de @${body.username} actualizada. Pasásela al jugador.`;
    container.querySelector('#pass-nueva').value = '';
  });
}
