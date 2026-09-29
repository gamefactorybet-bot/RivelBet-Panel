import { formatMoney, currency } from '../lib/currency.ts';
import { playerFetch } from './api.ts';
import { subirComprobante } from './cloudinary.js';
import { urlBanner } from '../lib/imgUrl.js';
import { ICONOS } from './iconos.js';

// Montos sugeridos según la moneda: en guaraníes nadie carga 500.
const RAPIDOS = currency.decimals === 0
  ? [50000, 100000, 200000, 500000]
  : [500, 1000, 5000, 10000];

/**
 * Hoja de recarga: el jugador elige a qué cuenta transfiere, copia los
 * datos, transfiere por su banco y deja el aviso con el monto.
 * El saldo se acredita recién cuando un cajero confirma que llegó.
 */
export async function abrirRecarga(onCerrar, onEnviado, cajeroWhatsapp, opts = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'pt-sheet-fondo';
  fondo.innerHTML = `<div class="pt-sheet"><p class="hint">Cargando cuentas...</p></div>`;
  document.body.appendChild(fondo);

  const cerrar = () => {
    fondo.remove();
    onCerrar?.();
  };

  fondo.addEventListener('click', (e) => {
    if (e.target === fondo) cerrar();
  });

  if (opts.pendienteCarga) {
    const sheet = fondo.querySelector('.pt-sheet');
    sheet.innerHTML = `
      <div class="pt-sheet-head"><h3>Recargar</h3><button class="pt-cerrar">×</button></div>
      <div class="pt-pendiente" style="margin:0">
        <strong>${formatMoney(opts.pendienteCarga.amount)}</strong>
        Ya tenés una carga pendiente. Esperá a que un cajero la confirme; no se puede cancelar ni pedir otra.
      </div>
    `;
    sheet.querySelector('.pt-cerrar').addEventListener('click', cerrar);
    return;
  }

  const [{ ok, data, error }, ofRes] = await Promise.all([
    playerFetch('/api/player-caja?recurso=cuentas'),
    playerFetch('/api/player-caja?recurso=ofertas'),
  ]);
  const ofertas = (ofRes.ok && Array.isArray(ofRes.data.ofertas) ? ofRes.data.ofertas : []) || [];
  const sheet = fondo.querySelector('.pt-sheet');

  if (!ok) {
    sheet.innerHTML = `
      <div class="pt-sheet-head"><h3>Recargar</h3><button class="pt-cerrar">×</button></div>
      <p class="hint error">${error}</p>
    `;
    sheet.querySelector('.pt-cerrar').addEventListener('click', cerrar);
    return;
  }

  const cuentas = data.cuentas || [];

  if (!cuentas.length) {
    // Puede ser que no haya ninguna cuenta activa, o que todas hayan
    // llegado a su techo del período.
    sheet.innerHTML = `
      <div class="pt-sheet-head"><h3>Recargar</h3><button class="pt-cerrar">×</button></div>
      <p class="pt-vacio">
        ${data.sinDisponibles
          ? 'No hay cuentas disponibles en este momento.<br>Probá más tarde o escribile a tu cajero.'
          : 'No hay cuentas cargadas.<br>Consultá con tu cajero.'}
      </p>
      ${cajeroWhatsapp ? `<p style="text-align:center;margin-top:12px"><a class="login-submit" href="${cajeroWhatsapp.url}" target="_blank" rel="noopener noreferrer">Escribir a ${escapeHtml(cajeroWhatsapp.nombre)}</a></p>` : ''}
    `;
    sheet.querySelector('.pt-cerrar').addEventListener('click', cerrar);
    return;
  }

  let seleccionada = 0;
  let comprobante = null;
  let promoCodigo = '';
  let montoActual = '';
  let ofertaId = null;

  const pintar = () => {
    const c = cuentas[seleccionada];

    sheet.innerHTML = `
      <div class="pt-sheet-head">
        <h3>Recargar</h3>
        <button class="pt-cerrar">×</button>
      </div>

      ${htmlOfertas(ofertas, ofertaId)}

      <p class="hint" style="margin-top:0">
        ${cuentas.length > 1
          ? 'Transferí a la cuenta y después avisanos el monto.'
          : 'Transferí a esta cuenta y después avisanos el monto.'}
      </p>
      ${cajeroWhatsapp ? `<p class="hint"><a href="${cajeroWhatsapp.url}" target="_blank" rel="noopener noreferrer">¿Dudas? Escribile a ${escapeHtml(cajeroWhatsapp.nombre)} por WhatsApp</a></p>` : ''}

      ${cuentas.length > 1 ? `
        <div class="pt-cuenta-tabs">
          ${cuentas.map((cta, i) => `
            <button class="pt-cuenta-tab ${i === seleccionada ? 'is-active' : ''}" data-i="${i}">
              ${escapeHtml(cta.banco)}
            </button>
          `).join('')}
        </div>
      ` : ''}

      ${dato('Banco', c.banco, false)}
      ${dato('Titular', c.titular, true)}
      ${dato('Número de cuenta', c.numero_cuenta, true)}
      ${c.alias ? dato('Alias', c.alias, true) : ''}
      ${c.documento ? dato(c.documento_tipo || 'Documento', c.documento, true) : ''}

      <h3 style="font-size:14px;margin:20px 0 8px">¿Cuánto transferiste?</h3>
      <input id="pt-monto" class="pt-monto-input" type="number" inputmode="numeric"
             placeholder="0" step="${currency.decimals ? '0.01' : '1'}" value="${escapeHtml(montoActual)}" />

      <div class="pt-rapidos">
        ${RAPIDOS.map((m) => `<button class="pt-rapido" data-monto="${m}">${formatMoney(m)}</button>`).join('')}
      </div>

      <input id="pt-promo" class="pt-monto-input" style="margin-top:10px;letter-spacing:0.06em;text-transform:uppercase;font-size:15px"
             placeholder="Código promocional (opcional)" autocapitalize="characters" autocomplete="off"
             value="${escapeHtml(promoCodigo)}" ${ofertaId ? 'disabled' : ''} />
      <div id="pt-bono"></div>

      <h3 style="font-size:14px;margin:18px 0 8px">Comprobante</h3>
      <div id="pt-comp">
        ${comprobante ? `
          <div class="pt-comp-ok">
            <img src="${comprobante.url}" alt="" class="pt-comp-thumb" draggable="false" onerror="this.style.display='none'" />
            <div style="flex:1">
              <div class="pt-dato-valor" style="font-size:13px">Comprobante adjunto</div>
              <div class="pt-dato-label">Listo para enviar</div>
            </div>
            <button class="pt-copy" id="pt-quitar-comp">Quitar</button>
          </div>
        ` : `
          <label class="pt-comp-drop">
            <input type="file" id="pt-file" accept="image/*,application/pdf" hidden />
            <span class="icono">${ICONOS.adjuntar}</span>
            <span>Adjuntar comprobante</span>
            <small>Foto o PDF, hasta 8 MB</small>
          </label>
        `}
        <div id="pt-progreso"></div>
      </div>

      <button id="pt-enviar" class="pt-enviar">Avisar transferencia</button>
      <p id="pt-msg" class="hint" style="text-align:center;margin-top:10px"></p>
    `;

    sheet.querySelector('.pt-cerrar').addEventListener('click', cerrar);

    sheet.querySelectorAll('.pt-oferta').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const of = ofertas.find((o) => o.id === id);
        if (!of?.disponible) return;
        if (ofertaId === id) ofertaId = null;
        else {
          ofertaId = id;
          promoCodigo = '';
          if (!Number(montoActual) || Number(montoActual) < Number(of.monto_min)) {
            montoActual = String(Math.round(Number(of.monto_min)));
          }
        }
        pintar();
      });
    });
    const pistaOf = sheet.querySelector('#pt-ofertas-pista');
    if (pistaOf) {
      const vids = [...pistaOf.querySelectorAll('video[data-src]')];
      const playVisibles = () => {
        vids.forEach((v) => {
          const r = v.getBoundingClientRect();
          const box = pistaOf.getBoundingClientRect();
          const on = r.left < box.right - 40 && r.right > box.left + 40;
          if (on) {
            if (!v.getAttribute('src')) v.src = v.dataset.src;
            v.play().catch(() => {});
          } else v.pause();
        });
      };
      pistaOf.addEventListener('scroll', playVisibles, { passive: true });
      playVisibles();
    }

    sheet.querySelectorAll('.pt-cuenta-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        seleccionada = Number(btn.dataset.i);
        pintar();
      });
    });

    // Copiar al portapapeles, con confirmación visual en el mismo botón
    sheet.querySelectorAll('.pt-copy').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const valor = btn.dataset.valor;
        try {
          await navigator.clipboard.writeText(valor);
        } catch {
          // Safari sin permiso de portapapeles: seleccionamos el texto
          // para que al menos pueda copiarlo a mano.
          const rango = document.createRange();
          rango.selectNodeContents(btn.previousElementSibling.querySelector('.pt-dato-valor'));
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(rango);
        }
        btn.textContent = 'Copiado';
        btn.classList.add('copiado');
        setTimeout(() => {
          btn.textContent = 'Copiar';
          btn.classList.remove('copiado');
        }, 1600);
      });
    });

    const inputMonto = sheet.querySelector('#pt-monto');
    const inputPromo = sheet.querySelector('#pt-promo');
    const bonoEl = sheet.querySelector('#pt-bono');
    const ofertaSel = ofertas.find((o) => o.id === ofertaId);

    // Consultamos el bono mientras escribe, con una pausa para no
    // pegarle a la API en cada tecla.
    let relojBono;
    const verBono = () => {
      clearTimeout(relojBono);
      const monto = Number(inputMonto.value);
      montoActual = inputMonto.value;
      promoCodigo = inputPromo ? inputPromo.value.trim().toUpperCase() : '';

      if (ofertaSel) {
        const extra = ofertaSel.bono_tipo === 'porcentaje'
          ? (monto > 0 ? Math.round(monto * Number(ofertaSel.bono_valor) / 100) : 0)
          : Number(ofertaSel.bono_valor);
        const corto = monto > 0 && monto < Number(ofertaSel.monto_min);
        bonoEl.innerHTML = `
          <div class="pt-bono ${corto ? 'pt-bono-warn' : ''}">
            <div class="pt-bono-head">
              <span class="pt-bono-nombre">${escapeHtml(ofertaSel.titulo || ofertaSel.nombre)}</span>
              <strong>+${formatMoney(extra)}</strong>
            </div>
            <div class="pt-bono-total">
              <span>${corto ? `Esta oferta pide ${formatMoney(ofertaSel.monto_min)}` : (Number(ofertaSel.rollover) ? `Rollover ${ofertaSel.rollover}×` : 'Sin rollover')}</span>
              <strong>${corto ? '' : formatMoney((monto || 0) + extra)}</strong>
            </div>
          </div>
        `;
        return;
      }

      if (!monto || monto <= 0) {
        bonoEl.innerHTML = '';
        return;
      }

      relojBono = setTimeout(async () => {
        const q = `/api/player-caja?recurso=bono&monto=${monto}${promoCodigo ? `&codigo=${encodeURIComponent(promoCodigo)}` : ''}`;
        const res = await playerFetch(q);

        if (res.ok && res.data.codigoInvalido) {
          bonoEl.innerHTML = `<p class="hint error" style="margin:8px 0 0">El código "${escapeHtml(promoCodigo)}" no aplica a este monto.</p>`;
          return;
        }
        if (!res.ok || !res.data.bono) {
          bonoEl.innerHTML = '';
          return;
        }

        const b = res.data.bono;
        bonoEl.innerHTML = `
          <div class="pt-bono">
            <div class="pt-bono-head">
              <span class="pt-bono-nombre">${escapeHtml(b.nombre)}</span>
              <strong>+${formatMoney(b.monto)}</strong>
            </div>
            <div class="pt-bono-total">
              <span>Vas a recibir</span>
              <strong>${formatMoney(b.total)}</strong>
            </div>
          </div>
        `;
      }, 350);
    };

    inputMonto.addEventListener('input', verBono);
    inputPromo.addEventListener('input', verBono);

    sheet.querySelectorAll('.pt-rapido').forEach((btn) => {
      btn.addEventListener('click', () => {
        inputMonto.value = btn.dataset.monto;
        montoActual = inputMonto.value;
        inputMonto.focus();
        verBono();
      });
    });

    verBono();

    const inputFile = sheet.querySelector('#pt-file');
    if (inputFile) {
      inputFile.addEventListener('change', async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;

        const progresoEl = sheet.querySelector('#pt-progreso');
        progresoEl.innerHTML = '<div class="pt-barra"><span style="width:0%"></span></div><p class="hint" style="text-align:center;margin:6px 0 0">Subiendo...</p>';
        const barra = progresoEl.querySelector('span');

        try {
          comprobante = await subirComprobante(archivo, (pct) => {
            barra.style.width = pct + '%';
          });
          pintar();
        } catch (err) {
          progresoEl.innerHTML = `<p class="hint error" style="text-align:center">${err.message}</p>`;
        }
      });
    }

    const btnQuitar = sheet.querySelector('#pt-quitar-comp');
    if (btnQuitar) {
      btnQuitar.addEventListener('click', () => {
        comprobante = null;
        pintar();
      });
    }

    sheet.querySelector('#pt-enviar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const msgEl = sheet.querySelector('#pt-msg');
      const monto = Number(inputMonto.value);

      montoActual = inputMonto.value;
      if (!monto || monto <= 0) {
        msgEl.className = 'hint error';
        msgEl.textContent = 'Ingresá el monto que transferiste.';
        inputMonto.focus();
        return;
      }
      if (ofertaSel && monto < Number(ofertaSel.monto_min)) {
        msgEl.className = 'hint error';
        msgEl.textContent = `Con esta oferta tenés que cargar ${formatMoney(ofertaSel.monto_min)} o más, o deseleccionala.`;
        inputMonto.focus();
        return;
      }

      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Enviando...';

      const res = await playerFetch('/api/player-caja?recurso=deposito', {
        method: 'POST',
        body: {
          amount: monto,
          accountId: c.id,
          comprobanteUrl: comprobante?.url,
          comprobantePublicId: comprobante?.publicId,
          promoCodigo: ofertaId ? null : ((inputPromo?.value.trim().toUpperCase()) || null),
          ofertaId: ofertaId || null,
        },
      });

      btn.disabled = false;

      if (!res.ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = res.error;
        return;
      }

      fondo.remove();
      onEnviado?.();
    });
  };

  pintar();
}

function textoEspera(segundos) {
  const s = Math.max(0, Number(segundos) || 0);
  const h = Math.floor(s / 3600);
  const m = Math.ceil((s % 3600) / 60);
  if (h >= 1 && m > 0 && m < 60) return `Disponible en ${h} h ${m} min`;
  if (h >= 1) return `Disponible en ${h} h`;
  return `Disponible en ${Math.max(1, m)} min`;
}

function htmlOfertas(ofertas, ofertaId) {
  if (!ofertas.length) return '';
  return `
    <div class="pt-ofertas">
      <div class="pt-ofertas-pista" id="pt-ofertas-pista">
        ${ofertas.map((o) => {
          const on = o.id === ofertaId;
          const espera = Number(o.espera_segundos) || 0;
          const minTxt = espera > 0
            ? textoEspera(espera)
            : `Obtener · desde ${formatMoney(o.monto_min)}`;
          return `
            <div class="pt-oferta ${on ? 'is-on' : ''} ${o.disponible ? '' : 'is-off'}" data-id="${o.id}">
              ${o.video_url
                ? `<video data-src="${escapeHtml(o.video_url)}" muted loop playsinline></video>`
                : (o.imagen_url ? `<img src="${urlBanner(o.imagen_url)}" alt="" draggable="false" />` : '<div class="pt-oferta-fondo"></div>')}
              <div class="pt-oferta-txt">
                <strong>${escapeHtml(o.titulo || o.nombre)}</strong>
                ${o.subtitulo ? `<span>${escapeHtml(o.subtitulo)}</span>` : ''}
              </div>
              <span class="pt-oferta-cta">${on ? 'Elegida' : minTxt}</span>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function dato(label, valor, copiable) {
  return `
    <div class="pt-dato">
      <div class="pt-dato-txt">
        <div class="pt-dato-label">${escapeHtml(label)}</div>
        <div class="pt-dato-valor">${escapeHtml(valor)}</div>
      </div>
      ${copiable ? `<button class="pt-copy" data-valor="${escapeHtml(valor)}">Copiar</button>` : ''}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
