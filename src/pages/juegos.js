import { apiFetch } from '../lib/api.ts';
import { subirImagen, subirVideo } from '../lib/subir-imagen.js';
import { puede } from '../lib/perfiles.js';

const ESTILOS = `
<style>
  .bn-drop {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 26px; border-radius: var(--radius);
    border: 1px dashed var(--border); background: var(--surface-alt-glass);
    color: var(--text-dim); font-size: 13px; cursor: pointer;
  }
  .bn-drop:hover { border-color: var(--accent); color: var(--accent); }
  .bn-preview { position: relative; border-radius: var(--radius); overflow: hidden; margin-bottom: 12px; }
  .bn-barra { height: 5px; background: var(--surface-alt); border-radius: 999px; overflow: hidden; margin-top: 10px; }
  .bn-barra span { display: block; height: 100%; background: var(--accent); transition: width 0.2s; }

  .jg-toolbar {
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    margin: 14px 0 12px;
  }
  .jg-toolbar input[type=search],
  .jg-toolbar select {
    background: var(--surface-alt-glass); border: 1px solid var(--border-glass);
    border-radius: 9px; color: var(--text); padding: 8px 11px; font-size: 13px; font-family: inherit;
  }
  .jg-toolbar input[type=search] { flex: 1; min-width: 200px; }
  .jg-toolbar select { max-width: 220px; }
  .jg-toolbar input:focus, .jg-toolbar select:focus {
    outline: none; border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .jg-meta { font-size: 12px; color: var(--text-dim); margin-left: auto; }
  .jg-lote {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    margin: 0 0 10px; padding: 8px 10px; border-radius: 10px;
    background: var(--surface-alt); border: 1px solid var(--border);
    font-size: 12.5px;
  }
  .jg-lote[hidden] { display: none; }
  .jg-lote button { padding: 6px 12px; font-size: 12.5px; height: auto; min-height: 0; }
  .jg-thumb {
    width: 28px; height: 36px; object-fit: cover; border-radius: 5px;
    background: var(--surface-alt); flex-shrink: 0; vertical-align: middle;
  }
  .jg-nom { display: flex; align-items: center; gap: 10px; }
  .jg-nom strong { display: block; font-size: 13.5px; }
  .jg-pager { display: flex; gap: 10px; align-items: center; justify-content: center; margin-top: 12px; }
  .jg-pager button { padding: 7px 12px; font-size: 12.5px; height: auto; min-height: 0; }
  .tabla .jg-check { width: 28px; }
  .jg-marca-ico {
    display: flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; border-radius: 10px; overflow: hidden;
    border: 1px dashed var(--border); background: var(--surface-alt);
    cursor: pointer; padding: 0;
  }
  .jg-marca-ico:hover { border-color: var(--accent); }
  .jg-marca-ico img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .jg-marca-ico span { color: var(--text-dim); font-size: 18px; line-height: 1; }
  .jg-marca-ico:not(.vacio) { border-style: solid; }
  .jg-marca-nom, .jg-marca-ord {
    width: 100%; background: var(--surface-alt-glass); border: 1px solid var(--border-glass);
    border-radius: 8px; color: var(--text); padding: 7px 9px; font-size: 13px; font-family: inherit;
  }
</style>
`;

function estadoJuegos() {
  return { q: '', categoria: '', proveedor: '', motor: '', estado: '', origen: '', pagina: 1 };
}

export function renderJuegos(container, { profile }) {
  const puedeEditar = puede(profile, 'ajustes');
  container._jg = estadoJuegos();

  container.innerHTML = `
    ${ESTILOS}
    <section class="card">
      <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
        <h2 style="margin:0">Juegos</h2>
        <span class="hint">catálogo que ve el jugador</span>
        ${puedeEditar ? `
          <button class="secundario" id="jg-sinc" style="margin-left:auto">Sincronizar catálogo</button>
          <button class="secundario" id="jg-marcas">Proveedores del lobby</button>
          <button class="secundario" id="jg-proveedores">API de proveedores</button>
        ` : ''}
      </div>
      <div id="jg-sinc-panel"></div>
      <div id="jg-marcas-panel"></div>
      <div id="jg-prov-panel"></div>
      <div class="jg-toolbar" id="jg-toolbar"></div>
      <div class="jg-lote" id="jg-lote" hidden></div>
      <div id="jg-lista"><p class="hint">Cargando...</p></div>
      ${puedeEditar ? '<div class="acciones"><button id="jg-nuevo">Agregar juego</button></div>' : ''}
      <div id="jg-form"></div>
    </section>
  `;

  if (puedeEditar) {
    container.querySelector('#jg-nuevo').addEventListener('click', () => formulario(container, {}, puedeEditar));
    container.querySelector('#jg-sinc').addEventListener('click', () => panelSincronizar(container, puedeEditar));
    container.querySelector('#jg-marcas').addEventListener('click', () => panelMarcas(container));
    container.querySelector('#jg-proveedores').addEventListener('click', () => panelProveedores(container));
  }

  cargar(container, puedeEditar);
}

function qsJuegos(st) {
  const p = new URLSearchParams();
  if (st.q) p.set('q', st.q);
  if (st.categoria) p.set('categoria', st.categoria);
  if (st.proveedor) p.set('proveedor', st.proveedor);
  if (st.motor) p.set('motor', st.motor);
  if (st.estado) p.set('estado', st.estado);
  if (st.origen) p.set('origen', st.origen);
  p.set('pagina', String(st.pagina || 1));
  p.set('porPagina', '50');
  return p.toString();
}

function opcionesFacet(facets, clave, actual) {
  const lista = facets?.[clave] || [];
  return lista.map((f) => {
    const valor = f.valor == null || f.valor === '' ? '' : String(f.valor);
    if (!valor) return '';
    const sel = actual === valor ? 'selected' : '';
    return `<option value="${escapeHtml(valor)}" ${sel}>${escapeHtml(valor)} (${f.n})</option>`;
  }).join('');
}

function pintarToolbar(container, facets, total) {
  const st = container._jg;
  const est = facets?.estados || {};
  const ori = facets?.origen || {};
  const toolbar = container.querySelector('#jg-toolbar');
  const foco = document.activeElement;
  const eraBuscar = foco && foco.id === 'jg-q';
  const pos = eraBuscar ? foco.selectionStart : null;

  toolbar.innerHTML = `
    <input type="search" id="jg-q" value="${escapeHtml(st.q)}" placeholder="Buscar por nombre o slug" autocomplete="off" />
    <select id="jg-f-cat">
      <option value="">Todas las categorías</option>
      ${opcionesFacet(facets, 'categorias', st.categoria)}
    </select>
    <select id="jg-f-prov">
      <option value="">Todos los proveedores</option>
      ${opcionesFacet(facets, 'proveedores', st.proveedor)}
    </select>
    <select id="jg-f-motor">
      <option value="">Todos los tipos</option>
      ${opcionesFacet(facets, 'motores', st.motor)}
    </select>
    <select id="jg-f-est">
      <option value="">Todos (${(est.activo || 0) + (est.oculto || 0)})</option>
      <option value="activo" ${st.estado === 'activo' ? 'selected' : ''}>Activos (${est.activo || 0})</option>
      <option value="oculto" ${st.estado === 'oculto' ? 'selected' : ''}>Ocultos (${est.oculto || 0})</option>
    </select>
    <select id="jg-f-ori">
      <option value="">Propio y externo</option>
      <option value="propio" ${st.origen === 'propio' ? 'selected' : ''}>Propios (${ori.propio || 0})</option>
      <option value="externo" ${st.origen === 'externo' ? 'selected' : ''}>Externos (${ori.externo || 0})</option>
    </select>
    <span class="jg-meta">${Number(total || 0).toLocaleString('es-PY')} juego${total === 1 ? '' : 's'}</span>
  `;

  const qEl = toolbar.querySelector('#jg-q');
  if (eraBuscar) {
    qEl.focus();
    try { qEl.setSelectionRange(pos, pos); } catch { /* */ }
  }

  let t = 0;
  qEl.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      container._jg.q = qEl.value.trim();
      container._jg.pagina = 1;
      cargar(container, puedeDe(container));
    }, 280);
  });

  const filtra = (id, campo) => {
    toolbar.querySelector(id).addEventListener('change', (e) => {
      container._jg[campo] = e.target.value;
      container._jg.pagina = 1;
      cargar(container, puedeDe(container));
    });
  };
  filtra('#jg-f-cat', 'categoria');
  filtra('#jg-f-prov', 'proveedor');
  filtra('#jg-f-motor', 'motor');
  filtra('#jg-f-est', 'estado');
  filtra('#jg-f-ori', 'origen');
}

function puedeDe(container) {
  return Boolean(container.querySelector('#jg-nuevo'));
}

function portada(j) {
  if (j.usar_imagen_personalizada && j.imagen_personalizada_url) return j.imagen_personalizada_url;
  return j.imagen_url || '';
}

async function cargar(container, puedeEditar) {
  const listaEl = container.querySelector('#jg-lista');
  const st = container._jg || (container._jg = estadoJuegos());
  listaEl.innerHTML = '<p class="hint">Cargando...</p>';

  const { ok, data, error } = await apiFetch(`/api/juegos?${qsJuegos(st)}`);
  if (!ok) { listaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

  const juegos = data.juegos || [];
  const total = data.total || 0;
  const pagina = data.pagina || 1;
  const paginas = data.paginas || 1;
  const hayFiltro = Boolean(st.q || st.categoria || st.proveedor || st.motor || st.estado || st.origen);

  pintarToolbar(container, data.facets || {}, total);

  if (!juegos.length) {
    listaEl.innerHTML = `<p class="hint">${hayFiltro ? 'Ningún juego coincide con la búsqueda o los filtros.' : 'Todavía no hay juegos cargados.'}</p>`;
    container.querySelector('#jg-lote').hidden = true;
    return;
  }

  listaEl.innerHTML = `
    <div class="tabla-scroll">
      <table class="tabla">
        <thead>
          <tr>
            ${puedeEditar ? '<th class="jg-check"><input type="checkbox" id="jg-all" title="Seleccionar esta página" /></th>' : ''}
            <th>Juego</th><th>Categoría</th><th>Tipo</th><th>Proveedor</th><th>Estado</th>
            ${puedeEditar ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${juegos.map((j) => {
            const img = portada(j);
            const tipo = j.motor || (j.launch_url ? 'externo' : 'propio');
            return `
              <tr data-id="${j.id}">
                ${puedeEditar ? `<td class="jg-check"><input type="checkbox" class="jg-sel" value="${j.id}" /></td>` : ''}
                <td>
                  <div class="jg-nom">
                    ${img ? `<img class="jg-thumb" src="${escapeHtml(img)}" alt="" />` : '<span class="jg-thumb"></span>'}
                    <div>
                      <strong>${escapeHtml(j.nombre)}</strong>
                      <small class="hint">${escapeHtml(j.slug)}${j.para_bonos ? ' · bono' : ''}</small>
                    </div>
                  </div>
                </td>
                <td>${escapeHtml(j.categoria || '—')}</td>
                <td>${escapeHtml(tipo)}</td>
                <td>${escapeHtml(j.proveedor || 'propio')}</td>
                <td>${j.activo ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-danger">Oculto</span>'}</td>
                <td>${puedeEditar ? `<button class="secundario jg-editar" data-id="${j.id}">Editar</button>` : ''}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${paginas > 1 ? `
      <div class="jg-pager">
        <button class="secundario" id="jg-prev" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
        <span class="hint">${((pagina - 1) * (data.porPagina || 50) + 1).toLocaleString('es-PY')}–${Math.min(pagina * (data.porPagina || 50), total).toLocaleString('es-PY')} de ${total.toLocaleString('es-PY')}</span>
        <button class="secundario" id="jg-next" ${pagina >= paginas ? 'disabled' : ''}>Siguiente</button>
      </div>
    ` : ''}
  `;

  listaEl.querySelectorAll('.jg-editar').forEach((btn) => {
    btn.addEventListener('click', () => {
      formulario(container, juegos.find((j) => j.id === btn.dataset.id), puedeEditar);
    });
  });

  const prev = listaEl.querySelector('#jg-prev');
  const next = listaEl.querySelector('#jg-next');
  if (prev && !prev.disabled) prev.addEventListener('click', () => { st.pagina = pagina - 1; cargar(container, puedeEditar); });
  if (next && !next.disabled) next.addEventListener('click', () => { st.pagina = pagina + 1; cargar(container, puedeEditar); });

  if (puedeEditar) cablearLote(container, puedeEditar);
}

/**
 * Trae el catálogo del proveedor.
 * Los juegos nuevos entran desactivados: alguien los tiene que revisar
 * y decidir límites antes de que aparezcan en el portal.
 */
function panelSincronizar(container, puedeEditar) {
  const panel = container.querySelector('#jg-sinc-panel');

  if (panel.innerHTML) { panel.innerHTML = ''; return; }

  const guardada = localStorage.getItem('catalogo_url') || '';

  panel.innerHTML = `
    <div class="card" style="margin-top:14px">
      <p class="form-grupo" style="margin-top:0">Sincronizar desde el proveedor</p>
      <label class="field">URL del catálogo
        <input id="jg-url" value="${escapeHtml(guardada)}"
               placeholder="https://juegos.tudominio.com/api/manifest" />
      </label>
      <p class="hint">
        Trae los juegos del proveedor. Los nuevos entran desactivados, y lo que vos definiste
        (orden, categoría, límites, si está activo) no se toca.
      </p>
      <div class="acciones">
        <button id="jg-sinc-ok">Sincronizar</button>
        <button class="secundario" id="jg-sinc-no">Cancelar</button>
      </div>
      <div id="jg-sinc-msg"></div>
    </div>
  `;

  panel.querySelector('#jg-sinc-no').addEventListener('click', () => { panel.innerHTML = ''; });

  panel.querySelector('#jg-sinc-ok').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const url = panel.querySelector('#jg-url').value.trim();
    const msgEl = panel.querySelector('#jg-sinc-msg');

    if (!url) {
      msgEl.innerHTML = '<p class="hint error">Pegá la URL del catálogo.</p>';
      return;
    }

    btn.disabled = true;
    msgEl.innerHTML = '<p class="hint">Consultando el catálogo...</p>';

    const { ok, data, error } = await apiFetch('/api/juegos?recurso=sincronizar', { method: 'POST', body: { url } });
    btn.disabled = false;

    if (!ok) {
      msgEl.innerHTML = `<p class="hint error">${error}</p>`;
      return;
    }

    localStorage.setItem('catalogo_url', url);

    const lista = (titulo, arr, clase = 'hint') =>
      arr.length ? `<p class="${clase}">${titulo}: ${arr.map(escapeHtml).join(', ')}</p>` : '';

    msgEl.innerHTML = `
      <div style="border-left:3px solid var(--success);background:var(--surface-alt);padding:12px 14px;margin-top:12px">
        <strong style="display:block;margin-bottom:6px">Catálogo de ${escapeHtml(data.proveedor || 'proveedor')}</strong>
        ${lista('Nuevos (desactivados)', data.nuevos, 'hint ok')}
        ${lista('Actualizados', data.actualizados)}
        ${lista('Sin cambios', data.sinCambios)}
        ${data.rechazados.length ? `
          <p class="hint error" style="margin-top:8px">Rechazados:</p>
          <ul style="margin:4px 0 0;padding-left:18px">
            ${data.rechazados.map((r) => `<li class="hint error">${escapeHtml(r.slug)}: ${escapeHtml(r.motivo)}</li>`).join('')}
          </ul>
        ` : ''}
      </div>
    `;

    cargar(container, puedeEditar);
  });
}

function seleccionados(container) {
  return [...container.querySelectorAll('.jg-sel:checked')].map((el) => el.value);
}

function cablearLote(container, puedeEditar) {
  const lote = container.querySelector('#jg-lote');
  const all = container.querySelector('#jg-all');

  const refrescar = () => {
    const ids = seleccionados(container);
    lote.hidden = ids.length === 0;
    lote.innerHTML = ids.length ? `
      <span>${ids.length} seleccionado${ids.length === 1 ? '' : 's'} en esta página</span>
      <button type="button" id="jg-lote-on">Activar</button>
      <button type="button" class="secundario" id="jg-lote-off">Ocultar</button>
    ` : '';
    if (all) {
      const boxes = container.querySelectorAll('.jg-sel');
      all.checked = boxes.length > 0 && ids.length === boxes.length;
      all.indeterminate = ids.length > 0 && ids.length < boxes.length;
    }
    lote.querySelector('#jg-lote-on')?.addEventListener('click', () => loteAccion(container, puedeEditar, true));
    lote.querySelector('#jg-lote-off')?.addEventListener('click', () => loteAccion(container, puedeEditar, false));
  };

  all?.addEventListener('change', () => {
    container.querySelectorAll('.jg-sel').forEach((el) => { el.checked = all.checked; });
    refrescar();
  });
  container.querySelectorAll('.jg-sel').forEach((el) => el.addEventListener('change', refrescar));
  refrescar();
}

async function loteAccion(container, puedeEditar, activo) {
  const ids = seleccionados(container);
  if (!ids.length) return;
  const { ok, error } = await apiFetch('/api/juegos', {
    method: 'POST',
    body: { accion: 'lote', ids, activo },
  });
  if (!ok) {
    container.querySelector('#jg-lista').insertAdjacentHTML('afterbegin', `<p class="hint error">${escapeHtml(error)}</p>`);
    return;
  }
  cargar(container, puedeEditar);
}



/**
 * Alta y listado de proveedores externos. El secreto se genera del
 * lado del servidor y se muestra UNA sola vez acá — después no se
 * puede volver a ver, hay que regenerarlo si se pierde.
 */
/**
 * Marcas del lobby: icono 1:1 y nombre para cada games.proveedor.
 * Distinto de la API de proveedores (secretos de plata).
 */
function panelMarcas(container) {
  const panel = container.querySelector('#jg-marcas-panel');
  if (panel.innerHTML) { panel.innerHTML = ''; return; }

  panel.innerHTML = `
    <div class="card" style="margin-top:14px">
      <p class="form-grupo" style="margin-top:0">Proveedores del lobby</p>
      <p class="hint" style="margin-top:0">
        Salen de los juegos del catálogo. Subí un icono cuadrado (1:1) y decidí si se muestra
        debajo del banner. No es la API de plata: eso sigue en “API de proveedores”.
      </p>
      <div id="jg-marcas-lista"><p class="hint">Cargando...</p></div>
      <p id="jg-marcas-msg" class="hint"></p>
    </div>
  `;

  const msgEl = panel.querySelector('#jg-marcas-msg');

  const cargarLista = async () => {
    const listaEl = panel.querySelector('#jg-marcas-lista');
    const { ok, data, error } = await apiFetch('/api/juegos?recurso=marcas');
    if (!ok) { listaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

    const filas = data.catalogo || [];
    if (!filas.length) {
      listaEl.innerHTML = '<p class="hint">Todavía no hay proveedores en el catálogo. Sincronizá juegos primero.</p>';
      return;
    }

    listaEl.innerHTML = `
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr><th>Icono 1:1</th><th>En el catálogo</th><th>Nombre en el portal</th><th>Orden</th><th>Lobby</th></tr></thead>
          <tbody>
            ${filas.map((f) => {
              const m = f.marca || {};
              const icono = m.icono_url || '';
              return `
                <tr data-clave="${escapeHtml(f.clave)}">
                  <td>
                    <label class="jg-marca-ico ${icono ? '' : 'vacio'}">
                      ${icono ? `<img src="${escapeHtml(icono)}" alt="" />` : '<span>+</span>'}
                      <input type="file" accept="image/*" hidden class="jg-marca-file" />
                    </label>
                  </td>
                  <td>
                    <strong>${escapeHtml(f.clave)}</strong>
                    <small class="hint">${f.n} juego${f.n === 1 ? '' : 's'}</small>
                  </td>
                  <td><input class="jg-marca-nom" value="${escapeHtml(m.nombre || f.clave)}" /></td>
                  <td><input class="jg-marca-ord" type="number" value="${m.orden ?? 0}" style="width:70px" /></td>
                  <td>
                    <label class="st-permiso" style="margin:0">
                      <input type="checkbox" class="jg-marca-on" ${m.activo !== false && icono ? 'checked' : ''} />
                      <span>Mostrar</span>
                    </label>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    listaEl.querySelectorAll('tr[data-clave]').forEach((tr) => {
      const clave = tr.dataset.clave;
      const fila = filas.find((x) => x.clave === clave);
      const marca = fila?.marca || {};

      const guardar = async (extra = {}) => {
        msgEl.className = 'hint';
        msgEl.textContent = 'Guardando...';
        const { ok: okG, error: errG } = await apiFetch('/api/juegos?recurso=marcas', {
          method: 'POST',
          body: {
            clave,
            nombre: tr.querySelector('.jg-marca-nom').value.trim() || clave,
            orden: Number(tr.querySelector('.jg-marca-ord').value) || 0,
            activo: extra.iconoUrl ? true : tr.querySelector('.jg-marca-on').checked,
            iconoUrl: extra.iconoUrl !== undefined ? extra.iconoUrl : (marca.icono_url || null),
          },
        });
        msgEl.className = okG ? 'hint ok' : 'hint error';
        msgEl.textContent = okG ? 'Guardado.' : errG;
        if (okG) cargarLista();
      };

      tr.querySelector('.jg-marca-nom').addEventListener('change', () => guardar());
      tr.querySelector('.jg-marca-ord').addEventListener('change', () => guardar());
      tr.querySelector('.jg-marca-on').addEventListener('change', () => guardar());

      tr.querySelector('.jg-marca-file').addEventListener('change', async (e) => {
        const archivo = e.target.files?.[0];
        if (!archivo) return;
        msgEl.className = 'hint';
        msgEl.textContent = 'Subiendo icono...';
        try {
          const img = await subirImagen(archivo, { carpeta: 'proveedores' });
          await guardar({ iconoUrl: img.url });
        } catch (err) {
          msgEl.className = 'hint error';
          msgEl.textContent = err.message;
        }
      });
    });
  };

  cargarLista();
}

function panelProveedores(container) {
  const panel = container.querySelector('#jg-prov-panel');

  if (panel.innerHTML) { panel.innerHTML = ''; return; }

  panel.innerHTML = `
    <div class="card" style="margin-top:14px">
      <p class="form-grupo" style="margin-top:0">Proveedores externos</p>
      <div id="jg-prov-lista"><p class="hint">Cargando...</p></div>

      <div style="display:flex;gap:8px;margin-top:12px">
        <input id="jg-prov-nombre" placeholder="Nombre del proveedor (ej: Estudio de Juan)" style="flex:1" />
        <button id="jg-prov-crear">Agregar</button>
      </div>
      <div id="jg-prov-msg"></div>
    </div>
  `;

  const cargarLista = async () => {
    const listaEl = panel.querySelector('#jg-prov-lista');
    const { ok, data, error } = await apiFetch('/api/config?recurso=proveedores');

    if (!ok) { listaEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

    const proveedores = data.proveedores || [];

    listaEl.innerHTML = proveedores.length ? `
      <div class="tabla-scroll">
        <table class="tabla">
          <thead><tr><th>Nombre</th><th>Slug</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            ${proveedores.map((p) => `
              <tr>
                <td>${escapeHtml(p.nombre)}</td>
                <td class="mono hint">${escapeHtml(p.slug)}</td>
                <td>${p.activo ? '<span class="badge badge-ok">Activo</span>' : '<span class="badge badge-danger">Deshabilitado</span>'}</td>
                <td><button class="secundario jg-prov-toggle" data-id="${p.id}" data-activo="${p.activo}">${p.activo ? 'Deshabilitar' : 'Habilitar'}</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p class="hint">Todavía no agregaste ningún proveedor.</p>';

    listaEl.querySelectorAll('.jg-prov-toggle').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await apiFetch('/api/config?recurso=proveedores', {
          method: 'POST',
          body: { id: btn.dataset.id, activo: btn.dataset.activo !== 'true' },
        });
        cargarLista();
      });
    });
  };

  panel.querySelector('#jg-prov-crear').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const nombreEl = panel.querySelector('#jg-prov-nombre');
    const nombre = nombreEl.value.trim();
    const msgEl = panel.querySelector('#jg-prov-msg');

    if (!nombre) { msgEl.innerHTML = '<p class="hint error">Escribí un nombre.</p>'; return; }

    btn.disabled = true;
    const { ok, data, error } = await apiFetch('/api/config?recurso=proveedores', {
      method: 'POST', body: { nombre },
    });
    btn.disabled = false;

    if (!ok) { msgEl.innerHTML = `<p class="hint error">${error}</p>`; return; }

    nombreEl.value = '';

    // El secreto se muestra una sola vez: hay que copiarlo ahora.
    msgEl.innerHTML = `
      <div style="border-left:3px solid var(--success);background:var(--surface-alt);padding:12px 14px;margin-top:10px">
        <strong style="display:block;margin-bottom:6px">Proveedor creado: ${escapeHtml(data.proveedor.nombre)}</strong>
        <p class="hint" style="margin:0 0 6px">
          Mandale este secreto por un canal privado. No se vuelve a mostrar — si se pierde, hay que regenerarlo.
        </p>
        <code style="display:block;background:var(--surface);padding:8px 10px;border-radius:6px;word-break:break-all;font-size:12px">${escapeHtml(data.secreto)}</code>
      </div>
    `;

    cargarLista();
  });

  cargarLista();
}

function formulario(container, juego, puedeEditar) {
  const formEl = container.querySelector('#jg-form');
  const esNuevo = !juego.id;
  let imagen = juego.imagen_url ? { url: juego.imagen_url } : null;

  // Portada personalizada: separada de la que trae el proveedor, así
  // cambiar de una fuente a la otra no borra la que no se está usando.
  let imagenPersonalizada = juego.imagen_personalizada_url ? { url: juego.imagen_personalizada_url } : null;
  let video = juego.video_url ? { url: juego.video_url } : null;

  // Cartel sobre la miniatura: '' = ninguno.
  let cartelTipo = juego.cartel_tipo || '';

  const pintar = () => {
    formEl.innerHTML = `
      <div class="card" style="margin-top:16px">
        <h3 style="margin-top:0">${esNuevo ? 'Nuevo juego' : escapeHtml(juego.nombre)}</h3>

        <p class="form-grupo">Identificación</p>
        <label class="field">Nombre
          <input id="jg-nombre" value="${escapeHtml(juego.nombre || '')}" placeholder="Fortune" />
        </label>

        ${esNuevo ? `
          <label class="field">Motor (slug)
            <input id="jg-slug" placeholder="fortune" />
          </label>
          <p class="hint">Identifica qué motor usa el juego. No se puede cambiar después.</p>
        ` : ''}

        <label class="field">Descripción
          <input id="jg-desc" value="${escapeHtml(juego.descripcion || '')}" placeholder="Clásico de 3 rodillos" />
        </label>
        <label class="field">Categoría
          <input id="jg-cat" value="${escapeHtml(juego.categoria || 'Populares')}" placeholder="Populares" />
        </label>

        <label class="st-permiso" style="max-width:280px;margin:6px 0 10px">
          <input type="checkbox" id="jg-externo" ${juego.launch_url ? 'checked' : ''} />
          <span>Juego de un proveedor externo</span>
        </label>
        <div id="jg-externo-campos" style="${juego.launch_url ? '' : 'display:none'}">
          <label class="field">URL de lanzamiento del proveedor
            <input id="jg-launch" value="${escapeHtml(juego.launch_url || '')}" placeholder="https://juego-del-amigo.vercel.app" />
          </label>
          <label class="field">Proveedor
            <select id="jg-proveedor-id"><option value="">Cargando...</option></select>
          </label>
        </div>

        <p class="form-grupo">Portada del proveedor</p>
        ${imagen ? `
          <div class="bn-preview" style="max-width:200px">
            <img src="${imagen.url}" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px" />
          </div>
          <div class="acciones" style="margin-bottom:14px">
            <button class="secundario" id="jg-quitar-img">Cambiar imagen</button>
          </div>
        ` : `
          <label class="bn-drop">
            <input type="file" id="jg-file" accept="image/*" hidden />
            <strong style="font-weight:500">Subir portada</strong>
            <small>Vertical, 3:4. Ideal 600x800 px.</small>
          </label>
        `}
        <div id="jg-prog"></div>

        <label class="st-permiso" style="max-width:340px;margin-top:14px">
          <input type="checkbox" id="jg-usar-personalizada" ${juego.usar_imagen_personalizada ? 'checked' : ''} />
          <span>Usar una imagen personalizada en vez de la de arriba</span>
        </label>
        <div id="jg-personalizada-campos" style="${juego.usar_imagen_personalizada ? '' : 'display:none'}">
          ${imagenPersonalizada ? `
            <div class="bn-preview" style="max-width:200px;margin-top:10px">
              <img src="${imagenPersonalizada.url}" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px" />
            </div>
            <div class="acciones" style="margin-bottom:14px">
              <button class="secundario" id="jg-quitar-img-personalizada">Cambiar imagen</button>
            </div>
          ` : `
            <label class="bn-drop" style="margin-top:10px">
              <input type="file" id="jg-file-personalizada" accept="image/*" hidden />
              <strong style="font-weight:500">Subir imagen personalizada</strong>
              <small>Vertical, 3:4. Ideal 600x800 px.</small>
            </label>
          `}
          <div id="jg-prog-personalizada"></div>
        </div>

        <p class="form-grupo">Video al pasar el mouse</p>
        <p class="hint">La carta se queda en foto. El clip solo se pide y corre cuando el jugador pasa por encima — no se cargan todos juntos. 2 segundos, sin audio, MP4 o WebM, ideal menos de 300 KB.</p>
        ${video ? `
          <div class="bn-preview" style="max-width:200px">
            <video src="${video.url}" muted playsinline style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:10px"></video>
          </div>
          <div class="acciones" style="margin-bottom:14px">
            <button class="secundario" id="jg-quitar-video">Quitar video</button>
          </div>
        ` : `
          <label class="bn-drop">
            <input type="file" id="jg-file-video" accept="video/mp4,video/webm,video/quicktime" hidden />
            <strong style="font-weight:500">Subir clip de portada</strong>
            <small>MP4 o WebM, 2s, sin audio.</small>
          </label>
        `}
        <div id="jg-prog-video"></div>

        <p class="form-grupo">Cartel sobre la miniatura</p>
        <div class="opciones-pill">
          ${[['', 'Ninguno'], ['vip', 'VIP'], ['hot', 'Hot'], ['nuevo', 'Nuevo'], ['personalizado', 'Personalizado']].map(([valor, etiqueta]) => `
            <label class="${cartelTipo === valor ? 'is-activa' : ''}">
              <input type="radio" name="jg-cartel" value="${valor}" ${cartelTipo === valor ? 'checked' : ''} />
              ${etiqueta}
            </label>
          `).join('')}
        </div>

        ${cartelTipo === 'nuevo' ? `
          <label class="field" style="max-width:200px">Mostrar hasta (opcional)
            <input type="date" id="jg-cartel-hasta" value="${juego.cartel_hasta || ''}" />
          </label>
          <p class="hint">Vacío = no se apaga solo.</p>
        ` : ''}

        ${cartelTipo === 'personalizado' ? `
          <label class="field">Animación de la biblioteca
            <select id="jg-cartel-animacion"><option value="">Cargando...</option></select>
          </label>
          <p class="hint">¿No está la que buscás? Subila desde "Animaciones" en el menú.</p>
        ` : ''}

        <p class="form-grupo">Apuestas</p>
        <div class="campos-fila">
          <label class="field">Mínima
            <input id="jg-min" type="number" min="0" value="${juego.min_bet ?? 1000}" />
          </label>
          <label class="field">Máxima
            <input id="jg-max" type="number" min="0" value="${juego.max_bet ?? 100000}" />
          </label>
          <label class="field corto">Orden
            <input id="jg-orden" type="number" value="${juego.orden ?? 0}" />
          </label>
        </div>

        <label class="st-permiso" style="max-width:220px;margin-top:10px">
          <input type="checkbox" id="jg-activo" ${juego.activo !== false ? 'checked' : ''} />
          <span>Visible para los jugadores</span>
        </label>

        <label class="st-permiso" style="max-width:320px;margin-top:6px">
          <input type="checkbox" id="jg-para-bonos" ${juego.para_bonos ? 'checked' : ''} />
          <span>Juego para bonos — el rollover avanza jugando este</span>
        </label>
        <p class="hint" style="margin-top:2px">Si marcás al menos un juego, el rollover del bono solo baja jugando los marcados. Si no marcás ninguno, cuentan todos (como hoy).</p>

        <div class="acciones">
          <button id="jg-guardar">Guardar</button>
          <button id="jg-cancelar" class="secundario">Cancelar</button>
        </div>
        <p id="jg-msg" class="hint"></p>
      </div>
    `;

    formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const msgEl = formEl.querySelector('#jg-msg');

    // Mostrar/ocultar los campos del proveedor externo
    formEl.querySelector('#jg-externo')?.addEventListener('change', (e) => {
      formEl.querySelector('#jg-externo-campos').style.display = e.target.checked ? '' : 'none';
    });

    // Cargar la lista de proveedores para el desplegable
    apiFetch('/api/config?recurso=proveedores').then(({ ok, data }) => {
      const sel = formEl.querySelector('#jg-proveedor-id');
      if (!sel) return;
      const opciones = ok ? (data.proveedores || []) : [];
      sel.innerHTML = '<option value="">Elegí un proveedor</option>' +
        opciones.map((p) => `<option value="${p.id}" ${p.id === juego.proveedor_id ? 'selected' : ''}>${escapeHtml(p.nombre)}${p.activo ? '' : ' (deshabilitado)'}</option>`).join('');
    });

    formEl.querySelector('#jg-file')?.addEventListener('change', async (e) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;

      const prog = formEl.querySelector('#jg-prog');
      prog.innerHTML = '<div class="bn-barra"><span style="width:0%"></span></div>';
      const barra = prog.querySelector('span');

      try {
        imagen = await subirImagen(archivo, { carpeta: 'juegos', onProgreso: (p) => { barra.style.width = p + '%'; } });
        pintar();
      } catch (err) {
        prog.innerHTML = `<p class="hint error">${err.message}</p>`;
      }
    });

    formEl.querySelector('#jg-quitar-img')?.addEventListener('click', () => { imagen = null; pintar(); });

    // Portada personalizada: mismo mecanismo que la de arriba, en un
    // campo aparte para no perder una cuando se usa la otra.
    formEl.querySelector('#jg-usar-personalizada')?.addEventListener('change', (e) => {
      formEl.querySelector('#jg-personalizada-campos').style.display = e.target.checked ? '' : 'none';
    });

    formEl.querySelector('#jg-file-personalizada')?.addEventListener('change', async (e) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;

      const prog = formEl.querySelector('#jg-prog-personalizada');
      prog.innerHTML = '<div class="bn-barra"><span style="width:0%"></span></div>';
      const barra = prog.querySelector('span');

      try {
        imagenPersonalizada = await subirImagen(archivo, { carpeta: 'juegos', onProgreso: (p) => { barra.style.width = p + '%'; } });
        pintar();
      } catch (err) {
        prog.innerHTML = `<p class="hint error">${err.message}</p>`;
      }
    });

    formEl.querySelector('#jg-quitar-img-personalizada')?.addEventListener('click', () => {
      imagenPersonalizada = null;
      pintar();
    });

    formEl.querySelector('#jg-file-video')?.addEventListener('change', async (e) => {
      const archivo = e.target.files?.[0];
      if (!archivo) return;

      const prog = formEl.querySelector('#jg-prog-video');
      prog.innerHTML = '<div class="bn-barra"><span style="width:0%"></span></div>';
      const barra = prog.querySelector('span');

      try {
        video = await subirVideo(archivo, { carpeta: 'juegos', onProgreso: (p) => { barra.style.width = p + '%'; } });
        pintar();
      } catch (err) {
        prog.innerHTML = `<p class="hint error">${err.message}</p>`;
      }
    });

    formEl.querySelector('#jg-quitar-video')?.addEventListener('click', () => { video = null; pintar(); });

    // El cartel cambia qué campo extra aparece (fecha, o el desplegable
    // de animaciones), así que un cambio de tipo repinta todo el form.
    formEl.querySelectorAll('input[name="jg-cartel"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        cartelTipo = e.target.value;
        pintar();
      });
    });

    if (cartelTipo === 'personalizado') {
      apiFetch('/api/config?recurso=animaciones').then(({ ok, data }) => {
        const sel = formEl.querySelector('#jg-cartel-animacion');
        if (!sel) return;
        const opciones = ok ? (data.animaciones || []) : [];
        sel.innerHTML = '<option value="">Elegí una animación</option>' +
          opciones.map((a) => `<option value="${a.id}" ${a.id === juego.cartel_animacion_id ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('');
      });
    }

    formEl.querySelector('#jg-cancelar').addEventListener('click', () => { formEl.innerHTML = ''; });

    formEl.querySelector('#jg-guardar').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      msgEl.className = 'hint';
      msgEl.textContent = 'Guardando...';

      const esExterno = formEl.querySelector('#jg-externo').checked;
      const cartelElegido = formEl.querySelector('input[name="jg-cartel"]:checked')?.value || '';

      const { ok, error } = await apiFetch('/api/juegos', {
        method: 'POST',
        body: {
          id: juego.id,
          slug: formEl.querySelector('#jg-slug')?.value,
          nombre: formEl.querySelector('#jg-nombre').value,
          descripcion: formEl.querySelector('#jg-desc').value,
          imagenUrl: imagen?.url || null,
          categoria: formEl.querySelector('#jg-cat').value,
          paraBonos: formEl.querySelector('#jg-para-bonos').checked,
          minBet: formEl.querySelector('#jg-min').value,
          maxBet: formEl.querySelector('#jg-max').value,
          orden: formEl.querySelector('#jg-orden').value,
          activo: formEl.querySelector('#jg-activo').checked,
          launchUrl: esExterno ? formEl.querySelector('#jg-launch').value.trim() : null,
          proveedorId: esExterno ? (formEl.querySelector('#jg-proveedor-id').value || null) : null,
          imagenPersonalizadaUrl: imagenPersonalizada?.url || null,
          usarImagenPersonalizada: formEl.querySelector('#jg-usar-personalizada').checked,
          videoUrl: video?.url || null,
          cartelTipo: cartelElegido || null,
          cartelAnimacionId: cartelElegido === 'personalizado'
            ? (formEl.querySelector('#jg-cartel-animacion')?.value || null) : null,
          cartelHasta: cartelElegido === 'nuevo'
            ? (formEl.querySelector('#jg-cartel-hasta')?.value || null) : null,
        },
      });

      btn.disabled = false;

      if (!ok) {
        msgEl.className = 'hint error';
        msgEl.textContent = error;
        return;
      }

      formEl.innerHTML = '';
      cargar(container, puedeEditar);
    });
  };

  pintar();
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
