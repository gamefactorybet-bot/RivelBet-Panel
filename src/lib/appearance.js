// Catálogo de capas del portal y cómo se resuelven contra un tema.
// Los temas son puntos de partida: lo que el admin pinta acá queda
// en casino_settings.theme_overrides y pisa al tema.

import { urlOptimizada } from './imgUrl.js';

export const FONT_BODY = [
  { value: 'Manrope', label: 'Manrope' },
  { value: 'Geist', label: 'Geist' },
  { value: 'Inter', label: 'Inter' },
  { value: 'system-ui', label: 'Sistema' },
];

export const FONT_DISPLAY = [
  { value: 'Fraunces', label: 'Fraunces' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Manrope', label: 'Manrope' },
  { value: 'Geist', label: 'Geist' },
];

export const BUTTON_FACES = [
  { value: 'color', label: 'Color de acento' },
  { value: 'image', label: 'Imagen' },
  { value: 'lottie', label: 'Animación Lottie' },
];

export const IMAGE_FITS = [
  { value: 'cover', label: 'Cubrir (recorta)' },
  { value: 'contain', label: 'Contener (entera)' },
];

export const APPEARANCE_GROUPS = [
  {
    id: 'fondo',
    name: 'Capa 0 — Fondo',
    hint: 'El vacío detrás de todo. Si hay imagen, el velo se pinta encima.',
    open: true,
    fields: [
      { key: 'void', label: 'Vacío (fondo sólido)', type: 'color' },
      { key: 'veilTop', label: 'Velo superior', type: 'color' },
      { key: 'halo', label: 'Halo ambiental', type: 'color' },
      { key: 'useBgImage', label: 'Mostrar imagen de fondo del portal', type: 'toggle' },
    ],
  },
  {
    id: 'superficies',
    name: 'Capa 1 — Superficies',
    hint: 'Header, paneles, hojas y tarjetas elevadas.',
    open: true,
    fields: [
      { key: 'surface', label: 'Panel / header', type: 'color' },
      { key: 'surfaceRaised', label: 'Tarjeta elevada', type: 'color' },
      { key: 'line', label: 'Línea / borde', type: 'color' },
      { key: 'lineOpacity', label: 'Opacidad del borde', type: 'range', min: 4, max: 100, unit: '%' },
    ],
  },
  {
    id: 'texto',
    name: 'Capa 2 — Texto',
    open: true,
    fields: [
      { key: 'text', label: 'Texto principal', type: 'color' },
      { key: 'textDim', label: 'Texto secundario', type: 'color' },
      { key: 'textDimmer', label: 'Texto apagado', type: 'color' },
    ],
  },
  {
    id: 'acento',
    name: 'Capa 3 — Acento',
    hint: 'El color de marca: activos, brillos y acciones que mueven saldo.',
    open: true,
    fields: [
      { key: 'accent', label: 'Acento', type: 'color' },
      { key: 'accentDeep', label: 'Acento profundo', type: 'color' },
      { key: 'accentGlow', label: 'Brillo', type: 'color' },
      { key: 'accentText', label: 'Texto sobre acento', type: 'color' },
      { key: 'secondary', label: 'Platino / secundario', type: 'color' },
    ],
  },
  {
    id: 'estados',
    name: 'Capa 4 — Estados',
    fields: [
      { key: 'success', label: 'Éxito / crédito', type: 'color' },
      { key: 'error', label: 'Error / alerta', type: 'color' },
      { key: 'warning', label: 'Aviso', type: 'color' },
    ],
  },
  {
    id: 'botones',
    name: 'Capa 5 — Botones de acción',
    hint: 'El tamaño se comparte. La imagen de cara solo pinta el botón Recargar, no Enviar ni login.',
    open: true,
    fields: [
      { key: 'buttonFace', label: 'Cara', type: 'select', options: BUTTON_FACES },
      { key: 'buttonHeight', label: 'Alto', type: 'range', min: 28, max: 72, unit: 'px' },
      { key: 'buttonWidth', label: 'Ancho (0 = auto)', type: 'range', min: 0, max: 280, unit: 'px', zeroLabel: 'auto' },
      { key: 'buttonRadius', label: 'Radio del botón', type: 'range', min: 0, max: 80, unit: 'px' },
      { key: 'buttonPadX', label: 'Padding horizontal', type: 'range', min: 6, max: 40, unit: 'px' },
      { key: 'buttonShowLabel', label: 'Mostrar texto', type: 'toggle' },
      { key: 'buttonImageUrl', label: 'Imagen (URL)', type: 'url', show: 'image' },
      { key: 'buttonLottieId', label: 'Animación', type: 'animacion', show: 'lottie' },
      { key: 'buttonMediaW', label: 'Ancho de la imagen/lottie', type: 'range', min: 20, max: 100, unit: '%', show: 'media' },
      { key: 'buttonMediaH', label: 'Alto de la imagen/lottie', type: 'range', min: 20, max: 100, unit: '%', show: 'media' },
      { key: 'buttonMediaRadius', label: 'Radio de la imagen/lottie', type: 'range', min: 0, max: 80, unit: 'px', show: 'media' },
    ],
  },
  {
    id: 'tipo',
    name: 'Capa 6 — Tipografía',
    fields: [
      { key: 'fontBody', label: 'Cuerpo', type: 'select', options: FONT_BODY },
      { key: 'fontDisplay', label: 'Títulos', type: 'select', options: FONT_DISPLAY },
    ],
  },
  {
    id: 'portal',
    name: 'Capa 7 — Tarjetas y atmósfera',
    hint: 'Portadas del catálogo y el banner de bienvenida.',
    fields: [
      { key: 'bannerFrom', label: 'Banner — inicio del degradé', type: 'color' },
      { key: 'cardRadius', label: 'Redondeo de portadas', type: 'range', min: 0, max: 28, unit: 'px' },
      { key: 'cardShadow', label: 'Sombra de portadas', type: 'range', min: 0, max: 100, unit: '%' },
      { key: 'hoverGlow', label: 'Brillo al pasar', type: 'range', min: 0, max: 80, unit: '%' },
    ],
  },
  {
    id: 'insignias',
    name: 'Capa 8 — Insignias de juegos',
    hint: 'VIP, Hot y Nuevo que se apoyan sobre las portadas.',
    fields: [
      { key: 'cartelVipFrom', label: 'VIP — luz', type: 'color' },
      { key: 'cartelVipTo', label: 'VIP — sombra', type: 'color' },
      { key: 'cartelHotFrom', label: 'Hot — luz', type: 'color' },
      { key: 'cartelHotMid', label: 'Hot — medio', type: 'color' },
      { key: 'cartelHotTo', label: 'Hot — sombra', type: 'color' },
      { key: 'cartelNuevoFrom', label: 'Nuevo — inicio', type: 'color' },
      { key: 'cartelNuevoTo', label: 'Nuevo — fin', type: 'color' },
    ],
  },
];

export const APPEARANCE_FIELDS = APPEARANCE_GROUPS.flatMap((g) => g.fields);
export const APPEARANCE_KEYS = APPEARANCE_FIELDS.map((f) => f.key);

const COLOR_KEYS = new Set(APPEARANCE_FIELDS.filter((f) => f.type === 'color').map((f) => f.key));
const RANGE_BY_KEY = Object.fromEntries(
  APPEARANCE_FIELDS.filter((f) => f.type === 'range').map((f) => [f.key, f]),
);
const SELECT_BY_KEY = Object.fromEntries(
  APPEARANCE_FIELDS.filter((f) => f.type === 'select').map((f) => [f.key, f]),
);
const URL_KEYS = new Set(APPEARANCE_FIELDS.filter((f) => f.type === 'url').map((f) => f.key));
const TOGGLE_KEYS = new Set([
  'useBgImage',
  ...APPEARANCE_FIELDS.filter((f) => f.type === 'toggle').map((f) => f.key),
]);
const ID_KEYS = new Set(['buttonLottieId']);
const EXTRA_URL_KEYS = new Set(['buttonLottieUrl']);

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const SAFE_URL = /^(https?:\/\/|\/)[^\s]{1,1800}$/i;
const SAFE_ID = /^[a-zA-Z0-9_-]{8,80}$/;

export function sanitizeOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (COLOR_KEYS.has(key)) {
      const hex = normalizeHex(value);
      if (hex) out[key] = hex;
      continue;
    }
    if (TOGGLE_KEYS.has(key)) {
      out[key] = Boolean(value);
      continue;
    }
    if (URL_KEYS.has(key) || EXTRA_URL_KEYS.has(key)) {
      const url = sanitizeUrl(value);
      if (url) out[key] = url;
      else if (value === '' || value == null) out[key] = '';
      continue;
    }
    if (ID_KEYS.has(key)) {
      const id = String(value || '').trim();
      if (!id) out[key] = '';
      else if (SAFE_ID.test(id)) out[key] = id;
      continue;
    }
    const sel = SELECT_BY_KEY[key];
    if (sel) {
      if (sel.options.some((o) => o.value === value)) out[key] = value;
      continue;
    }
    const range = RANGE_BY_KEY[key];
    if (range) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = clamp(n, range.min, range.max);
    }
  }
  return out;
}

function sanitizeUrl(value) {
  if (typeof value !== 'string') return '';
  const t = value.trim();
  if (!t) return '';
  if (!SAFE_URL.test(t)) return '';
  return t;
}

/**
 * Combina el tema de partida con lo que el admin pintó a mano.
 * Cada clave ausente en overrides se toma del tema.
 */
export function resolveAppearance(theme, overrides) {
  const base = defaultsFromTheme(theme);
  return { ...base, ...sanitizeOverrides(overrides) };
}

export function defaultsFromTheme(theme) {
  const c = theme?.colors || {};
  const t = theme?.tokens || {};
  const extra = theme?.appearance || {};

  const accent = normalizeHex(t.crimson || c.accent) || '#c41e3a';
  const surface = normalizeHex(t.surface || c.surface) || '#17121a';
  const voidHex = normalizeHex(t.void || c.bg) || '#09070a';
  const lineParsed = parseColor(t.line || c.border || '#2a222f');
  const textDim = normalizeHex(t.inkDim || c.textDim) || '#9b93a3';

  return {
    void: voidHex,
    veilTop: mix(voidHex, '#ffffff', 0.04),
    halo: normalizeHex(t.crimsonGlow || extra.halo) || lighten(accent, 0.18),
    useBgImage: extra.useBgImage !== undefined ? Boolean(extra.useBgImage) : !theme?.tokens,
    surface,
    surfaceRaised: normalizeHex(t.surfaceRaised || c.surfaceAlt) || '#221a26',
    line: lineParsed.hex,
    lineOpacity: Math.round(lineParsed.alpha * 100),
    text: normalizeHex(t.platinum || c.text) || '#e7e4ec',
    textDim,
    textDimmer: normalizeHex(t.inkDimmer) || darken(textDim, 0.28),
    accent,
    accentDeep: normalizeHex(t.crimsonDeep) || darken(accent, 0.32),
    accentGlow: normalizeHex(t.crimsonGlow) || lighten(accent, 0.22),
    accentText: normalizeHex(c.accentText) || '#fff5f6',
    secondary: normalizeHex(t.platinum || c.secondary) || '#e7e4ec',
    success: normalizeHex(c.success) || '#4ade80',
    error: normalizeHex(c.error) || '#f87171',
    warning: normalizeHex(extra.warning) || '#e8a33d',
    buttonFace: extra.buttonFace || 'color',
    buttonHeight: extra.buttonHeight ?? 36,
    buttonWidth: extra.buttonWidth ?? 0,
    buttonRadius: extra.buttonRadius ?? 18,
    buttonPadX: extra.buttonPadX ?? 14,
    buttonShowLabel: extra.buttonShowLabel !== undefined ? Boolean(extra.buttonShowLabel) : true,
    buttonImageUrl: extra.buttonImageUrl || '',
    buttonImageFit: extra.buttonImageFit || 'cover',
    buttonLottieId: extra.buttonLottieId || '',
    buttonLottieUrl: extra.buttonLottieUrl || '',
    buttonMediaW: extra.buttonMediaW ?? 100,
    buttonMediaH: extra.buttonMediaH ?? 100,
    buttonMediaRadius: extra.buttonMediaRadius ?? 18,
    fontBody: extra.fontBody || 'Manrope',
    fontDisplay: extra.fontDisplay || 'Fraunces',
    bannerFrom: extra.bannerFrom || surface,
    cardRadius: extra.cardRadius ?? 12,
    cardShadow: extra.cardShadow ?? 62,
    hoverGlow: extra.hoverGlow ?? 12,
    cartelVipFrom: extra.cartelVipFrom || '#ffffff',
    cartelVipTo: extra.cartelVipTo || darken(textDim, 0.28),
    cartelHotFrom: extra.cartelHotFrom || '#ffcf8a',
    cartelHotMid: extra.cartelHotMid || '#ff7a3d',
    cartelHotTo: extra.cartelHotTo || '#e5484d',
    cartelNuevoFrom: extra.cartelNuevoFrom || '#8fe3fb',
    cartelNuevoTo: extra.cartelNuevoTo || '#2f8fb0',
    ...sanitizeOverrides(extra),
  };
}

/**
 * Vuelca el aspecto resuelto a variables CSS en :root.
 * applySurface() se llama después para las versiones glass.
 */
export function applyResolved(resolved) {
  const root = document.documentElement;
  const r = resolved;

  const line = hexToRgba(r.line, (Number(r.lineOpacity) || 100) / 100);

  const set = (name, value) => root.style.setProperty(name, value);

  set('--void', r.void);
  set('--bg', r.void);
  set('--surface', r.surface);
  set('--surface-raised', r.surfaceRaised);
  set('--surface-alt', r.surfaceRaised);
  set('--line', line);
  set('--border', line);
  set('--accent', r.accent);
  set('--crimson', r.accent);
  set('--accent-deep', r.accentDeep);
  set('--crimson-deep', r.accentDeep);
  set('--accent-glow', r.accentGlow);
  set('--crimson-glow', r.accentGlow);
  set('--accent-text', r.accentText);
  set('--secondary', r.secondary);
  set('--platinum', r.secondary);
  set('--text', r.text);
  set('--text-dim', r.textDim);
  set('--ink-dim', r.textDim);
  set('--ink-dimmer', r.textDimmer);
  set('--success', r.success);
  set('--error', r.error);
  set('--warning', r.warning);
  set('--veil-top', r.veilTop);
  set('--halo', r.halo);
  set('--banner-from', r.bannerFrom);
  set('--card-radius', `${Number(r.cardRadius) || 0}px`);
  set('--card-shadow-alpha', String((Number(r.cardShadow) || 0) / 100));
  set('--hover-glow-mix', `${Number(r.hoverGlow) || 0}%`);
  set('--cartel-vip-from', r.cartelVipFrom);
  set('--cartel-vip-to', r.cartelVipTo);
  set('--cartel-hot-from', r.cartelHotFrom);
  set('--cartel-hot-mid', r.cartelHotMid);
  set('--cartel-hot-to', r.cartelHotTo);
  set('--cartel-nuevo-from', r.cartelNuevoFrom);
  set('--cartel-nuevo-to', r.cartelNuevoTo);
  set('--font-body', r.fontBody);
  set('--font-display', r.fontDisplay);
  asegurarFuente(r.fontBody);
  asegurarFuente(r.fontDisplay);
  set('--primary-button-face', r.accent);
  set('--btn-height', `${Number(r.buttonHeight) || 36}px`);
  set('--btn-width', r.buttonWidth ? `${Number(r.buttonWidth)}px` : 'auto');
  set('--btn-radius', `${Math.min(999, Number(r.buttonRadius) || 0)}px`);
  set('--btn-pad-x', `${Number(r.buttonPadX) || 14}px`);
  set('--btn-media-w', `${Number(r.buttonMediaW) || 100}%`);
  set('--btn-media-h', `${Number(r.buttonMediaH) || 100}%`);
  set('--btn-media-radius', `${Math.min(999, Number(r.buttonMediaRadius) || 0)}px`);
  set('--btn-image', r.buttonImageUrl ? `url("${urlOptimizada(String(r.buttonImageUrl), { w: 400 }).replace(/"/g, '')}")` : 'none');
  set('--btn-image-fit', r.buttonImageFit === 'contain' ? 'contain' : 'cover');

  root.dataset.btn = 'plano';
  root.dataset.btnFace = r.buttonFace === 'image' || r.buttonFace === 'lottie' ? r.buttonFace : 'color';
  root.dataset.btnLabel = r.buttonShowLabel === false ? 'off' : 'on';
  if (r.buttonFace === 'lottie' && r.buttonLottieUrl) root.dataset.btnLottie = r.buttonLottieUrl;
  else delete root.dataset.btnLottie;

  root.dataset.portalBg = r.useBgImage ? 'image' : 'solid';
}

const FUENTES_EN_HTML = new Set(['Manrope', 'Fraunces', 'Georgia', 'system-ui']);
const FUENTE_CSS = {
  Geist: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap',
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
};

function asegurarFuente(nombre) {
  if (!nombre || FUENTES_EN_HTML.has(nombre) || typeof document === 'undefined') return;
  const href = FUENTE_CSS[nombre];
  if (!href) return;
  const id = `font-${nombre.toLowerCase()}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

export function hexToRgba(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 0, 0, ${Number(alpha).toFixed(3)})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Number(alpha).toFixed(3)})`;
}

export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!HEX.test(s)) return null;
  if (s.length === 4) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return s.toLowerCase();
}

function parseColor(value) {
  const hex = normalizeHex(value);
  if (hex) return { hex, alpha: 1 };
  const s = String(value || '').trim();
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/i);
  if (m) {
    return {
      hex: rgbToHex({ r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }),
      alpha: m[4] !== undefined ? Math.min(1, Math.max(0, Number(m[4]))) : 1,
    };
  }
  return { hex: '#2a222f', alpha: 1 };
}

function hexToRgb(hex) {
  const n = normalizeHex(hex);
  if (!n) return null;
  const num = parseInt(n.slice(1), 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex({ r, g, b }) {
  const ch = (x) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function mix(hex, target, t) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  if (!a || !b) return hex;
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

function lighten(hex, t) { return mix(hex, '#ffffff', t); }
function darken(hex, t) { return mix(hex, '#000000', t); }

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Math.round(n)));
}
