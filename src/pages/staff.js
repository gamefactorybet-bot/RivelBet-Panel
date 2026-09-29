import { apiFetch } from '../lib/api.ts';
import { PERFILES, PERMISOS, PERFIL_KEYS, puede, permisosEfectivos } from '../lib/perfiles.js';
import { fechaCorta } from '../lib/players.js';
import { formatMoney } from '../lib/currency.ts';

const ESTILOS = `
<style>
  .st-tabs { display: flex; gap: 4px; margin-bottom: 18px; border-bottom: 1px solid var(--border); }
  .st-tab {
    background: transparent; border: none; border-bottom: 2px solid transparent;
    border-radius: 0; color: var(--text-dim); padding: 10px 14px; font-weight: 400;
  }
  .st-tab.is-active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 500; }
  .st-fila {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 0; border-bottom: 1px solid var(--border);
  }
  .st-avatar {
    width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border: 1px solid var(--accent); color: var(--accent); font-weight: 500; font-size: 15px;
  }
  .st-datos { flex: 1; min-width: 0; }
  .st-nombre { font-weight: 500; font-size: 14px; }
  .st-nombre.inactivo { text-decoration: line-through; opacity: 0.55; }
  .st-mail { font-size: 12px; color: var(--text-dim); }
  .st-perfil-badge {
    font-size: 11px; padding: 3px 9px; border-radius: 999px;
    border: 1px solid var(--border); color: var(--text-dim);
  }
  .st-perfil-badge.dios { color: var(--accent); border-color: var(--accent); }
  .st-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
  .st-perfil-op {
    text-align: left; background: var(--surface-alt-glass);
    border: 1px solid var(--border); border-radius: var(--radius);
    padding: 12px; color: var(--text); font-weight: 400;
  }
  .st-perfil-op.is-selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .st-perfil-op strong { display: block; font-size: 14px; font-weight: 500; }
  .st-perfil-op small { display: block; font-size: 12px; color: var(--text-dim); margin-top: 2px; }
  .st-permisos { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 8px; }
  .st-permiso {
    display: flex; align-items: center; gap: 9px;
    background: var(--surface-alt-glass); border-radius: var(--radius);
    padding: 9px 11px; font-size: 13px; cursor: pointer;
  }
  .st-permiso input { accent-color: var(--accent); width: 16px; height: 16px; }
  .st-permiso.heredado { opacity: 0.75; }
  .st-permiso .marca-excep { font-size: 10px; color: var(--accent); margin-left: auto; }
  .st-acciones-fila { display: flex; gap: 6px; flex-wrap: wrap; }
  .st-volver { margin-bottom: 12px; }
</style>
`;

export function renderStaff(container, { profile }) {
  if (!puede(profile, 'ver_staff')) {
    container.innerHTML = '<section class="card"><p class="hint">No tenés permiso para ver el staff.</p></section>';
    return;
  }

  const puedeGestionar = puede(profile, 'gestionar_staff');

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Cajeros y administradores</h2>
      <div class="st-tabs">
        <button class="st-tab is-active" data-tab="lista">Equipo</button>
        ${puedeGestionar ? '<button class="st-tab" data-tab="nuevo">Agregar</button>' : ''}
        <button class="st-tab" data-tab="perfiles">Perfiles</button>
      </div>
      <div id="st-vista"></div>
    </section>
  `;

  const vista = container.querySelector('#st-vista');
  const ctx = { profile, puedeGestionar, container, vista };

  container.querySelectorAll('.st-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.st-tab').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      if (btn.dataset.tab === 'lista') vistaLista(ctx);
      if (btn.dataset.tab === 'nuevo') vistaNuevo(ctx);
      if (btn.dataset.tab === 'perfiles') vistaPerfiles(ctx);
    });
  });

  vistaLista(ctx);
}

/* ---------------------------------------------------------
   Lista del equipo
   --------------------------------------------------------- */
async function vistaLista(ctx) {
  const { vista, profile, puedeGestionar } = ctx;
  vista.innerHTML = '<p class="hint">Cargando equipo...</p>';

  const { ok, data, error } = await apiFetch('/api/staff?recurso=listar');

  if (!ok) {
    vista.innerHTML = `<p class="hint error">${error}</p>`;
    return;
  }

  const equipo = data.staff || [];

  vista.innerHTML = equipo.map((s) => {
    const perfilDef = PERFILES[s.perfil] || PERFILES.cajero;
    const excepciones = Object.keys(s.permisos || {}).length;

    return `
      <div class="st-fila">
        <div class="st-avatar">${(s.display_name || s.email).charAt(0).toUpperCase()}</div>
        <div class="st-datos">
          <div class="st-nombre ${s.active ? '' : 'inactivo'}">
            ${escapeHtml(s.display_name)}${s.id === profile.id ? ' <small class="hint">(vos)</small>' : ''}
          </div>
          <div class="st-mail">
            ${escapeHtml(s.email)}
            ${s.ultimo_acceso ? ` · último acceso ${fechaCorta(s.ultimo_acceso)}` : ' · nunca entró'}
          </div>
        </div>
        <span class="st-perfil-badge ${s.perfil === 'dios' ? 'dios' : ''}">
          ${perfilDef.nombre}${s.perfil === 'externo' && s.externo_modo === 'comisionista' ? ' · comisión' : s.perfil === 'externo' ? ' · reventa' : ''}${excepciones ? ` +${excepciones}` : ''}
        </span>
        ${s.jugadores ? `<span class="hint">${s.jugadores} jug.</span>` : ''}
        ${s.active ? '' : '<span class="badge badge-danger">Inactivo</span>'}
        ${puedeGestionar ? `<button class="secundario st-editar" data-id="${s.id}">Editar</button>` : ''}
      </div>
    `;
  }).join('') || '<p class="hint">Todavía no hay nadie cargado.</p>';

  vista.querySelectorAll('.st-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const miembro = equipo.find((s) => s.id === btn.dataset.id);
      vistaEditar({ ...ctx, equipo }, miembro);
    });
  });
}

/* ---------------------------------------------------------
   Editar un miembro
   --------------------------------------------------------- */
function vistaEditar(ctx, miembro) {
  const { vista, profile } = ctx;
  const esUnoMismo = miembro.id === profile.id;

  let draft = {
    displayName: miembro.display_name || '',
    perfil: miembro.perfil || 'cajero',
    permisos: { ...(miembro.permisos || {}) },
    telefono: miembro.telefono || '',
    notas: miembro.notas || '',
    active: miembro.active !== false,
    externoModo: miembro.externo_modo || 'revendedor',
    comisionPct: miembro.comision_pct ?? 5,
    whatsappNumero: miembro.whatsapp_numero || '',
    whatsappActivo: Boolean(miembro.whatsapp_activo),
    whatsappSolo: Boolean(miembro.whatsapp_solo),
  };

  let destinos = (ctx.equipo || []).filter((s) => s.perfil === 'externo' && s.id !== miembro.id && s.active !== false);
  let comisionTotal = null;

  const pintar = () => {
    vista.innerHTML = `
      <button class="secundario st-volver" id="st-back">← Volver al equipo</button>

      <div class="perfil-header">
        <div>
          <h3 style="margin-top:0">${escapeHtml(miembro.display_name)}</h3>
          <p class="hint">${escapeHtml(miembro.email)} · desde ${fechaCorta(miembro.created_at)}</p>
        </div>
      </div>

      <label class="field">Nombre
        <input id="st-nombre" value="${escapeHtml(draft.displayName)}" />
      </label>
      <label class="field">Teléfono
        <input id="st-tel" value="${escapeHtml(draft.telefono)}" placeholder="opcional" />
      </label>
      <label class="field">Notas internas
        <input id="st-notas" value="${escapeHtml(draft.notas)}" placeholder="opcional" />
      </label>

      <h3>Perfil</h3>
      ${esUnoMismo ? '<p class="hint">No podés cambiarte tu propio perfil. Pedíselo a otro admin.</p>' : '<p class="hint">Cajero de caja atiende el portal. Mostrador solo carga y retira a mano.</p>'}
      <div class="st-grid">
        ${PERFIL_KEYS.map((key) => `
          <button class="st-perfil-op ${key === draft.perfil ? 'is-selected' : ''}"
                  data-perfil="${key}" ${esUnoMismo ? 'disabled' : ''}>
            <strong>${PERFILES[key].nombre}</strong>
            <small>${PERFILES[key].descripcion}</small>
          </button>
        `).join('')}
      </div>

      ${draft.perfil === 'externo' ? bloqueModoExterno(draft) : ''}
      ${draft.perfil === 'externo' ? bloqueWhatsapp(draft) : ''}
      ${draft.perfil === 'externo' ? bloqueCartera(miembro, destinos, comisionTotal) : ''}

      <h3>Permisos</h3>
      <p class="hint">Destildar algo lo convierte en excepción sobre el perfil, sin cambiarle el perfil.</p>
      <div class="st-permisos">
        ${Object.entries(PERMISOS).map(([key, label]) => {
          const activo = puede({ perfil: draft.perfil, permisos: draft.permisos, active: true }, key);
          const esExcepcion = Object.prototype.hasOwnProperty.call(draft.permisos, key);
          return `
            <label class="st-permiso ${esExcepcion ? '' : 'heredado'}">
              <input type="checkbox" data-permiso="${key}" ${activo ? 'checked' : ''} />
              <span>${label}</span>
              ${esExcepcion ? '<span class="marca-excep">excepción</span>' : ''}
            </label>
          `;
        }).join('')}
      </div>

      <h3>Cuenta</h3>
      <label class="st-permiso" style="max-width:280px">
        <input type="checkbox" id="st-activo" ${draft.active ? 'checked' : ''} ${esUnoMismo ? 'disabled' : ''} />
        <span>Cuenta activa</span>
      </label>

      <label class="field" style="margin-top:14px">Contraseña nueva
        <input id="st-pass" type="text" placeholder="dejar vacío para no cambiarla" autocomplete="off" />
      </label>

      <div class="acciones">
        <button id="st-guardar">Guardar cambios</button>
        <button id="st-reset-permisos" class="secundario">Quitar excepciones</button>
      </div>
      <p id="st-msg" class="hint"></p>
    `;

    vista.querySelector('#st-back').addEventListener('click', () => vistaLista(ctx));

    vista.querySelectorAll('[data-perfil]').forEach((btn) => {
      btn.addEventListener('click', () => {
        draft.perfil = btn.dataset.perfil;
        pintar();
      });
    });

    vista.querySelectorAll('[data-permiso]').forEach((chk) => {
      chk.addEventListener('change', () => {
        const key = chk.dataset.permiso;
        const perfilDice = PERFILES[draft.perfil].permisos.includes(key);

        // Si el valor coincide con lo que ya dice el perfil, no guardamos
        // una excepción redundante: se borra y vuelve a heredar.
        if (chk.checked === perfilDice) {
          delete draft.permisos[key];
        } else {
          draft.permisos[key] = chk.checked;
        }
        pintar();
      });
    });

    vista.querySelector('#st-nombre').addEventListener('input', (e) => { draft.displayName = e.target.value; });
    vista.querySelector('#st-tel').addEventListener('input', (e) => { draft.telefono = e.target.value; });
    vista.querySelector('#st-notas').addEventListener('input', (e) => { draft.notas = e.target.value; });
    cablearModoExterno(vista, draft, pintar);
    cablearWhatsapp(vista, draft);
    cablearCartera(vista, miembro, ctx);

    const chkActivo = vista.querySelector('#st-activo');
    if (!esUnoMismo) {
      chkActivo.addEventListener('change', (e) => { draft.active = e.target.checked; });
    }

    vista.querySelector('#st-reset-permisos').addEventListener('click', () => {
      draft.permisos = {};
      pintar();
    });

    vista.querySelector('#st-guardar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const msgEl = vista.querySelector('#st-msg');
      const nuevaPassword = vista.querySelector('#st-pass').value;

      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Guardando...';

      const body = {
        staffId: miembro.id,
        displayName: draft.displayName,
        permisos: draft.permisos,
        telefono: draft.telefono,
        notas: draft.notas,
        externoModo: draft.externoModo,
        comisionPct: draft.comisionPct,
        whatsappNumero: draft.whatsappNumero,
        whatsappActivo: draft.whatsappActivo,
        whatsappSolo: draft.whatsappSolo,
      };

      if (!esUnoMismo) {
        body.perfil = draft.perfil;
        body.active = draft.active;
      }

      if (nuevaPassword) body.nuevaPassword = nuevaPassword;

      const { ok, error } = await apiFetch('/api/staff?recurso=actualizar', { method: 'POST', body });
      btn.disabled = false;

      if (!ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = error;
        return;
      }

      msgEl.className = 'hint ok';
      msgEl.textContent = nuevaPassword
        ? 'Guardado. Pasale la contraseña nueva.'
        : 'Guardado.';
      vista.querySelector('#st-pass').value = '';
    });
  };

  pintar();
  apiFetch(`/api/staff?recurso=comisiones&staffId=${encodeURIComponent(miembro.id)}`).then((r) => {
    if (r.ok) {
      comisionTotal = Number(r.data.total || 0);
      pintar();
    }
  });
}

/* ---------------------------------------------------------
   Alta de staff
   --------------------------------------------------------- */
function vistaNuevo(ctx) {
  const { vista } = ctx;
  let perfilElegido = 'caja';
  const extra = { externoModo: 'revendedor', comisionPct: 5, whatsappNumero: '', whatsappActivo: false, whatsappSolo: false };

  const pintar = () => {
    vista.innerHTML = `
      <label class="field">Email
        <input id="nv-email" type="email" placeholder="cajero@casino.com" autocomplete="off" />
      </label>
      <label class="field">Nombre
        <input id="nv-nombre" placeholder="María López" autocomplete="off" />
      </label>
      <label class="field">Teléfono
        <input id="nv-tel" placeholder="opcional" autocomplete="off" />
      </label>
      <label class="field">Contraseña inicial
        <div class="cu-pass" style="display:flex;gap:8px">
          <input id="nv-pass" type="text" placeholder="mínimo 6 caracteres" autocomplete="off" style="flex:1" />
          <button id="nv-generar" class="secundario" type="button">Generar</button>
        </div>
      </label>

      <h3>Perfil</h3>
      <p class="hint">Cajero de caja atiende el portal. Mostrador solo carga y retira a mano. Externo es cartera propia.</p>
      <div class="st-grid">
        ${PERFIL_KEYS.map((key) => `
          <button class="st-perfil-op ${key === perfilElegido ? 'is-selected' : ''}" data-perfil="${key}">
            <strong>${PERFILES[key].nombre}</strong>
            <small>${PERFILES[key].descripcion}</small>
          </button>
        `).join('')}
      </div>

      ${perfilElegido === 'externo' ? bloqueModoExterno(extra) + bloqueWhatsapp(extra) : ''}

      <div class="acciones">
        <button id="nv-crear">Crear</button>
      </div>
      <p id="nv-msg" class="hint"></p>
      <div id="nv-resultado"></div>
    `;

    vista.querySelectorAll('[data-perfil]').forEach((btn) => {
      btn.addEventListener('click', () => {
        perfilElegido = btn.dataset.perfil;
        pintar();
      });
    });
    cablearModoExterno(vista, extra, pintar);
    cablearWhatsapp(vista, extra);

    vista.querySelector('#nv-generar').addEventListener('click', () => {
      const input = vista.querySelector('#nv-pass');
      input.value = generarPassword();
      input.focus();
      input.select();
    });

    vista.querySelector('#nv-crear').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const msgEl = vista.querySelector('#nv-msg');
      const password = vista.querySelector('#nv-pass').value;

      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Creando...';

      const { ok, data, error } = await apiFetch('/api/staff?recurso=crear', {
        method: 'POST',
        body: {
          email: vista.querySelector('#nv-email').value.trim(),
          displayName: vista.querySelector('#nv-nombre').value.trim(),
          telefono: vista.querySelector('#nv-tel').value.trim(),
          password,
          perfil: perfilElegido,
          role: perfilElegido === 'dios' ? 'admin' : 'cajero',
          externoModo: extra.externoModo,
          comisionPct: extra.comisionPct,
          whatsappNumero: extra.whatsappNumero,
          whatsappActivo: extra.whatsappActivo,
          whatsappSolo: extra.whatsappSolo,
        },
      });

      btn.disabled = false;

      if (!ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = error;
        return;
      }

      msgEl.textContent = '';
      vista.querySelector('#nv-resultado').innerHTML = `
        <div class="cu-resultado" style="border-left:3px solid var(--success);background:var(--surface-alt-glass);padding:12px 14px;margin-top:14px">
          <strong style="display:block">${escapeHtml(data.email)} · ${PERFILES[data.perfil].nombre}</strong>
          <small class="hint">Contraseña: <span class="mono">${escapeHtml(password)}</span> — anotala, no se puede volver a ver.</small>
        </div>
      `;

      vista.querySelector('#nv-email').value = '';
      vista.querySelector('#nv-nombre').value = '';
      vista.querySelector('#nv-tel').value = '';
      vista.querySelector('#nv-pass').value = '';
    });
  };

  pintar();
}

/* ---------------------------------------------------------
   Referencia de perfiles
   --------------------------------------------------------- */
function vistaPerfiles({ vista }) {
  vista.innerHTML = `
    <p class="hint">Qué puede hacer cada perfil. Los permisos sueltos se ajustan por persona desde Editar.</p>
    <div class="tabla-scroll"><table class="tabla">
      <thead>
        <tr><th>Permiso</th>${PERFIL_KEYS.map((k) => `<th>${PERFILES[k].nombre}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${Object.entries(PERMISOS).map(([key, label]) => `
          <tr>
            <td>${label}</td>
            ${PERFIL_KEYS.map((k) => `
              <td>${PERFILES[k].permisos.includes(key)
                ? '<span style="color:var(--success)">Sí</span>'
                : '<span class="hint">—</span>'}</td>
            `).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table></div>
  `;
}

function bloqueWhatsapp(draft) {
  return `
    <h3>WhatsApp</h3>
    <p class="hint">Lo pone la casa. El jugador de su cartera ve un botón para escribirle. El número va con código de país, sin + ni 0 (ej. 595981123456).</p>
    <label class="st-permiso" style="max-width:320px">
      <input type="checkbox" id="st-wa-activo" ${draft.whatsappActivo ? 'checked' : ''} />
      <span>Mostrar WhatsApp a sus jugadores</span>
    </label>
    <label class="field" style="max-width:280px">Número
      <input id="st-wa-num" value="${escapeHtml(draft.whatsappNumero)}" placeholder="595981123456" />
    </label>
    <label class="st-permiso" style="max-width:420px">
      <input type="checkbox" id="st-wa-solo" ${draft.whatsappSolo ? 'checked' : ''} />
      <span>Solo WhatsApp (ocultar el chat de la casa)</span>
    </label>
  `;
}

function cablearWhatsapp(vista, draft) {
  vista.querySelector('#st-wa-activo')?.addEventListener('change', (e) => { draft.whatsappActivo = e.target.checked; });
  vista.querySelector('#st-wa-solo')?.addEventListener('change', (e) => { draft.whatsappSolo = e.target.checked; });
  vista.querySelector('#st-wa-num')?.addEventListener('input', (e) => { draft.whatsappNumero = e.target.value; });
}

function bloqueCartera(miembro, destinos, comisionTotal) {
  const n = Number(miembro.jugadores || 0);
  return `
    <h3>Cartera</h3>
    <p class="hint">${n ? `${n} jugador${n === 1 ? '' : 'es'} a su nombre.` : 'Todavía no tiene jugadores.'}
      ${comisionTotal != null ? ` Comisión acumulada: <strong>${formatMoney(comisionTotal)}</strong>.` : ''}</p>
    ${n ? `
      <p class="hint">Si cortás con este cajero, pasá los jugadores a otro o a la casa. El saldo de cada uno no se toca.</p>
      <div class="fo-acc" style="margin-bottom:12px">
        <select id="st-cartera-dest" style="flex:1;min-width:180px">
          <option value="">A la casa</option>
          ${destinos.map((s) => `<option value="${s.id}">${escapeHtml(s.display_name || s.email)}</option>`).join('')}
        </select>
        <button type="button" class="secundario" id="st-pasar">Pasar cartera</button>
      </div>
    ` : ''}
  `;
}

function cablearCartera(vista, miembro, ctx) {
  vista.querySelector('#st-pasar')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const dest = vista.querySelector('#st-cartera-dest')?.value || '';
    const n = Number(miembro.jugadores || 0);
    const nombreDest = dest
      ? (vista.querySelector('#st-cartera-dest option:checked')?.textContent || 'el otro cajero')
      : 'la casa';
    if (!confirm(`Vas a pasar ${n} jugador${n === 1 ? '' : 'es'} a ${nombreDest}. Este cajero deja de verlos. El saldo no cambia.`)) return;
    btn.disabled = true;
    const { ok, data, error } = await apiFetch('/api/staff?recurso=pasar-cartera', {
      method: 'POST',
      body: { desdeId: miembro.id, haciaId: dest || null },
    });
    btn.disabled = false;
    const msgEl = vista.querySelector('#st-msg');
    if (!ok) {
      msgEl.className = 'hint error';
      msgEl.textContent = error;
      return;
    }
    miembro.jugadores = 0;
    msgEl.className = 'hint ok';
    msgEl.textContent = `Listo: ${data.cantidad} jugador${data.cantidad === 1 ? '' : 'es'} ahora ${dest ? 'son de ' + data.hacia : 'son de la casa'}.`;
    vistaLista(ctx);
  });
}

function bloqueModoExterno(draft) {
  const modo = draft.externoModo || 'revendedor';
  return `
    <h3>Cómo trabaja</h3>
    <p class="hint">Revendedor compra fichas y paga retiros. Comisionista usa las cuentas de la casa y se lleva un % de cada carga aprobada.</p>
    <div class="st-grid">
      <button type="button" class="st-perfil-op ${modo === 'revendedor' ? 'is-selected' : ''}" data-ext-modo="revendedor">
        <strong>Revendedor</strong>
        <small>Paga, recibe fichas con margen y cubre los retiros de su cartera. Si no paga, queda mal la casa.</small>
      </button>
      <button type="button" class="st-perfil-op ${modo === 'comisionista' ? 'is-selected' : ''}" data-ext-modo="comisionista">
        <strong>Comisionista</strong>
        <small>Trae jugadores. La casa cobra, da bonos y paga premios. Él se lleva comisión.</small>
      </button>
    </div>
    ${modo === 'comisionista' ? `
      <label class="field" style="max-width:220px">Comisión sobre cargas (%)
        <input id="st-comision" type="number" min="0" max="100" step="0.5" value="${Number(draft.comisionPct) || 0}" />
      </label>
    ` : ''}
  `;
}

function cablearModoExterno(vista, draft, pintar) {
  vista.querySelectorAll('[data-ext-modo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.externoModo = btn.dataset.extModo;
      pintar();
    });
  });
  vista.querySelector('#st-comision')?.addEventListener('input', (e) => {
    draft.comisionPct = e.target.value;
  });
}

function generarPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
