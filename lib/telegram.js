// Envío de avisos a grupos de Telegram, uno por canal:
//   cargas  — recargas y su resolución (ACREDITADO / RECHAZADO)
//   retiros — retiros (jugador o cashback) y su resolución (PAGADO / RECHAZADO)
//   soporte — reclamo abierto / cerrado
//   altas   — registro y verificación pendiente
//   alertas — posible abuso de bono (carga+promo sin jugar → retiro)
//
// Cada canal tiene TOKEN y CHAT_ID propios. Si faltan, cae a
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID para no silenciar un deploy
// que todavía no migró.
//
// Nunca frena una operación: si Telegram falla, la carga ya quedó
// registrada en la base igual. Por eso todo va en try/catch y las
// llamadas se hacen sin await bloqueante desde los endpoints.
//
// La resolución de una carga o retiro tiene que ir al MISMO chat que
// el pedido: responde al mensaje original (telegram_message_id).

const FALLBACK_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const FALLBACK_CHAT = process.env.TELEGRAM_CHAT_ID;
const API = 'https://api.telegram.org/bot';

const CANALES = {
  cargas: {
    token: process.env.TELEGRAM_CARGAS_BOT_TOKEN || FALLBACK_TOKEN,
    chat: process.env.TELEGRAM_CARGAS_CHAT_ID || FALLBACK_CHAT,
  },
  retiros: {
    token: process.env.TELEGRAM_RETIROS_BOT_TOKEN || FALLBACK_TOKEN,
    chat: process.env.TELEGRAM_RETIROS_CHAT_ID || FALLBACK_CHAT,
  },
  soporte: {
    token: process.env.TELEGRAM_SOPORTE_BOT_TOKEN || FALLBACK_TOKEN,
    chat: process.env.TELEGRAM_SOPORTE_CHAT_ID || FALLBACK_CHAT,
  },
  altas: {
    token: process.env.TELEGRAM_ALTAS_BOT_TOKEN || FALLBACK_TOKEN,
    chat: process.env.TELEGRAM_ALTAS_CHAT_ID || FALLBACK_CHAT,
  },
  alertas: {
    token: process.env.TELEGRAM_ALERTAS_BOT_TOKEN || FALLBACK_TOKEN,
    chat: process.env.TELEGRAM_ALERTAS_CHAT_ID || FALLBACK_CHAT,
  },
};

function credenciales(canal) {
  return CANALES[canal] || {};
}

async function llamar(canal, metodo, cuerpo) {
  const { token, chat } = credenciales(canal);
  if (!token || !chat) return null;

  try {
    const res = await fetch(`${API}${token}/${metodo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, ...cuerpo }),
    });

    const datos = await res.json();

    if (!datos.ok) {
      console.error('[telegram]', canal, metodo, datos.description);
      return null;
    }

    return datos.result;
  } catch (err) {
    console.error('[telegram]', canal, metodo, err.message);
    return null;
  }
}

/**
 * Avisa que entró una solicitud de carga.
 * Si hay comprobante lo manda como foto (se ve en el chat sin abrir
 * nada); si no, como texto.
 */
export async function avisarCarga({ jugador, monto, moneda, cuenta, comprobanteUrl, nota }) {
  const texto = [
    '<b>SOLICITUD DE CARGA</b>',
    '',
    `Jugador: ${escapar(jugador.display_name || jugador.username)} (ID #${jugador.player_number})`,
    `Monto: <b>${moneda} ${formatear(monto)}</b>`,
    cuenta ? `Cuenta: ${escapar(cuenta.banco)} — ${escapar(cuenta.titular)}` : null,
    nota ? `Nota: ${escapar(nota)}` : null,
    comprobanteUrl ? null : '',
    comprobanteUrl ? null : '<i>Sin comprobante adjunto</i>',
  ].filter((l) => l !== null).join('\n');

  if (comprobanteUrl) {
    return llamar('cargas', 'sendPhoto', {
      photo: comprobanteUrl,
      caption: texto,
      parse_mode: 'HTML',
    });
  }

  return llamar('cargas', 'sendMessage', { text: texto, parse_mode: 'HTML' });
}

/** Avisa que entró una solicitud de retiro. */
export async function avisarRetiro({ jugador, monto, moneda }) {
  const texto = [
    '<b>SOLICITUD DE RETIRO</b>',
    '',
    `Jugador: ${escapar(jugador.display_name || jugador.username)} (ID #${jugador.player_number})`,
    `Monto: <b>${moneda} ${formatear(monto)}</b>`,
    `Saldo actual: ${moneda} ${formatear(jugador.balance)}`,
  ].join('\n');

  return llamar('retiros', 'sendMessage', { text: texto, parse_mode: 'HTML' });
}

/**
 * Responde al mensaje original cuando un cajero resuelve la solicitud,
 * así en el grupo queda claro qué se aprobó y qué falta.
 * Va al mismo canal que el pedido (cargas o retiros) para no romper el hilo.
 */
export async function avisarResuelta({ tipo, aprobado, monto, moneda, jugador, staff, replyTo, nota, desbloqueado }) {
  const canal = tipo === 'carga' ? 'cargas' : 'retiros';
  const accion = aprobado
    ? (tipo === 'carga' ? 'ACREDITADO' : 'PAGADO')
    : 'RECHAZADO';

  const texto = [
    `<b>${accion}</b> — ${moneda} ${formatear(monto)}`,
    `Jugador: ${escapar(jugador.display_name || jugador.username)} (ID #${jugador.player_number})`,
    `Operador: ${escapar(staff)}`,
    desbloqueado ? '🔓 Retiro desbloqueado (cargó el valor del bono)' : null,
    nota ? `Nota: ${escapar(nota)}` : null,
  ].filter(Boolean).join('\n');

  return llamar(canal, 'sendMessage', {
    text: texto,
    parse_mode: 'HTML',
    reply_to_message_id: replyTo || undefined,
  });
}

/** Avisa que se registró un jugador nuevo desde el portal. */
export async function avisarRegistro({ jugador, bono, moneda }) {
  const texto = [
    '<b>NUEVO JUGADOR</b>',
    '',
    `Usuario: ${escapar(jugador.username)} (ID #${jugador.player_number})`,
    `Documento: ${escapar(jugador.documento || '—')}`,
    `Teléfono: ${escapar(jugador.telefono || '—')}`,
    bono > 0 ? `Bono de registro: <b>${moneda} ${formatear(bono)}</b>` : null,
    'Falta que suba y se le apruebe la verificación para poder jugar.',
  ].filter((l) => l !== null).join('\n');

  return llamar('altas', 'sendMessage', { text: texto, parse_mode: 'HTML' });
}

/** Avisa que un jugador subió sus fotos y espera revisión. */
export async function avisarVerificacionPendiente({ jugador, reenvio }) {
  const texto = [
    `<b>VERIFICACIÓN ${reenvio ? '(REENVÍO)' : 'PENDIENTE'}</b>`,
    '',
    `Jugador: ${escapar(jugador.display_name || jugador.username)} (ID #${jugador.player_number})`,
    'Revisala en el panel → Verificaciones.',
  ].join('\n');

  return llamar('altas', 'sendMessage', { text: texto, parse_mode: 'HTML' });
}

/**
 * Avisos del chat de soporte.
 * A propósito NO mandamos el contenido de la conversación: el reclamo
 * puede tener datos del jugador y la charla se lee en el panel. Al
 * grupo solo llega que se abrió y que se cerró.
 */
export async function avisarReclamoAbierto({ jugador, motivo }) {
  const texto = [
    '<b>RECLAMO ABIERTO</b>',
    '',
    `Jugador: ${escapar(jugador.display_name || jugador.username)} (ID #${jugador.player_number})`,
    `Motivo: ${escapar(motivo || 'otro')}`,
  ].join('\n');

  return llamar('soporte', 'sendMessage', { text: texto, parse_mode: 'HTML' });
}

const RAZONES_ABUSO = {
  sin_juego_post_bono: '0 jugadas desde la última carga con bono',
  bono_no_jugado: 'apostó menos de 1× los bonos del ciclo',
  cazador: 'varias cargas con bono y casi no jugó',
  hit_and_run: 'pidió el retiro al toque de una carga con bono',
};

/** Aviso de posible caza de bono. No bloquea el retiro: el cajero decide. */
export async function avisarAbusoBono({ jugador, monto, moneda, detalle, replyTo }) {
  const d = detalle || {};
  const razones = (d.razones || []).map((r) => `· ${RAZONES_ABUSO[r] || r}`);
  const texto = [
    '<b>POSIBLE ABUSO DE BONO</b>',
    '',
    `Jugador: ${escapar(jugador.display_name || jugador.username)} (ID #${jugador.player_number})`,
    `Retiro pedido: <b>${moneda} ${formatear(monto)}</b>`,
    '',
    `En este ciclo: cargó ${formatear(d.cargado)} · bonos ${formatear(d.bonos)} · apostó ${formatear(d.apostado)}`,
    Number(d.cargas_con_bono) ? `Cargas con bono: ${d.cargas_con_bono}` : null,
    Number(d.retiro_espera_horas) ? `Espera VIP: ${d.retiro_espera_horas} h` : null,
    razones.length ? '' : null,
    ...razones,
    '',
    '<i>Revisar antes de pagar.</i>',
  ].filter((l) => l !== null).join('\n');

  const mismoChat = credenciales('alertas').chat === credenciales('retiros').chat;

  return llamar('alertas', 'sendMessage', {
    text: texto,
    parse_mode: 'HTML',
    reply_to_message_id: (replyTo && mismoChat) ? replyTo : undefined,
  });
}

export async function avisarReclamoCerrado({ jugador, motivo, staff }) {
  const texto = [
    '<b>RECLAMO CERRADO</b>',
    '',
    `Jugador: ${escapar(jugador.display_name || jugador.username)} (ID #${jugador.player_number})`,
    `Motivo: ${escapar(motivo || 'otro')}`,
    `Cerró: ${escapar(staff)}`,
  ].join('\n');

  return llamar('soporte', 'sendMessage', { text: texto, parse_mode: 'HTML' });
}

function escapar(txt) {
  return String(txt ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function formatear(n) {
  return Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 2 });
}
