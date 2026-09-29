import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { requirePlayerActivo } from '../lib/playerAuth.js';
import { avisarReclamoAbierto } from '../lib/telegram.js';
import { aplicarCors } from '../lib/cors.js';

// /api/player-social?recurso=banners|soporte
// Consolidado (antes: player-banners, player-soporte).
export default async function handler(req, res) {
  if (aplicarCors(req, res)) return;

  if (req.query.recurso === 'soporte') return soporte(req, res);
  return banners(req, res);
}

// GET ?recurso=banners — sin token: el portal los muestra en la principal
async function banners(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const ahora = new Date().toISOString();

    const cols = 'id, imagen_url, titulo, subtitulo, link_url, ajuste, formato, video_url';
    let { data, error } = await supabaseAdmin
      .from('banners')
      .select(cols)
      .eq('activo', true)
      .or(`desde.is.null,desde.lte.${ahora}`)
      .or(`hasta.is.null,hasta.gte.${ahora}`)
      .order('orden', { ascending: true });

    if (error && /video_url/.test(error.message || '')) {
      ({ data, error } = await supabaseAdmin
        .from('banners')
        .select(cols.replace(', video_url', ''))
        .eq('activo', true)
        .or(`desde.is.null,desde.lte.${ahora}`)
        .or(`hasta.is.null,hasta.gte.${ahora}`)
        .order('orden', { ascending: true }));
    }

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ banners: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}

// GET  ?recurso=soporte -> su conversación activa
// POST ?recurso=soporte -> escribe (crea el ticket si no tiene uno abierto)
async function soporte(req, res) {
  try {
    const { sesion } = await requirePlayerActivo(req, supabaseAdmin, 'id');

    if (req.method === 'GET') {
      const { data: ticket } = await supabaseAdmin
        .from('soporte_tickets').select('*')
        .eq('player_id', sesion.sub)
        .order('ultimo_mensaje_at', { ascending: false }).limit(1).maybeSingle();

      if (!ticket) return res.status(200).json({ ticket: null, mensajes: [] });

      const { data: mensajes } = await supabaseAdmin
        .from('soporte_mensajes')
        .select('id, autor_tipo, autor, texto, adjunto_url, created_at')
        .eq('ticket_id', ticket.id).order('created_at', { ascending: true });

      await supabaseAdmin.from('soporte_tickets').update({ sin_leer_player: 0 }).eq('id', ticket.id);

      return res.status(200).json({ ticket, mensajes: mensajes || [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { motivo, texto, depositId, withdrawalId, adjuntoUrl } = req.body || {};

    // Se puede mandar solo una foto: a veces la captura dice más.
    if ((!texto || !String(texto).trim()) && !adjuntoUrl) {
      return res.status(400).json({ error: 'Escribí tu consulta o adjuntá una imagen' });
    }

    const { data: player } = await supabaseAdmin
      .from('players').select('player_number, username, display_name, ban_permanente')
      .eq('id', sesion.sub).single();

    if (!player || player.ban_permanente) return res.status(403).json({ error: 'Tu cuenta está suspendida.' });

    // ¿Tiene uno sin resolver? Escribe ahí en vez de abrir otro.
    const { data: abierto } = await supabaseAdmin
      .from('soporte_tickets').select('id')
      .eq('player_id', sesion.sub).in('estado', ['abierto', 'en_curso']).maybeSingle();

    let ticketId = abierto?.id;
    let esNuevo = false;

    if (!ticketId) {
      const { data: creado, error } = await supabaseAdmin
        .from('soporte_tickets')
        .insert({
          player_id: sesion.sub,
          motivo: ['recarga', 'retiro', 'cuenta', 'otro'].includes(motivo) ? motivo : 'otro',
          deposit_id: depositId || null, withdrawal_id: withdrawalId || null,
        })
        .select('id').single();

      if (error) return res.status(400).json({ error: error.message });

      ticketId = creado.id;
      esNuevo = true;
    }

    const { error: errMsg } = await supabaseAdmin.rpc('soporte_enviar', {
      p_ticket_id: ticketId, p_autor_tipo: 'jugador',
      p_autor: player.display_name || player.username,
      p_texto: texto ? String(texto).trim() : null, p_adjunto: adjuntoUrl || null,
    });

    if (errMsg) return res.status(400).json({ error: errMsg.message });

    if (esNuevo) {
      try {
        await avisarReclamoAbierto({ jugador: player, motivo });
      } catch (err) {
        console.error('[telegram] aviso de reclamo', err.message);
      }
    }

    return res.status(200).json({ ticketId });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
