import { supabaseAdmin, requireStaff, requirePermiso } from '../lib/supabaseAdmin.js';
import { analizarConfig } from '../lib/slot-engine.js';

// /api/juegos                     -> GET catálogo (staff) / POST crear-editar
// /api/juegos?recurso=manifest    -> GET público, sin auth (lo consultan otros paneles)
// /api/juegos?recurso=sincronizar -> POST trae el catálogo de un proveedor
// Consolidado (antes: juegos, sincronizar, manifest).
export default async function handler(req, res) {
  const recurso = req.query.recurso;

  if (recurso === 'manifest') return manifest(req, res);
  if (recurso === 'sincronizar') return sincronizar(req, res);
  if (recurso === 'marcas') return marcas(req, res);
  return catalogo(req, res);
}

// GET (staff, paginado y filtrado) / POST (crear, editar o lote)
async function catalogo(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      const { data, error } = await supabaseAdmin.rpc('juegos_panel', {
        p_q: req.query.q || null,
        p_categoria: req.query.categoria || null,
        p_proveedor: req.query.proveedor || null,
        p_motor: req.query.motor || null,
        p_estado: req.query.estado || null,
        p_origen: req.query.origen || null,
        p_pagina: Number(req.query.pagina) || 1,
        p_por_pagina: Number(req.query.porPagina) || 50,
      });
      if (error) return res.status(400).json({ error: error.message });

      const panel = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      const total = Number(panel.total || 0);
      const porPagina = Number(panel.porPagina || 50);
      return res.status(200).json({
        juegos: panel.juegos || [],
        facets: panel.facets || {},
        total,
        pagina: Number(panel.pagina || 1),
        porPagina,
        paginas: Math.max(1, Math.ceil(total / porPagina)),
      });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    await requirePermiso(req, 'ajustes');

    if (req.body?.accion === 'lote') {
      const ids = Array.isArray(req.body.ids) ? req.body.ids.filter((id) => typeof id === 'string' && id).slice(0, 200) : [];
      if (!ids.length) return res.status(400).json({ error: 'No hay juegos seleccionados' });
      if (typeof req.body.activo !== 'boolean') return res.status(400).json({ error: 'Falta activo' });

      const { error } = await supabaseAdmin.from('games').update({ activo: req.body.activo }).in('id', ids);
      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json({ ok: true, n: ids.length, activo: req.body.activo });
    }

    const { id, slug, nombre, descripcion, imagenUrl, categoria, minBet, maxBet, activo, orden,
            launchUrl, proveedorId, imagenPersonalizadaUrl, usarImagenPersonalizada,
            cartelTipo, cartelAnimacionId, cartelHasta, paraBonos, videoUrl } = req.body || {};

    if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });
    if (Number(maxBet) < Number(minBet)) {
      return res.status(400).json({ error: 'La apuesta máxima no puede ser menor a la mínima' });
    }

    const TIPOS_CARTEL = ['vip', 'hot', 'nuevo', 'personalizado'];
    if (cartelTipo && !TIPOS_CARTEL.includes(cartelTipo)) {
      return res.status(400).json({ error: 'Tipo de cartel inválido' });
    }
    if (cartelTipo === 'personalizado' && !cartelAnimacionId) {
      return res.status(400).json({ error: 'Elegí una animación de la biblioteca' });
    }

    const fila = {
      nombre: String(nombre).trim(), descripcion: descripcion || null, imagen_url: imagenUrl || null,
      categoria: categoria || 'Populares', min_bet: Number(minBet) || 1000, max_bet: Number(maxBet) || 100000,
      activo: activo === undefined ? true : Boolean(activo), orden: Number(orden) || 0,
      // Juego de proveedor externo: sin estos dos, el lanzamiento no
      // sabe adónde mandar al jugador ni con qué secreto firmar el
      // token. Van juntos: si no es externo, los dos quedan en null.
      launch_url: launchUrl ? String(launchUrl).trim() : null,
      proveedor_id: launchUrl ? (proveedorId || null) : null,
      // Portada: la personalizada queda guardada aunque no se esté
      // usando, así cambiar de una fuente a la otra no pierde nada.
      imagen_personalizada_url: imagenPersonalizadaUrl || null,
      usar_imagen_personalizada: Boolean(usarImagenPersonalizada),
      video_url: videoUrl ? String(videoUrl).trim() : null,
      // Cartel: cada tipo solo guarda lo suyo, el resto queda en null
      // para no dejar datos viejos de un tipo que ya no está elegido.
      cartel_tipo: cartelTipo || null,
      cartel_animacion_id: cartelTipo === 'personalizado' ? cartelAnimacionId : null,
      cartel_hasta: cartelTipo === 'nuevo' ? (cartelHasta || null) : null,
      // Juego para bonos: el rollover solo avanza jugando estos (si hay
      // al menos uno marcado).
      para_bonos: Boolean(paraBonos),
    };

    if (!id) fila.slug = String(slug || '').trim().toLowerCase();

    const resultado = id
      ? await supabaseAdmin.from('games').update(fila).eq('id', id).select().single()
      : await supabaseAdmin.from('games').insert(fila).select().single();

    if (resultado.error) return res.status(400).json({ error: resultado.error.message });
    return res.status(200).json({ juego: resultado.data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

// GET ?recurso=manifest — público, sin auth. CORS abierto a propósito:
// lo consulta cualquier panel de operador, no solo el nuestro.
async function manifest(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { data, error } = await supabaseAdmin
      .from('games')
      .select('slug, nombre, descripcion, imagen_url, motor, proveedor, config, launch_url, version, min_bet, max_bet')
      .order('slug', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json({
      proveedor: process.env.VITE_APP_NAME || 'Propio',
      generado: new Date().toISOString(),
      juegos: data || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}

// La versión del juego no sube cuando solo cambia el dominio. Igual
// hay que reescribir launch_url: el lobby abre la que quedó guardada.
async function refrescarLaunchUrl(slug, launchUrl, resultado) {
  if (!launchUrl) return false;
  const { data: fila, error: errorLee } = await supabaseAdmin
    .from('games').select('launch_url').eq('slug', slug).maybeSingle();
  if (errorLee) {
    resultado.rechazados.push({ slug, motivo: errorLee.message });
    return true;
  }
  if (!fila || fila.launch_url === launchUrl) return false;
  const { error } = await supabaseAdmin
    .from('games')
    .update({ launch_url: launchUrl, sincronizado_at: new Date().toISOString() })
    .eq('slug', slug);
  if (error) {
    resultado.rechazados.push({ slug, motivo: error.message });
    return true;
  }
  resultado.actualizados.push(slug);
  return true;
}

// POST ?recurso=sincronizar — body: { url }
async function sincronizar(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    await requirePermiso(req, 'ajustes');

    const url = String(req.body?.url || process.env.CATALOGO_URL || '').trim();

    if (!url) return res.status(400).json({ error: 'Falta la URL del catálogo' });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'La URL tiene que empezar con http o https' });

    let manifiesto;

    try {
      const control = new AbortController();
      const reloj = setTimeout(() => control.abort(), 15000);
      const respuesta = await fetch(url, { signal: control.signal });
      clearTimeout(reloj);

      if (!respuesta.ok) return res.status(400).json({ error: `El catálogo respondió ${respuesta.status}` });

      manifiesto = await respuesta.json();
    } catch (err) {
      return res.status(400).json({
        error: err.name === 'AbortError' ? 'El catálogo tardó demasiado en responder' : 'No se pudo leer el catálogo. Revisá la URL.',
      });
    }

    const juegos = manifiesto?.juegos;
    if (!Array.isArray(juegos) || !juegos.length) return res.status(400).json({ error: 'El catálogo no trae juegos' });

    const resultado = { nuevos: [], actualizados: [], sinCambios: [], rechazados: [] };

    for (const j of juegos) {
      if (!j.slug || !j.nombre) {
        resultado.rechazados.push({ slug: j.slug || '(sin slug)', motivo: 'faltan datos' });
        continue;
      }

      if (j.config && (!j.motor || j.motor === 'clasico-3x3')) {
        const analisis = analizarConfig(j.config);

        if (analisis.rtp > 100) {
          resultado.rechazados.push({ slug: j.slug, motivo: `retorno de ${analisis.rtp}%: el juego pagaría más de lo que recauda` });
          continue;
        }
        if (analisis.rtp < 70) {
          resultado.rechazados.push({ slug: j.slug, motivo: `retorno de ${analisis.rtp}%: demasiado bajo, el jugador se funde enseguida` });
          continue;
        }
      }

      const { data, error } = await supabaseAdmin.rpc('sincronizar_juego', {
        p_slug: j.slug, p_nombre: j.nombre, p_motor: j.motor || 'clasico-3x3',
        p_proveedor: j.proveedor || manifiesto.proveedor || 'externo',
        p_config: j.config || null, p_launch_url: j.launch_url || null,
        p_version: Number(j.version) || 1, p_descripcion: j.descripcion || null, p_imagen_url: j.imagen_url || null,
      });

      if (error) {
        resultado.rechazados.push({ slug: j.slug, motivo: error.message });
        continue;
      }

      if (data === 'nuevo') resultado.nuevos.push(j.slug);
      else if (data === 'actualizado') resultado.actualizados.push(j.slug);
      else if (await refrescarLaunchUrl(j.slug, j.launch_url, resultado)) { /* el dominio cambió */ }
      else resultado.sinCambios.push(j.slug);
    }

    return res.status(200).json({ proveedor: manifiesto.proveedor, ...resultado });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}

function slugMarca(txt) {
  return String(txt || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proveedor';
}

// GET/POST ?recurso=marcas — icono 1:1 y nombre para el lobby.
// La clave es games.proveedor (el texto del catálogo). No toca secretos de API.
async function marcas(req, res) {
  try {
    if (req.method === 'GET') {
      await requireStaff(req);

      const [{ data: marcas, error: errM }, { data: panel, error: errP }] = await Promise.all([
        supabaseAdmin.from('proveedores_marca').select('*').order('orden', { ascending: true }).order('nombre', { ascending: true }),
        supabaseAdmin.rpc('juegos_panel', { p_pagina: 1, p_por_pagina: 10 }),
      ]);
      if (errM) return res.status(400).json({ error: errM.message });
      if (errP) return res.status(400).json({ error: errP.message });

      const porClave = Object.fromEntries((marcas || []).map((m) => [m.clave, m]));
      const catalogo = ((panel && panel.facets && panel.facets.proveedores) || []).map((f) => ({
        clave: f.valor,
        n: f.n,
        marca: porClave[f.valor] || null,
      }));

      return res.status(200).json({ catalogo, marcas: marcas || [] });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
    await requirePermiso(req, 'ajustes');

    const { clave, nombre, iconoUrl, orden, activo } = req.body || {};
    const key = String(clave || '').trim();
    if (!key) return res.status(400).json({ error: 'Falta el proveedor' });

    const fila = {
      clave: key,
      nombre: String(nombre || key).trim(),
      slug: slugMarca(nombre || key),
      icono_url: iconoUrl ? String(iconoUrl).trim() : null,
      orden: Number(orden) || 0,
      activo: activo === undefined ? true : Boolean(activo),
    };

    const { data, error } = await supabaseAdmin
      .from('proveedores_marca')
      .upsert(fila, { onConflict: 'clave' })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya hay una marca con ese nombre' });
      return res.status(400).json({ error: error.message });
    }
    return res.status(200).json({ marca: data });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Error interno' });
  }
}
