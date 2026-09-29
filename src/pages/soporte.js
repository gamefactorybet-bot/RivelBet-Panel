import { apiFetch } from '../lib/api.ts';
import { formatMoney } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { puede } from '../lib/perfiles.js';
import { subirImagen } from '../lib/subir-imagen.js';

const ESTADOS = {
  abierto:  { nombre: 'Abierto', color: 'var(--error)' },
  en_curso: { nombre: 'En curso', color: 'var(--accent)' },
  resuelto: { nombre: 'Resuelto', color: 'var(--success)' },
  cerrado:  { nombre: 'Cerrado', color: 'var(--text-dim)' },
};

const ESTILOS = `
<style>
  /* Dos paneles fijos con su propio scroll, como un cliente de
     mensajería: la lista no se mueve mientras se lee la conversación. */
  .sp-app {
    display: flex;
    height: calc(100vh - 190px);
    min-height: 420px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--surface-alt-glass);
  }

  /* --- Columna izquierda: conversaciones --- */
  .sp-lat {
    width: 300px; flex-shrink: 0;
    display: flex; flex-direction: column;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }
  .sp-lat-head { padding: 10px 12px; border-bottom: 1px solid var(--border); }
  .sp-tabs { display: flex; gap: 5px; }
  .sp-tab {
    background: transparent; border: 1px solid var(--border);
    border-radius: 999px; padding: 5px 12px; font-size: 12px;
    color: var(--text-dim); font-weight: 400;
  }
  .sp-tab.on { border-color: var(--accent); color: var(--accent); font-weight: 500; }

  .sp-lista { flex: 1; overflow-y: auto; }
  .sp-t {
    display: flex; gap: 10px; align-items: center; width: 100%;
    padding: 11px 12px; border: none; border-bottom: 1px solid var(--border-glass);
    border-radius: 0; background: transparent; text-align: left;
    color: var(--text); font-weight: 400;
  }
  .sp-t:hover { background: var(--surface-alt); }
  .sp-t.sel { background: var(--surface-alt); }
  .sp-t.sel::before {
    content: ''; position: absolute; left: 0; width: 3px; height: 100%;
    background: var(--accent);
  }
  .sp-t { position: relative; }

  .sp-av {
    width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--surface-alt); border: 1px solid var(--border);
    color: var(--text-dim); font-size: 15px; font-weight: 500; position: relative;
  }
  .sp-av i {
    position: absolute; right: -1px; bottom: -1px;
    width: 10px; height: 10px; border-radius: 50%;
    border: 2px solid var(--surface);
  }
  .sp-ti { flex: 1; min-width: 0; }
  .sp-ti-top { display: flex; align-items: baseline; gap: 6px; }
  .sp-ti-top strong { flex: 1; font-size: 13px; font-weight: 500;
                      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sp-when { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
  .sp-ti-bot { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
  .sp-prev { flex: 1; font-size: 12px; color: var(--text-dim);
             white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sp-nuevos {
    background: var(--accent); color: var(--accent-text);
    border-radius: 999px; font-size: 10px; padding: 1px 7px;
    font-weight: 500; flex-shrink: 0;
  }
  .sp-tag {
    font-size: 9px; border: 1px solid var(--border); border-radius: 999px;
    padding: 0 6px; color: var(--text-dim); flex-shrink: 0;
  }

  .sp-mas {
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    padding: 14px 12px 18px;
  }
  .sp-mas button { padding: 7px 16px; font-size: 12px; }
  .sp-mas span { font-size: 11px; color: var(--text-dim); }

  /* --- Columna derecha: conversación --- */
  .sp-conv { flex: 1; min-width: 0; display: flex; flex-direction: column; }

  .sp-head {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px; border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .sp-head-txt { flex: 1; min-width: 0; }
  .sp-head-txt strong { display: block; font-size: 14px; font-weight: 500; }
  .sp-head-txt span { font-size: 11px; color: var(--text-dim); }
  .sp-head-acc { display: flex; gap: 6px; }
  .sp-head-acc button { padding: 6px 11px; font-size: 12px; }

  /* Fondo del hilo, apenas distinto para separar del resto */
  .sp-msgs {
    flex: 1; overflow-y: auto; padding: 14px;
    display: flex; flex-direction: column; gap: 3px;
    background:
      radial-gradient(circle at 20% 30%, var(--surface-alt) 0, transparent 45%),
      radial-gradient(circle at 80% 70%, var(--surface-alt) 0, transparent 45%),
      var(--bg);
  }

  .sp-dia {
    align-self: center; margin: 10px 0 6px;
    background: var(--surface); border: 1px solid var(--border-glass);
    border-radius: 999px; padding: 3px 12px;
    font-size: 11px; color: var(--text-dim);
  }

  .sp-m {
    max-width: 72%; padding: 7px 11px 5px;
    font-size: 13.5px; line-height: 1.45; position: relative;
    box-shadow: 0 1px 1px rgba(0,0,0,0.18);
  }
  /* Solo el primero de una tanda lleva la cola; los seguidos se agrupan */
  .sp-m.ellos {
    background: var(--surface); align-self: flex-start;
    border-radius: 9px 9px 9px 3px; margin-bottom: 2px;
  }
  .sp-m.ellos.seguido { border-radius: 3px 9px 9px 3px; }
  .sp-m.yo {
    background: var(--accent); color: var(--accent-text); align-self: flex-end;
    border-radius: 9px 9px 3px 9px; margin-bottom: 2px;
  }
  .sp-m.yo.seguido { border-radius: 9px 3px 3px 9px; }

  .sp-m .meta {
    display: block; text-align: right; font-size: 10px;
    opacity: 0.65; margin-top: 1px; white-space: nowrap;
  }
  .sp-m.con-img { padding: 4px 4px 5px; }
  .sp-m.con-img img {
    display: block; max-width: 260px; max-height: 240px;
    border-radius: 6px; cursor: zoom-in;
  }
  .sp-m.con-img .txt { padding: 4px 7px 0; display: block; }
  .sp-m.con-img .meta { padding-right: 6px; }

  .sp-m.sistema {
    align-self: center; background: transparent; box-shadow: none;
    color: var(--text-dim); font-size: 11px; text-align: center;
    max-width: 90%; padding: 3px;
  }

  /* --- Barra de escritura --- */
  .sp-in {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .sp-in input[type="text"] {
    flex: 1; background: var(--surface-alt); border: 1px solid var(--border);
    border-radius: 999px; padding: 10px 16px; color: var(--text); font-size: 14px;
  }
  .sp-in input[type="text"]:focus { outline: none; border-color: var(--accent); }
  .sp-clip, .sp-send {
    width: 40px; height: 40px; flex-shrink: 0; padding: 0;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
  }
  .sp-clip { background: transparent; border: 1px solid var(--border); color: var(--text-dim); cursor: pointer; }
  .sp-clip:hover { border-color: var(--accent); color: var(--accent); }
  .sp-clip span { width: 12px; height: 16px; border: 1.6px solid currentColor; border-radius: 9px; position: relative; }
  .sp-clip span::after {
    content: ''; position: absolute; left: 2.5px; top: 3px;
    width: 5px; height: 8px; border: 1.6px solid currentColor; border-radius: 4px;
  }
  .sp-send { background: var(--accent); color: var(--accent-text); border: none; }
  .sp-send svg { width: 19px; height: 19px; }

  .sp-adj-panel {
    display: flex; align-items: center; gap: 9px; margin: 0 12px 8px;
    background: var(--surface-alt); border: 1px solid var(--success);
    border-radius: 8px; padding: 7px 10px; font-size: 12px;
  }
  .sp-adj-panel img { width: 32px; height: 32px; object-fit: cover; border-radius: 5px; }
  .sp-adj-panel span { flex: 1; color: var(--text-dim); }
  .sp-adj-panel button {
    background: transparent; border: 1px solid var(--border);
    color: var(--text-dim); font-size: 11px; padding: 4px 9px; border-radius: 6px;
  }

  .sp-ref {
    margin: 12px 14px 0; padding: 9px 11px; font-size: 12px;
    border-left: 2px solid var(--accent); background: var(--surface-alt);
    border-radius: 0 8px 8px 0;
  }
  .sp-vacio {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: var(--text-dim); font-size: 13px; text-align: center; padding: 30px;
  }
  .sp-cerrado-aviso {
    padding: 12px; text-align: center; font-size: 12px;
    color: var(--text-dim); border-top: 1px solid var(--border); background: var(--surface);
  }

  /* En pantallas chicas se ve una cosa por vez, como en el celular */
  @media (max-width: 820px) {
    .sp-app { height: calc(100vh - 170px); }
    .sp-lat { width: 100%; }
    .sp-app.viendo .sp-lat { display: none; }
    .sp-app:not(.viendo) .sp-conv { display: none; }
    .sp-m { max-width: 85%; }
  }
  .sp-volver { display: none; }
  @media (max-width: 820px) { .sp-volver { display: flex; } }
</style>
`;

const ICONO_ENVIAR = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 12l16-8-5.5 16L11 14z" /><path d="M11 14l9-10" />
  </svg>
`;

export function renderSoporte(container, { profile, ticketId: ticketInicial } = {}) {
  if (!puede(profile, 'soporte')) {
    container.innerHTML = '<section class="card"><p class="hint">No tenés permiso para atender reclamos.</p></section>';
    return;
  }

  const POR_TANDA = 20;
  let grupo = 'abiertos';
  let tandas = 1;          // cuántas tandas de 20 pedimos
  let ticketId = ticketInicial || null;
  let ultimoMsgId = null;
  let ultimoEstado = null;
  let adjuntoPendiente = null;

  container.innerHTML = `
    ${ESTILOS}
    <div class="sp-app" id="sp-app">
      <aside class="sp-lat">
        <div class="sp-lat-head">
          <div class="sp-tabs">
            <button class="sp-tab on" data-grupo="abiertos">Abiertos</button>
            <button class="sp-tab" data-grupo="resueltos">Resueltos</button>
            <button class="sp-tab" data-grupo="cerrados">Cerrados</button>
          </div>
        </div>
        <div class="sp-lista" id="sp-lista"><p class="hint" style="padding:14px">Cargando...</p></div>
      </aside>

      <section class="sp-conv" id="sp-conv">
        <div class="sp-vacio">Elegí una conversación de la lista</div>
      </section>
    </div>
  `;

  const app = container.querySelector('#sp-app');
  const listaEl = container.querySelector('#sp-lista');
  const convEl = container.querySelector('#sp-conv');

  /* --------------------------------------------------- */

  const cargarBandeja = async () => {
    // Pedimos siempre desde el principio pero con el largo acumulado:
    // así el refresco cada 6 segundos no descoloca lo ya cargado ni
    // duplica filas si entró una conversación nueva mientras tanto.
    const { ok, data, error } = await apiFetch(
      `/api/atencion?recurso=soporte&estado=${grupo}&porPagina=${POR_TANDA * tandas}`
    );

    if (!ok) { listaEl.innerHTML = `<p class="hint error" style="padding:14px">${error}</p>`; return; }

    const tickets = data.tickets || [];

    if (!tickets.length) {
      listaEl.innerHTML = '<p class="hint" style="padding:14px">No hay conversaciones acá.</p>';
      return;
    }

    listaEl.innerHTML = tickets.map((t) => {
      const j = t.players || {};
      const est = ESTADOS[t.estado] || ESTADOS.abierto;
      const nombre = j.display_name || j.username || 'Jugador';

      return `
        <button class="sp-t ${t.id === ticketId ? 'sel' : ''}" data-ticket="${t.id}">
          <span class="sp-av">
            ${nombre.charAt(0).toUpperCase()}
            <i style="background:${est.color}"></i>
          </span>
          <span class="sp-ti">
            <span class="sp-ti-top">
              <strong>${escapeHtml(nombre)}</strong>
              <span class="sp-when">${hace(t.ultimo_mensaje_at)}</span>
            </span>
            <span class="sp-ti-bot">
              <span class="sp-prev">${escapeHtml(t.ultimo_mensaje || '')}</span>
              <span class="sp-tag">${escapeHtml(t.motivo)}</span>
              ${t.sin_leer_staff > 0 ? `<span class="sp-nuevos">${t.sin_leer_staff}</span>` : ''}
            </span>
          </span>
        </button>
      `;
    }).join('');

    if (data.hayMas) {
      listaEl.insertAdjacentHTML('beforeend', `
        <div class="sp-mas">
          <button class="secundario" id="sp-mas">Cargar más</button>
          <span>${data.tickets.length} de ${data.total}</span>
        </div>
      `);

      listaEl.querySelector('#sp-mas').addEventListener('click', (e) => {
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = 'Cargando...';
        tandas += 1;
        cargarBandeja();
      });
    }

    listaEl.querySelectorAll('[data-ticket]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ticketId = btn.dataset.ticket;
        ultimoMsgId = null;
        adjuntoPendiente = null;
        app.classList.add('viendo');
        cargarBandeja();
        abrirChat({ forzar: true });
      });
    });
  };

  /* --------------------------------------------------- */

  const abrirChat = async ({ forzar = false } = {}) => {
    if (!ticketId) return;

    const { ok, data, error } = await apiFetch(`/api/atencion?recurso=soporte&ticket=${ticketId}`);

    if (!ok) { convEl.innerHTML = `<p class="hint error" style="padding:14px">${error}</p>`; return; }

    const { ticket, mensajes, solicitud } = data;

    const nuevoUltimo = mensajes.length ? mensajes[mensajes.length - 1].id : null;
    if (!forzar && nuevoUltimo === ultimoMsgId && ticket.estado === ultimoEstado) return;

    // Conservamos lo escrito y el scroll antes de redibujar
    const previo = convEl.querySelector('#sp-texto')?.value || '';
    const teniaFoco = document.activeElement === convEl.querySelector('#sp-texto');
    const msgsViejo = convEl.querySelector('#sp-msgs');
    const abajo = !msgsViejo || msgsViejo.scrollHeight - msgsViejo.scrollTop - msgsViejo.clientHeight < 60;

    ultimoMsgId = nuevoUltimo;
    ultimoEstado = ticket.estado;

    const j = ticket.players || {};
    const est = ESTADOS[ticket.estado] || ESTADOS.abierto;
    const nombre = j.display_name || j.username || 'Jugador';
    const cerrado = ticket.estado === 'cerrado';

    convEl.innerHTML = `
      <header class="sp-head">
        <button class="secundario sp-volver" id="sp-volver" style="padding:6px 10px">←</button>
        <span class="sp-av">${nombre.charAt(0).toUpperCase()}<i style="background:${est.color}"></i></span>
        <div class="sp-head-txt">
          <strong>${escapeHtml(nombre)} · ID #${j.player_number}</strong>
          <span>
            ${est.nombre} · ${escapeHtml(ticket.motivo)}
            ${ticket.atendido_por ? ` · atiende ${escapeHtml(ticket.atendido_por)}` : ''}
            ${ticket.resuelto_at ? ` · resuelto ${fechaCorta(ticket.resuelto_at)}` : ''}
          </span>
        </div>
        <div class="sp-head-acc">
          ${ticket.estado === 'resuelto' || cerrado ? '' : '<button id="sp-resolver">Resuelto</button>'}
          ${cerrado
            ? '<button id="sp-reabrir" class="secundario">Reabrir</button>'
            : '<button id="sp-cerrar" class="secundario">Cerrar</button>'}
        </div>
      </header>

      ${solicitud ? `
        <div class="sp-ref">
          ${solicitud.tipo === 'carga' ? 'Carga' : 'Retiro'} de
          <strong>${formatMoney(solicitud.amount)}</strong>
          del ${fechaCorta(solicitud.created_at)} · ${escapeHtml(solicitud.estado)}
          ${solicitud.comprobante_url
            ? ` · <a href="${solicitud.comprobante_url}" target="_blank" rel="noopener">ver comprobante</a>`
            : ''}
        </div>
      ` : ''}

      <div class="sp-msgs" id="sp-msgs">${hilo(mensajes)}</div>

      <div id="sp-adj"></div>

      ${cerrado ? `
        <p class="sp-cerrado-aviso">Conversación cerrada. Reabrila para poder escribir.</p>
      ` : `
        <div class="sp-in">
          <label class="sp-clip" title="Adjuntar imagen">
            <input type="file" id="sp-file" accept="image/*" hidden />
            <span></span>
          </label>
          <input type="text" id="sp-texto" placeholder="Escribí un mensaje" autocomplete="off" />
          <button class="sp-send" id="sp-enviar" aria-label="Enviar">${ICONO_ENVIAR}</button>
        </div>
      `}
      <p id="sp-msg" class="hint" style="margin:0;padding:0 14px"></p>
    `;

    // Solo bajamos solo si el cajero ya estaba abajo: si estaba leyendo
    // más arriba, no le movemos la pantalla.
    const msgsEl = convEl.querySelector('#sp-msgs');
    if (abajo) msgsEl.scrollTop = msgsEl.scrollHeight;

    const input = convEl.querySelector('#sp-texto');
    if (input && previo) {
      input.value = previo;
      if (teniaFoco) {
        input.focus();
        input.setSelectionRange(previo.length, previo.length);
      }
    }

    convEl.querySelector('#sp-volver')?.addEventListener('click', () => {
      app.classList.remove('viendo');
    });

    convEl.querySelectorAll('[data-ver]').forEach((img) => {
      img.addEventListener('click', () => window.open(img.dataset.ver, '_blank', 'noopener'));
    });

    const msgEl = convEl.querySelector('#sp-msg');

    const cambiarEstado = async (nuevo) => {
      const res = await apiFetch('/api/atencion?recurso=soporte', { method: 'POST', body: { ticketId, estado: nuevo } });

      if (!res.ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = res.error;
        return;
      }

      abrirChat({ forzar: true });
      cargarBandeja();
    };

    convEl.querySelector('#sp-resolver')?.addEventListener('click', () => cambiarEstado('resuelto'));
    convEl.querySelector('#sp-cerrar')?.addEventListener('click', () => cambiarEstado('cerrado'));
    convEl.querySelector('#sp-reabrir')?.addEventListener('click', () => cambiarEstado('en_curso'));

    if (cerrado) return;

    const adjEl = convEl.querySelector('#sp-adj');

    const pintarAdj = () => {
      adjEl.innerHTML = adjuntoPendiente
        ? `<div class="sp-adj-panel">
             <img src="${adjuntoPendiente.url}" alt="" />
             <span>Imagen lista para enviar</span>
             <button id="sp-quitar-adj">Quitar</button>
           </div>`
        : '';

      adjEl.querySelector('#sp-quitar-adj')?.addEventListener('click', () => {
        adjuntoPendiente = null;
        pintarAdj();
      });
    };

    pintarAdj();

    convEl.querySelector('#sp-file').addEventListener('change', async (e) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;

      adjEl.innerHTML = '<div class="sp-adj-panel"><span>Subiendo imagen...</span></div>';

      try {
        adjuntoPendiente = await subirImagen(archivo, { carpeta: 'soporte' });
        pintarAdj();
      } catch (err) {
        adjEl.innerHTML = `<p class="hint error" style="padding:0 12px 8px">${err.message}</p>`;
      }

      e.target.value = '';
    });

    const enviar = async () => {
      const texto = input.value.trim();
      if (!texto && !adjuntoPendiente) return;

      const btn = convEl.querySelector('#sp-enviar');
      const adjEnviado = adjuntoPendiente;

      btn.disabled = true;
      input.value = '';
      adjuntoPendiente = null;
      pintarAdj();

      const res = await apiFetch('/api/atencion?recurso=soporte', {
        method: 'POST',
        body: { ticketId, texto, adjuntoUrl: adjEnviado?.url },
      });

      btn.disabled = false;

      if (!res.ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = res.error;
        input.value = texto;
        adjuntoPendiente = adjEnviado;
        pintarAdj();
        return;
      }

      await abrirChat({ forzar: true });
      cargarBandeja();
      convEl.querySelector('#sp-texto')?.focus();
    };

    convEl.querySelector('#sp-enviar').addEventListener('click', enviar);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); enviar(); }
    });
    if (!previo) input.focus();
  };

  /* --------------------------------------------------- */

  container.querySelectorAll('[data-grupo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-grupo]').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      grupo = btn.dataset.grupo;
      tandas = 1;
      listaEl.scrollTop = 0;
      cargarBandeja();
    });
  });

  cargarBandeja();

  // Con la pestaña en segundo plano no se consulta: un cajero con el
  // panel abierto todo el día generaba 14.000 consultas diarias sin
  // que nadie estuviera mirando.
  const reloj = setInterval(() => {
    if (document.hidden) return;
    cargarBandeja();
    if (ticketId) abrirChat();
  }, 6000);

  // Al volver a la pestaña, refresca enseguida en vez de esperar el ciclo
  const alVolver = () => {
    if (document.hidden) return;
    cargarBandeja();
    if (ticketId) abrirChat();
  };
  document.addEventListener('visibilitychange', alVolver);

  const observador = new MutationObserver(() => {
    if (!document.body.contains(listaEl)) {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', alVolver);
      observador.disconnect();
    }
  });
  observador.observe(document.body, { childList: true, subtree: true });
}

/* ---------------------------------------------------------
   Armado del hilo con separadores por día y mensajes agrupados
   --------------------------------------------------------- */
function hilo(mensajes) {
  let diaPrevio = null;
  let autorPrevio = null;

  return mensajes.map((m) => {
    const dia = new Date(m.created_at).toDateString();
    let salida = '';

    if (dia !== diaPrevio) {
      salida += `<div class="sp-dia">${etiquetaDia(m.created_at)}</div>`;
      diaPrevio = dia;
      autorPrevio = null;
    }

    if (m.autor_tipo === 'sistema') {
      autorPrevio = null;
      return salida + `<div class="sp-m sistema">${escapeHtml(m.autor)} · ${escapeHtml(m.texto)}</div>`;
    }

    const mio = m.autor_tipo === 'staff';
    const seguido = autorPrevio === m.autor_tipo;
    autorPrevio = m.autor_tipo;

    return salida + `
      <div class="sp-m ${mio ? 'yo' : 'ellos'} ${seguido ? 'seguido' : ''} ${m.adjunto_url ? 'con-img' : ''}">
        ${m.adjunto_url ? `<img src="${m.adjunto_url}" alt="Adjunto" data-ver="${m.adjunto_url}" />` : ''}
        ${m.texto ? `<span class="txt">${escapeHtml(m.texto)}</span>` : ''}
        <span class="meta">${mio ? escapeHtml(cortarMail(m.autor)) + ' · ' : ''}${hora(m.created_at)}</span>
      </div>
    `;
  }).join('');
}

function etiquetaDia(iso) {
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);

  const igual = (a, b) => a.toDateString() === b.toDateString();

  if (igual(d, hoy)) return 'Hoy';
  if (igual(d, ayer)) return 'Ayer';
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: 'long' });
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
}

function hace(iso) {
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const hs = Math.floor(min / 60);
  if (hs < 24) return `${hs} h`;
  return `${Math.floor(hs / 24)} d`;
}

function cortarMail(txt) {
  const s = String(txt ?? '');
  return s.includes('@') ? s.split('@')[0] : s;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
