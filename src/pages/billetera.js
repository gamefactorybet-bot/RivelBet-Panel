import { apiFetch } from '../lib/api.ts';
import { currency } from '../lib/currency.ts';
import { puede } from '../lib/perfiles.js';

// Interruptor maestro de la billetera. Apagado (default): un solo saldo,
// todo retirable, candado de primera carga como está. Encendido: cada
// bono tiene su rollover, el bono es "pegajoso" y se libera apostándolo,
// y hay opción de retener las ganancias del bono. Ver la maqueta que se
// validó antes de implementar esto para entender el modelo.

const ESTILOS = `
  <style>
    .bi-toggle { display:flex; gap:11px; align-items:flex-start; padding:13px 14px; border:1px solid var(--border-glass);
      border-radius:10px; background:var(--surface-alt-glass); margin-bottom:10px; }
    .bi-toggle input { margin-top:3px; width:15px; height:15px; flex-shrink:0; accent-color:var(--accent); }
    .bi-toggle .t b { display:block; font-size:13px; margin-bottom:2px; }
    .bi-toggle .t span { font-size:12px; color:var(--text-faint); }
    .bi-num { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px 16px; margin:12px 0; }
    .bi-num label { display:block; font-size:10.5px; letter-spacing:0.03em; text-transform:uppercase; color:var(--text-dim); margin-bottom:5px; font-weight:500; }
    .bi-num input { width:100%; background:var(--surface-alt-glass); border:1px solid var(--border-glass); color:var(--text);
      border-radius:8px; padding:9px 11px; font-size:13px; font-family:ui-monospace,monospace; }
    .bi-num .hint { margin-top:4px; }
    .bi-dim { opacity:0.45; pointer-events:none; }
    .bi-modo { font-size:11px; font-weight:700; letter-spacing:0.04em; border-radius:999px; padding:2px 10px; }
    .bi-modo.on { color:var(--success); border:1px solid color-mix(in srgb,var(--success) 40%,transparent); }
    .bi-modo.off { color:var(--text-dim); border:1px solid var(--border); }
  </style>
`;

export function renderBilletera(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Billetera</h2>
      <p class="hint">
        Con el <b>modo avanzado</b> apagado la billetera funciona como siempre: un
        solo saldo, todo retirable, candado de primera carga como está. Al
        encenderlo, cada tipo de bono se rige por su <b>rollover</b> (se configura
        en su propia pantalla), el bono es "pegajoso" hasta que se juega, y si el
        jugador retira antes de cumplirlo pierde solo el bono pendiente — nunca su
        carga ni sus ganancias.
      </p>
      <div id="bi-cfg"><p class="hint">Cargando...</p></div>
    </section>
  `;

  cargar();

  async function cargar() {
    const el = container.querySelector('#bi-cfg');
    const { ok, data, error } = await apiFetch('/api/config?recurso=billetera');
    if (!ok) { el.innerHTML = `<p class="hint error">${error}</p>`; return; }

    const dis = puedeEditar ? '' : 'disabled';
    const avanzado = Boolean(data.modo_avanzado);

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <span class="bi-modo ${avanzado ? 'on' : 'off'}" id="bi-estado">${avanzado ? 'Modo avanzado activo' : 'Modo simple (como hoy)'}</span>
      </div>

      <label class="bi-toggle">
        <input type="checkbox" id="bi-avanzado" ${data.modo_avanzado ? 'checked' : ''} ${dis} />
        <span class="t">
          <b>Modo avanzado (rollover y bono pegajoso)</b>
          <span>Afecta solo a los créditos nuevos. Un bono ya otorgado termina con las reglas con las que nació.</span>
        </span>
      </label>

      <div id="bi-avanzado-bloque" class="${avanzado ? '' : 'bi-dim'}">
        <label class="bi-toggle">
          <input type="checkbox" id="bi-retener" ${data.retener_ganancias ? 'checked' : ''} ${dis} />
          <span class="t">
            <b>Retener las ganancias del bono hasta cumplir el rollover</b>
            <span>Apagado: lo ganado con el bono es retirable al instante. Encendido: queda retenido; si el jugador retira antes, pierde el bono y esas ganancias (nunca su carga).</span>
          </span>
        </label>

        <label class="bi-toggle">
          <input type="checkbox" id="bi-candado" ${data.candado_primera_carga ? 'checked' : ''} ${dis} />
          <span class="t">
            <b>Candado de primera carga</b>
            <span>El jugador no retira nada hasta hacer una carga aprobada ≥ el bono de registro. Se puede dejar junto al rollover o apagar y confiar solo en él.</span>
          </span>
        </label>

        <div class="bi-num">
          <div>
            <label>Rollover del depósito real (×)</label>
            <input id="bi-ro-carga" type="number" min="0" step="0.5" value="${data.rollover_carga}" ${dis} />
            <div class="hint">0 = el depósito real nunca traba el retiro (recomendado).</div>
          </div>
          <div>
            <label>Apuesta máxima con bono activo (${currency.symbol})</label>
            <input id="bi-max-bono" type="number" min="0" step="100" value="${data.apuesta_max_bono}" ${dis} />
            <div class="hint">0 = sin tope. Frena el farmeo de varianza en una sola apuesta grande.</div>
          </div>
          <div>
            <label>Tope de conversión — ×N del bono (global)</label>
            <input id="bi-topeconv" type="number" min="0" step="0.5" value="${data.tope_conversion_mult ?? 0}" ${dis} />
            <div class="hint">Por más que el jugador gane jugando el bono, se lleva a saldo real como máximo ×N el bono; el resto se descarta al liberar. 0 = sin tope. Cada bono puede tener su propio valor.</div>
          </div>
        </div>
      </div>

      ${puedeEditar ? `<div class="acciones"><button id="bi-guardar">Guardar</button></div><p id="bi-msg" class="hint"></p>` : ''}

      <div style="border-top:1px solid var(--border-glass);margin-top:18px;padding-top:16px">
        <h3 style="margin:0 0 4px;font-size:14px">Probador de bono</h3>
        <p class="hint" style="margin-top:0">Qué te cuesta un bono según su monto y rollover, contra un cazador y contra un jugador normal. No guarda nada.</p>
        <div class="bi-num">
          <div><label>Monto del bono (${currency.symbol})</label><input id="pb-monto" type="number" min="0" value="5000" /></div>
          <div><label>Rollover (×)</label><input id="pb-roll" type="number" min="0" step="0.5" value="1" /></div>
          <div><label>RTP del juego (%)</label><input id="pb-rtp" type="number" min="80" max="99" step="0.5" value="94" /></div>
        </div>
        <div id="pb-out" style="margin-top:10px"></div>
      </div>
    `;

    // --- probador (siempre visible) ---
    const retener = Boolean(data.retener_ganancias);
    const probar = () => {
      const monto = Number(el.querySelector('#pb-monto').value) || 0;
      const roll = Number(el.querySelector('#pb-roll').value) || 0;
      const rtp = (Number(el.querySelector('#pb-rtp').value) || 0) / 100;
      const h = 1 - rtp;
      // factor = fracción del bono que el casino espera pagarle a un cazador
      const factor = retener ? Math.max(0, 1 - roll * h) : rtp;
      const costoCazador = Math.round(monto * factor);
      // jugador normal: juega el bono ~1× y algo más, el forfeit no aplica
      const costoNormal = Math.round(monto * Math.min(1, rtp));
      let estado, color;
      if (factor >= 0.55) { estado = 'Filtra plata'; color = 'var(--error)'; }
      else if (factor >= 0.2) { estado = 'Caro pero acotado'; color = 'var(--accent)'; }
      else if (factor >= 0.03) { estado = 'Contenido'; color = 'var(--success)'; }
      else { estado = 'Bono neutralizado'; color = 'var(--success)'; }
      const neutraliza = h > 0 ? Math.ceil(1 / h) : '∞';
      el.querySelector('#pb-out').innerHTML = `
        <p style="margin:0 0 6px"><span class="bi-modo" style="color:${color};border:1px solid ${color}">${estado}</span></p>
        <p class="hint" style="margin:0">
          Contra un <b>cazador</b>: ~<b style="color:var(--text)">${formatMoney(costoCazador)}</b> ·
          contra un <b>jugador normal</b>: ~<b style="color:var(--text)">${formatMoney(costoNormal)}</b>.
        </p>
        <p class="hint" style="margin:4px 0 0;font-family:ui-monospace,monospace">
          ${retener
            ? `costo ≈ ${formatMoney(monto)} × max(0, 1 − ${roll} × ${(h * 100).toFixed(1)}%) — rollover que lo neutraliza: ${neutraliza}×`
            : `costo ≈ ${formatMoney(monto)} × RTP — con "ganancias libres" el rollover casi no cambia esto; prendé la retención o bajá el monto`}
        </p>
      `;
    };
    ['#pb-monto', '#pb-roll', '#pb-rtp'].forEach((s) => el.querySelector(s).addEventListener('input', probar));
    probar();

    if (!puedeEditar) return;

    const bloque = el.querySelector('#bi-avanzado-bloque');
    el.querySelector('#bi-avanzado').addEventListener('change', (e) => {
      bloque.classList.toggle('bi-dim', !e.currentTarget.checked);
    });

    el.querySelector('#bi-guardar').addEventListener('click', async (e) => {
      const msg = el.querySelector('#bi-msg');
      e.currentTarget.disabled = true;
      msg.className = 'hint'; msg.textContent = 'Guardando...';
      const r = await apiFetch('/api/config?recurso=billetera&accion=config', {
        method: 'POST',
        body: {
          modoAvanzado: el.querySelector('#bi-avanzado').checked,
          retenerGanancias: el.querySelector('#bi-retener').checked,
          candadoPrimeraCarga: el.querySelector('#bi-candado').checked,
          rolloverCarga: Number(el.querySelector('#bi-ro-carga').value) || 0,
          apuestaMaxBono: Number(el.querySelector('#bi-max-bono').value) || 0,
          topeConversionMult: Number(el.querySelector('#bi-topeconv').value) || 0,
        },
      });
      e.currentTarget.disabled = false;
      msg.className = r.ok ? 'hint ok' : 'hint error';
      msg.textContent = r.ok ? 'Guardado.' : r.error;
      if (r.ok) cargar();
    });
  }
}
