// Ruleta del giro diario. Puro: arma el SVG a partir de la lista de
// premios de la config. Lo usan el portal (React) y el panel (probador).
//
// El azar REAL vive en la API. Acá solo se dibuja y se calcula a qué
// ángulo tiene que frenar la rueda para que la porción del premio que
// devolvió el servidor quede bajo la flecha.

const PORCIONES = 12;

export const TEMAS_RULETA = {
  casino: {
    id: 'casino',
    nombre: 'Casino',
    hint: 'Negro, rojo y oro',
    colores: ['#8a1018', '#d4af37', '#141414', '#e8c547', '#5c0a12', '#a8892c'],
    nada: '#080808',
    nadaTexto: '#8a7350',
    texto: '#f6e7c3',
    stroke: 'rgba(212,175,55,0.28)',
  },
  'san-patricio': {
    id: 'san-patricio',
    nombre: 'San Patricio',
    hint: 'Verde y oro',
    colores: ['#0d5c2e', '#f0c14b', '#163d24', '#2ea043', '#c9a227', '#0a4d28'],
    nada: '#08180e',
    nadaTexto: '#7d9a70',
    texto: '#f4eed4',
    stroke: 'rgba(240,193,75,0.32)',
  },
  noche: {
    id: 'noche',
    nombre: 'Noche',
    hint: 'Azul y plata',
    colores: ['#152444', '#8eb6e8', '#0c1220', '#c5d0e0', '#2a3f6e', '#6a8ab8'],
    nada: '#070b14',
    nadaTexto: '#6a7a94',
    texto: '#e8eef8',
    stroke: 'rgba(142,182,232,0.3)',
  },
  clasico: {
    id: 'clasico',
    nombre: 'Clásico',
    hint: 'Colores de feria',
    colores: ['#e0384f', '#d4af37', '#2fbf71', '#3b82f6', '#c05fd8', '#e8862f'],
    nada: '#16311f',
    nadaTexto: '#7fa890',
    texto: '#fff',
    stroke: 'rgba(0,0,0,0.4)',
  },
};

export function temaRuleta(id) {
  return TEMAS_RULETA[id] || TEMAS_RULETA.casino;
}

/** "15k", "1,5k", "500", "Nada" */
export function montoCorto(n) {
  const v = Number(n) || 0;
  if (v === 0) return 'Nada';
  if (v >= 1000) {
    const k = v / 1000;
    return (Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')) + 'k';
  }
  return String(v);
}

/**
 * Reparte los pesos en ~PORCIONES porciones, intercaladas por turnos
 * para que el "Nada" no quede como un tajo gigante.
 * Devuelve [{ i, monto }] donde i es el índice del premio original.
 */
export function repartirPorciones(premios) {
  const lista = (Array.isArray(premios) ? premios : []).map((p) => ({
    monto: Math.max(0, Number(p.monto) || 0),
    peso: Math.max(0, Number(p.peso) || 0),
  }));
  const total = lista.reduce((a, p) => a + p.peso, 0);
  if (total <= 0) return [];

  const cola = {};
  lista.forEach((p, i) => {
    cola[i] = p.peso > 0 ? Math.max(1, Math.round((p.peso / total) * PORCIONES)) : 0;
  });

  const orden = [];
  let quedan = true;
  while (quedan) {
    quedan = false;
    lista.forEach((p, i) => {
      if (cola[i] > 0) { orden.push({ i, monto: p.monto }); cola[i]--; quedan = true; }
    });
  }
  return orden;
}

/** Devuelve { svg, segs, n } — svg es un string listo para inyectar. */
export function ruletaSvg(premios, temaId) {
  const tema = temaRuleta(temaId);
  const segs = repartirPorciones(premios);
  const n = segs.length || 1;
  const ang = 360 / n;
  const cx = 100, cy = 100, r = 96;

  const partes = segs.map((s, k) => {
    const a0 = ((k * ang - 90) * Math.PI) / 180;
    const a1 = (((k + 1) * ang - 90) * Math.PI) / 180;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = ang > 180 ? 1 : 0;
    const color = s.monto === 0 ? tema.nada : tema.colores[s.i % tema.colores.length];
    const mid = (k + 0.5) * ang - 90;
    const tx = cx + 60 * Math.cos((mid * Math.PI) / 180);
    const ty = cy + 60 * Math.sin((mid * Math.PI) / 180);
    const label = montoCorto(s.monto);

    return (
      `<path d="M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} ` +
      `A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" ` +
      `fill="${color}" stroke="${tema.stroke}" stroke-width="0.7"/>` +
      `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" ` +
      `transform="rotate(${(mid + 90).toFixed(1)} ${tx.toFixed(2)} ${ty.toFixed(2)})" ` +
      `fill="${s.monto === 0 ? tema.nadaTexto : tema.texto}" font-size="9.5" font-weight="700" ` +
      `text-anchor="middle" dominant-baseline="middle" font-family="Geist, sans-serif">${label}</text>`
    );
  }).join('');

  return {
    svg: `<svg viewBox="0 0 200 200" width="100%" height="100%">${partes}</svg>`,
    segs,
    n,
  };
}

/** Índice de porción (al azar) que corresponde a ese premio. */
export function indicePorPremio(segs, monto) {
  const cand = [];
  segs.forEach((s, i) => { if (s.monto === Number(monto)) cand.push(i); });
  return cand.length ? cand[Math.floor(Math.random() * cand.length)] : 0;
}

/**
 * Rotación (en grados) para frenar con esa porción bajo la flecha,
 * sumando varias vueltas completas.
 */
export function rotacionGanadora(n, indice, vueltas = 6) {
  return 360 * vueltas - (indice + 0.5) * (360 / n);
}

/** Sorteo local ponderado — solo para el probador/simulador del panel. */
export function sortearLocal(premios) {
  const lista = (Array.isArray(premios) ? premios : []);
  const total = lista.reduce((a, p) => a + Math.max(0, Number(p.peso) || 0), 0);
  if (total <= 0) return 0;
  let x = Math.random() * total;
  for (const p of lista) {
    x -= Math.max(0, Number(p.peso) || 0);
    if (x < 0) return Math.max(0, Number(p.monto) || 0);
  }
  return 0;
}
