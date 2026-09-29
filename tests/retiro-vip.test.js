import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, jugador, n, rpc, rpcFalla, borrarTodos, supabase } from './helper.js';

after(async () => {
  await borrarTodos();
});

const RETIRO = {
  p_nota: 'test',
  p_metodo_tipo: 'alias',
  p_alias_tipo: 'ci',
  p_alias_valor: 'test',
};

async function darPlata(playerId, monto) {
  await rpc('wallet_movimiento', {
    p_player_id: playerId, p_type: 'carga', p_amount: monto,
    p_note: 'test', p_created_by: 'test',
  });
}

async function pedir(playerId, monto) {
  return rpc('solicitar_retiro', { p_player_id: playerId, p_amount: monto, ...RETIRO });
}

async function marcarAprobado(id, createdAt) {
  const patch = { estado: 'aprobado', resuelto_at: new Date().toISOString() };
  if (createdAt) patch.created_at = createdAt;
  const { error } = await supabase.from('withdrawal_requests').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

testDb(test, 'el primer retiro no espera', async () => {
  const p = await jugador();
  await darPlata(p.id, 5000);
  const wr = await pedir(p.id, 1000);
  assert.ok(wr?.id);
});

testDb(test, 'después de un retiro aprobado hay que esperar según el VIP', async () => {
  const p = await jugador();
  await darPlata(p.id, 8000);
  const wr = await pedir(p.id, 1000);
  await marcarAprobado(wr.id);

  const msg = await rpcFalla('solicitar_retiro', {
    p_player_id: p.id, p_amount: 1000, ...RETIRO,
  });
  assert.match(msg, /próximo retiro/i);
});

testDb(test, 'pasada la espera se puede volver a pedir', async () => {
  const p = await jugador();
  await darPlata(p.id, 8000);
  const wr = await pedir(p.id, 1000);
  const hace = new Date(Date.now() - 25 * 3600 * 1000).toISOString();
  await marcarAprobado(wr.id, hace);

  const wr2 = await pedir(p.id, 1000);
  assert.ok(wr2?.id);
});

testDb(test, 'nivel con 0 horas no espera entre retiros', async () => {
  const orden = 8000 + Math.floor(Math.random() * 1000);
  const { data: nivel, error: errN } = await supabase.from('vip_niveles').insert({
    nombre: `__test_espera0_${orden}`,
    orden,
    umbral_cargado: 0,
    retiro_espera_horas: 0,
  }).select('id').single();
  if (errN) throw new Error(errN.message);

  try {
    const p = await jugador({ vip_nivel_id: nivel.id });
    await darPlata(p.id, 8000);
    const wr = await pedir(p.id, 1000);
    await marcarAprobado(wr.id);
    const wr2 = await pedir(p.id, 1000);
    assert.ok(wr2?.id);
  } finally {
    await supabase.from('vip_niveles').delete().eq('id', nivel.id);
  }
});

testDb(test, 'abuso: varias cargas con bono y 0 apuestas dispara alerta', async () => {
  const p = await jugador();
  const { error } = await supabase.from('deposit_requests').insert([
    { player_id: p.id, amount: 10000, estado: 'aprobado', bono_monto: 2000, resuelto_at: new Date().toISOString() },
    { player_id: p.id, amount: 10000, estado: 'aprobado', bono_monto: 2000, resuelto_at: new Date().toISOString() },
  ]);
  if (error) throw new Error(error.message);

  const det = await rpc('evaluar_abuso_bono', { p_player_id: p.id });
  assert.equal(det.alerta, true);
  assert.ok(det.razones.includes('cazador'));
  assert.ok(det.razones.includes('bono_no_jugado'));
  assert.equal(n(det.cargas_con_bono), 2);
});

testDb(test, 'abuso: sin bono en el ciclo no alerta', async () => {
  const p = await jugador();
  const { error } = await supabase.from('deposit_requests').insert({
    player_id: p.id, amount: 5000, estado: 'aprobado', bono_monto: 0,
    resuelto_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);

  const det = await rpc('evaluar_abuso_bono', { p_player_id: p.id });
  assert.equal(det.alerta, false);
});
