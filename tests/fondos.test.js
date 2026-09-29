import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  testDb, jugador, leer, n, rpc, rpcFalla, borrarTodos, supabase, dbListo,
} from './helper.js';

let snapshot = null;
let staffId = null;

before(async () => {
  if (!dbListo) return;
  const { data: cfg } = await supabase.from('caja_config').select('*').eq('id', 1).maybeSingle();
  const { data: bov } = await supabase.from('casino_boveda').select('*').eq('id', 1).maybeSingle();
  snapshot = { cfg, bov };
  const { data: staff } = await supabase.from('staff_profiles').select('id').limit(1).maybeSingle();
  staffId = staff?.id || null;
});

after(async () => {
  try {
    if (snapshot?.cfg) {
      await supabase.from('caja_config').update({ caja_con_fondo: snapshot.cfg.caja_con_fondo }).eq('id', 1);
    }
  } finally {
    await borrarTodos();
  }
});

async function setFlag(on) {
  const { error } = await supabase.from('caja_config').update({ caja_con_fondo: on }).eq('id', 1);
  if (error) throw new Error(error.message);
}

testDb(test, 'flag apagado: la carga sigue fabricando (como hoy)', async () => {
  await setFlag(false);
  const p = await jugador();
  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 1000,
    p_note: 'libre', p_created_by: 'test',
  });
  assert.equal(n((await leer(p.id)).balance), 1000);
});

testDb(test, 'sin fichas en el fondo no se puede cargar', async () => {
  if (!staffId) { assert.ok(true); return; }
  await setFlag(true);
  const p = await jugador();
  const msg = await rpcFalla('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 500,
    p_note: 'sin fondo', p_created_by: 'test', p_staff_id: staffId,
  });
  assert.match(msg, /no te alcanzan las fichas/i);
  assert.equal(n((await leer(p.id)).balance), 0);
});

testDb(test, 'fabricar → asignar → cargar resta el fondo y anota plata', async () => {
  if (!staffId) { assert.ok(true); return; }
  await setFlag(true);

  const { data: antes } = await supabase.from('staff_fondos').select('fichas').eq('staff_id', staffId).maybeSingle();
  const fondoAntes = n(antes?.fichas);

  await rpc('boveda_fabricar', { p_amount: 8000, p_created_by: 'test', p_note: 'lab' });
  await rpc('fondo_asignar', {
    p_staff_id: staffId, p_amount: 3000, p_created_by: 'test', p_note: 'lab',
  });

  const p = await jugador();
  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 1000,
    p_note: 'caja', p_created_by: 'test', p_staff_id: staffId,
  });

  assert.equal(n((await leer(p.id)).balance), 1000);

  const { data: fondo } = await supabase.from('staff_fondos').select('fichas').eq('staff_id', staffId).single();
  assert.equal(n(fondo.fichas), fondoAntes + 3000 - 1000);

  const { data: dep } = await supabase.from('deposit_requests')
    .select('origen, estado, amount').eq('player_id', p.id).eq('origen', 'caja').maybeSingle();
  assert.equal(dep?.estado, 'aprobado');
  assert.equal(n(dep?.amount), 1000);

  await rpc('fondo_devolver', {
    p_staff_id: staffId, p_amount: 2000, p_created_by: 'test',
  });
});

testDb(test, 'retiro de caja devuelve fichas al cajero', async () => {
  if (!staffId) { assert.ok(true); return; }
  await setFlag(true);
  await rpc('boveda_fabricar', { p_amount: 2000, p_created_by: 'test' });
  await rpc('fondo_asignar', { p_staff_id: staffId, p_amount: 2000, p_created_by: 'test' });

  const p = await jugador();
  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 1500,
    p_note: 'in', p_created_by: 'test', p_staff_id: staffId,
  });
  const { data: mid } = await supabase.from('staff_fondos').select('fichas').eq('staff_id', staffId).single();

  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'retiro', p_amount: 400,
    p_note: 'out', p_created_by: 'test', p_staff_id: staffId,
  });

  assert.equal(n((await leer(p.id)).balance), 1100);
  const { data: after } = await supabase.from('staff_fondos').select('fichas').eq('staff_id', staffId).single();
  assert.equal(n(after.fichas), n(mid.fichas) + 400);
});
