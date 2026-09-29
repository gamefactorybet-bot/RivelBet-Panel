import { formatMoney } from '../lib/currency.ts';
import { playerFetch } from './api.ts';

const ALIAS_TIPOS = {
  ci: { corto: 'CI', label: 'Número de CI' },
  telefono: { corto: 'Teléfono', label: 'Número de teléfono' },
  correo: { corto: 'Correo', label: 'Correo electrónico' },
  ruc: { corto: 'RUC', label: 'RUC' },
};

/**
 * Hoja para cobrar el cashback: en fichas (al instante) o pedir
 * retiro (solicitud que revisa un operador).
 * `estado` es el PlayerEstado; `estado.cashback` trae el disponible.
 */
export function abrirCashback(estado, onCambio) {
  const cb = estado.cashback;
  if (!cb) return;

  const fondo = document.createElement('div');
  fondo.className = 'pt-sheet-fondo';
  document.body.appendChild(fondo);

  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });

  const rango = `${fecha(cb.periodo_inicio)} y ${fecha(cb.periodo_fin)}`;

  const elegir = () => {
    fondo.innerHTML = `
      <div class="pt-sheet">
        <div class="pt-sheet-head">
          <h3>Tu cashback</h3>
          <button class="pt-cerrar" type="button">×</button>
        </div>
        <div class="cb-hero">
          <span>De lo que perdiste entre ${rango}</span>
          <strong>${formatMoney(cb.monto)}</strong>
        </div>
        <button id="cb-fichas" class="pt-enviar">Cobrar en fichas</button>
        <button id="cb-retiro" class="pt-enviar secundario" style="margin-top:8px"
                ${Number(estado.retiroEspera?.segundosRestantes || 0) > 0 ? 'disabled' : ''}>Pedir retiro</button>
        <p class="pt-fineprint">
          "Cobrar en fichas" lo acredita al instante a tu saldo. "Pedir retiro" arma una
          solicitud que revisa un operador.
          ${Number(estado.retiroEspera?.segundosRestantes || 0) > 0
            ? ' El retiro en efectivo está en espera por tu nivel VIP; cobrá en fichas o esperá.'
            : ''}
        </p>
        <p id="cb-msg" class="hint" style="text-align:center"></p>
      </div>
    `;
    fondo.querySelector('.pt-cerrar').addEventListener('click', cerrar);
    fondo.querySelector('#cb-fichas').addEventListener('click', () => enviar({ modo: 'fichas' }));
    fondo.querySelector('#cb-retiro').addEventListener('click', pedirRetiro);
  };

  const pedirRetiro = () => {
    let metodo = 'alias';
    let aliasTipo = 'ci';

    const pintar = () => {
      fondo.innerHTML = `
        <div class="pt-sheet">
          <div class="pt-sheet-head">
            <h3>Cobrar ${formatMoney(cb.monto)} por retiro</h3>
            <button class="pt-cerrar" type="button">×</button>
          </div>
          <p class="pt-seccion-label">¿Cómo querés cobrar?</p>
          <div class="pt-cuenta-tabs">
            <button class="pt-cuenta-tab ${metodo === 'alias' ? 'is-active' : ''}" data-m="alias">Alias</button>
            <button class="pt-cuenta-tab ${metodo === 'cuenta' ? 'is-active' : ''}" data-m="cuenta">Cuenta bancaria</button>
          </div>
          ${metodo === 'alias' ? `
            <div class="pt-subtabs">
              ${Object.entries(ALIAS_TIPOS).map(([t, c]) => `
                <button class="pt-subtab ${t === aliasTipo ? 'is-active' : ''}" data-t="${t}">${c.corto}</button>
              `).join('')}
            </div>
            <label class="pt-campo">
              <span>${ALIAS_TIPOS[aliasTipo].label}</span>
              <input id="cb-alias" autocomplete="off" />
            </label>
          ` : `
            <label class="pt-campo"><span>Entidad bancaria</span><input id="cb-banco" /></label>
            <label class="pt-campo"><span>Número de cuenta</span><input id="cb-numero" inputmode="numeric" /></label>
            <label class="pt-campo"><span>Nombre del titular</span><input id="cb-titular" /></label>
            <label class="pt-campo"><span>Número de documento</span><input id="cb-doc" inputmode="numeric" /></label>
          `}
          <button id="cb-enviar" class="pt-enviar">Solicitar</button>
          <button id="cb-volver" class="pt-enviar secundario" style="margin-top:8px">Volver</button>
          <p id="cb-msg" class="hint" style="text-align:center;margin-top:10px"></p>
        </div>
      `;

      fondo.querySelector('.pt-cerrar').addEventListener('click', cerrar);
      fondo.querySelector('#cb-volver').addEventListener('click', elegir);

      fondo.querySelectorAll('.pt-cuenta-tab').forEach((b) => {
        b.addEventListener('click', () => { metodo = b.dataset.m; pintar(); });
      });
      fondo.querySelectorAll('.pt-subtab').forEach((b) => {
        b.addEventListener('click', () => { aliasTipo = b.dataset.t; pintar(); });
      });

      fondo.querySelector('#cb-enviar').addEventListener('click', () => {
        const body = { modo: 'retiro', metodoTipo: metodo };
        const msg = fondo.querySelector('#cb-msg');

        if (metodo === 'alias') {
          body.aliasTipo = aliasTipo;
          body.aliasValor = fondo.querySelector('#cb-alias').value.trim();
          if (!body.aliasValor) { msg.className = 'hint error'; msg.textContent = 'Completá el dato.'; return; }
        } else {
          body.banco = fondo.querySelector('#cb-banco').value.trim();
          body.numeroCuenta = fondo.querySelector('#cb-numero').value.trim();
          body.titular = fondo.querySelector('#cb-titular').value.trim();
          body.documento = fondo.querySelector('#cb-doc').value.trim();
          if (!body.banco || !body.numeroCuenta || !body.titular || !body.documento) {
            msg.className = 'hint error'; msg.textContent = 'Completá todos los datos.'; return;
          }
        }
        enviar(body);
      });
    };

    pintar();
  };

  async function enviar(body) {
    const msg = fondo.querySelector('#cb-msg');
    msg.className = 'hint';
    msg.textContent = 'Enviando...';

    const { ok, error } = await playerFetch('/api/player-caja?recurso=cashback', {
      method: 'POST',
      body: { periodoId: cb.id, ...body },
    });

    if (!ok) { msg.className = 'hint error'; msg.textContent = error; return; }

    cerrar();
    onCambio?.();
  }

  elegir();
}

function fecha(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}`;
}
