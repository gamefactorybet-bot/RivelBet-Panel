// Íconos SVG de trazo, en línea. Heredan el color del texto con
// currentColor, así se adaptan solos a cada tema.

const svg = (d, extra = '') => `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>
`;

export const ICONOS = {
  casino: svg(`
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
  `),

  recargar: svg(`
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 10h19" />
    <path d="M6.5 15h3" />
  `),

  inicio: svg(`
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M9.5 20v-5.5h5V20" />
  `),

  cuenta: svg(`
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
  `),

  adjuntar: svg(`
    <path d="M20 11.5 12.2 19.3a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 0 1 4.2 4.2l-7.9 8a1.5 1.5 0 0 1-2.1-2.1l7.3-7.3" />
  `),

  buscar: svg(`
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  `),

  soporte: svg(`
    <path d="M20 15.5a2 2 0 0 1-2 2H8l-4 3.5V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    <path d="M9 9h6M9 12.5h4" />
  `),
  cerrar: svg(`
    <path d="M6 6l12 12M18 6L6 18" />
  `),

  flecha: svg(`
    <path d="M9 5l7 7-7 7" />
  `),

  salir: svg(`
    <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
    <path d="M16 8.5 19.5 12 16 15.5" />
    <path d="M10.5 12h9" />
  `),

  llave: svg(`
    <circle cx="8" cy="12" r="3.5" />
    <path d="M11.5 12H20" />
    <path d="M17 12v3M20 12v2.5" />
  `),

  slot: svg(`
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M9 4.5v15M15 4.5v15" />
    <path d="M6 12h1.5M11.2 12h1.6M16.5 12H18" />
  `),

  estrella: svg(`
    <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" />
  `),

  enviar: svg(`
    <path d="M4 20l16-8L4 4v6l10 2-10 2z" fill="currentColor" stroke="none" />
  `),

  estrellaLlena: `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z" />
    </svg>
  `,
};
