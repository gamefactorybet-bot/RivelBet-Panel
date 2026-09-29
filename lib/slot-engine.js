import crypto from 'node:crypto';

// =========================================================
// Motor de slot 3x3, una línea de pago (la fila del medio).
//
// El motor no sabe qué juego está resolviendo: recibe la config
// (símbolos, pesos y tabla de pagos) y la aplica. Eso es lo que
// permite que un juego nuevo del mismo tipo sea una fila en la base
// y no una línea de código.
//
// Todo el azar vive acá, en el servidor. El navegador nunca decide
// si el jugador ganó: pide un giro, recibe el resultado ya resuelto
// y solo lo anima.
// =========================================================

// Config por defecto, usada si un juego no trae la suya.
// Retorno 91.8%, premio en 1 de cada 4.6 giros, premio mayor 330x.
export const CONFIG_DEFECTO = {
  simbolos: ['cereza', 'limon', 'campana', 'trebol', 'corona', 'diamante', 'siete', 'wild'],
  pesos:    { cereza: 22, limon: 20, campana: 16, trebol: 13, corona: 9, diamante: 6, siete: 3, wild: 2 },
  pagos:    { cereza: 4, limon: 6, campana: 12, trebol: 22, corona: 46, diamante: 82, siete: 165, wild: 330 },
  pagosDos: { cereza: 1, limon: 1, campana: 2, trebol: 3, corona: 5, diamante: 10, siete: 22, wild: 40 },
};

/** Completa lo que falte con los valores por defecto. */
function normalizar(config) {
  const c = config || {};
  return {
    simbolos: c.simbolos?.length ? c.simbolos : CONFIG_DEFECTO.simbolos,
    pesos: c.pesos || CONFIG_DEFECTO.pesos,
    pagos: c.pagos || CONFIG_DEFECTO.pagos,
    pagosDos: c.pagosDos || CONFIG_DEFECTO.pagosDos,
  };
}

/** Arma la tira de un rodillo repitiendo cada símbolo según su peso. */
function armarTira(cfg) {
  const tira = [];
  for (const simbolo of cfg.simbolos) {
    for (let i = 0; i < (cfg.pesos[simbolo] || 1); i++) tira.push(simbolo);
  }
  return tira;
}

/**
 * Número al azar criptográficamente seguro.
 * Math.random() no sirve acá: es predecible si alguien conoce el
 * estado del generador, y en un juego de plata eso es un agujero.
 */
function azar(max) {
  return crypto.randomInt(0, max);
}

/**
 * Gira los tres rodillos y devuelve una matriz 3x3.
 * Cada rodillo se para en una posición de su tira y se muestran tres
 * símbolos consecutivos, como una máquina real.
 */
function girarRodillos(cfg) {
  const tira = armarTira(cfg);
  const columnas = [];

  for (let c = 0; c < 3; c++) {
    const pos = azar(tira.length);
    columnas.push([
      tira[(pos - 1 + tira.length) % tira.length],
      tira[pos],
      tira[(pos + 1) % tira.length],
    ]);
  }

  return [0, 1, 2].map((fila) => columnas.map((col) => col[fila]));
}

/**
 * Evalúa la línea del medio.
 * El wild reemplaza a cualquier símbolo; tres wilds pagan el mayor.
 */
export function evaluarLinea(linea, cfg) {
  const [a, b] = linea;
  const reales = linea.filter((x) => x !== 'wild');
  const candidato = reales.length ? reales[0] : 'wild';

  if (linea.every((x) => x === candidato || x === 'wild')) {
    const simbolo = reales.length ? candidato : 'wild';
    return { tipo: 'tres', simbolo, multiplicador: cfg.pagos[simbolo] || 0 };
  }

  const dosPrimeros = (a === b) || (a === 'wild' && b !== 'wild') || (b === 'wild' && a !== 'wild');

  if (dosPrimeros) {
    const simbolo = a === 'wild' ? b : a;
    const mult = cfg.pagosDos[simbolo];
    if (mult) return { tipo: 'dos', simbolo, multiplicador: mult };
  }

  return { tipo: 'nada', simbolo: null, multiplicador: 0 };
}

/** Resuelve un giro. `config` viene de la fila del juego en la base. */
export function girar({ apuesta, config }) {
  const cfg = normalizar(config);
  const grilla = girarRodillos(cfg);
  const linea = grilla[1];
  const resultado = evaluarLinea(linea, cfg);
  const premio = Math.round(apuesta * resultado.multiplicador);

  return {
    grilla,
    linea,
    premio,
    detalle: {
      linea,
      tipo: resultado.tipo,
      simbolo: resultado.simbolo,
      multiplicador: resultado.multiplicador,
    },
  };
}

/**
 * Calcula retorno y volatilidad de una config sin simular: recorre las
 * 512 combinaciones posibles pesando cada una por su probabilidad.
 *
 * Sirve para que el panel avise si alguien cargó una config que regala
 * plata o que funde al jugador, ANTES de activar el juego.
 */
export function analizarConfig(config) {
  const cfg = normalizar(config);
  const total = cfg.simbolos.reduce((a, s) => a + (cfg.pesos[s] || 1), 0);
  const prob = (s) => (cfg.pesos[s] || 1) / total;

  let ev = 0;
  let ev2 = 0;
  let hits = 0;

  for (const a of cfg.simbolos) {
    for (const b of cfg.simbolos) {
      for (const c of cfg.simbolos) {
        const p = prob(a) * prob(b) * prob(c);
        const { multiplicador } = evaluarLinea([a, b, c], cfg);
        ev += p * multiplicador;
        ev2 += p * multiplicador * multiplicador;
        if (multiplicador > 0) hits += p;
      }
    }
  }

  return {
    rtp: +(ev * 100).toFixed(2),
    frecuencia: +(hits * 100).toFixed(2),
    volatilidad: +Math.sqrt(ev2 - ev * ev).toFixed(2),
    premioMayor: Math.max(...Object.values(cfg.pagos)),
  };
}

export const SIMBOLOS_CONOCIDOS = CONFIG_DEFECTO.simbolos;
