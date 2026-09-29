import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

/**
 * Tests que mueven plata. El motor de slot corre siempre (es JS puro).
 * Lo que pega a Postgres solo corre con WIN777_TEST=1 y las mismas
 * variables de Supabase que el panel. Pensado para una base de LAB:
 * crea jugadores `__test_*` y los borra al terminar.
 *
 *   WIN777_TEST=1 npm test
 */

function cargarEnv() {
  const archivo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!existsSync(archivo)) return;
  for (const linea of readFileSync(archivo, 'utf-8').split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte === -1) continue;
    const clave = limpia.slice(0, corte).trim();
    const valor = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[clave]) process.env[clave] = valor;
  }
}

cargarEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const dbListo = process.env.WIN777_TEST === '1' && Boolean(url && key);

if (process.env.WIN777_TEST === '1' && !dbListo) {
  console.error('[test] WIN777_TEST=1 pero faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}

if (dbListo) {
  console.error(`[test] base de lab: ${url}`);
}

export const supabase = dbListo
  ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

const skipDb = dbListo ? false : 'Definí WIN777_TEST=1 (y las keys de un Supabase de lab) para correr esta prueba';

/** test() que se saltea solo si no hay base. */
export function testDb(test, nombre, fn) {
  test(nombre, { skip: skipDb }, fn);
}

const vivos = [];

export async function jugador(extra = {}) {
  const username = `__test_${process.pid}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('players')
    .insert({
      username,
      password_hash: 'test',
      display_name: 'Test',
      estado_verificacion: 'verificado',
      created_by: 'test',
      ...extra,
    })
    .select('*')
    .single();
  if (error) throw new Error(`alta jugador: ${error.message}`);
  vivos.push(data.id);
  return data;
}

export async function leer(id) {
  const { data, error } = await supabase.from('players').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

export function n(v) {
  return Number(v) || 0;
}

export async function rpc(nombre, args) {
  const { data, error } = await supabase.rpc(nombre, args);
  if (error) {
    const err = new Error(error.message);
    err.code = error.code;
    throw err;
  }
  return data;
}

export async function rpcFalla(nombre, args) {
  const { data, error } = await supabase.rpc(nombre, args);
  if (!error) {
    throw new Error(`${nombre} tenía que fallar y devolvió ${JSON.stringify(data)}`);
  }
  return error.message || '';
}

const TABLAS_PLAYER = [
  'vip_pagos',
  'bono_movimientos',
  'player_hitos',
  'giros_diarios',
  'cashback_periodos',
  'game_rounds',
  'bonos_otorgados',
  'verificaciones',
  'player_notas',
  'player_heartbeat',
  'deposit_requests',
  'withdrawal_requests',
];

async function silencioso(promesa) {
  try { await promesa; } catch { /* tabla o columna que este deploy no tiene */ }
}

export async function borrarJugador(id) {
  // Las FKs a balance_transactions no son cascade: hay que soltarlas
  // antes de borrar el libro, y el libro antes del jugador (restrict).
  await silencioso(supabase.from('deposit_requests').update({ tx_id: null, tx_bono_id: null }).eq('player_id', id));
  await silencioso(supabase.from('withdrawal_requests').update({ tx_id: null, tx_reembolso_id: null }).eq('player_id', id));
  await silencioso(supabase.from('vip_pagos').update({ tx_id: null }).eq('player_id', id));
  await silencioso(supabase.from('bono_movimientos').update({ tx_id: null }).eq('player_id', id));
  await silencioso(supabase.from('giros_diarios').update({ tx_id: null }).eq('player_id', id));
  await silencioso(supabase.from('cashback_periodos').update({ tx_id: null, withdrawal_id: null }).eq('player_id', id));

  const { data: txs } = await supabase.from('balance_transactions').select('id').eq('player_id', id);
  const ids = (txs || []).map((t) => t.id);
  if (ids.length) {
    await silencioso(supabase.from('balance_transactions').update({ anula_a: null }).in('anula_a', ids));
  }

  for (const tabla of TABLAS_PLAYER) {
    await silencioso(supabase.from(tabla).delete().eq('player_id', id));
  }
  await silencioso(supabase.from('referidos').delete().eq('referido_id', id));
  await silencioso(supabase.from('referidos').delete().eq('referidor_id', id));
  const { error: txErr } = await supabase.from('balance_transactions').delete().eq('player_id', id);
  if (txErr) throw new Error(`borrar txs: ${txErr.message}`);
  const { error: pErr } = await supabase.from('players').delete().eq('id', id);
  if (pErr) throw new Error(`borrar jugador: ${pErr.message}`);
}

export async function borrarTodos() {
  if (!dbListo) return;
  const ids = vivos.splice(0);
  for (const id of ids) {
    try {
      await borrarJugador(id);
    } catch (err) {
      console.error(`[test] no pude borrar ${id}:`, err.message);
    }
  }
}
