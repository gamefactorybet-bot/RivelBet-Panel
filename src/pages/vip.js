import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { fechaCorta } from '../lib/players.js';
import { subirImagen } from '../lib/subir-imagen.js';
import { puede } from '../lib/perfiles.js';
import { crearInstancia, destruirInstancia } from '../player/lottieCache.ts';

const ESTILOS = `
  <style>
    .vp-tabs { display:flex; gap:4px; border-bottom:1px solid var(--border-glass); margin:0 0 18px; }
    .vp-tabs button { background:transparent; border:none; border-bottom:2px solid transparent; color:var(--text-dim);
      padding:9px 15px; font-size:13px; font-family:inherit; border-radius:0; font-weight:400; }
    .vp-tabs button.is-active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }

    /* inputs / selects propios de la sección */
    #vp-cont input:not([type=color]):not([type=file]):not([type=radio]),
    #vp-cont select {
      width:100%; background:var(--surface-alt-glass); border:1px solid var(--border-glass);
      border-radius:9px; color:var(--text); padding:9px 11px; font-size:13px; font-family:inherit;
      font-variant-numeric:tabular-nums;
    }
    #vp-cont input:focus, #vp-cont select:focus {
      outline:none; border-color:var(--accent);
      box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
    }
    #vp-cont input[type=color] {
      width:38px; height:34px; padding:2px; border:1px solid var(--border-glass);
      border-radius:8px; background:var(--surface-alt-glass); cursor:pointer; flex-shrink:0;
    }

    /* gema faceteada */
    .vp-gema {
      display:inline-block; flex-shrink:0; border-radius:3px; transform:rotate(45deg);
      width:13px; height:13px;
      background:linear-gradient(135deg,
        color-mix(in srgb,var(--g,#c7ccd1) 55%,#fff) 0%, var(--g,#c7ccd1) 55%,
        color-mix(in srgb,var(--g,#c7ccd1) 72%,#000) 100%);
      box-shadow:inset 0 1px 2px rgba(255,255,255,0.55);
    }
    .vp-gema-lg { width:30px; height:30px; border-radius:6px;
      box-shadow:inset 0 2px 3px rgba(255,255,255,0.5), 0 4px 16px color-mix(in srgb,var(--g,#c7ccd1) 35%,transparent); }
    .vp-gema-badge {
      display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:600;
      color:var(--g,#c7ccd1); padding:3px 11px 3px 8px; border-radius:999px;
      border:1px solid color-mix(in srgb, var(--g,#c7ccd1) 50%, transparent);
      background:color-mix(in srgb, var(--g,#c7ccd1) 12%, transparent);
    }

    /* card de nivel */
    .vp-nivel {
      border:1px solid var(--border-glass); border-left:3px solid var(--g,var(--border));
      border-radius:var(--radius); background:var(--surface-alt-glass);
      padding:16px 18px; margin-bottom:12px;
    }
    .vp-nivel-head { display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap; }
    .vp-nivel-head .nom { flex:1; min-width:130px; max-width:200px; font-weight:600; }
    .vp-orden-chip {
      font-size:11px; letter-spacing:0.04em; color:var(--text-dim);
      background:var(--surface); border:1px solid var(--border-glass);
      border-radius:6px; padding:3px 8px; font-variant-numeric:tabular-nums;
    }

    .vp-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px 16px; }
    .vp-grid label {
      display:block; font-size:10.5px; letter-spacing:0.03em; text-transform:uppercase;
      color:var(--text-dim); margin-bottom:5px; font-weight:500;
    }

    /* editor de ícono */
    .vp-ico { border-top:1px solid var(--border-glass); margin-top:16px; padding-top:14px; }
    .vp-ico-titulo { font-size:10.5px; letter-spacing:0.03em; text-transform:uppercase; color:var(--text-dim); font-weight:500; margin-bottom:9px; }
    .vp-ico-opts { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
    .vp-ico-opts label {
      display:inline-flex; gap:7px; align-items:center; font-size:12.5px;
      padding:7px 12px; border-radius:999px; cursor:pointer;
      border:1px solid var(--border-glass); background:var(--surface);
    }
    .vp-ico-opts label:has(input:checked) { border-color:var(--accent); color:var(--accent); }
    .vp-ico-opts input[type=radio] { accent-color:var(--accent); }
    .vp-ico-detalle { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .vp-ico-prev {
      width:52px; height:52px; flex-shrink:0; border:1px solid var(--border-glass);
      border-radius:10px; background:var(--surface);
      padding:4px; overflow:hidden;
    }
    .vp-ico-prev img, .vp-ico-prev svg, .vp-ico-prev canvas { width:100%; height:100%; display:block; object-fit:contain; }
    .vp-ico-controles { display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:1; min-width:180px; }
    .vp-ico-controles select { max-width:220px; }
    .vp-ico-lib { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .vp-lottie-pick {
      width:40px; height:40px; padding:4px; border-radius:10px; cursor:pointer;
      border:1px solid var(--border-glass); background:var(--surface);
    }
    .vp-lottie-pick.sel { outline:2px solid var(--accent); outline-offset:1px; }
    .vp-lottie-thumb { display:block; width:100%; height:100%; overflow:hidden; }
    .vp-lottie-thumb svg, .vp-lottie-thumb canvas { width:100%; height:100%; display:block; }

    .vp-barra { height:5px; background:var(--surface); border-radius:999px; overflow:hidden; margin-top:10px; }
    .vp-barra span { display:block; height:100%; background:var(--accent); transition:width .2s; }

    .vp-acc { display:flex; gap:8px; margin-top:16px; }

    /* jugadores */
    .vp-filtros { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
    .vp-filtros input { flex:1; min-width:180px; }
    .vp-filtros select { max-width:220px; }
    #vp-cont .tabla td { vertical-align:middle; }
    .vp-forzar { max-width:150px; }
    .sem { display:inline-flex; align-items:center; gap:7px; font-size:12px; white-space:nowrap; }
    .sem::before { content:""; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .sem.v { color:var(--success); } .sem.v::before { background:var(--success); }
    .sem.a { color:var(--accent); } .sem.a::before { background:var(--accent); }
    .sem.r { color:var(--error); } .sem.r::before { background:var(--error); }
  </style>
`;

export function renderVip(container, { profile }) {
  const puedeConfig = puede(profile, 'ajustes');
  const puedeForzar = puede(profile, 'crear_jugador');
  let tab = 'niveles';

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Niveles VIP</h2>
      <p class="hint">
        El nivel sale de cuánto cargó el jugador en total (histórico) y solo sube.
        El % de cashback del nivel reemplaza al global. La espera entre retiros
        baja en los niveles altos: es la exclusividad.
      </p>
      <div class="vp-tabs" id="vp-tabs">
        <button class="is-active" data-t="niveles">Niveles</button>
        <button data-t="jugadores">Jugadores</button>
      </div>
      <div id="vp-cont"></div>
    </section>
  `;

  const tabsEl = container.querySelector('#vp-tabs');
  tabsEl.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      tab = b.dataset.t;
      tabsEl.querySelectorAll('button').forEach((x) => x.classList.toggle('is-active', x === b));
      render();
    });
  });

  function render() {
    if (tab === 'niveles') vistaNiveles(container.querySelector('#vp-cont'), puedeConfig);
    else vistaJugadores(container.querySelector('#vp-cont'), puedeForzar);
  }

  render();
}

/* ---------------- Niveles ---------------- */
async function vistaNiveles(cont, puedeEditar) {
  cont.innerHTML = '<p class="hint">Cargando...</p>';

  const [{ ok, data, error }, animRes] = await Promise.all([
    apiFetch('/api/config?recurso=vip'),
    apiFetch('/api/config?recurso=animaciones'),
  ]);
  if (!ok) { cont.innerHTML = `<p class="hint error">${error}</p>`; return; }

  const animaciones = animRes.ok ? (animRes.data.animaciones || []) : [];
  const niveles = data.niveles || [];

  cont.innerHTML = `
    <p class="hint" style="margin:-4px 0 14px">
      ${niveles.length} nivel(es), de menor a mayor umbral. El % de cashback y el multiplicador de giro salen de acá.
      La espera entre retiros (horas) es por nivel: 0 = sin espera. El primer retiro de la cuenta no espera.
      Cumpleaños y mensual se acreditan solos de madrugada: el día del cumple (o el siguiente si el cron falló) y los primeros dos días de cada mes. Solo cuentas verificadas, una vez por período.
    </p>
    <div id="vp-lista">${niveles.map((n) => filaNivel(n, animaciones, puedeEditar)).join('')}</div>
    ${puedeEditar ? `
      <div class="vp-acc" style="margin-top:4px">
        <button id="vp-nuevo">Agregar nivel</button>
        <button class="secundario" id="vp-recalc">Recalcular todos ahora</button>
      </div>
      <p id="vp-msg" class="hint"></p>
    ` : ''}
  `;

  cont.querySelectorAll('.vp-nivel').forEach((el) => cablearNivel(el, cont, animaciones, puedeEditar));

  if (!puedeEditar) return;

  cont.querySelector('#vp-nuevo').addEventListener('click', () => {
    const orden = Math.max(0, ...niveles.map((n) => n.orden)) + 1;
    const el = document.createElement('div');
    el.innerHTML = filaNivel({ orden, color: '#c7ccd1', cashback_pct: 5, giro_multiplicador: 1 }, animaciones, true);
    cont.querySelector('#vp-lista').appendChild(el.firstElementChild);
    cablearNivel(cont.querySelector('.vp-nivel:last-child'), cont, animaciones, true);
  });

  cont.querySelector('#vp-recalc').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const msg = cont.querySelector('#vp-msg');
    msg.className = 'hint'; msg.textContent = 'Recalculando...';
    const r = await apiFetch('/api/config?recurso=vip&accion=recalcular', { method: 'POST', body: {} });
    e.currentTarget.disabled = false;
    msg.className = r.ok ? 'hint ok' : 'hint error';
    msg.textContent = r.ok ? `Listo. ${r.data.actualizados} jugador(es) actualizado(s).` : r.error;
  });
}

function filaNivel(n, animaciones, puedeEditar) {
  const dis = puedeEditar ? '' : 'disabled';
  const modo = n.animacion_id ? 'animacion' : n.imagen_url ? 'imagen' : 'gema';
  const rn = `ico-${n.id || 'new-' + Math.random().toString(36).slice(2, 7)}`;
  return `
    <div class="vp-nivel" data-id="${n.id || ''}" data-orden="${n.orden ?? 1}" style="--g:${n.color || '#c7ccd1'}">
      <div class="vp-nivel-head">
        <span class="vp-gema vp-gema-lg"></span>
        <input class="nom" value="${escapeHtml(n.nombre || '')}" placeholder="Nombre del nivel" ${dis} />
        <input type="color" class="col" value="${n.color || '#c7ccd1'}" ${dis} title="Color de la piedra" />
        <span class="vp-orden-chip">orden ${n.orden ?? 1}</span>
      </div>

      <div class="vp-grid">
        <div><label>Desde · cargado (${currency.symbol})</label><input class="umb" type="number" min="0" value="${n.umbral_cargado ?? 0}" ${dis} /></div>
        <div><label>Cashback %</label><input class="cbp" type="number" min="0" max="100" step="0.5" value="${n.cashback_pct ?? 5}" ${dis} /></div>
        <div><label>Multiplicador giro</label><input class="gm" type="number" min="1" step="0.5" value="${n.giro_multiplicador ?? 1}" ${dis} /></div>
        <div><label>Bono cumpleaños (${currency.symbol})</label><input class="bc" type="number" min="0" value="${n.bono_cumple ?? 0}" ${dis} /></div>
        <div><label>Bono mensual (${currency.symbol})</label><input class="bm" type="number" min="0" value="${n.bono_mensual ?? 0}" ${dis} /></div>
        <div><label>Espera entre retiros (h)</label><input class="reh" type="number" min="0" step="0.5" value="${n.retiro_espera_horas ?? 24}" ${dis} title="0 = sin espera. El primer retiro no espera." /></div>
      </div>

      <div class="vp-ico">
        <div class="vp-ico-titulo">Ícono de la piedra</div>
        <div class="vp-ico-opts">
          <label><input type="radio" name="${rn}" value="gema" ${modo === 'gema' ? 'checked' : ''} ${dis} /> Gema por defecto</label>
          <label><input type="radio" name="${rn}" value="imagen" ${modo === 'imagen' ? 'checked' : ''} ${dis} /> Imagen</label>
          <label><input type="radio" name="${rn}" value="animacion" ${modo === 'animacion' ? 'checked' : ''} ${dis} /> Animación Lottie</label>
        </div>
        <div class="vp-ico-detalle">
          <div class="vp-ico-prev" ${(n.animacion_url || n.imagen_url) ? '' : 'hidden'}></div>
          <span class="vp-ico-controles"></span>
        </div>
        <input type="hidden" class="img-url" value="${escapeHtml(n.imagen_url || '')}" />
        <input type="hidden" class="anim-id" value="${n.animacion_id || ''}" />
        <div class="vp-barra ico-prog" hidden><span style="width:0%"></span></div>
      </div>

      ${puedeEditar ? `
        <div class="vp-acc">
          <button class="vp-guardar">Guardar</button>
          ${n.id ? '<button class="secundario vp-borrar">Borrar</button>' : '<button class="secundario vp-cancelar">Cancelar</button>'}
        </div>
        <p class="vp-nivel-msg hint"></p>
      ` : ''}
    </div>
  `;
}

function cablearNivel(el, cont, animaciones, puedeEditar) {
  if (!el || !puedeEditar) return;
  const $ = (s) => el.querySelector(s);
  const msg = $('.vp-nivel-msg');

  $('.col').addEventListener('input', (e) => { el.style.setProperty('--g', e.target.value); });

  let lottiesVivos = [];
  const soltarLotties = () => {
    lottiesVivos.forEach((i) => { try { destruirInstancia(i); } catch { /* ya destruida */ } });
    lottiesVivos = [];
  };

  const montarLottie = (caja, url) => {
    if (!caja || !url) return;
    crearInstancia(caja, url).then((inst) => {
      if (!caja.isConnected) { destruirInstancia(inst); return; }
      lottiesVivos.push(inst);
    });
  };

  const pintarControles = () => {
    const modo = el.querySelector('input[type=radio]:checked')?.value || 'gema';
    const cont2 = $('.vp-ico-controles');
    const prev = $('.vp-ico-prev');
    soltarLotties();

    const refrescarPrev = () => {
      const anim = $('.anim-id').value;
      const img = $('.img-url').value;
      const a = animaciones.find((x) => x.id === anim);
      prev.innerHTML = '';
      if (a?.url) {
        prev.hidden = false;
        montarLottie(prev, a.url);
      } else if (img) {
        prev.hidden = false;
        prev.innerHTML = `<img src="${escapeHtml(img)}" alt="" />`;
      } else {
        prev.hidden = true;
      }
    };

    if (modo === 'animacion') {
      cont2.innerHTML = `
        <div class="vp-ico-lib">
          ${animaciones.length
            ? animaciones.map((a) => `
                <button type="button" class="vp-lottie-pick ${a.id === $('.anim-id').value ? 'sel' : ''}"
                        data-id="${a.id}" title="${escapeHtml(a.nombre)}">
                  <span class="vp-lottie-thumb" data-lottie-url="${escapeHtml(a.url)}"></span>
                </button>
              `).join('')
            : '<span class="hint">No hay animaciones. Subí una desde “Animaciones” en el menú.</span>'}
        </div>
      `;
      cont2.querySelectorAll('[data-lottie-url]').forEach((caja) => montarLottie(caja, caja.dataset.lottieUrl));
      cont2.querySelectorAll('.vp-lottie-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
          const yaEs = $('.anim-id').value === btn.dataset.id;
          $('.anim-id').value = yaEs ? '' : btn.dataset.id;
          $('.img-url').value = '';
          cont2.querySelectorAll('.vp-lottie-pick').forEach((x) => x.classList.toggle('sel', !yaEs && x === btn));
          refrescarPrev();
        });
      });
      refrescarPrev();
    } else if (modo === 'imagen') {
      cont2.innerHTML = `<label class="secundario" style="cursor:pointer;padding:8px 14px;border-radius:8px;font-size:12.5px">
        Subir imagen<input type="file" class="img-file" accept="image/*" hidden />
      </label><span class="hint">PNG con fondo transparente, recomendado</span>`;
      cont2.querySelector('.img-file').addEventListener('change', async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        const prog = $('.ico-prog'); prog.hidden = false;
        const barra = prog.querySelector('span');
        try {
          const img = await subirImagen(archivo, { carpeta: 'vip', onProgreso: (p) => { barra.style.width = p + '%'; } });
          $('.img-url').value = img.url;
          $('.anim-id').value = '';
          prog.hidden = true;
          refrescarPrev();
        } catch (err) {
          prog.hidden = true;
          msg.className = 'hint error'; msg.textContent = err.message;
        }
      });
      refrescarPrev();
    } else {
      cont2.innerHTML = '<span class="hint">Se dibuja la piedra con el color de arriba.</span>';
      $('.img-url').value = '';
      $('.anim-id').value = '';
      prev.innerHTML = '';
      prev.hidden = true;
    }
  };

  el.querySelectorAll('input[type=radio]').forEach((r) => r.addEventListener('change', pintarControles));
  pintarControles();

  $('.vp-cancelar')?.addEventListener('click', () => el.remove());

  $('.vp-borrar')?.addEventListener('click', async (e) => {
    if (!window.confirm('¿Borrar este nivel? Los jugadores se recalculan a otro nivel.')) return;
    e.currentTarget.disabled = true;
    const r = await apiFetch(`/api/config?recurso=vip&accion=borrar-nivel&id=${el.dataset.id}`, { method: 'POST', body: {} });
    if (!r.ok) { e.currentTarget.disabled = false; msg.className = 'hint error'; msg.textContent = r.error; return; }
    vistaNiveles(cont, true);
  });

  $('.vp-guardar').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    msg.className = 'hint'; msg.textContent = 'Guardando...';
    const r = await apiFetch('/api/config?recurso=vip&accion=nivel', {
      method: 'POST',
      body: {
        id: el.dataset.id || undefined,
        nombre: $('.nom').value.trim(),
        color: $('.col').value,
        orden: Number(el.dataset.orden) || 1,
        umbralCargado: Number($('.umb').value) || 0,
        cashbackPct: Number($('.cbp').value) || 0,
        giroMultiplicador: Number($('.gm').value) || 1,
        bonoCumple: Number($('.bc').value) || 0,
        bonoMensual: Number($('.bm').value) || 0,
        retiroEsperaHoras: Number($('.reh').value) || 0,
        imagenUrl: $('.img-url').value || null,
        animacionId: $('.anim-id').value || null,
      },
    });
    e.currentTarget.disabled = false;
    if (!r.ok) { msg.className = 'hint error'; msg.textContent = r.error; return; }
    vistaNiveles(cont, true);
  });
}

/* ---------------- Jugadores ---------------- */
async function vistaJugadores(cont, puedeForzar) {
  cont.innerHTML = `
    <div class="vp-filtros">
      <input id="vp-buscar" placeholder="Buscar jugador" autocomplete="off" />
      <select id="vp-nivel"><option value="">Todos los niveles</option></select>
    </div>
    <div id="vp-jlista"><p class="hint">Cargando...</p></div>
  `;

  let niveles = [];

  const cargar = async () => {
    const listaEl = cont.querySelector('#vp-jlista');
    listaEl.innerHTML = '<p class="hint">Cargando...</p>';
    const params = new URLSearchParams({ recurso: 'vip', lista: '1' });
    const buscar = cont.querySelector('#vp-buscar').value.trim();
    const nivel = cont.querySelector('#vp-nivel').value;
    if (buscar) params.set('buscar', buscar);
    if (nivel) params.set('nivel', nivel);

    const { ok, data, error } = await apiFetch(`/api/config?${params}`);
    if (!ok) { listaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

    niveles = data.niveles || [];
    const selN = cont.querySelector('#vp-nivel');
    if (selN.options.length <= 1) {
      selN.innerHTML = '<option value="">Todos los niveles</option>' +
        niveles.map((n) => `<option value="${n.id}">${escapeHtml(n.nombre)}</option>`).join('');
      selN.value = nivel;
    }

    const jug = data.jugadores || [];
    if (!jug.length) {
      listaEl.innerHTML = '<p class="hint">Ningún jugador con cargas todavía.</p>';
      return;
    }

    listaEl.innerHTML = `
      <p class="hint" style="margin:-2px 0 10px">${jug.length} jugador(es)${jug.length === 200 ? ' (se muestran los 200 con más cargado)' : ''}</p>
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th>Jugador</th><th>Nivel</th><th>Cargado histórico</th><th>Actividad 30d</th><th>Último ingreso</th><th>Estado</th>${puedeForzar ? '<th>Forzar</th>' : ''}</tr></thead>
        <tbody>
          ${jug.map((j) => fila(j, niveles, puedeForzar)).join('')}
        </tbody>
      </table></div>
    `;

    listaEl.querySelectorAll('.vp-forzar').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const r = await apiFetch('/api/config?recurso=vip&accion=forzar', {
          method: 'POST', body: { playerId: sel.dataset.player, nivelId: sel.value || null },
        });
        if (!r.ok) { window.alert(r.error); return; }
        cargar();
      });
    });
  };

  cont.querySelector('#vp-buscar').addEventListener('keydown', (e) => { if (e.key === 'Enter') cargar(); });
  cont.querySelector('#vp-nivel').addEventListener('change', cargar);
  cargar();
}

function fila(j, niveles, puedeForzar) {
  const n = j.nivel;
  const dias = Number(j.dias_jugo_30 || 0);
  const inactivoDias = j.ultimo_ingreso
    ? Math.floor((Date.now() - new Date(j.ultimo_ingreso)) / 86400000) : 999;
  let sem = 'v', txt = 'Activo';
  if (dias <= 2 || inactivoDias > 10) { sem = 'r'; txt = 'No conecta'; }
  else if (dias <= 7) { sem = 'a'; txt = 'Bajó actividad'; }

  return `
    <tr>
      <td>${escapeHtml(j.display_name || j.username)}<small class="hint">#${j.player_number} · @${escapeHtml(j.username)}</small></td>
      <td><span class="vp-gema-badge" style="--g:${n?.color || '#c7ccd1'}"><span class="vp-gema"></span>${escapeHtml(n?.nombre || '—')}</span>${j.forzado ? ' <small class="hint">forzado</small>' : ''}</td>
      <td class="mono">${formatMoney(j.cargado_historico)}</td>
      <td class="mono">${dias} días</td>
      <td class="hint">${j.ultimo_ingreso ? fechaCorta(j.ultimo_ingreso) : '—'}</td>
      <td><span class="sem ${sem}">${txt}</span></td>
      ${puedeForzar ? `<td>
        <select class="vp-forzar" data-player="${j.player_id}">
          <option value="">— auto —</option>
          ${niveles.map((x) => `<option value="${x.id}" ${x.id === j.vip_nivel_forzado ? 'selected' : ''}>${escapeHtml(x.nombre)}</option>`).join('')}
        </select>
      </td>` : ''}
    </tr>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
