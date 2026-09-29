import { apiFetch } from '../lib/api.ts';
import { formatMoney, currency } from '../lib/currency.ts';
import { ruletaSvg, repartirPorciones, indicePorPremio, rotacionGanadora, sortearLocal, TEMAS_RULETA } from '../lib/ruleta.js';
import { puede } from '../lib/perfiles.js';
import { crearInstancia, destruirInstancia } from '../player/lottieCache.ts';

const ESTILOS = `
  <style>
    .gd-wrap { display:grid; grid-template-columns:300px 1fr; gap:28px; align-items:start; }
    @media (max-width:860px) { .gd-wrap { grid-template-columns:1fr; } }

    .gd-rul-col { display:flex; flex-direction:column; align-items:center; gap:12px; }
    .gd-rul { position:relative; width:230px; }
    .gd-rul::before { content:''; display:block; padding-bottom:100%; }
    .gd-rul {
      --rul-aro: radial-gradient(circle at 30% 25%, #f3e08e, #d4af37 42%, #5a3e0e 100%);
      --rul-luces: #f3e08e; --rul-hub: radial-gradient(circle at 35% 30%, #f8e7a0, #d4af37 58%, #7a5c14);
      --rul-hub-txt: #1a1204; --rul-flecha: #d4af37; --rul-cara: #0a0a0a;
    }
    .gd-rul[data-tema="san-patricio"] {
      --rul-aro: radial-gradient(circle at 30% 25%, #d4f0a0, #2e8b57 45%, #0d3d22 100%);
      --rul-luces: #f0c14b; --rul-hub: radial-gradient(circle at 35% 30%, #e8f5c8, #3d9b5c 60%, #145c32);
      --rul-hub-txt: #0a2414; --rul-flecha: #f0c14b; --rul-cara: #0a2414;
    }
    .gd-rul[data-tema="noche"] {
      --rul-aro: radial-gradient(circle at 30% 25%, #d0def4, #6a8ab8 45%, #152444 100%);
      --rul-luces: #8eb6e8; --rul-hub: radial-gradient(circle at 35% 30%, #e8eef8, #8eb6e8 60%, #2a3f6e);
      --rul-hub-txt: #0c1220; --rul-flecha: #8eb6e8; --rul-cara: #070b14;
    }
    .gd-rul[data-tema="clasico"] {
      --rul-aro: radial-gradient(circle at 30% 25%, #fff, var(--platinum) 45%, #8a6d1c 100%);
      --rul-luces: #fff7db; --rul-hub: radial-gradient(circle at 35% 30%, #f3e08e, #c9a12f 60%, #8a6d1c);
      --rul-hub-txt: #3a2c08; --rul-flecha: var(--accent); --rul-cara: #1c1408;
    }
    .gd-rul-flecha { position:absolute; top:-4px; left:50%; transform:translateX(-50%); z-index:4;
      width:0; height:0; border-left:11px solid transparent; border-right:11px solid transparent; border-top:20px solid var(--rul-flecha);
      filter:drop-shadow(0 2px 3px rgba(0,0,0,0.6)); }
    .gd-rul-aro { position:absolute; inset:-9px; border-radius:50%;
      background:var(--rul-aro);
      box-shadow:0 12px 34px -10px rgba(0,0,0,0.7), inset 0 0 12px rgba(0,0,0,0.35); }
    .gd-rul-luces { position:absolute; inset:-7px; border-radius:50%; z-index:2; border:4px dotted var(--rul-luces);
      filter:drop-shadow(0 0 3px var(--rul-luces)); opacity:0.8; }
    .gd-rul-cara { position:absolute; inset:0; border-radius:50%; overflow:hidden; border:5px solid var(--rul-cara);
      box-shadow:inset 0 0 16px rgba(0,0,0,0.5); }
    .gd-rul-svg { width:100%; height:100%; transition:transform 4.6s cubic-bezier(.12,.75,.15,1); }
    .gd-rul-svg svg { display:block; }
    .gd-rul-hub { position:absolute; top:50%; left:50%; width:42px; height:42px; margin:-21px; z-index:3; border-radius:50%;
      background:var(--rul-hub);
      box-shadow:0 3px 10px rgba(0,0,0,0.5), inset 0 2px 3px rgba(255,255,255,0.35);
      display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:700; color:var(--rul-hub-txt); letter-spacing:0.06em;
      font-family:ui-monospace,monospace; }
    .gd-temas { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 16px; }
    .gd-tema {
      display:flex; flex-direction:column; gap:4px; align-items:flex-start;
      background:var(--surface-alt); border:1px solid var(--border); border-radius:10px;
      padding:8px 10px; cursor:pointer; font-family:inherit; color:var(--text); min-width:110px;
    }
    .gd-tema.sel { outline:2px solid var(--accent); outline-offset:1px; }
    .gd-tema strong { font-size:12px; }
    .gd-tema small { font-size:10.5px; color:var(--text-dim); }
    .gd-tema-swatch { display:flex; height:8px; width:100%; border-radius:99px; overflow:hidden; }
    .gd-tema-swatch i { flex:1; display:block; }
    .gd-rul-res { font-size:13px; color:var(--text-dim); min-height:20px; text-align:center; }
    .gd-rul-res b { color:var(--success); font-variant-numeric:tabular-nums; }
    .gd-rul-res b.nada { color:var(--text-dim); }

    .gd-prem { width:100%; border-collapse:collapse; font-size:13px; margin:6px 0 10px; }
    .gd-prem th { text-align:left; font-size:11px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.03em; padding:8px 8px; border-bottom:1px solid var(--border); }
    .gd-prem td { padding:8px; border-bottom:1px solid var(--border-glass); }
    .gd-prem input { width:100px; background:var(--surface-alt-glass); border:1px solid var(--border-glass); color:var(--text);
      border-radius:8px; padding:8px 10px; font-size:13px; font-family:ui-monospace,monospace; }
    .gd-prem .prob { color:var(--text-dim); font-variant-numeric:tabular-nums; }
    .gd-prem .porc { color:var(--accent); font-family:ui-monospace,monospace; }
    .gd-prem .quitar { background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:7px; padding:5px 10px; font-size:11px; }

    .gd-stats { display:flex; gap:12px; flex-wrap:wrap; margin:14px 0; }
    .gd-stat { flex:1; min-width:120px; background:var(--surface-alt-glass); border:1px solid var(--border-glass); border-radius:10px; padding:12px 14px; }
    .gd-stat small { font-size:10.5px; letter-spacing:0.04em; text-transform:uppercase; color:var(--text-dim); }
    .gd-stat strong { display:block; font-size:19px; font-weight:600; margin-top:2px; font-variant-numeric:tabular-nums; }

    .gd-sim { margin-top:12px; padding:12px 14px; border:1px solid var(--border-soft); border-radius:10px; background:var(--surface-alt-glass); }
    .gd-sim h4 { margin:0 0 8px; font-size:12px; font-weight:600; }
    .gd-sim-row { display:flex; justify-content:space-between; font-size:12px; padding:3px 0; color:var(--text-dim); font-variant-numeric:tabular-nums; }
    .gd-sim-row b { color:var(--text); }
    .gd-ico-lib { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:0 0 14px; }
    .gd-ico-pick {
      width:44px; height:44px; padding:4px; border-radius:10px; cursor:pointer;
      border:1px solid var(--border-glass); background:var(--surface);
    }
    .gd-ico-pick.sel { outline:2px solid var(--accent); outline-offset:1px; }
    .gd-ico-thumb { display:block; width:100%; height:100%; overflow:hidden; }
    .gd-ico-thumb svg, .gd-ico-thumb canvas { width:100%; height:100%; display:block; }
  </style>
`;

export function renderGiroDiario(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <h2>Giro diario gratis</h2>
      <p class="hint">
        Una tirada gratis por día. El premio lo resuelve el servidor y se acredita al saldo,
        multiplicado por el nivel VIP. Aunque el jugador no tenga saldo, entra a probar.
      </p>
      <div id="gd-cont"><p class="hint">Cargando...</p></div>
    </section>
  `;

  cargar(container, puedeEditar);
}

async function cargar(container, puedeEditar) {
  const cont = container.querySelector('#gd-cont');
  const { ok, data, error } = await apiFetch('/api/config?recurso=giro-diario');
  if (!ok) { cont.innerHTML = `<p class="hint error">${error}</p>`; return; }

  let premios = (data.premios || []).map((p) => ({ monto: Number(p.monto) || 0, peso: Number(p.peso) || 0 }));
  let activo = Boolean(data.activo);
  let rollover = data.rollover ?? 0;
  let iconoAnimacionId = data.icono_animacion_id || '';
  let tema = data.tema || 'casino';
  const st = data.stats || {};
  const animRes = await apiFetch('/api/config?recurso=animaciones');
  const animaciones = animRes.ok ? (animRes.data.animaciones || []) : [];
  let lottiesVivos = [];
  const soltarLotties = () => {
    lottiesVivos.forEach((i) => { try { destruirInstancia(i); } catch { /* */ } });
    lottiesVivos = [];
  };
  const leerControles = () => {
    activo = cont.querySelector('#gd-activo').checked;
    rollover = Number(cont.querySelector('#gd-rollover')?.value) || 0;
  };

  const pintar = () => {
    const total = premios.reduce((a, p) => a + Math.max(0, p.peso), 0);
    const ev = total > 0 ? premios.reduce((a, p) => a + p.monto * Math.max(0, p.peso) / total, 0) : 0;
    const segs = repartirPorciones(premios);

    cont.innerHTML = `
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <label class="st-permiso" style="max-width:170px">
          <input type="checkbox" id="gd-activo" ${activo ? 'checked' : ''} ${puedeEditar ? '' : 'disabled'} />
          <span>Activo</span>
        </label>
        <label class="field corto">Rollover del premio (×)
          <input id="gd-rollover" type="number" min="0" step="0.5" value="${rollover}" ${puedeEditar ? '' : 'disabled'} />
        </label>
      </div>
      <p class="hint" style="margin:-4px 0 12px">El rollover del premio aplica solo con el modo avanzado de Billetera. 0 = el premio sale libre, como hoy.</p>

      <p class="form-grupo">Temática de la ruleta</p>
      <div class="gd-temas">
        ${Object.values(TEMAS_RULETA).map((t) => `
          <button type="button" class="gd-tema ${t.id === tema ? 'sel' : ''}" data-tema="${t.id}">
            <span class="gd-tema-swatch">${t.colores.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
            <strong>${escapeHtml(t.nombre)}</strong>
            <small>${escapeHtml(t.hint)}</small>
          </button>
        `).join('')}
      </div>

      <p class="form-grupo">Ícono del chip en el portal</p>
      <p class="hint">Reemplaza la ruedita. Subí el Lottie en Animaciones.</p>
      <div class="gd-ico-lib">
        <button type="button" class="gd-ico-pick ${!iconoAnimacionId ? 'sel' : ''}" data-id="" title="Rueda por defecto">○</button>
        ${animaciones.map((a) => `
          <button type="button" class="gd-ico-pick ${a.id === iconoAnimacionId ? 'sel' : ''}" data-id="${a.id}" title="${escapeHtml(a.nombre)}">
            <span class="gd-ico-thumb" data-lottie-url="${escapeHtml(a.url)}"></span>
          </button>
        `).join('') || '<span class="hint">No hay animaciones.</span>'}
      </div>

      <div class="gd-wrap">
        <div class="gd-rul-col">
          <div class="gd-rul" id="gd-rul" data-tema="${escapeHtml(tema)}">
            <div class="gd-rul-flecha"></div>
            <div class="gd-rul-aro"></div>
            <div class="gd-rul-luces"></div>
            <div class="gd-rul-cara"><div class="gd-rul-svg" id="gd-rul-svg">${ruletaSvg(premios, tema).svg}</div></div>
            <div class="gd-rul-hub">GIRÁ</div>
          </div>
          <button class="secundario" id="gd-probar">Probar giro</button>
          <div class="gd-rul-res" id="gd-res">Tocá "Probar giro"</div>
        </div>

        <div>
          <p class="form-grupo" style="margin-top:0">Tabla de premios</p>
          <p class="hint" style="margin-bottom:4px">Cada fila con su peso. El ₲ 0 es "no ganó". "Porciones" es cómo se reparte en la rueda.</p>
          <div class="tabla-scroll">
            <table class="gd-prem">
              <thead><tr><th>Premio (${currency.symbol})</th><th>Peso</th><th>Prob.</th><th>Porciones</th><th></th></tr></thead>
              <tbody>
                ${premios.map((p, i) => `
                  <tr>
                    <td><input data-i="${i}" data-k="monto" type="number" min="0" value="${p.monto}" ${puedeEditar ? '' : 'disabled'} /></td>
                    <td><input data-i="${i}" data-k="peso" type="number" min="0" value="${p.peso}" ${puedeEditar ? '' : 'disabled'} /></td>
                    <td class="prob">${total > 0 ? (Math.max(0, p.peso) / total * 100).toFixed(1) + '%' : '—'}</td>
                    <td class="porc">${segs.filter((s) => s.i === i).length}${segs.length ? ' / ' + segs.length : ''}</td>
                    <td>${puedeEditar ? `<button class="quitar" data-quitar="${i}">Quitar</button>` : ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <p class="hint">Valor esperado por giro: <strong id="gd-ev">${formatMoney(ev)}</strong> · con 100 giros/día ≈ <span id="gd-ev100">${formatMoney(ev * 100)}</span>/día.</p>

          <div class="gd-stats">
            <div class="gd-stat"><small>Giros hoy</small><strong>${st.hoy ?? 0}</strong></div>
            <div class="gd-stat"><small>Repartido hoy</small><strong>${formatMoney(st.repartido_hoy || 0)}</strong></div>
            <div class="gd-stat"><small>Giros 7 días</small><strong>${st.semana ?? 0}</strong></div>
            <div class="gd-stat"><small>Repartido 7 días</small><strong>${formatMoney(st.repartido_semana || 0)}</strong></div>
          </div>

          <div class="gd-sim">
            <h4>Simulación de 1.000 giros <span class="hint" style="text-transform:none;letter-spacing:0">(local, para chequear el reparto)</span></h4>
            <div id="gd-sim"><p class="hint">Tocá "Simular 1.000"</p></div>
            <button class="secundario" id="gd-sim-btn" style="margin-top:8px">Simular 1.000</button>
          </div>

          ${puedeEditar ? `
            <div class="acciones" style="margin-top:14px">
              <button id="gd-nuevo" class="secundario">Agregar premio</button>
              <button id="gd-guardar">Guardar</button>
            </div>
            <p id="gd-msg" class="hint"></p>
          ` : '<p class="hint" style="margin-top:10px">Necesitás el permiso de ajustes para editar.</p>'}
        </div>
      </div>
    `;

    // --- probador ---
    let spins = 0;
    cont.querySelector('#gd-probar').addEventListener('click', (e) => {
      const seg = repartirPorciones(premios);
      if (!seg.length) return;
      e.currentTarget.disabled = true;
      const premio = sortearLocal(premios);
      const idx = indicePorPremio(seg, premio);
      spins++;
      const rot = 360 * 6 * spins - (idx + 0.5) * (360 / seg.length);
      cont.querySelector('#gd-rul-svg').style.transform = `rotate(${rot}deg)`;
      setTimeout(() => {
        cont.querySelector('#gd-res').innerHTML = premio > 0
          ? `Cayó en <b>${formatMoney(premio)}</b>`
          : `Cayó en <b class="nada">Nada</b>`;
        e.currentTarget.disabled = false;
      }, 4700);
    });

    cont.querySelector('#gd-sim-btn').addEventListener('click', () => {
      const cuenta = {};
      let repartido = 0;
      for (let k = 0; k < 1000; k++) { const m = sortearLocal(premios); cuenta[m] = (cuenta[m] || 0) + 1; repartido += m; }
      document.getElementById('gd-sim').innerHTML = Object.keys(cuenta)
        .sort((a, b) => a - b)
        .map((m) => {
          const p = premios.find((x) => x.monto == m);
          const esp = p && total > 0 ? (p.peso / total * 100).toFixed(1) : '0';
          return `<div class="gd-sim-row"><span>${m == 0 ? 'Nada' : formatMoney(m)}</span><b>${(cuenta[m] / 10).toFixed(1)}%</b><span>esperado ${esp}%</span></div>`;
        }).join('') +
        `<div class="gd-sim-row" style="border-top:1px solid var(--border-soft);margin-top:4px;padding-top:6px"><span>Repartido</span><b>${formatMoney(repartido)}</b><span>≈ ${formatMoney(repartido / 1000)}/giro</span></div>`;
    });

    if (!puedeEditar) return;

    // Actualiza en vivo la rueda, las probabilidades y el valor esperado
    // SIN re-renderizar los inputs (no perder el foco al tipear).
    const refrescarVivo = () => {
      const t = premios.reduce((a, p) => a + Math.max(0, p.peso), 0);
      const sg = repartirPorciones(premios);
      const svgEl = cont.querySelector('#gd-rul-svg');
      svgEl.style.transition = 'none';
      svgEl.style.transform = 'none';
      spins = 0;
      svgEl.innerHTML = ruletaSvg(premios, tema).svg;
      requestAnimationFrame(() => { svgEl.style.transition = ''; });
      cont.querySelectorAll('.gd-prem tbody tr').forEach((tr, i) => {
        tr.querySelector('.prob').textContent = t > 0 ? (Math.max(0, premios[i].peso) / t * 100).toFixed(1) + '%' : '—';
        tr.querySelector('.porc').textContent = sg.filter((s) => s.i === i).length + (sg.length ? ' / ' + sg.length : '');
      });
      const ev = t > 0 ? premios.reduce((a, p) => a + p.monto * Math.max(0, p.peso) / t, 0) : 0;
      cont.querySelector('#gd-ev').textContent = formatMoney(ev);
      cont.querySelector('#gd-ev100').textContent = formatMoney(ev * 100);
    };

    cont.querySelectorAll('.gd-prem input').forEach((inp) => {
      inp.addEventListener('input', () => {
        premios[inp.dataset.i][inp.dataset.k] = Number(inp.value) || 0;
        refrescarVivo();
      });
    });

    cont.querySelectorAll('[data-quitar]').forEach((b) => {
      b.addEventListener('click', () => { premios.splice(Number(b.dataset.quitar), 1); leerControles(); pintar(); });
    });
    cont.querySelector('#gd-nuevo').addEventListener('click', () => { premios.push({ monto: 0, peso: 1 }); leerControles(); pintar(); });

    soltarLotties();
    cont.querySelectorAll('[data-lottie-url]').forEach((caja) => {
      crearInstancia(caja, caja.dataset.lottieUrl).then((inst) => {
        if (!caja.isConnected) { destruirInstancia(inst); return; }
        lottiesVivos.push(inst);
      });
    });
    cont.querySelectorAll('.gd-ico-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        iconoAnimacionId = btn.dataset.id || '';
        leerControles();
        pintar();
      });
    });
    cont.querySelectorAll('.gd-tema').forEach((btn) => {
      btn.addEventListener('click', () => {
        tema = btn.dataset.tema || 'casino';
        leerControles();
        pintar();
      });
    });

    cont.querySelector('#gd-guardar').addEventListener('click', async (e) => {
      const msg = cont.querySelector('#gd-msg');
      e.currentTarget.disabled = true;
      msg.className = 'hint'; msg.textContent = 'Guardando...';
      const r = await apiFetch('/api/config?recurso=giro-diario', {
        method: 'POST',
        body: {
          activo: cont.querySelector('#gd-activo').checked,
          rollover: Number(cont.querySelector('#gd-rollover').value) || 0,
          iconoAnimacionId: iconoAnimacionId || null,
          tema,
          premios,
        },
      });
      e.currentTarget.disabled = false;
      msg.className = r.ok ? 'hint ok' : 'hint error';
      msg.textContent = r.ok ? 'Guardado.' : r.error;
      if (r.ok) {
        activo = r.data.activo;
        rollover = r.data.rollover ?? 0;
        iconoAnimacionId = r.data.icono_animacion_id || '';
        tema = r.data.tema || 'casino';
        premios = (r.data.premios || []).map((p) => ({ monto: Number(p.monto) || 0, peso: Number(p.peso) || 0 }));
      }
    });
  };

  pintar();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
