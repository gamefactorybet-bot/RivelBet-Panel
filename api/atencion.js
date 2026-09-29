import { supabaseAdmin, requireStaff, requirePermiso, requireCasa } from '../lib/supabaseAdmin.js';
import { puede } from '../lib/permisos.js';
import { avisarResuelta, avisarReclamoCerrado } from '../lib/telegram.js';

// /api/atencion?recurso=solicitudes|soporte|verificaciones
// Consolidado (antes: solicitudes, soporte).
export default async function handler(req, res) {
  const recurso = req.query.recurso;

  if (recurso === 'soporte') return soporte(req, res);
  if (recurso === 'verificaciones') return verificaciones(req, res);
  return solicitudes(req, res);
}

/* =========================================================
   Verificaciones de identidad (KYC): cola y resolución
   Gate: permiso atender (cajero de caja / gerente).
   ========================================================= */
async function verificaciones(req, res) {
  try {
    if (req.method === 'GET') {
      const staff = await requirePermiso(req, 'atender');
      requireCasa(staff);

      const estado = ['pendiente', 'aprobada', 'rechazada'].includes(req.query.estado)
        ? req.query.estado : 'pendiente';
      const porPagina = Math.min(50, Math.max(5, Number(req.query.porPagina) || 20));
      const pagina = Math.max(1, Number(req.query.pagina) || 1);
      const desde = (pagina - 1) * porPagina;

      const { data, error, count } = await supabaseAdmin
        .from('verificaciones')
        .select(`*, players(player_number, username, display_name, documento, telefono, email, fecha_nacimiento, estado_verificacion)`, { count: 'planned' })
        .eq('estado', estado)
        .order('created_at', { ascending: estado === 'pendiente' })
        .range(desde, desde + porPagina - 1);

      if (error) return res.status(400).json({ error: error.message });

      const { count: pendientes } = await supabaseAdmin
        .from('verificaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente');

      return res.status(200).json({
        verificaciones: data || [], estado, pagina, porPagina, pendientes: pendientes ?? 0,
        total: count ?? 0, paginas: Math.max(1, Math.ceil((count ?? 0) / porPagina)),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'atender');
    requireCasa(staff);
    const { verifId, accion, motivo } = req.body || {};

    if (!verifId || !['aprobar', 'rechazar'].includes(accion)) {
      return res.status(400).json({ error: 'Faltan verifId o acción' });
    }

    const { data, error } = await supabaseAdmin.rpc('resolver_verificacion', {
      p_verif_id: verifId,
      p_created_by: staff.email,
      p_aprobar: accion === 'aprobar',
      p_motivo: motivo || null,
    });

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ verificacion: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

/* =========================================================
   Solicitudes: aprobar/rechazar cargas y retiros del portal
   ========================================================= */
async function solicitudes(req, res) {
  try {
    if (req.method === 'GET') {
      const staff = await requirePermiso(req, 'atender');
      requireCasa(staff);

      const estado = req.query.estado || 'pendiente';
      const tipo = req.query.tipo === 'carga' ? 'carga' : 'retiro';
      const tabla = tipo === 'carga' ? 'deposit_requests' : 'withdrawal_requests';
      const extra = tipo === 'carga' ? ', bank_accounts(banco, titular, alias)' : '';

      const porPagina = Math.min(50, Math.max(5, Number(req.query.porPagina) || 20));
      const pagina = Math.max(1, Number(req.query.pagina) || 1);
      const desde = (pagina - 1) * porPagina;
      const ascendente = estado === 'pendiente';

      const [{ data, error, count }, nCarga, nRetiro] = await Promise.all([
        supabaseAdmin
          .from(tabla)
          .select(`*, players(player_number, username, display_name, balance)${extra}`, { count: 'planned' })
          .eq('estado', estado)
          .order('created_at', { ascending: ascendente })
          .range(desde, desde + porPagina - 1),
        supabaseAdmin.from('deposit_requests').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
        supabaseAdmin.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
      ]);

      if (error) return res.status(400).json({ error: error.message });

      return res.status(200).json({
        solicitudes: data, tipo, pagina, porPagina, total: count ?? 0,
        paginas: Math.max(1, Math.ceil((count ?? 0) / porPagina)),
        pendientes: { carga: nCarga.count ?? 0, retiro: nRetiro.count ?? 0 },
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { requestId, accion, nota, tipo, montoReal } = req.body || {};
    const esCarga = tipo === 'carga';

    const staff = await requirePermiso(req, 'atender');
    requireCasa(staff);

    if (!requestId || !['aprobar', 'rechazar'].includes(accion)) {
      return res.status(400).json({ error: 'Faltan requestId o accion' });
    }

    if (accion === 'aprobar' && !puede(staff, esCarga ? 'cargar' : 'retirar')) {
      return res.status(403).json({ error: esCarga ? 'No podés aprobar cargas' : 'No podés aprobar retiros' });
    }

    const tabla = esCarga ? 'deposit_requests' : 'withdrawal_requests';

    if (accion === 'rechazar') {
      if (esCarga) {
        const { data, error } = await supabaseAdmin
          .from(tabla)
          .update({ estado: 'rechazado', nota_staff: nota || null, resuelto_por: staff.email, resuelto_at: new Date().toISOString() })
          .eq('id', requestId).eq('estado', 'pendiente').select().maybeSingle();

        if (error) return res.status(400).json({ error: error.message });
        if (!data) return res.status(409).json({ error: 'Esa solicitud ya fue resuelta' });

        await notificarSolicitud({ solicitud: data, tipo, aprobado: false, staff, nota });
        return res.status(200).json({ solicitud: data });
      }

      // El retiro ya se había descontado del saldo al solicitarlo:
      // rechazar_retiro se encarga de devolver las fichas al jugador.
      const { data, error } = await supabaseAdmin.rpc('rechazar_retiro', {
        p_request_id: requestId, p_created_by: staff.email, p_nota: nota || null,
      });

      if (error) return res.status(400).json({ error: error.message });

      await notificarSolicitud({ solicitud: data, tipo, aprobado: false, staff, nota });
      return res.status(200).json({ solicitud: data });
    }

    const { data, error } = esCarga
      ? await supabaseAdmin.rpc('aprobar_deposito', {
          p_request_id: requestId, p_created_by: staff.email,
          p_monto_real: montoReal ? Number(montoReal) : null, p_nota: nota || null,
        })
      : await supabaseAdmin.rpc('aprobar_retiro', {
          p_request_id: requestId, p_created_by: staff.email, p_nota: nota || null,
        });

    if (error) return res.status(400).json({ error: error.message });

    if (esCarga && data?.player_id) {
      const carga = Number(montoReal) || Number(data.amount) || 0;
      const { error: errCom } = await supabaseAdmin.rpc('acreditar_comision_carga', {
        p_player_id: data.player_id,
        p_deposit_id: data.id,
        p_carga: carga,
        p_created_by: staff.email,
      });
      if (errCom) console.error('[comision]', errCom.message);
    }

    await notificarSolicitud({ solicitud: data, tipo, aprobado: true, staff, nota });
    return res.status(200).json({ solicitud: data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function notificarSolicitud({ solicitud, tipo, aprobado, staff, nota }) {
  try {
    const { data: jugador } = await supabaseAdmin
      .from('players').select('player_number, username, display_name, balance')
      .eq('id', solicitud.player_id).single();

    if (!jugador) return;

    // ¿Esta carga aprobada fue la que levantó el candado del bono?
    let desbloqueado = false;
    if (aprobado && tipo === 'carga') {
      const { data: bono } = await supabaseAdmin
        .from('bonos_otorgados').select('carga_liberadora')
        .eq('player_id', solicitud.player_id).maybeSingle();
      desbloqueado = bono?.carga_liberadora === solicitud.id;
    }

    await avisarResuelta({
      tipo, aprobado, monto: solicitud.amount, moneda: process.env.VITE_CURRENCY_CODE || '',
      jugador, staff: staff.display_name || staff.email, replyTo: solicitud.telegram_message_id, nota,
      desbloqueado,
    });
  } catch (err) {
    console.error('[telegram] aviso de resolución', err.message);
  }
}

/* =========================================================
   Soporte (lado staff): bandeja y conversación con el jugador
   ========================================================= */
const GRUPOS_SOPORTE = { abiertos: ['abierto', 'en_curso'], resueltos: ['resuelto'], cerrados: ['cerrado'] };

async function soporte(req, res) {
  try {
    const staff = await requirePermiso(req, 'soporte');

    if (req.method === 'GET') {
      if (req.query.ticket) {
        const [{ data: ticket }, { data: mensajes }] = await Promise.all([
          supabaseAdmin.from('soporte_tickets')
            .select('*, players(player_number, username, display_name, balance)')
            .eq('id', req.query.ticket).single(),
          supabaseAdmin.from('soporte_mensajes').select('*')
            .eq('ticket_id', req.query.ticket).order('created_at', { ascending: true }),
        ]);

        if (!ticket) return res.status(404).json({ error: 'Conversación no encontrada' });

        await supabaseAdmin.from('soporte_tickets').update({ sin_leer_staff: 0 }).eq('id', req.query.ticket);

        let solicitud = null;

        if (ticket.deposit_id) {
          const { data } = await supabaseAdmin
            .from('deposit_requests').select('id, amount, estado, comprobante_url, created_at, bono_monto')
            .eq('id', ticket.deposit_id).single();
          solicitud = data ? { ...data, tipo: 'carga' } : null;
        } else if (ticket.withdrawal_id) {
          const { data } = await supabaseAdmin
            .from('withdrawal_requests').select('id, amount, estado, created_at')
            .eq('id', ticket.withdrawal_id).single();
          solicitud = data ? { ...data, tipo: 'retiro' } : null;
        }

        return res.status(200).json({ ticket, mensajes: mensajes || [], solicitud });
      }

      const grupo = GRUPOS_SOPORTE[req.query.estado] || GRUPOS_SOPORTE.abiertos;
      const porPagina = Math.min(200, Math.max(10, Number(req.query.porPagina) || 20));

      const { data, error, count } = await supabaseAdmin
        .from('soporte_tickets')
        .select('*, players(player_number, username, display_name)', { count: 'planned' })
        .in('estado', grupo).order('ultimo_mensaje_at', { ascending: false }).range(0, porPagina - 1);

      if (error) return res.status(400).json({ error: error.message });

      const { count: sinLeerCount } = await supabaseAdmin
        .from('soporte_tickets').select('id', { count: 'exact', head: true })
        .in('estado', ['abierto', 'en_curso']).gt('sin_leer_staff', 0);

      return res.status(200).json({
        tickets: data || [], sinLeer: sinLeerCount ?? 0, total: count ?? 0, hayMas: (count ?? 0) > porPagina,
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { ticketId, texto, estado, adjuntoUrl } = req.body || {};
    if (!ticketId) return res.status(400).json({ error: 'Falta ticketId' });

    if (estado) {
      if (!['abierto', 'en_curso', 'resuelto', 'cerrado'].includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
      }

      const patch = { estado, atendido_por: staff.display_name || staff.email };
      if (estado === 'resuelto') patch.resuelto_at = new Date().toISOString();
      if (estado === 'cerrado') patch.cerrado_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('soporte_tickets').update(patch).eq('id', ticketId)
        .select('*, players(player_number, username, display_name)').single();

      if (error) return res.status(400).json({ error: error.message });

      if (estado === 'cerrado') {
        try {
          await avisarReclamoCerrado({ jugador: data.players || {}, motivo: data.motivo, staff: staff.display_name || staff.email });
        } catch (err) {
          console.error('[telegram] aviso de cierre', err.message);
        }
      }

      await supabaseAdmin.from('soporte_mensajes').insert({
        ticket_id: ticketId, autor_tipo: 'sistema', autor: staff.display_name || staff.email,
        texto: estado === 'resuelto' ? 'Marcó el reclamo como resuelto' : estado === 'cerrado' ? 'Cerró la conversación' : `Cambió el estado a ${estado}`,
      });

      return res.status(200).json({ ticket: data });
    }

    if ((!texto || !String(texto).trim()) && !adjuntoUrl) {
      return res.status(400).json({ error: 'Escribí un mensaje o adjuntá una imagen' });
    }

    const { data, error } = await supabaseAdmin.rpc('soporte_enviar', {
      p_ticket_id: ticketId, p_autor_tipo: 'staff', p_autor: staff.display_name || staff.email,
      p_texto: texto ? String(texto).trim() : null, p_adjunto: adjuntoUrl || null,
    });

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ mensaje: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
