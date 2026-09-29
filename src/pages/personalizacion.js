import { supabase } from '../lib/supabaseClient.js';
import { apiFetch } from '../lib/api.ts';
import { puede } from '../lib/perfiles.js';
import { THEMES, TEMPLATES, applyAppearance, applyBackground } from '../lib/themes.js';
import { APPEARANCE_GROUPS, resolveAppearance, sanitizeOverrides } from '../lib/appearance.js';
import { subirImagen } from '../lib/subir-imagen.js';

let animacionesCache = [];

// Vista previa de cada plantilla: un mini-wireframe hecho con divs,
// para que el admin vea la estructura antes de aplicarla.
const TEMPLATE_PREVIEWS = {
  clasico: '<div class="tpl-prev tpl-centered"><span></span></div>',
  'mesa-de-control': '<div class="tpl-prev tpl-sidebar"><span class="side"></span><span class="main"></span></div>',
  fichas: '<div class="tpl-prev tpl-chips"><span></span><span></span><span></span></div>',
  tablero: '<div class="tpl-prev tpl-grid"><span></span><span></span><span class="wide"></span></div>',
  minimal: '<div class="tpl-prev tpl-minimal"><span></span><span></span><span></span></div>',
  'minimal-ejecutivo': '<div class="tpl-prev tpl-minimal"><span></span><span></span><span></span></div>',
};

export function renderPersonalizacion(container, { profile, settings, onSaved }) {
  const esAdmin = puede(profile, 'ajustes');

  // Estado local: lo que el admin está probando ahora, sin guardar todavía.
  let draft = {
    themeKey: settings.theme_key,
    templateKey: settings.template_key,
    casinoName: settings.casino_name,
    logoUrl: settings.logo_url || '',
    wordmarkUrl: settings.wordmark_url || '',
    bgLoginUrl: settings.bg_login_url || '',
    bgPanelUrl: settings.bg_panel_url || '',
    bgJuegosUrl: settings.bg_juegos_url || '',
    bgLoginDim: settings.bg_login_dim ?? 55,
    bgPanelDim: settings.bg_panel_dim ?? 88,
    bgJuegosDim: settings.bg_juegos_dim ?? 80,
    surfaceOpacity: settings.surface_opacity ?? 100,
    surfaceBlur: settings.surface_blur ?? 0,
    soporteAnimacionId: settings.soporte_animacion_id || '',
    saldoAnimacionId: settings.saldo_animacion_id || '',
    saldoAnimacionPosicion: settings.saldo_animacion_posicion || 'antes',
    overrides: sanitizeOverrides(settings.theme_overrides || {}),
  };

  const resolvedAhora = () => resolveAppearance(THEMES[draft.themeKey] || THEMES['carmesi-rivelbet'], draft.overrides);

  const pintar = () => applyAppearance({
    theme_key: draft.themeKey,
    template_key: draft.templateKey,
    surface_opacity: draft.surfaceOpacity,
    surface_blur: draft.surfaceBlur,
    theme_overrides: draft.overrides,
  });

  container.innerHTML = `
    <section class="card personalizacion">
      <h2>Personalización</h2>
      <p class="hint ap-intro">Elegí un punto de partida y después pintá cada capa. Así no hace falta inventar un tema nuevo cada vez que un color no cierra.</p>

      <label class="field">
        Nombre del casino
        <input id="casino-name" value="${escapeHtml(draft.casinoName)}" ${esAdmin ? '' : 'disabled'} />
      </label>

      <h3>Punto de partida</h3>
      <div class="theme-grid">
        ${Object.entries(THEMES).map(([key, t]) => `
          <button type="button" class="theme-option ${key === draft.themeKey ? 'is-selected' : ''}" data-theme="${key}" ${esAdmin ? '' : 'disabled'}>
            <span class="swatches">
              <span style="background:${t.colors.bg}"></span>
              <span style="background:${t.colors.accent}"></span>
              <span style="background:${t.colors.secondary}"></span>
            </span>
            <strong>${t.name}</strong>
            <small>${t.description}</small>
          </button>
        `).join('')}
      </div>

      <h3>Capas del portal</h3>
      <p class="hint">Cada control pinta en vivo. Guardá cuando te guste. “Volver al punto de partida” tira lo pintado a mano y deja el tema elegido.</p>
      <div class="ap-studio">
        <div class="ap-layers" id="ap-layers">
          ${htmlCapas(resolvedAhora(), esAdmin)}
        </div>
        <aside class="ap-preview" aria-label="Vista previa del portal">
          <div class="ap-phone">
            <div class="ap-phone-header">
              <strong>${escapeHtml(draft.casinoName || 'RivelBet')}</strong>
              <span class="ap-chip">₲ 2.500.000</span>
              <button type="button" class="pt-recargar" tabindex="-1">Recargar</button>
            </div>
            <div class="ap-phone-banner">
              La suerte se viste de rojo.
              <small>Así se ve el lobby con los colores de ahora.</small>
            </div>
            <div class="ap-phone-cards">
              <div class="ap-card"></div>
              <div class="ap-card"></div>
              <div class="ap-card"></div>
            </div>
            <div class="ap-phone-nav">
              <span class="is-active">Casino</span>
              <span>Buscar</span>
              <span>Cuenta</span>
            </div>
          </div>
          <p class="hint">El panel de staff toma los mismos colores. Las plantillas de más abajo cambian la estructura, no la paleta.</p>
        </aside>
      </div>

      <h3>Plantilla visual</h3>
      <div class="template-grid">
        ${Object.entries(TEMPLATES).map(([key, t]) => `
          <button type="button" class="template-option ${key === draft.templateKey ? 'is-selected' : ''}" data-template="${key}" ${esAdmin ? '' : 'disabled'}>
            ${TEMPLATE_PREVIEWS[key] || ''}
            <strong>${t.name}</strong>
            <small>${t.description}</small>
          </button>
        `).join('')}
      </div>

      <h3>Imágenes</h3>
      <label class="field">
        Logo (URL)
        <input id="logo-url" value="${escapeHtml(draft.logoUrl)}" placeholder="https://..." ${esAdmin ? '' : 'disabled'} />
      </label>
      <p class="hint">Ícono chico a la izquierda del nombre.</p>

      <label class="field">
        Nombre en el header (imagen)
        <input id="wordmark-url" value="${escapeHtml(draft.wordmarkUrl)}" placeholder="https://..." ${esAdmin ? '' : 'disabled'} />
      </label>
      <p class="hint">PNG sin fondo, horizontal. Si hay imagen, reemplaza el texto del nombre. El logo chico se queda.</p>
      ${esAdmin ? `
        <label class="field" style="max-width:280px">
          Subir PNG del nombre
          <input type="file" id="wordmark-file" accept="image/png,image/webp,image/jpeg" />
        </label>
        <div id="wordmark-prog"></div>
      ` : ''}

      <div class="fondo-bloque">
        <label class="field">
          Fondo del login (URL)
          <input id="bg-login" value="${escapeHtml(draft.bgLoginUrl)}" placeholder="https://..." ${esAdmin ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span class="fondo-label">Oscurecer fondo del login <b id="dim-login-val">${draft.bgLoginDim}%</b></span>
          <input id="dim-login" type="range" min="0" max="100" value="${draft.bgLoginDim}" ${esAdmin ? '' : 'disabled'} />
        </label>
      </div>

      <div class="fondo-bloque">
        <label class="field">
          Fondo del panel (URL)
          <input id="bg-panel" value="${escapeHtml(draft.bgPanelUrl)}" placeholder="https://..." ${esAdmin ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span class="fondo-label">Oscurecer fondo del panel <b id="dim-panel-val">${draft.bgPanelDim}%</b></span>
          <input id="dim-panel" type="range" min="0" max="100" value="${draft.bgPanelDim}" ${esAdmin ? '' : 'disabled'} />
        </label>
        <p class="hint">Conviene dejarlo alto: la foto tiene que acompañar sin tapar los montos.</p>
      </div>

      <div class="fondo-bloque">
        <label class="field">
          Fondo del portal del jugador — donde están los juegos (URL)
          <input id="bg-juegos" value="${escapeHtml(draft.bgJuegosUrl)}" placeholder="https://..." ${esAdmin ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span class="fondo-label">Oscurecer fondo del portal <b id="dim-juegos-val">${draft.bgJuegosDim}%</b></span>
          <input id="dim-juegos" type="range" min="0" max="100" value="${draft.bgJuegosDim}" ${esAdmin ? '' : 'disabled'} />
        </label>
        <p class="hint">Es independiente del fondo del login: se ve solo una vez adentro, detrás de la lista de juegos.</p>
      </div>

      <h3>Chat de soporte</h3>
      <label class="field" style="max-width:340px">
        Ícono animado del globo flotante
        <select id="soporte-animacion" ${esAdmin ? '' : 'disabled'}><option value="">Cargando...</option></select>
      </label>
      <p class="hint">¿No está la que buscás? Subila desde "Animaciones" en el menú. Sin ninguna elegida, se muestra un ícono fijo.</p>

      <h3>Ficha animada del saldo</h3>
      <label class="field" style="max-width:340px">
        Animación junto al monto (header)
        <select id="saldo-animacion" ${esAdmin ? '' : 'disabled'}><option value="">Cargando...</option></select>
      </label>
      <p class="hint">Sin ninguna elegida, el chip de saldo queda como está hoy, sin ícono.</p>

      <p class="form-grupo">Ubicación de la ficha</p>
      <div class="opciones-pill">
        ${[['antes', 'Antes del monto'], ['grande', 'Más grande'], ['despues', 'Después del monto']].map(([valor, etiqueta]) => `
          <label class="${draft.saldoAnimacionPosicion === valor ? 'is-activa' : ''}">
            <input type="radio" name="saldo-posicion" value="${valor}" ${draft.saldoAnimacionPosicion === valor ? 'checked' : ''} ${esAdmin ? '' : 'disabled'} />
            ${etiqueta}
          </label>
        `).join('')}
      </div>

      <h3>Transparencia</h3>
      <div class="fondo-bloque">
        <label class="field">
          <span class="fondo-label">Opacidad de las tarjetas <b id="op-val">${draft.surfaceOpacity}%</b></span>
          <input id="op-surface" type="range" min="0" max="100" value="${draft.surfaceOpacity}" ${esAdmin ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span class="fondo-label">Desenfoque detrás <b id="blur-val">${draft.surfaceBlur}px</b></span>
          <input id="blur-surface" type="range" min="0" max="30" value="${draft.surfaceBlur}" ${esAdmin ? '' : 'disabled'} />
        </label>
        <p class="hint">Al bajar la opacidad se ve la imagen a través de las tarjetas. Subí el desenfoque para que los montos sigan siendo legibles.</p>
      </div>

      ${esAdmin ? `
        <div class="acciones">
          <button id="guardar-apariencia">Guardar cambios</button>
          <button id="descartar" class="secundario">Descartar</button>
        </div>
        <p id="apariencia-msg" class="hint"></p>
      ` : `
        <p class="hint">No tenés permiso para cambiar la apariencia.</p>
      `}
    </section>
  `;

  const msgEl = container.querySelector('#apariencia-msg');

  // Cada clic aplica el tema al instante — el admin ve el resultado real,
  // no una miniatura. Si descarta, volvemos a lo guardado.
  container.querySelectorAll('[data-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.themeKey = btn.dataset.theme;
      draft.overrides = {};
      marcarSeleccion(container, '[data-theme]', btn);
      refrescarCapas();
      pintar();
    });
  });

  container.querySelectorAll('[data-template]').forEach((btn) => {
    btn.addEventListener('click', () => {
      draft.templateKey = btn.dataset.template;
      marcarSeleccion(container, '[data-template]', btn);
      pintar();
    });
  });

  if (!esAdmin) return;

  container.querySelector('#casino-name').addEventListener('input', (e) => {
    draft.casinoName = e.target.value;
    const preview = container.querySelector('.ap-phone-header strong');
    if (preview) preview.textContent = draft.casinoName || 'RivelBet';
  });

  container.querySelector('#logo-url').addEventListener('input', (e) => {
    draft.logoUrl = e.target.value.trim();
  });

  container.querySelector('#wordmark-url')?.addEventListener('input', (e) => {
    draft.wordmarkUrl = e.target.value.trim();
  });

  container.querySelector('#wordmark-file')?.addEventListener('change', async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const prog = container.querySelector('#wordmark-prog');
    if (prog) prog.innerHTML = '<p class="hint">Subiendo...</p>';
    try {
      const subida = await subirImagen(archivo, { carpeta: 'marca' });
      draft.wordmarkUrl = subida.url;
      const input = container.querySelector('#wordmark-url');
      if (input) input.value = subida.url;
      if (prog) prog.innerHTML = '<p class="hint">Listo. Guardá para que se vea en el portal.</p>';
    } catch (err) {
      if (prog) prog.innerHTML = `<p class="hint error">${err.message}</p>`;
    }
  });

  // Los fondos se aplican en vivo, igual que los temas.
  const vincularFondo = (zona, inputId, rangeId, valId, campoUrl, campoDim) => {
    const inputUrl = container.querySelector(inputId);
    const range = container.querySelector(rangeId);
    const valEl = container.querySelector(valId);

    const pintar = () => applyBackground(zona, { url: draft[campoUrl], dim: draft[campoDim] });

    inputUrl.addEventListener('input', (e) => {
      draft[campoUrl] = e.target.value.trim();
      pintar();
    });

    range.addEventListener('input', (e) => {
      draft[campoDim] = Number(e.target.value);
      valEl.textContent = `${draft[campoDim]}%`;
      pintar();
    });
  };

  apiFetch('/api/config?recurso=animaciones').then(({ ok, data }) => {
    animacionesCache = ok ? (data.animaciones || []) : [];
    const opciones = animacionesCache;
    const soporte = container.querySelector('#soporte-animacion');
    if (soporte) {
      soporte.innerHTML = '<option value="">Ícono fijo (sin animación)</option>' +
        opciones.map((a) => `<option value="${a.id}" ${a.id === draft.soporteAnimacionId ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('');
    }
    const saldo = container.querySelector('#saldo-animacion');
    if (saldo) {
      saldo.innerHTML = '<option value="">Sin ícono</option>' +
        opciones.map((a) => `<option value="${a.id}" ${a.id === draft.saldoAnimacionId ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('');
    }
    const layers = container.querySelector('#ap-layers');
    if (layers) llenarAnimaciones(layers);
  });

  container.querySelector('#soporte-animacion').addEventListener('change', (e) => {
    draft.soporteAnimacionId = e.target.value;
  });

  container.querySelector('#saldo-animacion').addEventListener('change', (e) => {
    draft.saldoAnimacionId = e.target.value;
  });

  container.querySelectorAll('input[name="saldo-posicion"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      draft.saldoAnimacionPosicion = e.target.value;
      container.querySelectorAll('input[name="saldo-posicion"]').forEach((r) => {
        r.closest('label').classList.toggle('is-activa', r.checked);
      });
    });
  });

  vincularFondo('login', '#bg-login', '#dim-login', '#dim-login-val', 'bgLoginUrl', 'bgLoginDim');
  vincularFondo('panel', '#bg-panel', '#dim-panel', '#dim-panel-val', 'bgPanelUrl', 'bgPanelDim');
  vincularFondo('juegos', '#bg-juegos', '#dim-juegos', '#dim-juegos-val', 'bgJuegosUrl', 'bgJuegosDim');

  container.querySelector('#op-surface').addEventListener('input', (e) => {
    draft.surfaceOpacity = Number(e.target.value);
    container.querySelector('#op-val').textContent = `${draft.surfaceOpacity}%`;
    pintar();
  });

  container.querySelector('#blur-surface').addEventListener('input', (e) => {
    draft.surfaceBlur = Number(e.target.value);
    container.querySelector('#blur-val').textContent = `${draft.surfaceBlur}px`;
    pintar();
  });

  enlazarCapas();

  container.querySelector('#descartar').addEventListener('click', () => {
    draft = {
      themeKey: settings.theme_key,
      templateKey: settings.template_key,
      casinoName: settings.casino_name,
      logoUrl: settings.logo_url || '',
    wordmarkUrl: settings.wordmark_url || '',
      bgLoginUrl: settings.bg_login_url || '',
      bgPanelUrl: settings.bg_panel_url || '',
      bgJuegosUrl: settings.bg_juegos_url || '',
      bgLoginDim: settings.bg_login_dim ?? 55,
      bgPanelDim: settings.bg_panel_dim ?? 88,
      bgJuegosDim: settings.bg_juegos_dim ?? 80,
      surfaceOpacity: settings.surface_opacity ?? 100,
      surfaceBlur: settings.surface_blur ?? 0,
      soporteAnimacionId: settings.soporte_animacion_id || '',
      saldoAnimacionId: settings.saldo_animacion_id || '',
      saldoAnimacionPosicion: settings.saldo_animacion_posicion || 'antes',
      overrides: sanitizeOverrides(settings.theme_overrides || {}),
    };
    applyAppearance({
      theme_key: draft.themeKey,
      template_key: draft.templateKey,
      surface_opacity: draft.surfaceOpacity,
      surface_blur: draft.surfaceBlur,
      theme_overrides: draft.overrides,
    });
    applyBackground('login', { url: draft.bgLoginUrl, dim: draft.bgLoginDim });
    applyBackground('panel', { url: draft.bgPanelUrl, dim: draft.bgPanelDim });
    applyBackground('juegos', { url: draft.bgJuegosUrl, dim: draft.bgJuegosDim });
    renderPersonalizacion(container, { profile, settings, onSaved });
  });

  container.querySelector('#guardar-apariencia').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    msgEl.textContent = 'Guardando...';

    const { ok, data: body, error } = await apiFetch('/api/config?recurso=settings', {
      method: 'POST',
      body: {
        themeKey: draft.themeKey,
        templateKey: draft.templateKey,
        casinoName: draft.casinoName,
        logoUrl: draft.logoUrl,
        wordmarkUrl: draft.wordmarkUrl,
        bgLoginUrl: draft.bgLoginUrl,
        bgPanelUrl: draft.bgPanelUrl,
        bgJuegosUrl: draft.bgJuegosUrl,
        bgLoginDim: draft.bgLoginDim,
        bgPanelDim: draft.bgPanelDim,
        bgJuegosDim: draft.bgJuegosDim,
        surfaceOpacity: draft.surfaceOpacity,
        surfaceBlur: draft.surfaceBlur,
        soporteAnimacionId: draft.soporteAnimacionId || null,
        saldoAnimacionId: draft.saldoAnimacionId || null,
        saldoAnimacionPosicion: draft.saldoAnimacionPosicion,
        themeOverrides: draft.overrides,
      },
    });
    btn.disabled = false;

    if (!ok) {
      msgEl.textContent = `No se pudo guardar: ${error}`;
      return;
    }

    msgEl.textContent = 'Apariencia guardada.';
    onSaved?.(body);
  });

  function refrescarCapas() {
    const layers = container.querySelector('#ap-layers');
    if (!layers) return;
    layers.innerHTML = htmlCapas(resolvedAhora(), esAdmin);
    enlazarCapas();
  }

  function enlazarCapas() {
    const layers = container.querySelector('#ap-layers');
    if (!layers) return;

    const escribir = (key, value) => {
      draft.overrides = { ...draft.overrides, [key]: value };
      pintar();
      syncVisibilidadBoton();
    };

    layers.querySelectorAll('[data-ap]').forEach((el) => {
      const key = el.dataset.ap;
      const tipo = el.dataset.apType;

      if (tipo === 'color') {
        el.addEventListener('input', () => {
          const hex = el.value;
          const txt = layers.querySelector(`[data-ap-hex="${key}"]`);
          if (txt) txt.value = hex;
          escribir(key, hex);
        });
      } else if (tipo === 'hex') {
        el.addEventListener('change', () => {
          const hex = el.value.trim();
          if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return;
          const full = hex.length === 4
            ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
            : hex;
          const picker = layers.querySelector(`[data-ap="${key}"][data-ap-type="color"]`);
          if (picker) picker.value = full;
          escribir(key, full.toLowerCase());
        });
      } else if (tipo === 'range') {
        el.addEventListener('input', () => {
          const n = Number(el.value);
          const val = layers.querySelector(`[data-ap-val="${key}"]`);
          if (val) {
            val.textContent = (n === 0 && el.dataset.apZero)
              ? el.dataset.apZero
              : `${n}${el.dataset.apUnit || ''}`;
          }
          escribir(key, n);
        });
      } else if (tipo === 'select') {
        el.addEventListener('change', () => escribir(key, el.value));
      } else if (tipo === 'toggle') {
        el.addEventListener('change', () => escribir(key, el.checked));
      } else if (tipo === 'url') {
        el.addEventListener('input', () => {
          escribir(key, el.value.trim());
          const prev = layers.querySelector(`[data-ap-preview="${key}"]`);
          if (prev) prev.style.backgroundImage = el.value.trim() ? `url("${el.value.trim()}")` : 'none';
        });
      } else if (tipo === 'animacion') {
        el.addEventListener('change', () => {
          const opt = el.selectedOptions[0];
          escribir('buttonLottieId', el.value);
          escribir('buttonLottieUrl', opt?.dataset.url || '');
        });
      }
    });

    layers.querySelectorAll('[data-ap-upload]').forEach((btn) => {
      const key = btn.dataset.apUpload;
      const file = layers.querySelector(`[data-ap-file="${key}"]`);
      if (!file) return;
      btn.addEventListener('click', () => file.click());
      file.addEventListener('change', async () => {
        const archivo = file.files?.[0];
        file.value = '';
        if (!archivo) return;
        btn.disabled = true;
        btn.textContent = 'Subiendo...';
        try {
          const subida = await subirImagen(archivo, { carpeta: 'botones' });
          const input = layers.querySelector(`[data-ap="${key}"][data-ap-type="url"]`);
          if (input) input.value = subida.url;
          const prev = layers.querySelector(`[data-ap-preview="${key}"]`);
          if (prev) prev.style.backgroundImage = `url("${subida.url}")`;
          escribir(key, subida.url);
        } catch (err) {
          const msg = container.querySelector('#apariencia-msg');
          if (msg) msg.textContent = err.message || 'No se pudo subir la imagen';
        } finally {
          btn.disabled = false;
          btn.textContent = 'Subir';
        }
      });
    });

    layers.querySelector('#ap-reset')?.addEventListener('click', () => {
      draft.overrides = {};
      refrescarCapas();
      pintar();
    });

    llenarAnimaciones(layers);
    syncVisibilidadBoton();
  }

  function syncVisibilidadBoton() {
    const layers = container.querySelector('#ap-layers');
    if (!layers) return;
    const face = resolvedAhora().buttonFace || 'color';
    layers.querySelectorAll('[data-ap-show]').forEach((el) => {
      const show = el.dataset.apShow;
      el.hidden = show === 'media'
        ? !(face === 'image' || face === 'lottie')
        : show !== face;
    });
  }

  function llenarAnimaciones(layers) {
    const html = '<option value="">Sin animación</option>' +
      animacionesCache.map((a) => `<option value="${escapeHtml(a.id)}" data-url="${escapeHtml(a.url)}">${escapeHtml(a.nombre)}</option>`).join('');
    layers.querySelectorAll('[data-ap-type="animacion"]').forEach((sel) => {
      const actual = resolvedAhora().buttonLottieId || '';
      sel.innerHTML = html;
      sel.value = actual;
    });
  }
}

function htmlCapas(resolved, esAdmin) {
  const disabled = esAdmin ? '' : 'disabled';
  return APPEARANCE_GROUPS.map((grupo) => `
    <details class="ap-grupo" ${grupo.open ? 'open' : ''}>
      <summary>${escapeHtml(grupo.name)}</summary>
      <div class="ap-grupo-body">
        ${grupo.hint ? `<p class="hint">${escapeHtml(grupo.hint)}</p>` : ''}
        ${grupo.fields.map((campo) => htmlCampo(campo, resolved[campo.key], disabled)).join('')}
      </div>
    </details>
  `).join('') + (esAdmin ? `
    <div class="acciones" style="margin-top:8px">
      <button type="button" class="secundario" id="ap-reset">Volver al punto de partida</button>
    </div>
  ` : '');
}

function htmlCampo(campo, valor, disabled) {
  const show = campo.show ? `data-ap-show="${campo.show}"` : '';
  if (campo.type === 'color') {
    const hex = String(valor || '#000000');
    return `
      <label class="ap-color" ${show}>
        <span>${escapeHtml(campo.label)}</span>
        <span class="ap-color-ctrl">
          <input type="color" data-ap="${campo.key}" data-ap-type="color" value="${escapeHtml(hex)}" ${disabled} />
          <input type="text" data-ap="${campo.key}" data-ap-type="hex" data-ap-hex="${campo.key}" value="${escapeHtml(hex)}" maxlength="7" ${disabled} />
        </span>
      </label>
    `;
  }
  if (campo.type === 'range') {
    const n = Number(valor) || 0;
    const shown = (n === 0 && campo.zeroLabel) ? campo.zeroLabel : `${n}${campo.unit || ''}`;
    return `
      <label class="ap-range" ${show}>
        <span>${escapeHtml(campo.label)}</span>
        <input type="range" data-ap="${campo.key}" data-ap-type="range" data-ap-unit="${campo.unit || ''}"
          data-ap-zero="${escapeHtml(campo.zeroLabel || '')}"
          min="${campo.min}" max="${campo.max}" value="${n}" ${disabled} />
        <b data-ap-val="${campo.key}">${shown}</b>
      </label>
    `;
  }
  if (campo.type === 'select') {
    return `
      <label class="ap-select" ${show}>
        <span>${escapeHtml(campo.label)}</span>
        <select data-ap="${campo.key}" data-ap-type="select" ${disabled}>
          ${(campo.options || []).map((o) => `
            <option value="${escapeHtml(o.value)}" ${o.value === valor ? 'selected' : ''}>${escapeHtml(o.label)}</option>
          `).join('')}
        </select>
      </label>
    `;
  }
  if (campo.type === 'url') {
    const url = String(valor || '');
    return `
      <div class="ap-url" ${show}>
        <span>${escapeHtml(campo.label)}</span>
        <div class="ap-url-ctrl">
          <input type="text" data-ap="${campo.key}" data-ap-type="url" value="${escapeHtml(url)}" placeholder="https://..." ${disabled} />
          <button type="button" class="secundario ap-upload" data-ap-upload="${campo.key}" ${disabled}>Subir</button>
          <input type="file" data-ap-file="${campo.key}" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden />
        </div>
        <div class="ap-url-preview" data-ap-preview="${campo.key}" style="background-image:${url ? `url('${escapeHtml(url)}')` : 'none'}"></div>
      </div>
    `;
  }
  if (campo.type === 'animacion') {
    return `
      <label class="ap-select" ${show}>
        <span>${escapeHtml(campo.label)}</span>
        <select data-ap="${campo.key}" data-ap-type="animacion" ${disabled}>
          <option value="">Cargando...</option>
        </select>
      </label>
    `;
  }
  if (campo.type === 'toggle') {
    return `
      <label class="ap-toggle" ${show}>
        <span>${escapeHtml(campo.label)}</span>
        <input type="checkbox" data-ap="${campo.key}" data-ap-type="toggle" ${valor ? 'checked' : ''} ${disabled} />
      </label>
    `;
  }
  return '';
}

function marcarSeleccion(container, selector, activo) {
  container.querySelectorAll(selector).forEach((el) => el.classList.remove('is-selected'));
  activo.classList.add('is-selected');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
