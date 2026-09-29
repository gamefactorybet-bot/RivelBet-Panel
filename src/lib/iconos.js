// Íconos SVG de trazo para el panel. Heredan color con currentColor,
// así se adaptan solos a cada tema sin código extra.

const svg = (d) => `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>
`;

export const ICONOS = {
  inicio: svg(`
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
  `),
  cargar: svg(`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v8M8 12h8" />
  `),
  retirar: svg(`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8 12h8" />
  `),
  solicitudes: svg(`
    <path d="M5 4.5h14v15l-3.5-2.2-3.5 2.2-3.5-2.2L5 19.5z" />
    <path d="M9 9h6M9 12.5h4" />
  `),
  soporte: svg(`
    <path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    <path d="M9 9h6M9 12.5h4" />
  `),
  cierre: svg(`
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17" />
    <path d="M8 13.5h3M8 16.5h3M14 13.5h2.5M14 16.5h2.5" />
  `),
  historial: svg(`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  `),
  jugadores: svg(`
    <circle cx="9" cy="9" r="3.2" />
    <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 6.2a3.2 3.2 0 0 1 0 5.6" />
    <path d="M17.5 14.5c1.9.6 3 2.2 3 4.5" />
  `),
  nuevoJugador: svg(`
    <circle cx="10" cy="9" r="3.4" />
    <path d="M4 19.5c0-3.2 2.7-5.5 6-5.5 1 0 2 .2 2.8.6" />
    <path d="M17 14.5v6M14 17.5h6" />
  `),
  llave: svg(`
    <circle cx="8" cy="12" r="3.5" />
    <path d="M11.5 12H20M17 12v3M20 12v2.5" />
  `),
  banco: svg(`
    <path d="M3.5 9.5 12 4.5l8.5 5" />
    <path d="M5.5 9.5v8M10 9.5v8M14 9.5v8M18.5 9.5v8" />
    <path d="M3.5 19.5h17" />
  `),
  equipo: svg(`
    <circle cx="12" cy="8" r="3.4" />
    <path d="M5 19.5c0-3.4 3.1-5.8 7-5.8s7 2.4 7 5.8" />
  `),
  ajustes: svg(`
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.3 1z" />
  `),
  juegos: svg(`
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M9 4.5v15M15 4.5v15" />
    <path d="M6 12h1.5M11.2 12h1.6M16.5 12H18" />
  `),
  bono: svg(`
    <path d="M4 11.5h16V20H4z" />
    <path d="M4 7.5h16v4H4z" />
    <path d="M12 7.5V20" />
    <path d="M12 7.5S10.5 4 8.5 4a2 2 0 0 0 0 4h3.5" />
    <path d="M12 7.5S13.5 4 15.5 4a2 2 0 0 1 0 4H12" />
  `),
  banner: svg(`
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <circle cx="8.5" cy="10" r="1.4" />
    <path d="M3.5 16l4.5-4 3.5 3 3-2.5 6 5" />
  `),
  menu: svg(`<path d="M4 7h16M4 12h16M4 17h16" />`),
  cerrar: svg(`<path d="M6 6l12 12M18 6L6 18" />`),
  salir: svg(`
    <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
    <path d="M16 8.5 19.5 12 16 15.5M10.5 12h9" />
  `),
  colapsar: svg(`<path d="M14 6l-6 6 6 6" />`),
  verificacion: svg(`
    <path d="M12 3.5 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  `),
  cashback: svg(`
    <path d="M20 11a8 8 0 1 0-2.34 5.66" />
    <path d="M20 6v5h-5" />
    <path d="M12 8v4l2.5 1.5" />
  `),
  vip: svg(`
    <path d="M5 8h14l-2.5 4.5L12 20l-4.5-7.5z" />
    <path d="M9 8l3 5 3-5" />
    <path d="M5 8l2.2-3h9.6L19 8" />
  `),
  giro: svg(`
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
    <circle cx="12" cy="12" r="2" />
  `),
  referidos: svg(`
    <circle cx="8" cy="8" r="3" />
    <path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 11l2 2 4-4" />
  `),
  animaciones: svg(`
    <path d="M12 3l1.8 4.4L18 9l-4.2 1.6L12 15l-1.8-4.4L6 9l4.2-1.6z" />
    <path d="M19 15.5l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" />
  `),
  fondos: svg(`
    <rect x="3.5" y="8" width="17" height="12" rx="2" />
    <path d="M7 8V6.5A5 5 0 0 1 17 6.5V8" />
    <path d="M12 12v4M10 14h4" />
  `),
};
