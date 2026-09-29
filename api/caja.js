import { supabaseAdmin, requireStaff, requirePermiso, requireJugadorDe } from '../lib/supabaseAdmin.js';
import { puede, esExterno } from '../lib/permisos.js';

const CATEGORIAS_HIST = {
  cargas: ['carga'], retiros: ['retiro'], rechazos: ['rechazo'],
  bans: ['ban'], jugadores: ['jugador'], staff: ['staff'],
};

// /api/caja?recurso=movimiento|cierre|anular|historial|fondos
export default async function handler(req, res) {
  const recurso = req.query.recurso;

  if (recurso === 'cierre') return cierre(req, res);
  if (recurso === 'anular') return anular(req, res);
  if (recurso === 'historial') return historial(req, res);
  if (recurso === 'fondos') return fondos(req, res);
  return movimiento(req, res);
}

// POST ?recurso=movimiento — body: { playerId, type, amount, note }
async function movimiento(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requireStaff(req);

    const { playerId, type, amount, note } = req.body || {};

    if (!playerId || !type || !amount) {
      return res.status(400).json({ error: 'Faltan playerId, type o amount' });
    }

    const permiso = type === 'carga' ? 'cargar' : 'retirar';
    if (!puede(staff, permiso)) {
      return res.status(403).json({ error: `No tenés permiso para ${type === 'carga' ? 'cargar' : 'retirar'} fichas` });
    }

    await requireJugadorDe(staff, playerId);

    const { data, error } = await supabaseAdmin.rpc('wallet_movimiento', {
      p_player_id: playerId, p_type: type, p_amount: amount,
      p_note: note || null, p_created_by: staff.email, p_staff_id: staff.id,
    });

    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ transaction: data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=cierre&desde=...&hasta=...
async function cierre(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'ver_historial');

    const { desde, hasta } = req.query;

    const desdeIso = desde ? new Date(desde).toISOString() : null;
    const hastaIso = hasta ? finDelDia(hasta) : null;

    const [{ data, error }, plataRes, txsRes] = await Promise.all([
      supabaseAdmin.rpc('cierre_caja', { p_desde: desdeIso, p_hasta: hastaIso }),
      supabaseAdmin.rpc('cierre_plata', { p_desde: desdeIso, p_hasta: hastaIso }),
      (async () => {
        let q = supabaseAdmin.from('staff_fondo_txs')
          .select('tipo, amount, staff_id, created_by');
        if (desdeIso) q = q.gte('created_at', desdeIso);
        if (hastaIso) q = q.lte('created_at', hastaIso);
        return q;
      })(),
    ]);

    if (error) return res.status(400).json({ error: error.message });
    const plata = plataRes.data || null;

    let rondas = supabaseAdmin.from('game_rounds').select('bet, win');
    if (desde) rondas = rondas.gte('created_at', new Date(desde).toISOString());
    if (hasta) rondas = rondas.lte('created_at', finDelDia(hasta));

    const { data: giros } = await rondas;

    const juegos = (giros || []).reduce((acc, r) => {
      acc.giros += 1; acc.apostado += Number(r.bet); acc.pagado += Number(r.win);
      return acc;
    }, { giros: 0, apostado: 0, pagado: 0 });

    juegos.margen = juegos.apostado - juegos.pagado;

    const { data: equipo } = await supabaseAdmin.from('staff_profiles').select('id, email, display_name');
    const nom = Object.fromEntries((equipo || []).map((s) => [s.id, s.display_name || s.email]));

    const porCajero = {};
    (txsRes.data || []).forEach((t) => {
      const key = t.staff_id || t.created_by || 'boveda';
      if (!porCajero[key]) {
        porCajero[key] = {
          staff_id: t.staff_id,
          nombre: nom[t.staff_id] || t.created_by || 'Bóveda',
          asignadas: 0, devueltas: 0, entregadas: 0, recuperadas: 0,
        };
      }
      const n = Number(t.amount) || 0;
      if (t.tipo === 'asignar') porCajero[key].asignadas += n;
      if (t.tipo === 'devolver') porCajero[key].devueltas += n;
      if (t.tipo === 'carga_caja') porCajero[key].entregadas += n;
      if (t.tipo === 'retiro_caja') porCajero[key].recuperadas += n;
    });

    let cierreFilas = data || [];
    let plataOut = plata || null;
    let fichasOut = Object.values(porCajero);

    if (esExterno(staff)) {
      cierreFilas = cierreFilas.filter((f) => f.cajero === staff.email);
      fichasOut = fichasOut.filter((f) => f.staff_id === staff.id);
      if (plataOut) {
        // El externo no ve la plata de la casa (portal). Su neto es
        // cargas de caja menos retiros de caja, que ya está en cierre_caja.
        plataOut = null;
      }
    }

    return res.status(200).json({
      cierre: cierreFilas,
      juegos: esExterno(staff) ? { giros: 0, apostado: 0, pagado: 0, margen: 0 } : juegos,
      plata: plataOut,
      fichas: fichasOut,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

function finDelDia(fecha) {
  const d = new Date(fecha);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

// POST ?recurso=anular — body: { txId, motivo }
async function anular(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'gestionar_staff');

    const { txId, motivo } = req.body || {};

    if (!txId) return res.status(400).json({ error: 'Falta el movimiento a anular' });
    if (!motivo || !String(motivo).trim()) return res.status(400).json({ error: 'El motivo es obligatorio' });

    const { data, error } = await supabaseAdmin.rpc('anular_movimiento', {
      p_tx_id: txId,
      p_created_by: staff.display_name || staff.email,
      p_motivo: String(motivo).trim(),
    });

    if (error) return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });

    return res.status(200).json({ movimiento: Array.isArray(data) ? data[0] : data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=historial&filtro=&q=&desde=&hasta=&actor=&pagina=&formato=csv
async function historial(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'ver_historial');

    const { filtro, q, desde, hasta, actor, formato } = req.query;

    const esCsv = formato === 'csv';
    const porPagina = esCsv ? 5000 : Math.min(100, Math.max(10, Number(req.query.porPagina) || 25));
    const pagina = Math.max(1, Number(req.query.pagina) || 1);
    const inicio = esCsv ? 0 : (pagina - 1) * porPagina;

    let query = supabaseAdmin
      .from('vista_eventos')
      .select('*', { count: 'planned' })
      .order('fecha', { ascending: false });

    if (esExterno(staff)) query = query.eq('actor', staff.email);

    if (filtro && CATEGORIAS_HIST[filtro]) query = query.in('categoria', CATEGORIAS_HIST[filtro]);
    if (desde) query = query.gte('fecha', new Date(desde).toISOString());

    if (hasta) {
      const fin = new Date(hasta);
      fin.setHours(23, 59, 59, 999);
      query = query.lte('fecha', fin.toISOString());
    }

    if (actor) query = query.eq('actor', actor);

    if (q) {
      const texto = String(q).trim();
      query = /^\d+$/.test(texto)
        ? query.eq('player_number', Number(texto))
        : query.or(`sujeto.ilike.%${texto}%,actor.ilike.%${texto}%`);
    }

    const { data, error, count } = await query.range(inicio, inicio + porPagina - 1);

    if (error) return res.status(400).json({ error: error.message });

    if (esCsv) {
      const filas = [
        ['Fecha', 'Evento', 'Origen', 'Jugador', 'ID', 'Quien', 'Monto', 'Saldo', 'Detalle'],
        ...(data || []).map((e) => [
          new Date(e.fecha).toLocaleString('es-PY'), e.evento, e.origen || '', e.sujeto || '',
          e.player_number ?? '', e.actor || '', e.monto ?? '', e.saldo ?? '',
          (e.detalle || '').replace(/\s+/g, ' '),
        ]),
      ];

      const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="historial-${Date.now()}.csv"`);
      res.end('\uFEFF' + csv);
      return;
    }

    return res.status(200).json({
      eventos: data || [], pagina, porPagina, total: count ?? 0,
      paginas: Math.max(1, Math.ceil((count ?? 0) / porPagina)),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET  ?recurso=fondos
// POST ?recurso=fondos&accion=fabricar|asignar|devolver|config
async function fondos(req, res) {
  try {
    const staff = await requireStaff(req);

    if (req.method === 'GET') {
      let { data: cfg } = {};
      let { data: boveda } = {};
      let { data: fondosData } = {};
      let { data: txs } = {};
      let equipo = [];

      const lote = await Promise.all([
        supabaseAdmin.from('caja_config').select('caja_con_fondo').eq('id', 1).maybeSingle(),
        supabaseAdmin.from('casino_boveda').select('fichas, fabricadas_acum').eq('id', 1).maybeSingle(),
        supabaseAdmin.from('staff_fondos').select('staff_id, fichas, updated_at'),
        supabaseAdmin.from('staff_profiles').select('id, email, display_name, perfil, active, externo_modo, comision_pct'),
        supabaseAdmin.from('staff_fondo_txs')
          .select('id, tipo, staff_id, amount, note, created_by, created_at, fondo_before, fondo_after, boveda_before, boveda_after')
          .order('created_at', { ascending: false })
          .limit(40),
      ]);
      cfg = lote[0].data;
      boveda = lote[1].data;
      fondosData = lote[2].data;
      txs = lote[4].data;
      if (lote[3].error && /externo_modo|comision_pct/.test(lote[3].error.message || '')) {
        const retry = await supabaseAdmin.from('staff_profiles').select('id, email, display_name, perfil, active');
        equipo = retry.data || [];
      } else {
        equipo = lote[3].data || [];
      }

      const porId = Object.fromEntries((equipo || []).map((s) => [s.id, s]));
      const mio = (fondosData || []).find((f) => f.staff_id === staff.id);
      const veTodos = puede(staff, 'asignar_fichas') || puede(staff, 'fabricar_fichas');

      return res.status(200).json({
        cajaConFondo: Boolean(cfg?.caja_con_fondo),
        boveda: veTodos ? {
          fichas: Number(boveda?.fichas || 0),
          fabricadas: Number(boveda?.fabricadas_acum || 0),
        } : null,
        mio: Number(mio?.fichas || 0),
        fondos: veTodos ? (fondosData || []).map((f) => {
          const s = porId[f.staff_id] || {};
          return {
            staffId: f.staff_id,
            fichas: Number(f.fichas || 0),
            email: s.email || '',
            nombre: s.display_name || s.email || '',
            perfil: s.perfil || '',
            externoModo: s.externo_modo || null,
            comisionPct: Number(s.comision_pct || 0),
            active: s.active !== false,
          };
        }) : [],
        movimientos: veTodos ? (txs || []) : [],
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const accion = req.query.accion || req.body?.accion;
    const amount = Number(req.body?.amount);
    const note = req.body?.note || null;
    const staffId = req.body?.staffId || null;
    const margenPct = req.body?.margenPct === undefined || req.body?.margenPct === null || req.body?.margenPct === ''
      ? null
      : Number(req.body.margenPct);

    if (accion === 'config') {
      await requirePermiso(req, 'fabricar_fichas');
      const { error } = await supabaseAdmin.from('caja_config').update({
        caja_con_fondo: Boolean(req.body?.cajaConFondo),
        updated_by: staff.email,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, cajaConFondo: Boolean(req.body?.cajaConFondo) });
    }

    if (accion === 'fabricar') {
      await requirePermiso(req, 'fabricar_fichas');
      const { data, error } = await supabaseAdmin.rpc('boveda_fabricar', {
        p_amount: amount, p_created_by: staff.email, p_note: note,
      });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ boveda: data });
    }

    if (accion === 'asignar' || accion === 'devolver') {
      await requirePermiso(req, 'asignar_fichas');
      if (!staffId) return res.status(400).json({ error: 'Falta el cajero' });
      if (accion === 'devolver') {
        const { data, error } = await supabaseAdmin.rpc('fondo_devolver', {
          p_staff_id: staffId, p_amount: amount, p_created_by: staff.email, p_note: note,
        });
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ fondo: data });
      }

      const args = {
        p_staff_id: staffId, p_amount: amount, p_created_by: staff.email, p_note: note,
      };
      if (margenPct !== null && Number.isFinite(margenPct)) args.p_margen_pct = margenPct;
      const { data, error } = await supabaseAdmin.rpc('fondo_asignar', args);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ fondo: data });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
