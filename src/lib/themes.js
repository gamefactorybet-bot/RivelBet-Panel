// src/lib/themes.js
// Catálogo compartido de temas y plantillas.
// El panel lo usa para su propia UI y lo guarda en casino_settings,
// de donde el portal del jugador va a leer la misma configuración.

import { resolveAppearance, applyResolved, hexToRgba } from './appearance.js';
import { syncButtonFaces } from './buttonFace.js';
import { urlOptimizada } from './imgUrl.js';

export const LOGO_RIVELBET = '/image/rivelbet-icon.png';
export const FONDO_LOGIN = '/image/bg-login.jpg';
export const FONDO_PANEL = '/image/bg-panel.jpg';
export const FONDO_JUEGOS = '/image/bg-juegos.jpg';

export function urlLogo(settings) {
  return settings?.logo_url || LOGO_RIVELBET;
}

export const THEMES = {
  'carmesi-rivelbet': {
    name: 'RivelBet Carmesí',
    description: 'Negro y rojo — punto de partida, no un destino',
    colors: {
      bg: '#09070a', surface: '#17121a', surfaceAlt: '#221a26',
      accent: '#c41e3a', accentText: '#fff5f6', secondary: '#e7e4ec',
      text: '#e7e4ec', textDim: '#9b93a3', border: '#2a222f',
      success: '#4ade80', error: '#ff4d6d',
    },
    tokens: {
      void: '#09070a', surface: '#17121a', surfaceRaised: '#221a26',
      line: 'rgba(228, 226, 232, 0.08)', crimson: '#c41e3a',
      crimsonDeep: '#7a1526', crimsonGlow: '#ff2f52', platinum: '#e7e4ec',
      inkDim: '#9b93a3', inkDimmer: '#665f6e',
    },
    appearance: {
      useBgImage: false,
      buttonFace: 'color',
      veilTop: '#17121a',
      halo: '#ff2f52',
      bannerFrom: '#17121a',
      warning: '#e8a33d',
      fontBody: 'Manrope',
      fontDisplay: 'Fraunces',
    },
  },
  'oro-real': {
    name: 'RivelBet',
    description: 'Azul noche y oro champagne',
    colors: {
      bg: '#0d1220',
      surface: '#16203a',
      surfaceAlt: '#111a2e',
      accent: '#e8c874',
      accentText: '#1a1405',
      secondary: '#cfae5c',
      text: '#e9edf5',
      textDim: '#94a0ba',
      border: '#22304f',
      success: '#4ade80',
      error: '#f87171',
    },
  },
  'mesa-verde': {
    name: 'Mesa verde',
    description: 'Paño y oro clásico',
    colors: {
      bg: '#0b1f14',
      surface: '#122b1d',
      surfaceAlt: '#0e2417',
      accent: '#d4af37',
      accentText: '#1a1206',
      secondary: '#2f7d4f',
      text: '#e8f0e9',
      textDim: '#93a897',
      border: '#1e4230',
      success: '#4ade80',
      error: '#f87171',
    },
  },
  'ruleta-roja': {
    name: 'Ruleta roja',
    description: 'Rojo y negro con oro',
    colors: {
      bg: '#1a0d0d',
      surface: '#241313',
      surfaceAlt: '#1f1010',
      accent: '#c81e3a',
      accentText: '#fff5f5',
      secondary: '#d4af37',
      text: '#f0e6e6',
      textDim: '#a89393',
      border: '#3d1f1f',
      success: '#4ade80',
      error: '#ff6b6b',
    },
  },
  'diamante-platino': {
    name: 'Diamante platino',
    description: 'Gris carbón y celeste hielo',
    colors: {
      bg: '#16181c',
      surface: '#20232a',
      surfaceAlt: '#1a1d22',
      accent: '#6fd0e8',
      accentText: '#08222b',
      secondary: '#c7ccd1',
      text: '#e8eaed',
      textDim: '#9aa0a8',
      border: '#2d323b',
      success: '#4ade80',
      error: '#f87171',
    },
  },
  'selva-tropical': {
    name: 'Selva tropical',
    description: 'Esmeralda y naranja mango',
    colors: {
      bg: '#0a1a17',
      surface: '#0f2724',
      surfaceAlt: '#0c201d',
      accent: '#f59e0b',
      accentText: '#231301',
      secondary: '#10b981',
      text: '#e6f2ef',
      textDim: '#8fa9a3',
      border: '#194039',
      success: '#34d399',
      error: '#fb7185',
    },
  },

  // ---- Joyas y metales ----
  'zafiro-real': {
    name: 'Zafiro real',
    description: 'Azul profundo, plata fría',
    colors: {
      bg: '#0a1220', surface: '#101b32', surfaceAlt: '#0c1628',
      accent: '#3b82f6', accentText: '#04101f', secondary: '#93c5fd',
      text: '#e8edf7', textDim: '#8b9cb8', border: '#1c2a45',
      success: '#4ade80', error: '#f87171',
    },
  },
  'rubi-imperial': {
    name: 'Rubí imperial',
    description: 'Vino oscuro y oro',
    colors: {
      bg: '#1a0a10', surface: '#26121a', surfaceAlt: '#200e15',
      accent: '#e11d48', accentText: '#fff0f3', secondary: '#d4af37',
      text: '#f3e6ea', textDim: '#ab8f96', border: '#3d1a24',
      success: '#4ade80', error: '#ff6b81',
    },
  },
  'onix-plata': {
    name: 'Ónix y plata',
    description: 'Negro puro, mínimo',
    colors: {
      bg: '#0c0c0e', surface: '#161618', surfaceAlt: '#111113',
      accent: '#d8dde3', accentText: '#101114', secondary: '#8b93a1',
      text: '#eef0f2', textDim: '#8c8f95', border: '#26272b',
      success: '#4ade80', error: '#f87171',
    },
  },
  'champagne-dorado': {
    name: 'Champagne dorado',
    description: 'Espresso y champagne',
    colors: {
      bg: '#1a140c', surface: '#241c11', surfaceAlt: '#1f180e',
      accent: '#e8c98a', accentText: '#241505', secondary: '#c9a86a',
      text: '#f2e9da', textDim: '#a8987f', border: '#3a2c18',
      success: '#4ade80', error: '#f87171',
    },
  },
  'amatista-nocturna': {
    name: 'Amatista nocturna',
    description: 'Violeta profundo',
    colors: {
      bg: '#140b1f', surface: '#1f1230', surfaceAlt: '#190e28',
      accent: '#a855f7', accentText: '#18041f', secondary: '#c4b5fd',
      text: '#efe8f7', textDim: '#a294b8', border: '#2f1c47',
      success: '#4ade80', error: '#f87171',
    },
  },

  // ---- Neón y luces ----
  'esmeralda-vegas': {
    name: 'Esmeralda Vegas',
    description: 'Negro y verde neón',
    colors: {
      bg: '#070f0a', surface: '#0c1a10', surfaceAlt: '#09150c',
      accent: '#39ff88', accentText: '#03170a', secondary: '#22c55e',
      text: '#e6f5ea', textDim: '#83a08e', border: '#163322',
      success: '#39ff88', error: '#ff4d6d',
    },
  },
  'neon-miami': {
    name: 'Neón Miami',
    description: 'Rosa y cian sobre azul noche',
    colors: {
      bg: '#0b0f1a', surface: '#131a2c', surfaceAlt: '#0f1524',
      accent: '#ff2d95', accentText: '#1a0410', secondary: '#22d3ee',
      text: '#eaf0fb', textDim: '#8993b3', border: '#232c47',
      success: '#4ade80', error: '#fb7185',
    },
  },

  // ---- Tierra y lujo clásico ----
  'cafe-habano': {
    name: 'Café habano',
    description: 'Salón de cigarros',
    colors: {
      bg: '#1a1108', surface: '#241a0e', surfaceAlt: '#1f160b',
      accent: '#c98a3e', accentText: '#1f1002', secondary: '#8a5a2e',
      text: '#f0e6d6', textDim: '#a89478', border: '#3d2c17',
      success: '#4ade80', error: '#f87171',
    },
  },
  'cobre-industrial': {
    name: 'Cobre industrial',
    description: 'Grafito y cobre',
    colors: {
      bg: '#141312', surface: '#1f1c1a', surfaceAlt: '#1a1715',
      accent: '#d97a3f', accentText: '#1e0f04', secondary: '#9c9a96',
      text: '#efece8', textDim: '#a39d95', border: '#332d27',
      success: '#4ade80', error: '#f87171',
    },
  },
  'bronce-antiguo': {
    name: 'Bronce antiguo',
    description: 'Casino de otra época',
    colors: {
      bg: '#150f08', surface: '#20180e', surfaceAlt: '#1a130a',
      accent: '#b8862f', accentText: '#1c1103', secondary: '#8a7048',
      text: '#ede2cf', textDim: '#a3927a', border: '#382a15',
      success: '#4ade80', error: '#f87171',
    },
  },
  'azul-casino-clasico': {
    name: 'Azul casino clásico',
    description: 'Paño azul, oro de siempre',
    colors: {
      bg: '#08121e', surface: '#0f1e30', surfaceAlt: '#0b1828',
      accent: '#f2c14e', accentText: '#241704', secondary: '#4a80c4',
      text: '#e9f0f7', textDim: '#8a9db5', border: '#1c3350',
      success: '#4ade80', error: '#f87171',
    },
  },

  // ---- Sobrios y modernos ----
  'perla-nacar': {
    name: 'Perla nácar',
    description: 'Grafito y rosa champagne',
    colors: {
      bg: '#14161c', surface: '#1e2129', surfaceAlt: '#181a21',
      accent: '#e8b4c8', accentText: '#251016', secondary: '#d4af8f',
      text: '#eceef2', textDim: '#9498a3', border: '#2c3038',
      success: '#4ade80', error: '#f87171',
    },
  },
  'medianoche-real': {
    name: 'Medianoche real',
    description: 'Púrpura y oro',
    colors: {
      bg: '#0a0a14', surface: '#141225', surfaceAlt: '#100e1e',
      accent: '#8b7cf6', accentText: '#0d0620', secondary: '#d4af37',
      text: '#e8e6f5', textDim: '#8d88a8', border: '#211f3a',
      success: '#4ade80', error: '#f87171',
    },
  },
  'fuego-carmesi': {
    name: 'Fuego carmesí',
    description: 'Negro y fuego',
    colors: {
      bg: '#160707', surface: '#210c0c', surfaceAlt: '#1b0909',
      accent: '#ff4d3d', accentText: '#1f0500', secondary: '#ff8a3d',
      text: '#f5e4e2', textDim: '#ab8683', border: '#3a1512',
      success: '#4ade80', error: '#ff7a5c',
    },
  },
  'menta-plata': {
    name: 'Menta y plata',
    description: 'Fresco y frío',
    colors: {
      bg: '#0d1614', surface: '#15221f', surfaceAlt: '#111c19',
      accent: '#5eead4', accentText: '#04211c', secondary: '#a8b0af',
      text: '#e6f2ef', textDim: '#8ba39d', border: '#213a35',
      success: '#4ade80', error: '#f87171',
    },
  },
};

export const TEMPLATES = {
  clasico: {
    name: 'Clásico',
    description: 'Tarjeta centrada, una cosa a la vez',
    layout: 'centered',
    radius: '12px',
    density: 'comfortable',
  },
  'mesa-de-control': {
    name: 'Mesa de control',
    description: 'Barra lateral fija + tabla de movimientos',
    layout: 'sidebar',
    radius: '10px',
    density: 'compact',
  },
  fichas: {
    name: 'Fichas',
    description: 'Accesos y montos como fichas redondas',
    layout: 'chips',
    radius: '999px',
    density: 'comfortable',
  },
  tablero: {
    name: 'Tablero',
    description: 'Grilla de estadísticas arriba, acciones abajo',
    layout: 'grid',
    radius: '12px',
    density: 'comfortable',
  },
  'minimal-ejecutivo': {
    name: 'Minimal ejecutivo',
    description: 'Líneas finas, sin sombras ni relleno',
    layout: 'minimal',
    radius: '0px',
    density: 'compact',
  },
};

export const DEFAULT_SETTINGS = {
  theme_key: 'carmesi-rivelbet',
  template_key: 'clasico',
  casino_name: import.meta.env.VITE_APP_NAME || 'RivelBet',
  logo_url: LOGO_RIVELBET,
  bg_login_url: FONDO_LOGIN,
  bg_panel_url: FONDO_PANEL,
  bg_juegos_url: FONDO_JUEGOS,
  bg_login_dim: 62,
  bg_panel_dim: 82,
  bg_juegos_dim: 76,
  surface_opacity: 92,
  surface_blur: 8,
  theme_overrides: {},
};

/**
 * Vuelca el tema, los overrides pintados a mano y la plantilla
 * a variables CSS en :root. Cambiar un color no requiere recargar.
 */
export function applyAppearance({ theme_key, template_key, surface_opacity, surface_blur, theme_overrides }) {
  const theme = THEMES[theme_key] || THEMES['carmesi-rivelbet'];
  const template = TEMPLATES[template_key] || TEMPLATES.clasico;
  const root = document.documentElement;
  const resolved = resolveAppearance(theme, theme_overrides);

  applyResolved(resolved);
  applySurface({
    opacity: surface_opacity,
    blur: surface_blur,
    surface: resolved.surface,
    surfaceAlt: resolved.surfaceRaised,
    text: resolved.text,
  });

  root.style.setProperty('--radius', template.radius);
  root.dataset.theme = theme_key || 'carmesi-rivelbet';
  root.dataset.layout = template.layout;
  root.dataset.density = template.density;
  syncButtonFaces();
}

/**
 * Pinta la imagen de fondo con un velo del color del tema encima.
 * El velo es lo que hace que cualquier foto sirva: sin él, una imagen
 * clara vuelve ilegible el texto blanco.
 */
const PREFIJOS_FONDO = { login: '--bg-login', panel: '--bg-panel', juegos: '--bg-juegos' };

export function applyBackground(zona, { url, dim = 70 } = {}) {
  const root = document.documentElement;
  const prefijo = PREFIJOS_FONDO[zona] || '--bg-panel';

  if (!url) {
    root.style.setProperty(`${prefijo}-image`, 'none');
    root.style.setProperty(`${prefijo}-veil`, '1');
    return;
  }

  root.style.setProperty(`${prefijo}-image`, `url("${urlOptimizada(url, { w: 1600 }).replace(/"/g, '')}")`);
  root.style.setProperty(`${prefijo}-veil`, String(Math.min(100, Math.max(0, dim)) / 100));
}

/**
 * Genera las versiones translúcidas de las superficies.
 * Mantenemos --surface / --surface-alt sólidos (los usan bordes y
 * elementos chicos donde la transparencia no aporta) y agregamos
 * --surface-glass / --surface-alt-glass para tarjetas y barras.
 *
 * El desenfoque es lo que hace usable la transparencia: sin él, una
 * foto con detalle atrás vuelve ilegible cualquier tabla de montos.
 */
export function applySurface({ opacity = 100, blur = 0, theme, surface, surfaceAlt, text } = {}) {
  const root = document.documentElement;
  const t = theme || THEMES[root.dataset.theme] || THEMES['carmesi-rivelbet'];
  const surfaceHex = surface || t.colors.surface;
  const altHex = surfaceAlt || t.colors.surfaceAlt;
  const textHex = text || t.colors.text;

  const alpha = Math.min(100, Math.max(0, Number(opacity) ?? 100)) / 100;
  const px = Math.min(30, Math.max(0, Number(blur) ?? 0));

  root.style.setProperty('--surface-glass', hexToRgba(surfaceHex, alpha));
  root.style.setProperty('--surface-alt-glass', hexToRgba(altHex, alpha));
  root.style.setProperty('--surface-blur', px ? `blur(${px}px)` : 'none');

  // Con transparencia alta el borde es lo único que define la tarjeta,
  // así que lo reforzamos a medida que baja la opacidad.
  root.style.setProperty('--border-glass', hexToRgba(textHex, (1 - alpha) * 0.22 + 0.06));
}
