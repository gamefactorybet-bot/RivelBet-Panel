import { formatMoney, currency } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { playerFetch } from './api.ts';
import { abrirVerificacion } from './verificacion.js';
import { ICONOS } from './iconos.js';

/**
 * Panel de cuenta: quién sos, la plata con Recargar/Retirar, y el
 * resto en pestañas (Inicio, Actividad, Premios) para que no se mezcle.
 */
export function abrirPanelCuenta({ estado, onSalir, onCambio, onRecargar }) {
  const { player, movimientos, pendiente, pendienteCarga } = estado;

  const estadoVer = player.estado_verificacion || 'sin_verificar';
  const verificado = estadoVer === 'verificado';
  const bonoRegistro = Number(estado.bonoRegistro || 0);

  // Billetera modo avanzado: parte del saldo puede ser bono pegajoso.
  const avanzado = Boolean(estado.billetera?.modo_avanzado);
  const retener = Boolean(estado.billetera?.retener_ganancias);
  const saldoBono = Number(player.saldo_bono || 0);
  const requisito = Number(player.requisito_apuesta || 0);
  const gananciaBono = Number(player.ganancia_bono || 0);
  const forfeit = (avanzado && requisito > 0)
    ? saldoBono + (retener ? gananciaBono : 0)
    : 0;

  const piso = Math.min(Number(player.bono_por_descontar || 0), Number(player.balance || 0));
  const retirable = Math.max(0, Number(player.balance || 0) - piso - forfeit);
  const esperaRetiro = textoEsperaRetiro(estado.retiroEspera);

  // Motivo por el que Retirar está bloqueado (o null si se puede).
  const bloqueoRetiro = player.ban_retiros
    ? 'Los retiros están deshabilitados en tu cuenta.'
    : !verificado
      ? 'Verificá tu identidad para poder retirar.'
      : player.retiro_bloqueado
        ? `Hacé una carga de al menos ${formatMoney(bonoRegistro)} para desbloquear el retiro de tus ganancias.`
        : esperaRetiro;

  const fondo = document.createElement('div');
  fondo.className = 'pt-drawer-fondo';
  document.body.appendChild(fondo);

  const cerrar = () => {
    fondo.classList.remove('abierto');
    setTimeout(() => fondo.remove(), 180);
  };

  const etiquetaEstado = verificado
    ? 'verificado'
    : estadoVer === 'pendiente' ? 'en revisión'
    : estadoVer === 'rechazado' ? 'rechazado'
    : 'sin verificar';
  const hayBono = piso > 0 || saldoBono > 0;
  const ultimos = (movimientos || []).slice(0, 2);
  const hayPremios = verificado || (estado.hitos || []).length || (estado.referidos?.activo && estado.referidos.codigo);

  fondo.innerHTML = `
    <aside class="pt-drawer">
      <div class="pt-drawer-head">
        <div class="pt-avatar-lg">${(player.display_name || player.username).charAt(0).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <strong>${escapeHtml(player.display_name || player.username)}</strong>
          <span class="hint">ID #${player.player_number} · ${etiquetaEstado}</span>
        </div>
        <button class="pt-icon-btn" id="dr-cerrar" aria-label="Cerrar">${ICONOS.cerrar}</button>
      </div>

      <div class="pt-drawer-hero">
        <span class="pt-dato-label">Saldo</span>
        <strong class="pt-drawer-hero-monto">${formatMoney(player.balance)}</strong>
        <div class="pt-drawer-split">
          <span>Retirable <b>${formatMoney(retirable)}</b></span>
          ${hayBono ? `<span>Bono <b>${formatMoney(piso || saldoBono)}</b></span>` : ''}
        </div>
        ${pendiente ? `
          <div class="pt-drawer-saldo-retenido">
            <span>En proceso de retiro</span>
            <strong>${formatMoney(pendiente.amount)}</strong>
          </div>
        ` : ''}
        <div class="pt-drawer-acciones">
          <button id="dr-recargar" class="pt-recargar" ${pendienteCarga ? 'disabled' : ''}>Recargar</button>
          <button class="secundario" id="dr-retirar"
                  ${bloqueoRetiro || pendiente ? 'disabled' : ''}>Retirar</button>
        </div>
        ${pendienteCarga ? `<p class="hint" style="margin:10px 0 0">Ya tenés una carga en proceso. Esperá a que la confirmen.</p>` : ''}
        ${bloqueoRetiro ? `<p class="hint" style="margin:10px 0 0">${bloqueoRetiro}</p>` : ''}
        <p id="dr-msg" class="hint"></p>
      </div>

      <div class="pt-drawer-tabs" role="tablist">
        <button type="button" class="pt-drawer-tab is-active" data-tab="inicio">Inicio</button>
        <button type="button" class="pt-drawer-tab" data-tab="actividad">Actividad</button>
        <button type="button" class="pt-drawer-tab" data-tab="premios">Premios</button>
      </div>

      <div class="pt-drawer-panel" data-panel="inicio">
        ${!verificado ? bloqueVerificacion(estadoVer, bonoRegistro) : ''}
        ${avanzado && requisito > 0 ? `
          <div class="pt-candado">
            <b>Tenés un bono activo</b>
            De tu saldo podés retirar <strong>${formatMoney(retirable)}</strong>.
            Apostá <strong>${formatMoney(requisito)}</strong> más para liberar tu bono de ${formatMoney(saldoBono)}${retener && gananciaBono > 0 ? ` y las ${formatMoney(gananciaBono)} que ganaste con él` : ''}.
            Si retirás antes, perdés esa parte — nunca tu carga ni el resto de tus ganancias.
          </div>
        ` : ''}
        ${verificado && player.retiro_bloqueado ? `
          <div class="pt-candado">
            <b>Retiros bloqueados</b>
            Hacé una carga de <strong>${formatMoney(bonoRegistro)} o más</strong> para desbloquear el retiro de tus ganancias. El bono en sí no es retirable.
          </div>
        ` : ''}
        ${verificado && !player.retiro_bloqueado && esperaRetiro ? `
          <div class="pt-candado">
            <b>Retiro en espera</b>
            ${esperaRetiro}
          </div>
        ` : ''}
        ${verificado && !player.retiro_bloqueado && !esperaRetiro && piso > 0 ? `
          <div class="pt-candado pt-candado-ok">
            <b>Retiros habilitados</b>
            Podés retirar hasta <strong>${formatMoney(retirable)}</strong>. ${formatMoney(piso)} del bono no son retirables.
          </div>
        ` : ''}
        ${pendienteCarga ? bloquePendiente('carga', pendienteCarga) : ''}
        ${pendiente ? bloquePendiente('retiro', pendiente) : ''}
        ${ultimos.length ? `
          <h3 class="pt-drawer-titulo">Últimos movimientos</h3>
          <div class="pt-drawer-movs">${bloqueMovs(ultimos)}</div>
        ` : ''}
      </div>

      <div class="pt-drawer-panel" data-panel="actividad" hidden>
        <h3 class="pt-drawer-titulo">Movimientos</h3>
        <div class="pt-drawer-movs">
          ${movimientos.length ? bloqueMovs(movimientos) : '<p class="pt-vacio">Todavía no tenés movimientos.</p>'}
        </div>
      </div>

      <div class="pt-drawer-panel" data-panel="premios" hidden>
        ${verificado ? `
          <div class="pt-promo">
            <label>Código promocional</label>
            <div class="pt-promo-fila">
              <input id="dr-promo" placeholder="CÓDIGO" autocapitalize="characters" autocomplete="off" />
              <button id="dr-promo-btn">Canjear</button>
            </div>
            <p id="dr-promo-msg" class="hint"></p>
          </div>
        ` : ''}
        ${(estado.hitos || []).length ? bloqueHitos(estado.hitos) : ''}
        ${estado.referidos?.activo && estado.referidos.codigo ? bloqueReferidos(estado.referidos) : ''}
        ${!hayPremios ? '<p class="pt-vacio">Cuando haya premios o un código, aparecen acá.</p>' : ''}
      </div>

      <button class="pt-fila-accion" id="dr-salir">
        <span class="icono">${ICONOS.salir}</span>
        <span style="flex:1;text-align:left">Cerrar sesión</span>
        <span class="icono chico">${ICONOS.flecha}</span>
      </button>
    </aside>
  `;

  // Un frame de espera para que la transición de entrada se vea.
  requestAnimationFrame(() => fondo.classList.add('abierto'));

  fondo.addEventListener('click', (e) => {
    if (e.target === fondo) cerrar();
  });

  fondo.querySelector('#dr-cerrar').addEventListener('click', cerrar);

  fondo.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      fondo.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
      fondo.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    });
  });

  const btnCopiar = fondo.querySelector('#dr-ref-copiar');
  if (btnCopiar) {
    btnCopiar.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(btnCopiar.dataset.codigo); } catch { /* nada */ }
      btnCopiar.textContent = 'Copiado';
      setTimeout(() => { btnCopiar.textContent = 'Copiar'; }, 1500);
    });
  }
  const btnShare = fondo.querySelector('#dr-ref-share');
  if (btnShare) {
    btnShare.addEventListener('click', () => {
      const url = btnShare.dataset.url;
      const txt = btnShare.dataset.texto;
      const wa = `https://wa.me/?text=${encodeURIComponent(txt + ' ' + url)}`;
      window.open(wa, '_blank', 'noopener');
    });
  }

  const salirDelDrawer = () => { fondo.remove(); };

  fondo.querySelector('#dr-recargar').addEventListener('click', () => {
    salirDelDrawer();
    onRecargar?.();
  });

  const promoBtn = fondo.querySelector('#dr-promo-btn');
  if (promoBtn) {
    promoBtn.addEventListener('click', async () => {
      const input = fondo.querySelector('#dr-promo');
      const msgEl = fondo.querySelector('#dr-promo-msg');
      const codigo = input.value.trim();
      if (!codigo) return;
      promoBtn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Canjeando...';
      const { ok, data, error } = await playerFetch('/api/player-caja?recurso=promo', {
        method: 'POST', body: { codigo },
      });
      promoBtn.disabled = false;
      if (!ok) { msgEl.className = 'hint error'; msgEl.textContent = error; return; }
      msgEl.className = 'hint';
      msgEl.textContent = `¡Listo! Te dimos ${formatMoney(data.monto)}${Number(data.rollover) > 0 ? ` — apostalo ${data.rollover}× para liberarlo` : ''}.`;
      onCambio?.();
    });
  }

  fondo.querySelector('#dr-salir').addEventListener('click', () => {
    cerrar();
    onSalir?.();
  });

  const btnVerificar = fondo.querySelector('#dr-verificar');
  if (btnVerificar) {
    btnVerificar.addEventListener('click', () => {
      salirDelDrawer();
      abrirVerificacion(estado, onCambio);
    });
  }

  const btnRetirar = fondo.querySelector('#dr-retirar');
  if (btnRetirar && !btnRetirar.disabled) {
    btnRetirar.addEventListener('click', () => {
      salirDelDrawer();
      abrirHojaRetiro(player, onCambio, { retirable, forfeit });
    });
  }

}

function bloqueMovs(movimientos) {
  return movimientos.map((m) => `
    <div class="pt-mov">
      <div class="pt-mov-icono ${m.type}">${m.type === 'carga' ? '+' : '−'}</div>
      <div class="pt-mov-datos">
        <div class="pt-mov-tipo">${m.type}</div>
        <div class="pt-mov-fecha">${fechaCorta(m.created_at)}</div>
      </div>
      <div class="pt-mov-monto">
        ${m.type === 'carga' ? '+' : '−'}${formatMoney(m.amount)}
        <small>saldo ${formatMoney(m.balance_after)}</small>
      </div>
    </div>
  `).join('');
}

function bloqueHitos(hitos) {
  return `
    <h3 class="pt-drawer-titulo">Premios por carga</h3>
    ${hitos.map((h) => {
      const total = Number(h.cada_cargas) || 1;
      const van = Math.min(total, Number(h.cargas_contadas) || 0);
      const pct = Math.round(van / total * 100);
      const val = Number(h.proximo_valor) || 0;
      const premio = h.tipo === 'porcentaje' ? `${val}% de tu carga` : formatMoney(val);
      const tope = Number(h.tope_conversion_mult) || 0;
      return `
        <div class="pt-hito">
          ${h.banner_titulo ? `<strong>${escapeHtml(h.banner_titulo)}</strong>` : `<strong>${escapeHtml(h.nombre)}</strong>`}
          ${h.banner_texto ? `<span class="hint">${escapeHtml(h.banner_texto)}</span>` : ''}
          <div class="pt-hito-barra"><span style="width:${pct}%"></span></div>
          <div class="pt-hito-info">
            <span>${van} de ${total} cargas de ${formatMoney(h.min_por_carga)}+</span>
            <b>faltan ${h.faltan}</b>
          </div>
          <span class="hint">Próximo bono: ${premio}${tope > 0 ? ` · te llevás hasta ×${tope} el bono` : ''}${h.hitos_completados > 0 ? ` · ${h.hitos_completados} logrado${h.hitos_completados > 1 ? 's' : ''}` : ''}</span>
        </div>
      `;
    }).join('')}
  `;
}

function bloqueReferidos(ref) {
  const base = (typeof window !== 'undefined' ? window.location.origin : '');
  const url = `${base}/?ref=${encodeURIComponent(ref.codigo)}`;
  const texto = `Entrá a jugar con mi código ${ref.codigo} y los dos ganamos ${formatMoney(ref.bono)}:`;
  return `
    <h3 class="pt-drawer-titulo">Invitá amigos</h3>
    <div class="pt-ref">
      <h4>Ganá ${formatMoney(ref.bono)} por amigo</h4>
      <p>Por cada amigo que se registre con tu código y haga su primera carga.</p>
      <div class="pt-ref-cod">
        <b>${escapeHtml(ref.codigo)}</b>
        <button id="dr-ref-copiar" data-codigo="${escapeHtml(ref.codigo)}">Copiar</button>
      </div>
      <button class="pt-ref-share" id="dr-ref-share" data-url="${escapeHtml(url)}" data-texto="${escapeHtml(texto)}">
        Compartir por WhatsApp
      </button>
      <div class="pt-ref-nums">
        <div><small>Invitados</small><strong>${ref.invitados}</strong></div>
        <div><small>Cargaron</small><strong>${ref.pagados}</strong></div>
        <div><small>Ganaste</small><strong>${formatMoney(ref.ganado)}</strong></div>
      </div>
    </div>
  `;
}

function bloqueVerificacion(estadoVer, bono) {
  const textos = {
    sin_verificar: {
      titulo: 'Verificá tu identidad para jugar',
      cuerpo: bono > 0
        ? `Ya tenés ${formatMoney(bono)} de bono. Subí 3 fotos para poder jugar y retirar.`
        : 'Subí 3 fotos del documento para poder jugar y retirar.',
      boton: 'Verificar',
    },
    pendiente: {
      titulo: 'Verificación en revisión',
      cuerpo: 'Estamos revisando tus fotos. Te avisamos acá cuando esté lista.',
      boton: 'Ver estado',
    },
    rechazado: {
      titulo: 'Verificación rechazada',
      cuerpo: 'Reenviá tus fotos para poder jugar y retirar.',
      boton: 'Reenviar',
    },
  };
  const t = textos[estadoVer] || textos.sin_verificar;
  return `
    <div class="pt-candado">
      <b>${t.titulo}</b>
      ${t.cuerpo}
      <div style="margin-top:10px">
        <button class="secundario" id="dr-verificar" style="padding:7px 14px">${t.boton}</button>
      </div>
    </div>
  `;
}

function bloquePendiente(tipo, sol) {
  const esCarga = tipo === 'carga';
  return `
    <div class="pt-pendiente">
      <strong>${formatMoney(sol.amount)}</strong>
      ${esCarga ? 'Carga' : 'Retiro'} pendiente desde ${fechaCorta(sol.created_at)}.
      ${esCarga
        ? 'Se acredita cuando confirmemos la transferencia. No se puede cancelar.'
        : 'Ya se descontó de tu saldo. Un cajero lo va a procesar. No se puede cancelar.'}
    </div>
  `;
}

const ALIAS_TIPOS = {
  ci: { corto: 'CI', label: 'Número de CI', placeholder: '1.234.567', inputmode: 'numeric' },
  telefono: { corto: 'Teléfono', label: 'Número de teléfono', placeholder: '0981 234 567', inputmode: 'tel' },
  correo: { corto: 'Correo', label: 'Correo electrónico', placeholder: 'nombre@correo.com', inputmode: 'email' },
  ruc: { corto: 'RUC', label: 'RUC', placeholder: '80012345-6', inputmode: 'text' },
};

function abrirHojaRetiro(player, onCambio, opts = {}) {
  const retirable = opts.retirable != null ? Number(opts.retirable) : Number(player.balance);
  const forfeit = Number(opts.forfeit || 0);
  const fondo = document.createElement('div');
  fondo.className = 'pt-sheet-fondo';
  fondo.innerHTML = `
    <div class="pt-sheet">
      <div class="pt-sheet-head">
        <h3>Solicitar retiro</h3>
        <button class="pt-cerrar">×</button>
      </div>
      <div class="pt-sheet-disp">
        <div class="pt-dato-label">Disponible para retirar</div>
        <strong>${formatMoney(retirable)}</strong>
        ${forfeit > 0 ? `<p class="hint" style="color:var(--error)">Si retirás ahora perdés ${formatMoney(forfeit)} de bono sin liberar.</p>` : ''}
      </div>
      <p class="pt-seccion-label">Monto</p>
      <input id="rt-monto" class="pt-monto-input" type="number" inputmode="numeric"
             placeholder="0" step="${currency.decimals ? '0.01' : '1'}" />
      <div class="pt-rapidos">
        <button class="pt-rapido" data-todo="1">Todo lo retirable</button>
      </div>

      <p class="pt-seccion-label">¿Cómo querés cobrar?</p>
      <div class="pt-cuenta-tabs">
        <button class="pt-cuenta-tab is-active" data-metodo="alias">Alias</button>
        <button class="pt-cuenta-tab" data-metodo="cuenta">Cuenta bancaria</button>
      </div>

      <div class="pt-panel-metodo" id="rt-panel-alias">
        <div class="pt-subtabs">
          ${Object.entries(ALIAS_TIPOS).map(([tipo, cfg], i) => `
            <button class="pt-subtab${i === 0 ? ' is-active' : ''}" data-tipo="${tipo}">${cfg.corto}</button>
          `).join('')}
        </div>
        <label class="pt-campo">
          <span id="rt-label-alias">${ALIAS_TIPOS.ci.label}</span>
          <input id="rt-alias-valor" placeholder="${ALIAS_TIPOS.ci.placeholder}" inputmode="${ALIAS_TIPOS.ci.inputmode}" />
        </label>
      </div>

      <div class="pt-panel-metodo" id="rt-panel-cuenta" hidden>
        <label class="pt-campo"><span>Entidad bancaria</span><input id="rt-banco" placeholder="Banco Itaú" /></label>
        <label class="pt-campo"><span>Número de cuenta</span><input id="rt-numero-cuenta" placeholder="0001-0234567-8" inputmode="numeric" /></label>
        <label class="pt-campo"><span>Nombre del titular</span><input id="rt-titular" placeholder="Como figura en el banco" /></label>
        <label class="pt-campo"><span>Número de documento</span><input id="rt-documento" placeholder="1.234.567" inputmode="numeric" /></label>
      </div>

      <button id="rt-enviar" class="pt-enviar">Solicitar</button>
      <p id="rt-msg" class="hint" style="text-align:center;margin-top:10px"></p>
    </div>
  `;
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  fondo.querySelector('.pt-cerrar').addEventListener('click', cerrar);

  const input = fondo.querySelector('#rt-monto');
  fondo.querySelector('[data-todo]').addEventListener('click', () => {
    input.value = Math.max(0, retirable);
  });

  let metodo = 'alias';
  let aliasTipo = 'ci';
  const panelAlias = fondo.querySelector('#rt-panel-alias');
  const panelCuenta = fondo.querySelector('#rt-panel-cuenta');

  fondo.querySelectorAll('.pt-cuenta-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      fondo.querySelectorAll('.pt-cuenta-tab').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      metodo = tab.dataset.metodo;
      panelAlias.hidden = metodo !== 'alias';
      panelCuenta.hidden = metodo !== 'cuenta';
    });
  });

  const labelAlias = fondo.querySelector('#rt-label-alias');
  const inputAlias = fondo.querySelector('#rt-alias-valor');

  fondo.querySelectorAll('.pt-subtab').forEach((tab) => {
    tab.addEventListener('click', () => {
      fondo.querySelectorAll('.pt-subtab').forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      aliasTipo = tab.dataset.tipo;
      const cfg = ALIAS_TIPOS[aliasTipo];
      labelAlias.textContent = cfg.label;
      inputAlias.placeholder = cfg.placeholder;
      inputAlias.setAttribute('inputmode', cfg.inputmode);
      inputAlias.value = '';
    });
  });

  fondo.querySelector('#rt-enviar').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const msgEl = fondo.querySelector('#rt-msg');
    const monto = Number(input.value);

    if (!monto || monto <= 0) {
      msgEl.className = 'hint error';
      msgEl.textContent = 'Ingresá un monto válido.';
      return;
    }

    const body = { amount: monto, metodoTipo: metodo };

    if (metodo === 'alias') {
      const valor = inputAlias.value.trim();
      if (!valor) {
        msgEl.className = 'hint error';
        msgEl.textContent = `Completá tu ${ALIAS_TIPOS[aliasTipo].label.toLowerCase()}.`;
        return;
      }
      body.aliasTipo = aliasTipo;
      body.aliasValor = valor;
    } else {
      const banco = fondo.querySelector('#rt-banco').value.trim();
      const numeroCuenta = fondo.querySelector('#rt-numero-cuenta').value.trim();
      const titular = fondo.querySelector('#rt-titular').value.trim();
      const documento = fondo.querySelector('#rt-documento').value.trim();

      if (!banco || !numeroCuenta || !titular || !documento) {
        msgEl.className = 'hint error';
        msgEl.textContent = 'Completá todos los datos de la cuenta bancaria.';
        return;
      }
      body.banco = banco;
      body.numeroCuenta = numeroCuenta;
      body.titular = titular;
      body.documento = documento;
    }

    btn.disabled = true;
    msgEl.className = 'hint';
    msgEl.textContent = 'Enviando...';

    const { ok, error } = await playerFetch('/api/player-caja?recurso=retiro', {
      method: 'POST',
      body,
    });

    btn.disabled = false;

    if (!ok) {
      msgEl.className = 'hint error';
      msgEl.textContent = error;
      return;
    }

    cerrar();
    onCambio?.();
  });

  input.focus();
}

function textoEsperaRetiro(espera) {
  if (!espera || Number(espera.segundosRestantes || 0) <= 0) return null;
  const hasta = espera.disponibleAt ? new Date(espera.disponibleAt) : null;
  const ms = hasta ? hasta.getTime() - Date.now() : Number(espera.segundosRestantes) * 1000;
  if (ms <= 0) return null;

  const horas = Number(espera.horas || 0);
  const nivel = espera.nivelNombre ? ` En tu nivel ${espera.nivelNombre} hay que esperar ${horas} h entre retiros.` : '';
  const cuando = hasta
    ? hasta.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;
  const h = Math.floor(ms / 3600000);
  const m = Math.max(1, Math.ceil((ms % 3600000) / 60000));

  if (h >= 24 && cuando) return `Próximo retiro el ${cuando}.${nivel}`;
  if (cuando) return `Próximo retiro en ${h ? `${h} h ` : ''}${m} min (${cuando}).${nivel}`;
  return `Próximo retiro en ${h ? `${h} h ` : ''}${m} min.${nivel}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
