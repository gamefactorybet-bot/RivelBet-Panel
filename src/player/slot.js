import { formatMoney, currency } from '../lib/currency.ts';
import { playerFetch } from './api.ts';

// Dibujo de cada símbolo. SVG en vez de imágenes: pesan nada, se ven
// nítidos en cualquier pantalla y toman el color del tema.
const SIMBOLOS = {
  cereza:   { color: '#e5484d', d: '<circle cx="9" cy="16" r="4.2"/><circle cx="16" cy="17" r="3.6"/><path d="M9 11.8C10 7 14 5 17 4M16 13.4C16.6 9.8 17 6 17 4" fill="none" stroke="currentColor" stroke-width="1.4"/>' },
  limon:    { color: '#f5c518', d: '<ellipse cx="12" cy="12" rx="7.5" ry="6"/><path d="M12 6v12M6 12h12" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>' },
  campana:  { color: '#f2a33c', d: '<path d="M12 3.5a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 6 2.5 7h-16c1-1 2.5-3 2.5-7A5.5 5.5 0 0 1 12 3.5z"/><circle cx="12" cy="19.5" r="1.8"/>' },
  trebol:   { color: '#3fbf6f', d: '<circle cx="12" cy="7" r="3.6"/><circle cx="8" cy="12" r="3.6"/><circle cx="16" cy="12" r="3.6"/><path d="M11.2 13h1.6l1.2 7h-4z"/>' },
  corona:   { color: '#d9b44a', d: '<path d="M3.5 8l3.5 4 5-6.5 5 6.5 3.5-4-1.5 10h-14z"/><rect x="5" y="19" width="14" height="2.2" rx="1"/>' },
  diamante: { color: '#5bc8e8', d: '<path d="M12 3l6 5-6 13-6-13z"/><path d="M6 8h12M12 3l-3 5 3 13 3-13z" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="1"/>' },
  siete:    { color: '#e5484d', d: '<path d="M6.5 4h11l-6 17h-4l5.5-13H6.5z"/>' },
  wild:     { color: '#b98bff', d: '<path d="M12 2.5l2.7 6 6.6.6-5 4.4 1.5 6.5-5.8-3.5-5.8 3.5 1.5-6.5-5-4.4 6.6-.6z"/>' },
};

const ESTILOS = `
<style>
  .sl-wrap { padding: 12px 14px 30px; }
  .sl-top { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .sl-volver {
    width: 36px; height: 36px; border-radius: 50%; padding: 0;
    background: transparent; border: 1px solid var(--border); color: var(--text-dim);
    display: flex; align-items: center; justify-content: center; font-size: 17px;
  }
  .sl-titulo { flex: 1; min-width: 0; }
  .sl-titulo strong { display: block; font-size: 16px; font-weight: 600; }
  .sl-titulo span { font-size: 11px; color: var(--text-dim); }

  .sl-maquina {
    background: linear-gradient(160deg, var(--surface) 0%, var(--surface-alt) 100%);
    border: 1px solid var(--border); border-radius: 16px;
    padding: 14px; margin-bottom: 14px;
  }

  .sl-grilla {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
    background: var(--bg); border-radius: 12px; padding: 8px;
    position: relative; overflow: hidden;
  }
  /* La línea de pago es la fila del medio: se marca para que el
     jugador entienda de dónde salen los premios. */
  .sl-grilla::after {
    content: ''; position: absolute; left: 6px; right: 6px; top: 50%;
    height: 1px; background: var(--accent); opacity: 0.25; transform: translateY(-0.5px);
  }
  .sl-celda {
    aspect-ratio: 1; border-radius: 9px;
    background: var(--surface-alt);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  }
  .sl-celda.media { background: var(--surface); box-shadow: inset 0 0 0 1px var(--border); }
  .sl-celda svg { width: 62%; height: 62%; display: block; }
  .sl-celda.girando svg { animation: sl-rodar 0.28s linear infinite; }
  @keyframes sl-rodar {
    0%   { transform: translateY(-115%); opacity: 0.2; }
    50%  { opacity: 1; }
    100% { transform: translateY(115%); opacity: 0.2; }
  }
  .sl-celda.gano { animation: sl-brillo 0.7s ease 2; }
  @keyframes sl-brillo {
    0%, 100% { box-shadow: inset 0 0 0 1px var(--border); }
    50% { box-shadow: inset 0 0 0 2px var(--accent), 0 0 14px var(--accent); }
  }

  .sl-aviso {
    text-align: center; min-height: 26px; margin-top: 10px;
    font-size: 15px; font-weight: 500;
  }
  .sl-aviso.gano { color: var(--success); }
  .sl-aviso.error { color: var(--error); }

  .sl-controles { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
  .sl-apuesta { flex: 1; }
  .sl-apuesta-label { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-dim); }
  .sl-apuesta-row { display: flex; align-items: center; gap: 6px; margin-top: 4px; }
  .sl-apuesta-row button {
    width: 32px; height: 32px; padding: 0; border-radius: 8px;
    background: var(--surface-alt); border: 1px solid var(--border); color: var(--text);
    font-size: 17px; line-height: 1;
  }
  .sl-apuesta-row strong {
    flex: 1; text-align: center; font-size: 16px; font-variant-numeric: tabular-nums;
  }
  .sl-girar {
    width: 84px; height: 84px; border-radius: 50%; flex-shrink: 0;
    font-size: 14px; font-weight: 600; letter-spacing: 0.02em;
  }
  .sl-girar:disabled { opacity: 0.5; }

  .sl-pie { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-dim); margin-top: 12px; }
  .sl-pie strong { color: var(--text); font-variant-numeric: tabular-nums; }

  .sl-pagos { margin-top: 16px; }
  .sl-pagos h4 { margin: 0 0 8px; font-size: 12px; letter-spacing: 0.08em;
                 text-transform: uppercase; color: var(--text-dim); font-weight: 500; }
  .sl-pagos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 7px; }

  .sl-abriendo {
    min-height: 100vh; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px; padding: 24px;
    text-align: center;
  }
  .sl-abriendo p { margin: 0; font-size: 15px; }
  .sl-pago {
    display: flex; align-items: center; gap: 7px;
    background: var(--surface-alt-glass); border-radius: 8px; padding: 7px 9px; font-size: 12px;
  }
  .sl-pago svg { width: 20px; height: 20px; flex-shrink: 0; }
  .sl-pago b { margin-left: auto; font-variant-numeric: tabular-nums; }
</style>
`;

function icono(nombre) {
  const s = SIMBOLOS[nombre] || SIMBOLOS.cereza;
  return `<svg viewBox="0 0 24 24" fill="${s.color}" aria-label="${nombre}">${s.d}</svg>`;
}

/**
 * Pantalla del slot.
 * El navegador nunca decide el resultado: manda la apuesta, recibe la
 * grilla ya resuelta del servidor y la anima.
 */
export function renderSlot(vista, { juego, saldoInicial, pagos, onVolver, onSaldo }) {
  // Juego de otro proveedor: pedimos una URL firmada (así el
  // proveedor sabe quién es el jugador) y recién ahí lo abrimos. Abrir
  // juego.launch_url directo, sin firmar, dejaría al proveedor sin
  // forma de identificar a quién le está mostrando el juego.
  if (juego.launch_url) {
    // Misma pestaña: un solo juego a la vez. Otra pestaña dejaba
    // "Abriendo..." pegado en el lobby y permitía abrir varios.
    vista.innerHTML = `
      ${ESTILOS}
      <div class="sl-abriendo">
        <p class="hint">Abriendo ${escapeHtml(juego.nombre)}...</p>
        <button class="secundario" id="sl-abrir-cancelar">Volver al casino</button>
      </div>
    `;
    let cancelado = false;
    vista.querySelector('#sl-abrir-cancelar').addEventListener('click', () => {
      cancelado = true;
      onVolver();
    });

    playerFetch('/api/player-juego?recurso=lanzar', { method: 'POST', body: { juego: juego.slug } })
      .then(({ ok, data, error }) => {
        if (cancelado) return;
        if (!ok) {
          vista.innerHTML = `
            ${ESTILOS}
            <div class="sl-abriendo">
              <p class="hint error">${error}</p>
              <button class="secundario" id="sl-volver-error">Volver al casino</button>
            </div>
          `;
          vista.querySelector('#sl-volver-error').addEventListener('click', onVolver);
          return;
        }
        sessionStorage.setItem('pt-volver-lobby', '1');
        window.location.assign(data.url);
      });

    return;
  }

  const paso = currency.decimals === 0 ? 1000 : 10;
  let apuesta = Math.max(Number(juego.min_bet), paso);
  let saldo = saldoInicial;
  let girando = false;

  // Grilla inicial, solo decorativa hasta el primer giro
  let grilla = [
    ['corona', 'diamante', 'siete'],
    ['siete', 'wild', 'corona'],
    ['trebol', 'campana', 'limon'],
  ];

  const pintar = ({ ganadoras = [] } = {}) => {
    vista.innerHTML = `
      ${ESTILOS}
      <div class="sl-wrap">
        <div class="sl-top">
          <button class="sl-volver" id="sl-volver" aria-label="Volver">←</button>
          <div class="sl-titulo">
            <strong>${escapeHtml(juego.nombre)}</strong>
            <span>Apuesta ${formatMoney(juego.min_bet)} a ${formatMoney(juego.max_bet)}</span>
          </div>
        </div>

        <div class="sl-maquina">
          <div class="sl-grilla" id="sl-grilla">
            ${grilla.map((fila, f) => fila.map((s, c) => `
              <div class="sl-celda ${f === 1 ? 'media' : ''} ${f === 1 && ganadoras.includes(c) ? 'gano' : ''}"
                   data-col="${c}" data-fila="${f}">
                ${icono(s)}
              </div>
            `).join('')).join('')}
          </div>

          <p class="sl-aviso" id="sl-aviso"></p>

          <div class="sl-controles">
            <div class="sl-apuesta">
              <span class="sl-apuesta-label">Apuesta</span>
              <div class="sl-apuesta-row">
                <button id="sl-menos" aria-label="Bajar apuesta">−</button>
                <strong id="sl-monto">${formatMoney(apuesta)}</strong>
                <button id="sl-mas" aria-label="Subir apuesta">+</button>
              </div>
            </div>
            <button class="sl-girar" id="sl-girar">GIRAR</button>
          </div>

          <div class="sl-pie">
            <span>Saldo <strong id="sl-saldo">${formatMoney(saldo)}</strong></span>
            <span>Línea del medio</span>
          </div>
        </div>

        <div class="sl-pagos">
          <h4>Paga tres iguales</h4>
          <div class="sl-pagos-grid">
            ${Object.entries(pagos?.tres || {})
              .sort((a, b) => b[1] - a[1])
              .map(([s, m]) => `
                <div class="sl-pago">${icono(s)} <b>${m}x</b></div>
              `).join('')}
          </div>
          <p class="hint" style="margin-top:8px">
            El comodín reemplaza a cualquier símbolo. Dos iguales de los altos también pagan.
          </p>
        </div>
      </div>
    `;

    vista.querySelector('#sl-volver').addEventListener('click', onVolver);
    vista.querySelector('#sl-menos').addEventListener('click', () => cambiarApuesta(-paso));
    vista.querySelector('#sl-mas').addEventListener('click', () => cambiarApuesta(paso));
    vista.querySelector('#sl-girar').addEventListener('click', girarAhora);
  };

  const cambiarApuesta = (delta) => {
    if (girando) return;
    const nueva = apuesta + delta;
    if (nueva < Number(juego.min_bet) || nueva > Number(juego.max_bet)) return;
    apuesta = nueva;
    vista.querySelector('#sl-monto').textContent = formatMoney(apuesta);
  };

  const girarAhora = async () => {
    if (girando) return;

    const avisoEl = vista.querySelector('#sl-aviso');
    const btn = vista.querySelector('#sl-girar');
    const celdas = [...vista.querySelectorAll('.sl-celda')];

    if (saldo < apuesta) {
      avisoEl.className = 'sl-aviso error';
      avisoEl.textContent = 'Saldo insuficiente';
      return;
    }

    girando = true;
    btn.disabled = true;
    avisoEl.className = 'sl-aviso';
    avisoEl.textContent = '';
    celdas.forEach((c) => c.classList.add('girando'));

    // Identificador único de este giro. Si la respuesta se pierde y el
    // jugador reintenta, el servidor reconoce el id y devuelve el mismo
    // resultado en vez de cobrarle dos veces.
    const clientId = crypto.randomUUID();

    const pedido = playerFetch('/api/player-juego', {
      method: 'POST',
      body: { juego: juego.slug, apuesta, clientId },
    });

    // Los rodillos giran un mínimo aunque el servidor conteste al
    // instante: sin esa pausa no se percibe como una máquina.
    const [res] = await Promise.all([pedido, esperar(700)]);

    if (!res.ok) {
      celdas.forEach((c) => c.classList.remove('girando'));
      girando = false;
      btn.disabled = false;

      if (res.expirado) { window.location.reload(); return; }

      avisoEl.className = 'sl-aviso error';
      avisoEl.textContent = res.error;
      return;
    }

    grilla = res.data.grilla;
    saldo = res.data.saldo;

    // Los rodillos frenan de a uno, de izquierda a derecha
    for (let col = 0; col < 3; col++) {
      await esperar(220);
      celdas
        .filter((c) => Number(c.dataset.col) === col)
        .forEach((c, i) => {
          c.classList.remove('girando');
          c.innerHTML = icono(grilla[i][col]);
        });
    }

    girando = false;
    btn.disabled = false;

    vista.querySelector('#sl-saldo').textContent = formatMoney(saldo);
    onSaldo?.(saldo);

    if (res.data.premio > 0) {
      avisoEl.className = 'sl-aviso gano';
      avisoEl.textContent = `Ganaste ${formatMoney(res.data.premio)}`;

      const cuantas = res.data.tipo === 'tres' ? 3 : 2;
      vista.querySelectorAll('.sl-celda[data-fila="1"]').forEach((c, i) => {
        if (i < cuantas) c.classList.add('gano');
      });
    }
  };

  pintar();
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
