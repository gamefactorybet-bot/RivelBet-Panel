import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, jugador, leer, n, rpc, rpcFalla, borrarTodos, supabase } from './helper.js';

after(borrarTodos);

testDb(test, 'carga aumenta el saldo y deja asiento', async () => {
  const p = await jugador();
  const tx = await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 5000,
    p_note: 'test carga', p_created_by: 'test',
  });

  assert.equal(n(tx.amount), 5000);
  assert.equal(n(tx.balance_before), 0);
  assert.equal(n(tx.balance_after), 5000);
  assert.equal(n((await leer(p.id)).balance), 5000);
});

testDb(test, 'retiro descuenta y no deja saldo negativo', async () => {
  const p = await jugador();
  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 3000,
    p_note: 'seed', p_created_by: 'test',
  });

  const tx = await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'retiro', p_amount: 1200,
    p_note: 'test retiro', p_created_by: 'test',
  });
  assert.equal(n(tx.balance_after), 1800);
  assert.equal(n((await leer(p.id)).balance), 1800);

  const msg = await rpcFalla('wallet_movimiento', {
    p_player_id: p.id, p_type: 'retiro', p_amount: 999999,
    p_note: 'de más', p_created_by: 'test',
  });
  assert.match(msg, /saldo insuficiente/i);
  assert.equal(n((await leer(p.id)).balance), 1800);
});

testDb(test, 'los bans frenan en Postgres, no solo en la UI', async () => {
  const recargas = await jugador({ ban_recargas: true });
  assert.match(await rpcFalla('wallet_movimiento', {
    p_player_id: recargas.id, p_type: 'carga', p_amount: 100,
    p_note: 'no', p_created_by: 'test',
  }), /ban de recargas/i);

  const retiros = await jugador();
  await rpc('wallet_movimiento', {
    p_player_id: retiros.id, p_type: 'carga', p_amount: 500,
    p_note: 'seed', p_created_by: 'test',
  });
  const { error: banErr } = await supabase.from('players').update({ ban_retiros: true }).eq('id', retiros.id);
  if (banErr) throw new Error(banErr.message);
  assert.match(await rpcFalla('wallet_movimiento', {
    p_player_id: retiros.id, p_type: 'retiro', p_amount: 100,
    p_note: 'no', p_created_by: 'test',
  }), /ban de retiros/i);

  const permanente = await jugador({ ban_permanente: true });
  assert.match(await rpcFalla('wallet_movimiento', {
    p_player_id: permanente.id, p_type: 'carga', p_amount: 100,
    p_note: 'no', p_created_by: 'test',
  }), /ban permanente/i);
});

testDb(test, 'anular deja contraasiento y no borra el original', async () => {
  const p = await jugador();
  const orig = await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 2000,
    p_note: 'equivocado', p_created_by: 'test',
  });

  const inversa = await rpc('anular_movimiento', {
    p_tx_id: orig.id, p_created_by: 'test', p_motivo: 'cajero se equivocó',
  });
  assert.equal(inversa.type, 'retiro');
  assert.equal(n(inversa.amount), 2000);
  assert.equal(n((await leer(p.id)).balance), 0);

  const msg = await rpcFalla('anular_movimiento', {
    p_tx_id: orig.id, p_created_by: 'test', p_motivo: 'otra vez',
  });
  assert.match(msg, /ya fue anulado/i);
});

testDb(test, 'anular una carga gastada se frena', async () => {
  const p = await jugador();
  const orig = await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 1000,
    p_note: 'seed', p_created_by: 'test',
  });
  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'retiro', p_amount: 600,
    p_note: 'gastó', p_created_by: 'test',
  });

  const msg = await rpcFalla('anular_movimiento', {
    p_tx_id: orig.id, p_created_by: 'test', p_motivo: 'tarde',
  });
  assert.match(msg, /ya no tiene ese saldo/i);
  assert.equal(n((await leer(p.id)).balance), 400);
});

testDb(test, 'aprobar el mismo depósito dos veces no acredita de nuevo', async () => {
  const p = await jugador();
  const { data: dep, error } = await supabase
    .from('deposit_requests')
    .insert({ player_id: p.id, amount: 2500, nota_jugador: 'test' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  await rpc('aprobar_deposito', {
    p_request_id: dep.id, p_created_by: 'test', p_monto_real: 2500,
  });
  const despues = n((await leer(p.id)).balance);
  assert.ok(despues >= 2500, `saldo ${despues} tenía que incluir la carga`);

  const msg = await rpcFalla('aprobar_deposito', {
    p_request_id: dep.id, p_created_by: 'test',
  });
  assert.match(msg, /ya fue/i);
  assert.equal(n((await leer(p.id)).balance), despues);
});


