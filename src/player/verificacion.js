import { formatMoney } from '../lib/currency.ts';
import { playerFetch } from './api.ts';
import { subirComprobante } from './cloudinary.js';

const SLOTS = [
  { key: 'frente', label: 'Frente del documento' },
  { key: 'dorso', label: 'Dorso del documento' },
  { key: 'persona', label: 'Foto tuya con el documento' },
];

/**
 * Hoja de verificación de identidad. Cuatro estados, una sola pantalla:
 *  - sin_verificar / rechazado -> subir las 3 fotos
 *  - pendiente -> "en revisión"
 *  - verificado -> "listo, ya podés jugar"
 *
 * `estado` es el PlayerEstado que ya tiene el portal.
 * `onCambio()` refresca el portal después de enviar.
 */
export function abrirVerificacion(estado, onCambio) {
  const player = estado.player;
  const verif = estado.verificacion;
  const bono = Number(estado.bonoRegistro || player.bono_por_descontar || 0);
  const estadoVer = player.estado_verificacion || 'sin_verificar';

  const fondo = document.createElement('div');
  fondo.className = 'pt-sheet-fondo';
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });

  if (estadoVer === 'verificado') {
    pintarSimple({
      pill: ['ok', 'Verificado'],
      titulo: '¡Listo! Ya podés jugar',
      cuerpo: bono > 0
        ? `Tu cuenta está verificada. Para retirar lo que ganes con el bono, hacé una carga de al menos ${formatMoney(bono)}.`
        : 'Tu cuenta está verificada.',
    });
    return;
  }

  if (estadoVer === 'pendiente') {
    pintarSimple({
      pill: ['wait', 'En revisión'],
      titulo: 'Estamos revisando tus fotos',
      cuerpo: 'Te avisamos acá cuando esté listo. Mientras tanto podés mirar el catálogo; vas a poder jugar apenas se verifique tu cuenta.',
      pie: verif?.created_at ? `Enviado ${fechaHora(verif.created_at)}.` : '',
    });
    return;
  }

  // sin_verificar | rechazado -> formulario de subida
  const subidas = {}; // key -> { url, publicId }

  const render = () => {
    const listas = SLOTS.every((s) => subidas[s.key]);
    fondo.innerHTML = `
      <div class="pt-sheet">
        <div class="pt-sheet-head">
          <h3>Verificá tu identidad</h3>
          <button class="pt-cerrar" type="button">×</button>
        </div>

        ${estadoVer === 'rechazado' && verif?.motivo ? `
          <div class="ver-motivo">
            <strong>No pudimos verificar tu identidad</strong>
            ${escapeHtml(verif.motivo)}
          </div>
        ` : `
          <p class="hint" style="margin-top:0">
            ${bono > 0 ? `Ya tenés ${formatMoney(bono)} en tu saldo. ` : ''}Subí las tres fotos para poder jugar. Un operador las revisa en unos minutos.
          </p>
        `}

        <label class="pt-seccion-label">Tipo de documento</label>
        <select id="ver-tipo" class="pt-field-select">
          <option value="ci">Cédula de identidad</option>
          <option value="pasaporte">Pasaporte</option>
          <option value="dni">DNI</option>
          <option value="otro">Otro</option>
        </select>

        <div class="ver-slots">
          ${SLOTS.map((s) => `
            <div class="ver-slot ${subidas[s.key] ? 'is-ok' : ''}" data-key="${s.key}">
              <input type="file" accept="image/*,application/pdf" hidden />
              <div class="ver-slot-ico"></div>
              <span>${s.label}</span>
              <div class="ver-slot-estado" data-estado></div>
            </div>
          `).join('')}
        </div>

        <p class="pt-fineprint">Buena luz, sin recortar los bordes. Foto o PDF, hasta 8 MB cada una.</p>

        <button id="ver-enviar" class="pt-enviar" ${listas ? '' : 'disabled'}>
          ${estadoVer === 'rechazado' ? 'Reenviar para revisión' : 'Enviar para revisión'}
        </button>
        <p id="ver-msg" class="hint" style="text-align:center;margin-top:10px"></p>
      </div>
    `;

    fondo.querySelector('.pt-cerrar').addEventListener('click', cerrar);

    fondo.querySelectorAll('.ver-slot').forEach((slot) => {
      const key = slot.dataset.key;
      const input = slot.querySelector('input');
      const estadoEl = slot.querySelector('[data-estado]');

      slot.addEventListener('click', () => { if (!slot.classList.contains('subiendo')) input.click(); });

      input.addEventListener('change', async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;

        slot.classList.add('subiendo');
        estadoEl.textContent = '0%';

        try {
          subidas[key] = await subirComprobante(archivo, (pct) => { estadoEl.textContent = pct + '%'; }, 'verificacion');
          render();
        } catch (err) {
          slot.classList.remove('subiendo');
          estadoEl.textContent = '';
          const msg = fondo.querySelector('#ver-msg');
          msg.className = 'hint error';
          msg.textContent = err.message;
        }
      });
    });

    fondo.querySelector('#ver-enviar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const msg = fondo.querySelector('#ver-msg');

      btn.disabled = true;
      msg.className = 'hint';
      msg.textContent = 'Enviando...';

      const { ok, error } = await playerFetch('/api/player-caja?recurso=verificacion', {
        method: 'POST',
        body: {
          docTipo: fondo.querySelector('#ver-tipo').value,
          urlFrente: subidas.frente.url,
          urlDorso: subidas.dorso.url,
          urlPersona: subidas.persona.url,
        },
      });

      if (!ok) {
        btn.disabled = false;
        msg.className = 'hint error';
        msg.textContent = error;
        return;
      }

      cerrar();
      onCambio?.();
    });
  };

  render();

  function pintarSimple({ pill, titulo, cuerpo, pie }) {
    fondo.innerHTML = `
      <div class="pt-sheet">
        <div class="pt-sheet-head">
          <h3>Verificación</h3>
          <button class="pt-cerrar" type="button">×</button>
        </div>
        <span class="ver-pill ${pill[0]}">${pill[1]}</span>
        <h3 style="margin:10px 0 6px;font-size:17px">${escapeHtml(titulo)}</h3>
        <p class="hint" style="line-height:1.55">${escapeHtml(cuerpo)}</p>
        ${pie ? `<p class="pt-fineprint">${escapeHtml(pie)}</p>` : ''}
        <button class="pt-enviar" id="ver-ok" style="margin-top:14px">Entendido</button>
      </div>
    `;
    fondo.querySelector('.pt-cerrar').addEventListener('click', cerrar);
    fondo.querySelector('#ver-ok').addEventListener('click', cerrar);
  }
}

function fechaHora(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
