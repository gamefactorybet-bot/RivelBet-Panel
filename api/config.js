import crypto from 'node:crypto';
import { supabaseAdmin, requireStaff, requirePermiso } from '../lib/supabaseAdmin.js';
import { avisarRetiro } from '../lib/telegram.js';
import { aplicarCors } from '../lib/cors.js';

// Mismas claves que THEMES en src/lib/themes.js. No se importa ese
// archivo acá porque su DEFAULT_SETTINGS usa import.meta.env
// (transformado por Vite) — en la función serverless de Vercel eso
// rompería al no pasar por ese transform. Si se agrega un tema nuevo,
// hay que sumarlo en los dos lugares.
const THEME_KEYS = [
  'carmesi-rivelbet',
  'mesa-verde', 'ruleta-roja', 'oro-real', 'diamante-platino', 'selva-tropical',
  'zafiro-real', 'rubi-imperial', 'onix-plata', 'champagne-dorado', 'amatista-nocturna',
  'esmeralda-vegas', 'neon-miami',
  'cafe-habano', 'cobre-industrial', 'bronce-antiguo', 'azul-casino-clasico',
  'perla-nacar', 'medianoche-real', 'fuego-carmesi', 'menta-plata',
];

const OVERRIDE_COLORS = new Set([
  'void', 'veilTop', 'halo', 'surface', 'surfaceRaised', 'line',
  'text', 'textDim', 'textDimmer', 'accent', 'accentDeep', 'accentGlow',
  'accentText', 'secondary', 'success', 'error', 'warning',
  'buttonFrom', 'buttonMid', 'buttonTo', 'buttonShadow', 'bannerFrom',
  'cartelVipFrom', 'cartelVipTo', 'cartelHotFrom', 'cartelHotMid', 'cartelHotTo',
  'cartelNuevoFrom', 'cartelNuevoTo',
]);
const OVERRIDE_SELECT = {
  buttonFace: ['color', 'image', 'lottie'],
  buttonImageFit: ['cover', 'contain'],
  fontBody: ['Manrope', 'Geist', 'Inter', 'system-ui'],
  fontDisplay: ['Fraunces', 'Georgia', 'Manrope', 'Geist'],
};
const OVERRIDE_RANGE = {
  lineOpacity: [4, 100], cardRadius: [0, 28], cardShadow: [0, 100], hoverGlow: [0, 80],
  buttonHeight: [28, 72], buttonWidth: [0, 280], buttonRadius: [0, 80], buttonPadX: [6, 40],
  buttonMediaW: [20, 100], buttonMediaH: [20, 100], buttonMediaRadius: [0, 80],
};
const OVERRIDE_URLS = new Set(['buttonImageUrl', 'buttonLottieUrl']);
const OVERRIDE_IDS = new Set(['buttonLottieId']);
const OVERRIDE_TOGGLES = new Set(['useBgImage', 'buttonShowLabel']);
const SAFE_URL = /^(https?:\/\/|\/)[^\s]{1,1800}$/i;
const SAFE_ID = /^[a-zA-Z0-9_-]{8,80}$/;
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const TEMPLATE_KEYS = ['clasico', 'mesa-de-control', 'fichas', 'tablero', 'minimal-ejecutivo'];

// /api/config?recurso=settings|cuentas|cuentas-stats|banners|bonos|cloudinary|animaciones
// Consolidado (antes: settings, cuentas, cuentas-stats, banners, bonos,
// cloudinary-firma-staff, animaciones).
export default async function handler(req, res) {
  // El portal del jugador lee /api/config?recurso=settings desde su
  // propio dominio (loadSettings): sin esto, el navegador bloquea el
  // pedido cruzado antes de que llegue acá.
  if (aplicarCors(req, res)) return;

  const recurso = req.query.recurso;

  if (recurso === 'cron') return cron(req, res);
  if (recurso === 'cuentas') return cuentas(req, res);
  if (recurso === 'cuentas-stats') return cuentasStats(req, res);
  if (recurso === 'banners') return banners(req, res);
  if (recurso === 'bonos') return bonos(req, res);
  if (recurso === 'bono-registro') return bonoRegistro(req, res);
  if (recurso === 'cashback') return cashback(req, res);
  if (recurso === 'billetera') return billetera(req, res);
  if (recurso === 'promos') return promos(req, res);
  if (recurso === 'hitos') return hitos(req, res);
  if (recurso === 'ofertas-carga') return ofertasCarga(req, res);
  if (recurso === 'vip') return vip(req, res);
  if (recurso === 'giro-diario') return giroDiario(req, res);
  if (recurso === 'referidos') return referidos(req, res);
  if (recurso === 'cloudinary') return cloudinary(req, res);
  if (recurso === 'proveedores') return proveedores(req, res);
  if (recurso === 'animaciones') return animaciones(req, res);
  return settings(req, res);
}

// GET (sin auth, pública) / POST (permiso ajustes) — apariencia del casino
async function settings(req, res) {
  if (req.method === 'GET') {
    const [{ data, error }, { data: bonoReg }, { data: refCfg }, { data: billeteraCfg }] = await Promise.all([
      supabaseAdmin
        .from('casino_settings')
        .select(`*,
          soporte_animacion:animaciones!casino_settings_soporte_animacion_id_fkey(url),
          saldo_animacion:animaciones!casino_settings_saldo_animacion_id_fkey(url)
        `)
        .eq('id', 1).single(),
      supabaseAdmin
        .from('bono_registro')
        .select('activo, monto, banner_url, titulo, subtitulo, edad_minima').eq('id', 1).single(),
      supabaseAdmin
        .from('referidos_config')
        .select('activo, bono_referidor, bono_referido, min_carga').eq('id', 1).single(),
      supabaseAdmin
        .from('billetera_config')
        .select('modo_avanzado, retener_ganancias').eq('id', 1).maybeSingle(),
    ]);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      ...data,
      soporte_animacion_url: data.soporte_animacion?.url || null,
      saldo_animacion_url: data.saldo_animacion?.url || null,
      bono_registro: bonoReg || null,
      referidos: refCfg || null,
      billetera: billeteraCfg || { modo_avanzado: false, retener_ganancias: false },
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'ajustes');

    const { casinoName, logoUrl, wordmarkUrl, themeKey, templateKey, bgLoginUrl, bgPanelUrl, bgJuegosUrl,
            bgLoginDim, bgPanelDim, bgJuegosDim, soporteAnimacionId, saldoAnimacionId, saldoAnimacionPosicion,
            surfaceOpacity, surfaceBlur, rotacionModo, rotacionReinicio, themeOverrides } = req.body || {};

    if (themeKey && !THEME_KEYS.includes(themeKey)) return res.status(400).json({ error: 'Tema inválido' });
    if (templateKey && !TEMPLATE_KEYS.includes(templateKey)) return res.status(400).json({ error: 'Plantilla inválida' });

    const patch = { updated_by: staff.email, updated_at: new Date().toISOString() };
    if (casinoName !== undefined) patch.casino_name = casinoName;
    if (logoUrl !== undefined) patch.logo_url = logoUrl;
    if (wordmarkUrl !== undefined) patch.wordmark_url = wordmarkUrl || null;
    if (themeKey !== undefined) patch.theme_key = themeKey;
    if (templateKey !== undefined) patch.template_key = templateKey;
    if (bgLoginUrl !== undefined) patch.bg_login_url = bgLoginUrl || null;
    if (bgPanelUrl !== undefined) patch.bg_panel_url = bgPanelUrl || null;
    if (bgJuegosUrl !== undefined) patch.bg_juegos_url = bgJuegosUrl || null;
    if (bgLoginDim !== undefined) patch.bg_login_dim = clamp(bgLoginDim);
    if (bgPanelDim !== undefined) patch.bg_panel_dim = clamp(bgPanelDim);
    if (bgJuegosDim !== undefined) patch.bg_juegos_dim = clamp(bgJuegosDim);
    if (soporteAnimacionId !== undefined) patch.soporte_animacion_id = soporteAnimacionId || null;
    if (saldoAnimacionId !== undefined) patch.saldo_animacion_id = saldoAnimacionId || null;

    if (saldoAnimacionPosicion !== undefined) {
      if (!['antes', 'grande', 'despues'].includes(saldoAnimacionPosicion)) {
        return res.status(400).json({ error: 'Posición de la ficha inválida' });
      }
      patch.saldo_animacion_posicion = saldoAnimacionPosicion;
    }
    if (surfaceOpacity !== undefined) patch.surface_opacity = clamp(surfaceOpacity);
    if (surfaceBlur !== undefined) patch.surface_blur = clamp(surfaceBlur, 30);
    if (themeOverrides !== undefined) patch.theme_overrides = sanitizeThemeOverrides(themeOverrides);

    if (rotacionModo !== undefined) {
      if (!['monto', 'turnos', 'manual'].includes(rotacionModo)) return res.status(400).json({ error: 'Modo de rotación inválido' });
      patch.rotacion_modo = rotacionModo;
    }

    if (rotacionReinicio !== undefined) {
      if (!['diario', 'mensual', 'nunca'].includes(rotacionReinicio)) return res.status(400).json({ error: 'Período de reinicio inválido' });
      patch.rotacion_reinicio = rotacionReinicio;
    }

    const { data, error } = await supabaseAdmin
      .from('casino_settings')
      .update(patch)
      .eq('id', 1)
      .select(`*,
        soporte_animacion:animaciones!casino_settings_soporte_animacion_id_fkey(url),
        saldo_animacion:animaciones!casino_settings_saldo_animacion_id_fkey(url)
      `)
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      ...data,
      soporte_animacion_url: data.soporte_animacion?.url || null,
      saldo_animacion_url: data.saldo_animacion?.url || null,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

function clamp(v, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return max;
  return Math.min(max, Math.max(0, Math.round(n)));
}

function sanitizeThemeOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (OVERRIDE_COLORS.has(key)) {
      if (typeof value === 'string' && HEX_COLOR.test(value.trim())) {
        const s = value.trim();
        out[key] = s.length === 4
          ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase()
          : s.toLowerCase();
      }
      continue;
    }
    if (OVERRIDE_TOGGLES.has(key)) {
      out[key] = Boolean(value);
      continue;
    }
    if (OVERRIDE_URLS.has(key)) {
      const t = typeof value === 'string' ? value.trim() : '';
      if (!t) out[key] = '';
      else if (SAFE_URL.test(t)) out[key] = t;
      continue;
    }
    if (OVERRIDE_IDS.has(key)) {
      const id = String(value || '').trim();
      if (!id) out[key] = '';
      else if (SAFE_ID.test(id)) out[key] = id;
      continue;
    }
    if (OVERRIDE_SELECT[key] && OVERRIDE_SELECT[key].includes(value)) {
      out[key] = value;
      continue;
    }
    const range = OVERRIDE_RANGE[key];
    if (range) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = Math.min(range[1], Math.max(range[0], Math.round(n)));
    }
  }
  return out;
}

// GET / POST / DELETE ?recurso=cuentas — cuentas bancarias
async function cuentas(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      const { data, error } = await supabaseAdmin
        .from('bank_accounts').select('*')
        .order('orden', { ascending: true }).order('created_at', { ascending: true });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ cuentas: data });
    }

    if (req.method === 'DELETE') {
      const staff = await requirePermiso(req, 'ajustes');

      const { error } = await supabaseAdmin.from('bank_accounts').update({ activa: false }).eq('id', req.query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, por: staff.email });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');

    const { id, banco, titular, numeroCuenta, alias, documento, documentoTipo, mostrarDocumento, orden, activa, topePeriodo } = req.body || {};

    if (!banco || !titular || !numeroCuenta) {
      return res.status(400).json({ error: 'Banco, titular y número de cuenta son obligatorios' });
    }

    const fila = {
      banco: String(banco).trim(), titular: String(titular).trim(), numero_cuenta: String(numeroCuenta).trim(),
      alias: alias ? String(alias).trim() : null,
      documento: documento ? String(documento).trim() : null,
      documento_tipo: documentoTipo || null,
      mostrar_documento: Boolean(mostrarDocumento),
      orden: Number(orden) || 0,
      activa: activa === undefined ? true : Boolean(activa),
      tope_periodo: topePeriodo ? Number(topePeriodo) : null,
    };

    const resultado = id
      ? await supabaseAdmin.from('bank_accounts').update(fila).eq('id', id).select().single()
      : await supabaseAdmin.from('bank_accounts').insert({ ...fila, created_by: staff.email }).select().single();

    if (resultado.error) return res.status(400).json({ error: resultado.error.message });
    return res.status(200).json({ cuenta: resultado.data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=cuentas-stats — cuánto recibió cada cuenta, y cuál sigue
async function cuentasStats(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    await requireStaff(req);

    const [{ data: stats }, { data: siguiente }, { data: settingsData }] = await Promise.all([
      supabaseAdmin.rpc('stats_cuentas'),
      supabaseAdmin.rpc('elegir_cuenta'),
      supabaseAdmin.from('casino_settings').select('rotacion_modo, rotacion_reinicio').eq('id', 1).single(),
    ]);

    const elegida = Array.isArray(siguiente) ? siguiente[0] : siguiente;

    return res.status(200).json({
      stats: stats || [], siguienteId: elegida?.id || null,
      modo: settingsData?.rotacion_modo || 'monto', reinicio: settingsData?.rotacion_reinicio || 'diario',
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET / POST / DELETE ?recurso=banners
async function banners(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      const { data, error } = await supabaseAdmin
        .from('banners').select('*')
        .order('orden', { ascending: true }).order('created_at', { ascending: true });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ banners: data });
    }

    if (req.method === 'DELETE') {
      await requirePermiso(req, 'ajustes');

      const { error } = await supabaseAdmin.from('banners').delete().eq('id', req.query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');

    const { id, imagenUrl, imagenPublicId, titulo, subtitulo, linkUrl, orden, activo, desde, hasta,
            ajuste, formato, videoUrl } = req.body || {};

    if (!imagenUrl) return res.status(400).json({ error: 'Falta la imagen del banner' });
    if (ajuste && !['contain', 'cover'].includes(ajuste)) {
      return res.status(400).json({ error: 'Ajuste de imagen inválido' });
    }
    if (formato && !['2-1', '16-7'].includes(formato)) {
      return res.status(400).json({ error: 'Formato de banner inválido' });
    }

    const fila = {
      imagen_url: String(imagenUrl).trim(), imagen_public_id: imagenPublicId || null,
      titulo: titulo ? String(titulo).trim() : null, subtitulo: subtitulo ? String(subtitulo).trim() : null,
      link_url: linkUrl ? String(linkUrl).trim() : null, orden: Number(orden) || 0,
      activo: activo === undefined ? true : Boolean(activo), desde: desde || null, hasta: hasta || null,
      ajuste: ajuste === 'cover' ? 'cover' : 'contain',
      formato: formato === '16-7' ? '16-7' : '2-1',
      video_url: videoUrl ? String(videoUrl).trim() : null,
    };

    const resultado = id
      ? await supabaseAdmin.from('banners').update(fila).eq('id', id).select().single()
      : await supabaseAdmin.from('banners').insert({ ...fila, created_by: staff.email }).select().single();

    if (resultado.error) return res.status(400).json({ error: resultado.error.message });
    return res.status(200).json({ banner: resultado.data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET / POST / DELETE ?recurso=bonos    (GET&metricas=1 -> resumen)
async function bonos(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      if (req.query.metricas) {
        const { data, error } = await supabaseAdmin.rpc('bono_metricas');
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json(data || {});
      }

      const { data, error } = await supabaseAdmin
        .from('bonos').select('*')
        .order('orden', { ascending: true }).order('monto_min', { ascending: true });

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ bonos: data });
    }

    if (req.method === 'DELETE') {
      await requirePermiso(req, 'ajustes');

      const { error } = await supabaseAdmin.from('bonos').update({ activo: false }).eq('id', req.query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');

    const { id, nombre, tipo, valor, montoMin, montoMax, aplica, tope, orden, activo, desde, hasta, rollover,
            vipNivelMin, diasSinCargar, soloSinDeposito, topeUsos, presupuesto, topeConversionMult,
            cargaNumMin, cargaNumMax } = req.body || {};

    if (!nombre || !tipo || !valor) return res.status(400).json({ error: 'Faltan nombre, tipo o valor' });
    if (!['porcentaje', 'fijo'].includes(tipo)) return res.status(400).json({ error: 'Tipo de bono inválido' });
    if (Number(valor) <= 0) return res.status(400).json({ error: 'El valor tiene que ser mayor a 0' });
    if (montoMax && Number(montoMax) < Number(montoMin || 0)) {
      return res.status(400).json({ error: 'El monto máximo no puede ser menor al mínimo' });
    }

    const fila = {
      nombre: String(nombre).trim(), tipo, valor: Number(valor),
      monto_min: Number(montoMin) || 0, monto_max: montoMax ? Number(montoMax) : null,
      aplica: aplica === 'primera' ? 'primera' : 'todas',
      tope: tope ? Number(tope) : null, orden: Number(orden) || 0,
      activo: activo === undefined ? true : Boolean(activo), desde: desde || null, hasta: hasta || null,
      // rollover para el modo avanzado de billetera (default 1× si no se manda)
      rollover: rollover === undefined ? 1 : Math.max(0, Number(rollover) || 0),
      // segmentación
      vip_nivel_min: vipNivelMin || null,
      dias_sin_cargar: Math.max(0, Math.floor(Number(diasSinCargar) || 0)),
      solo_sin_deposito: Boolean(soloSinDeposito),
      tope_usos: Math.max(0, Math.floor(Number(topeUsos) || 0)),
      presupuesto: Math.max(0, Number(presupuesto) || 0),
      carga_num_min: Math.max(0, Math.floor(Number(cargaNumMin) || 0)),
      carga_num_max: Math.max(0, Math.floor(Number(cargaNumMax) || 0)),
      tope_conversion_mult: (topeConversionMult === '' || topeConversionMult === undefined || topeConversionMult === null)
        ? null : Math.max(0, Number(topeConversionMult) || 0),
    };

    const resultado = id
      ? await supabaseAdmin.from('bonos').update(fila).eq('id', id).select().single()
      : await supabaseAdmin.from('bonos').insert({ ...fila, created_by: staff.email }).select().single();

    if (resultado.error) return res.status(400).json({ error: resultado.error.message });
    return res.status(200).json({ bono: resultado.data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// Cron diario de Vercel. Llama a cashback_cron(), que hace el día
// operativo: cierra cashback, recalcula VIP, limpia login_attempts y
// acredita cumpleaños/mensual. Idempotente. También sirve de ping
// para que Supabase no se pause.
async function cron(req, res) {
  // Vercel agrega Authorization: Bearer <CRON_SECRET> si la variable
  // está configurada. Sin variable, se deja pasar (lab / dev).
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('cashback_cron');
    if (error) {
      console.error('[cron] cashback_cron', error.message);
      return res.status(200).json({ ok: false, error: error.message });
    }
    return res.status(200).json(data || { ok: true });
  } catch (err) {
    console.error('[cron]', err.message);
    return res.status(200).json({ ok: false });
  }
}

// GET  ?recurso=cashback              — config (staff)
// GET  ?recurso=cashback&lista=...    — jugadores con cashback (staff)
// POST ?recurso=cashback&accion=config    — guardar config (permiso ajustes)
// POST ?recurso=cashback&accion=cobrar    — entregar un cashback (permiso cargar)
// POST ?recurso=cashback&accion=cerrar    — cerrar el período ahora (permiso ajustes)
async function cashback(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      if (req.query.lista) {
        const estado = ['disponible', 'cobrado', 'vencido'].includes(req.query.estado)
          ? req.query.estado : 'disponible';
        const porPagina = Math.min(50, Math.max(5, Number(req.query.porPagina) || 20));
        const pagina = Math.max(1, Number(req.query.pagina) || 1);
        const desde = (pagina - 1) * porPagina;

        let q = supabaseAdmin
          .from('cashback_periodos')
          .select('*, players(player_number, username, display_name)', { count: 'planned' })
          .eq('estado', estado);

        if (req.query.buscar) {
          const b = String(req.query.buscar).trim().toLowerCase();
          const { data: ids } = await supabaseAdmin
            .from('players').select('id')
            .or(/^\d+$/.test(b) ? `player_number.eq.${Number(b)}` : `username.ilike.%${b}%,display_name.ilike.%${b}%`);
          q = q.in('player_id', (ids || []).map((r) => r.id));
        }

        const ordenar = req.query.ordenar === 'viejo'
          ? { col: 'created_at', asc: true }
          : { col: 'monto', asc: false };

        const { data, error, count } = await q
          .order(ordenar.col, { ascending: ordenar.asc })
          .range(desde, desde + porPagina - 1);

        if (error) return res.status(400).json({ error: error.message });

        const { count: disponibles } = await supabaseAdmin
          .from('cashback_periodos').select('id', { count: 'exact', head: true }).eq('estado', 'disponible');

        return res.status(200).json({
          cashbacks: data || [], estado, pagina, porPagina, disponibles: disponibles ?? 0,
          total: count ?? 0, paginas: Math.max(1, Math.ceil((count ?? 0) / porPagina)),
        });
      }

      const { data, error } = await supabaseAdmin
        .from('cashback_config').select('activo, porcentaje, periodo, min_apostado, vence_dias, rollover').eq('id', 1).single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const accion = req.query.accion || 'config';

    if (accion === 'config') {
      const staff = await requirePermiso(req, 'ajustes');
      const { activo, porcentaje, periodo, minApostado, venceDias, rollover } = req.body || {};

      const patch = { updated_by: staff.email, updated_at: new Date().toISOString() };
      if (activo !== undefined) patch.activo = Boolean(activo);
      if (porcentaje !== undefined) {
        const p = Number(porcentaje);
        if (!(p > 0 && p <= 100)) return res.status(400).json({ error: 'El porcentaje va entre 0 y 100' });
        patch.porcentaje = p;
      }
      if (periodo !== undefined) {
        if (!['semanal', 'mensual', 'diario'].includes(periodo)) return res.status(400).json({ error: 'Período inválido' });
        patch.periodo = periodo;
      }
      if (minApostado !== undefined) patch.min_apostado = Math.max(0, Number(minApostado) || 0);
      if (venceDias !== undefined) patch.vence_dias = Math.max(0, Number(venceDias) || 0);
      if (rollover !== undefined) patch.rollover = Math.max(0, Number(rollover) || 0);

      const { data, error } = await supabaseAdmin
        .from('cashback_config').update(patch).eq('id', 1)
        .select('activo, porcentaje, periodo, min_apostado, vence_dias, rollover').single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (accion === 'cerrar') {
      await requirePermiso(req, 'ajustes');
      const { data, error } = await supabaseAdmin.rpc('cashback_cron');
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data || { ok: true });
    }

    if (accion === 'cobrar') {
      const staff = await requirePermiso(req, 'cargar');
      const { periodoId, modo, metodoTipo, aliasTipo, aliasValor, banco, numeroCuenta, titular, documento } = req.body || {};

      if (!periodoId || !['fichas', 'retiro'].includes(modo)) {
        return res.status(400).json({ error: 'Faltan periodoId o modo' });
      }

      const { data, error } = await supabaseAdmin.rpc('cobrar_cashback', {
        p_periodo_id: periodoId,
        p_actor: staff.email,
        p_modo: modo,
        p_metodo_tipo: modo === 'retiro' ? metodoTipo : null,
        p_alias_tipo: modo === 'retiro' && metodoTipo === 'alias' ? aliasTipo : null,
        p_alias_valor: modo === 'retiro' && metodoTipo === 'alias' ? String(aliasValor || '').trim() : null,
        p_banco: modo === 'retiro' && metodoTipo === 'cuenta' ? String(banco || '').trim() : null,
        p_numero_cuenta: modo === 'retiro' && metodoTipo === 'cuenta' ? String(numeroCuenta || '').trim() : null,
        p_titular: modo === 'retiro' && metodoTipo === 'cuenta' ? String(titular || '').trim() : null,
        p_documento: modo === 'retiro' && metodoTipo === 'cuenta' ? String(documento || '').trim() : null,
      });

      if (error) return res.status(400).json({ error: error.message });

      const cb = Array.isArray(data) ? data[0] : data;

      if (cb?.modo === 'retiro' && cb.withdrawal_id) {
        try {
          const { data: jugador } = await supabaseAdmin
            .from('players').select('player_number, username, display_name, balance').eq('id', cb.player_id).single();
          const msg = await avisarRetiro({ jugador, monto: cb.monto, moneda: process.env.VITE_CURRENCY_CODE || '' });
          if (msg?.message_id) {
            await supabaseAdmin.from('withdrawal_requests').update({ telegram_message_id: msg.message_id }).eq('id', cb.withdrawal_id);
          }
        } catch (err) {
          console.error('[telegram] cashback retiro', err.message);
        }
      }

      return res.status(200).json({ cashback: cb });
    }

    return res.status(400).json({ error: 'Acción inválida' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// Billetera — interruptor maestro del modo avanzado con rollover
// GET                  — config (staff)
// POST ?accion=config  — guardar (permiso ajustes)
async function billetera(req, res) {
  const COLS = 'modo_avanzado, retener_ganancias, rollover_carga, apuesta_max_bono, candado_primera_carga, tope_conversion_mult';
  try {
    if (req.method === 'GET') {
      await requireStaff(req);
      const { data, error } = await supabaseAdmin
        .from('billetera_config').select(COLS).eq('id', 1).single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');
    const { modoAvanzado, retenerGanancias, rolloverCarga, apuestaMaxBono, candadoPrimeraCarga, topeConversionMult } = req.body || {};

    const patch = { updated_by: staff.email, updated_at: new Date().toISOString() };
    if (modoAvanzado !== undefined) patch.modo_avanzado = Boolean(modoAvanzado);
    if (retenerGanancias !== undefined) patch.retener_ganancias = Boolean(retenerGanancias);
    if (candadoPrimeraCarga !== undefined) patch.candado_primera_carga = Boolean(candadoPrimeraCarga);
    if (rolloverCarga !== undefined) patch.rollover_carga = Math.max(0, Number(rolloverCarga) || 0);
    if (apuestaMaxBono !== undefined) patch.apuesta_max_bono = Math.max(0, Number(apuestaMaxBono) || 0);
    if (topeConversionMult !== undefined) patch.tope_conversion_mult = Math.max(0, Number(topeConversionMult) || 0);

    const { data, error } = await supabaseAdmin
      .from('billetera_config').update(patch).eq('id', 1).select(COLS).single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// Códigos promocionales
// GET               — lista (staff)
// POST              — alta/edición (permiso ajustes)
// DELETE ?id=xxx    — desactivar (permiso ajustes)
async function promos(req, res) {
  const COLS = 'id, codigo, descripcion, tipo, valor, tope, rollover, requiere_carga, min_carga, desde, hasta, tope_usos, usos, activo, created_at, carga_num_min, carga_num_max, tope_conversion_mult';
  try {
    if (req.method === 'GET') {
      await requireStaff(req);
      const { data, error } = await supabaseAdmin
        .from('promo_codigos').select(COLS).order('created_at', { ascending: false });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ promos: data || [] });
    }

    if (req.method === 'DELETE') {
      await requirePermiso(req, 'ajustes');
      const { error } = await supabaseAdmin.from('promo_codigos').update({ activo: false }).eq('id', req.query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');
    const b = req.body || {};
    const codigo = String(b.codigo || '').trim().toUpperCase().replace(/\s+/g, '');

    if (!codigo || codigo.length < 3) return res.status(400).json({ error: 'El código necesita al menos 3 caracteres' });
    if (!['fijo', 'porcentaje'].includes(b.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (!(Number(b.valor) > 0)) return res.status(400).json({ error: 'El valor tiene que ser mayor a 0' });
    if (b.requiereCarga === false && b.tipo === 'porcentaje') {
      return res.status(400).json({ error: 'Un free bet no puede ser porcentaje: el % necesita una carga sobre la que calcular' });
    }

    const fila = {
      codigo,
      descripcion: String(b.descripcion || '').trim() || null,
      tipo: b.tipo,
      valor: Number(b.valor),
      tope: b.tope ? Number(b.tope) : null,
      rollover: b.rollover === undefined ? 1 : Math.max(0, Number(b.rollover) || 0),
      requiere_carga: b.requiereCarga === undefined ? true : Boolean(b.requiereCarga),
      min_carga: Math.max(0, Number(b.minCarga) || 0),
      desde: b.desde || null,
      hasta: b.hasta || null,
      tope_usos: Math.max(0, Math.floor(Number(b.topeUsos) || 0)),
      carga_num_min: Math.max(0, Math.floor(Number(b.cargaNumMin) || 0)),
      carga_num_max: Math.max(0, Math.floor(Number(b.cargaNumMax) || 0)),
      tope_conversion_mult: (b.topeConversionMult === '' || b.topeConversionMult == null)
        ? null : Math.max(0, Number(b.topeConversionMult) || 0),
      activo: b.activo === undefined ? true : Boolean(b.activo),
    };

    const r = b.id
      ? await supabaseAdmin.from('promo_codigos').update(fila).eq('id', b.id).select(COLS).single()
      : await supabaseAdmin.from('promo_codigos').insert({ ...fila, created_by: staff.email }).select(COLS).single();

    if (r.error) {
      if (r.error.code === '23505') return res.status(409).json({ error: 'Ya existe un código con ese nombre' });
      return res.status(400).json({ error: r.error.message });
    }
    return res.status(200).json({ promo: r.data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// Hitos de carga (escalera de lealtad)
// GET / POST / DELETE ?recurso=hitos
async function hitos(req, res) {
  const COLS = 'id, nombre, activo, cada_cargas, min_por_carga, ventana_dias, tipo, valor, valor_incremento, valor_max, tope, rollover, tope_conversion_mult, vip_nivel_min, vip_nivel_max, tope_hitos, banner_url, banner_public_id, banner_titulo, banner_texto, created_at';
  try {
    if (req.method === 'GET') {
      await requireStaff(req);
      const { data, error } = await supabaseAdmin
        .from('bono_hitos').select(COLS).order('created_at', { ascending: false });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ hitos: data || [] });
    }

    if (req.method === 'DELETE') {
      await requirePermiso(req, 'ajustes');
      const { error } = await supabaseAdmin.from('bono_hitos').update({ activo: false }).eq('id', req.query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');
    const b = req.body || {};

    if (!String(b.nombre || '').trim()) return res.status(400).json({ error: 'Falta el nombre' });
    if (!(Number(b.cadaCargas) >= 1)) return res.status(400).json({ error: 'Cada cuántas cargas tiene que ser 1 o más' });
    if (!['porcentaje', 'fijo'].includes(b.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
    if (!(Number(b.valor) > 0)) return res.status(400).json({ error: 'El valor tiene que ser mayor a 0' });

    const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
    const fila = {
      nombre: String(b.nombre).trim(),
      activo: b.activo === undefined ? true : Boolean(b.activo),
      cada_cargas: Math.max(1, Math.floor(Number(b.cadaCargas))),
      min_por_carga: Math.max(0, Number(b.minPorCarga) || 0),
      ventana_dias: Math.max(0, Math.floor(Number(b.ventanaDias) || 0)),
      tipo: b.tipo,
      valor: Number(b.valor),
      valor_incremento: Math.max(0, Number(b.valorIncremento) || 0),
      valor_max: num(b.valorMax),
      tope: num(b.tope),
      rollover: b.rollover === undefined ? 1 : Math.max(0, Number(b.rollover) || 0),
      tope_conversion_mult: num(b.topeConversionMult),
      vip_nivel_min: b.vipNivelMin || null,
      vip_nivel_max: b.vipNivelMax || null,
      tope_hitos: Math.max(0, Math.floor(Number(b.topeHitos) || 0)),
      banner_url: b.bannerUrl || null,
      banner_public_id: b.bannerPublicId || null,
      banner_titulo: String(b.bannerTitulo || '').trim() || null,
      banner_texto: String(b.bannerTexto || '').trim() || null,
    };

    const r = b.id
      ? await supabaseAdmin.from('bono_hitos').update(fila).eq('id', b.id).select(COLS).single()
      : await supabaseAdmin.from('bono_hitos').insert({ ...fila, created_by: staff.email }).select(COLS).single();

    if (r.error) return res.status(400).json({ error: r.error.message });
    return res.status(200).json({ hito: r.data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// Niveles VIP
// GET                       — niveles (con url de animación resuelta)
// GET ?lista=1              — jugadores con su histórico y actividad
// POST ?accion=nivel       — alta/edición de un nivel (permiso ajustes)
// POST ?accion=borrar-nivel&id=  (permiso ajustes)
// POST ?accion=recalcular  — recalcula histórico y nivel de todos (ajustes)
// POST ?accion=forzar      — fija/suelta el nivel de un jugador (permiso crear_jugador)
async function vip(req, res) {
  const SELECT_NIVEL = `*, animacion:animaciones!vip_niveles_animacion_id_fkey(url)`;
  const conUrl = (n) => ({ ...n, animacion_url: n.animacion?.url || null, animacion: undefined });

  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      if (req.query.lista) {
        const { data, error } = await supabaseAdmin.rpc('vip_jugadores', {
          p_nivel: req.query.nivel || null,
          p_buscar: req.query.buscar || null,
        });
        if (error) return res.status(400).json({ error: error.message });

        const { data: niveles } = await supabaseAdmin
          .from('vip_niveles').select('id, nombre, color, orden');
        const byId = Object.fromEntries((niveles || []).map((n) => [n.id, n]));

        return res.status(200).json({
          jugadores: (data || []).map((j) => ({ ...j, nivel: byId[j.vip_nivel_id] || null, forzado: Boolean(j.vip_nivel_forzado) })),
          niveles: niveles || [],
        });
      }

      const { data, error } = await supabaseAdmin
        .from('vip_niveles').select(SELECT_NIVEL).order('orden', { ascending: true });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ niveles: (data || []).map(conUrl) });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const accion = req.query.accion;

    if (accion === 'forzar') {
      const staff = await requirePermiso(req, 'crear_jugador');
      const { playerId, nivelId } = req.body || {};
      if (!playerId) return res.status(400).json({ error: 'Falta playerId' });

      const { data, error } = await supabaseAdmin.rpc('forzar_nivel_vip', {
        p_player_id: playerId, p_nivel_id: nivelId || null,
      });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ player: Array.isArray(data) ? data[0] : data, por: staff.email });
    }

    const staff = await requirePermiso(req, 'ajustes');

    if (accion === 'recalcular') {
      const { data, error } = await supabaseAdmin.rpc('recalcular_vip');
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ actualizados: data ?? 0 });
    }

    if (accion === 'borrar-nivel') {
      const { error } = await supabaseAdmin.from('vip_niveles').delete().eq('id', req.query.id);
      if (error) return res.status(400).json({ error: error.message });
      await supabaseAdmin.rpc('recalcular_vip');
      return res.status(200).json({ ok: true });
    }

    if (accion === 'nivel') {
      const b = req.body || {};
      if (!b.nombre || b.orden == null) return res.status(400).json({ error: 'Faltan nombre u orden' });

      const fila = {
        nombre: String(b.nombre).trim(),
        color: /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#c7ccd1',
        orden: Number(b.orden),
        umbral_cargado: Math.max(0, Number(b.umbralCargado) || 0),
        cashback_pct: Math.min(100, Math.max(0, Number(b.cashbackPct) || 0)),
        giro_multiplicador: Math.max(1, Number(b.giroMultiplicador) || 1),
        bono_cumple: Math.max(0, Number(b.bonoCumple) || 0),
        bono_mensual: Math.max(0, Number(b.bonoMensual) || 0),
        retiro_espera_horas: Math.max(0, Number(b.retiroEsperaHoras) || 0),
        imagen_url: b.imagenUrl || null,
        animacion_id: b.animacionId || null,
      };

      const r = b.id
        ? await supabaseAdmin.from('vip_niveles').update(fila).eq('id', b.id).select(SELECT_NIVEL).single()
        : await supabaseAdmin.from('vip_niveles').insert(fila).select(SELECT_NIVEL).single();

      if (r.error) {
        if (r.error.code === '23505') return res.status(409).json({ error: 'Ya hay un nivel con ese orden' });
        return res.status(400).json({ error: r.error.message });
      }
      await supabaseAdmin.rpc('recalcular_vip');
      return res.status(200).json({ nivel: conUrl(r.data), por: staff.email });
    }

    return res.status(400).json({ error: 'Acción inválida' });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// Giro diario
// GET                  — config + métricas (staff)
// POST ?accion=config  — guardar (permiso ajustes)
async function giroDiario(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);
      const [{ data: cfg, error }, { data: stats }] = await Promise.all([
        supabaseAdmin.from('giro_diario_config').select('activo, premios, rollover, icono_animacion_id, tema').eq('id', 1).single(),
        supabaseAdmin.rpc('giro_stats'),
      ]);
      if (error && /tema/.test(error.message || '')) {
        const r2 = await supabaseAdmin.from('giro_diario_config').select('activo, premios, rollover, icono_animacion_id').eq('id', 1).single();
        if (r2.error) return res.status(400).json({ error: r2.error.message });
        return res.status(200).json({ ...r2.data, tema: 'casino', stats: stats || {} });
      }
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ...cfg, stats: stats || {} });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');
    const { activo, premios, rollover, iconoAnimacionId, tema } = req.body || {};

    const patch = { updated_by: staff.email, updated_at: new Date().toISOString() };
    if (activo !== undefined) patch.activo = Boolean(activo);
    if (rollover !== undefined) patch.rollover = Math.max(0, Number(rollover) || 0);
    if (iconoAnimacionId !== undefined) patch.icono_animacion_id = iconoAnimacionId || null;
    if (tema !== undefined) {
      const ok = ['casino', 'san-patricio', 'noche', 'clasico'].includes(String(tema));
      patch.tema = ok ? String(tema) : 'casino';
    }
    if (premios !== undefined) {
      if (!Array.isArray(premios) || !premios.length) {
        return res.status(400).json({ error: 'Cargá al menos un premio' });
      }
      const limpios = premios
        .map((p) => ({ monto: Math.max(0, Number(p.monto) || 0), peso: Math.max(0, Number(p.peso) || 0) }))
        .filter((p) => p.peso > 0);
      if (!limpios.length) return res.status(400).json({ error: 'Al menos un premio necesita peso mayor a 0' });
      patch.premios = limpios;
    }
    if (patch.activo && !(patch.premios?.length)) {
      const { data: act } = await supabaseAdmin.from('giro_diario_config').select('premios').eq('id', 1).single();
      if (!(act?.premios?.length)) return res.status(400).json({ error: 'Cargá los premios antes de activar' });
    }

    const { data, error } = await supabaseAdmin
      .from('giro_diario_config').update(patch).eq('id', 1).select('activo, premios, rollover, icono_animacion_id, tema').single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// Referidos
// GET               — config (staff)
// GET ?lista=1       — lista de referidos (staff)
// POST ?accion=config — guardar (permiso ajustes)
async function referidos(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      if (req.query.lista) {
        const porPagina = Math.min(50, Math.max(5, Number(req.query.porPagina) || 20));
        const pagina = Math.max(1, Number(req.query.pagina) || 1);
        const desde = (pagina - 1) * porPagina;
        const estado = ['registrado', 'pagado'].includes(req.query.estado) ? req.query.estado : null;

        let q = supabaseAdmin
          .from('referidos')
          .select('*, referidor:players!referidos_referidor_id_fkey(player_number, username, display_name), referido:players!referidos_referido_id_fkey(player_number, username, display_name)', { count: 'planned' })
          .order('created_at', { ascending: false });
        if (estado) q = q.eq('estado', estado);

        const { data, error, count } = await q.range(desde, desde + porPagina - 1);
        if (error) return res.status(400).json({ error: error.message });

        return res.status(200).json({
          referidos: data || [], pagina, porPagina, total: count ?? 0,
          paginas: Math.max(1, Math.ceil((count ?? 0) / porPagina)),
        });
      }

      const { data, error } = await supabaseAdmin
        .from('referidos_config').select('activo, bono_referidor, bono_referido, min_carga, tope, rollover').eq('id', 1).single();
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const staff = await requirePermiso(req, 'ajustes');
    const { activo, bonoReferidor, bonoReferido, minCarga, tope, rollover } = req.body || {};

    const patch = { updated_by: staff.email, updated_at: new Date().toISOString() };
    if (activo !== undefined) patch.activo = Boolean(activo);
    if (bonoReferidor !== undefined) patch.bono_referidor = Math.max(0, Number(bonoReferidor) || 0);
    if (bonoReferido !== undefined) patch.bono_referido = Math.max(0, Number(bonoReferido) || 0);
    if (minCarga !== undefined) patch.min_carga = Math.max(0, Number(minCarga) || 0);
    if (tope !== undefined) patch.tope = Math.max(0, Math.floor(Number(tope) || 0));
    if (rollover !== undefined) patch.rollover = Math.max(0, Number(rollover) || 0);

    const { data, error } = await supabaseAdmin
      .from('referidos_config').update(patch).eq('id', 1)
      .select('activo, bono_referidor, bono_referido, min_carga, tope, rollover').single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET (pública, la lee el portal) / POST (permiso ajustes)
// Config del bono de registro: monto + banner que ve el jugador.
async function bonoRegistro(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('bono_registro').select('activo, monto, banner_url, titulo, subtitulo, edad_minima, rollover').eq('id', 1).single();
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const staff = await requirePermiso(req, 'ajustes');
    const { activo, monto, bannerUrl, titulo, subtitulo, edadMinima, rollover } = req.body || {};

    const patch = { updated_by: staff.email, updated_at: new Date().toISOString() };
    if (activo !== undefined) patch.activo = Boolean(activo);
    if (rollover !== undefined) patch.rollover = Math.max(0, Number(rollover) || 0);
    if (monto !== undefined) {
      const n = Number(monto);
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'Monto inválido' });
      patch.monto = n;
    }
    if (bannerUrl !== undefined) patch.banner_url = bannerUrl || null;
    if (titulo !== undefined) patch.titulo = String(titulo).trim() || 'Registrate y llevate tu bono';
    if (subtitulo !== undefined) patch.subtitulo = String(subtitulo).trim() || 'Verificá tu identidad y empezá a jugar';
    if (edadMinima !== undefined) {
      const e = Number(edadMinima);
      if (!Number.isInteger(e) || e < 18 || e > 25) return res.status(400).json({ error: 'La edad mínima va entre 18 y 25' });
      patch.edad_minima = e;
    }

    if (patch.activo && (patch.monto ?? 0) <= 0) {
      const { data: actual } = await supabaseAdmin.from('bono_registro').select('monto').eq('id', 1).single();
      if (Number(actual?.monto || patch.monto || 0) <= 0) {
        return res.status(400).json({ error: 'Poné un monto antes de activar el bono' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('bono_registro').update(patch).eq('id', 1)
      .select('activo, monto, banner_url, titulo, subtitulo, edad_minima, rollover').single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json(data);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=cloudinary&carpeta=...&tipo=image|raw|video — firma para subir
// archivos (banners, logos, portadas = image; animaciones Lottie = raw,
// porque un .json no es una imagen para Cloudinary; clips de portada = video)
async function cloudinary(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    await requirePermiso(req, 'ajustes');

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.VITE_CLOUDINARY_CLOUD;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const preset = process.env.VITE_CLOUDINARY_PRESET;

    if (!cloudName) return res.status(500).json({ error: 'Falta configurar Cloudinary en el servidor' });

    const tipo = req.query.tipo === 'raw' ? 'raw' : req.query.tipo === 'video' ? 'video' : 'image';
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${tipo}/upload`;
    const folder = String(req.query.carpeta || 'banners').replace(/[^a-z0-9/_-]/gi, '');

    if (apiKey && apiSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const aFirmar = `folder=${folder}&timestamp=${timestamp}`;
      const signature = crypto.createHash('sha1').update(aFirmar + apiSecret).digest('hex');
      return res.status(200).json({ modo: 'firmado', url, folder, apiKey, timestamp, signature });
    }

    if (!preset) return res.status(500).json({ error: 'Falta configurar Cloudinary: preset o API key y secret' });

    return res.status(200).json({ modo: 'preset', url, folder, preset });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}


// GET / POST ?recurso=proveedores — juegos de terceros integrados
async function proveedores(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      const [{ data, error }, { data: juegosExt, error: errorJuegos }] = await Promise.all([
        supabaseAdmin
          .from('proveedores_externos')
          .select('id, nombre, slug, activo, created_at')  // el secreto NUNCA se lista de vuelta
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('games')
          .select('proveedor_id, activo')
          .not('launch_url', 'is', null)
          .not('proveedor_id', 'is', null),
      ]);

      if (error) return res.status(400).json({ error: error.message });
      if (errorJuegos) return res.status(400).json({ error: errorJuegos.message });

      const cuentas = {};
      for (const j of juegosExt || []) {
        const c = cuentas[j.proveedor_id] || { juegos: 0, juegosActivos: 0 };
        c.juegos += 1;
        if (j.activo) c.juegosActivos += 1;
        cuentas[j.proveedor_id] = c;
      }

      return res.status(200).json({
        proveedores: (data || []).map((p) => ({
          ...p,
          juegos: cuentas[p.id]?.juegos || 0,
          juegosActivos: cuentas[p.id]?.juegosActivos || 0,
        })),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    await requirePermiso(req, 'ajustes');

    const { nombre, activo, id, accion, desdeId, haciaId } = req.body || {};

    // Los juegos guardan el id del proveedor que firma. Cambiar de
    // proveedor no toca el secreto: solo apunta las filas al que está
    // activo, que es el que el panel de juegos conoce.
    if (accion === 'mover-juegos') {
      if (!desdeId || !haciaId || desdeId === haciaId) {
        return res.status(400).json({ error: 'Elegí el proveedor de destino' });
      }
      const { data: destino, error: errorDestino } = await supabaseAdmin
        .from('proveedores_externos')
        .select('id, nombre, activo')
        .eq('id', haciaId)
        .maybeSingle();
      if (errorDestino) return res.status(400).json({ error: errorDestino.message });
      if (!destino?.activo) return res.status(400).json({ error: 'El proveedor de destino tiene que estar activo' });

      const { data: movidos, error: errorMover } = await supabaseAdmin
        .from('games')
        .update({ proveedor_id: haciaId })
        .eq('proveedor_id', desdeId)
        .not('launch_url', 'is', null)
        .select('id');
      if (errorMover) return res.status(400).json({ error: errorMover.message });
      return res.status(200).json({ ok: true, n: (movidos || []).length, proveedor: destino.nombre });
    }

    // Editar (activar/desactivar) no regenera el secreto
    if (id) {
      if (activo === false) {
        const { count, error: errorCuenta } = await supabaseAdmin
          .from('games')
          .select('id', { count: 'exact', head: true })
          .eq('proveedor_id', id)
          .eq('activo', true);
        if (errorCuenta) return res.status(400).json({ error: errorCuenta.message });
        if (count > 0) {
          return res.status(400).json({
            error: `Este proveedor tiene ${count} juego${count === 1 ? '' : 's'} activo${count === 1 ? '' : 's'}. Conectalos a otro proveedor antes de apagarlo.`,
          });
        }
      }

      const { data, error } = await supabaseAdmin
        .from('proveedores_externos')
        .update({ activo: Boolean(activo) })
        .eq('id', id).select('id, nombre, slug, activo').single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ proveedor: data });
    }

    if (!nombre) return res.status(400).json({ error: 'Falta el nombre del proveedor' });

    const slug = String(nombre).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // El secreto se genera acá, del lado del servidor, y se muestra
    // UNA sola vez en la respuesta. Después no se puede volver a ver
    // — si se pierde, hay que regenerarlo (y avisarle al proveedor).
    const secreto = crypto.randomBytes(32).toString('base64url');

    const { data, error } = await supabaseAdmin
      .from('proveedores_externos')
      .insert({ nombre: String(nombre).trim(), slug, secreto })
      .select('id, nombre, slug, activo').single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre' });
      return res.status(400).json({ error: error.message });
    }

    return res.status(200).json({ proveedor: data, secreto });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function ofertasCarga(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);
      const { data, error } = await supabaseAdmin
        .from('ofertas_carga').select('*')
        .order('orden', { ascending: true }).order('created_at', { ascending: true });
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ofertas: data || [] });
    }

    if (req.method === 'DELETE') {
      await requirePermiso(req, 'ajustes');
      const { error } = await supabaseAdmin.from('ofertas_carga').update({ activo: false }).eq('id', req.query.id);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    const staff = await requirePermiso(req, 'ajustes');

    const { id, nombre, titulo, subtitulo, imagenUrl, videoUrl, montoMin, bonoTipo, bonoValor,
            rollover, enfriamientoMinutos, vipNivelMin, vipNivelMax, orden, activo, desde, hasta } = req.body || {};

    if (!nombre || !montoMin || !bonoValor) {
      return res.status(400).json({ error: 'Faltan nombre, monto mínimo o valor del bono.' });
    }
    if (bonoTipo && !['fijo', 'porcentaje'].includes(bonoTipo)) {
      return res.status(400).json({ error: 'El bono es fijo o porcentaje.' });
    }

    const fila = {
      nombre: String(nombre).trim(),
      titulo: titulo ? String(titulo).trim() : null,
      subtitulo: subtitulo ? String(subtitulo).trim() : null,
      imagen_url: imagenUrl || null,
      video_url: videoUrl || null,
      monto_min: Number(montoMin),
      bono_tipo: bonoTipo === 'porcentaje' ? 'porcentaje' : 'fijo',
      bono_valor: Number(bonoValor),
      rollover: Math.max(0, Number(rollover) || 0),
      enfriamiento_minutos: Math.max(0, Math.floor(Number(enfriamientoMinutos) || 0)),
      vip_nivel_min: vipNivelMin || null,
      vip_nivel_max: vipNivelMax || null,
      orden: Number(orden) || 0,
      activo: activo === undefined ? true : Boolean(activo),
      desde: desde || null,
      hasta: hasta || null,
    };

    const resultado = id
      ? await supabaseAdmin.from('ofertas_carga').update(fila).eq('id', id).select().single()
      : await supabaseAdmin.from('ofertas_carga').insert({ ...fila, created_by: staff.email }).select().single();

    if (resultado.error) return res.status(400).json({ error: resultado.error.message });
    return res.status(200).json({ oferta: resultado.data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET    ?recurso=animaciones     — lista (con cuántos usos tiene cada una)
// POST   ?recurso=animaciones     — crear { nombre, url }
// DELETE ?recurso=animaciones&id= — borrar
async function animaciones(req, res) {
  if (req.method === 'GET') return listarAnimaciones(req, res);
  if (req.method === 'POST') return crearAnimacion(req, res);
  if (req.method === 'DELETE') return eliminarAnimacion(req, res);
  return res.status(405).json({ error: 'Método no permitido' });
}

async function listarAnimaciones(req, res) {
  try {
    await requirePermiso(req, 'ajustes');

    const [{ data: lista, error }, { data: usos }, { data: settings }] = await Promise.all([
      supabaseAdmin.from('animaciones').select('id, nombre, url, creado_por, created_at')
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('games').select('cartel_animacion_id').not('cartel_animacion_id', 'is', null),
      supabaseAdmin.from('casino_settings').select('soporte_animacion_id, saldo_animacion_id').eq('id', 1).single(),
    ]);

    if (error) return res.status(400).json({ error: error.message });

    // Cuántos juegos (y el ícono de soporte y el de la ficha de saldo)
    // usan cada animación: se muestra en la lista para que antes de
    // borrar una, el cajero sepa qué le va a sacar.
    const conteo = {};
    (usos || []).forEach((g) => { conteo[g.cartel_animacion_id] = (conteo[g.cartel_animacion_id] || 0) + 1; });
    if (settings?.soporte_animacion_id) {
      conteo[settings.soporte_animacion_id] = (conteo[settings.soporte_animacion_id] || 0) + 1;
    }
    if (settings?.saldo_animacion_id) {
      conteo[settings.saldo_animacion_id] = (conteo[settings.saldo_animacion_id] || 0) + 1;
    }

    return res.status(200).json({
      animaciones: (lista || []).map((a) => ({ ...a, usos: conteo[a.id] || 0 })),
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

async function crearAnimacion(req, res) {
  try {
    const staff = await requirePermiso(req, 'ajustes');

    const { nombre, url } = req.body || {};
    if (!nombre || !url) return res.status(400).json({ error: 'Faltan nombre o url' });

    const { data, error } = await supabaseAdmin
      .from('animaciones')
      .insert({ nombre: String(nombre).trim(), url: String(url).trim(), creado_por: staff.email })
      .select('id, nombre, url, creado_por, created_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ animacion: { ...data, usos: 0 } });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// DELETE — los juegos que la tenían quedan sin cartel
// (cartel_animacion_id references animaciones(id) on delete set null),
// no se rompe nada, solo dejan de mostrarlo.
async function eliminarAnimacion(req, res) {
  try {
    await requirePermiso(req, 'ajustes');

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Falta el id' });

    const { error } = await supabaseAdmin.from('animaciones').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
