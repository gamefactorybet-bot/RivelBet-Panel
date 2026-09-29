import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, jugador, leer, n, rpc, rpcFalla, borrarTodos, supabase, dbListo } from './helper.js';

let snapshot = null;

before(async () => {
  if (!dbListo) return;
  const { data, error } = await supabase.from('billetera_config').select('*').eq('id', 1).single();
  if (error) throw new Error(`billetera_config: ${error.message}`);
  snapshot = data;
});

after(async () => {
  try {
    if (snapshot) {
      await supabase.from('billetera_config').update({
        modo_avanzado: snapshot.modo_avanzado,
        retener_ganancias: snapshot.retener_ganancias,
        rollover_carga: snapshot.rollover_carga,
        apuesta_max_bono: snapshot.apuesta_max_bono,
        tope_conversion_mult: snapshot.tope_conversion_mult,
      }).eq('id', 1);
    }
  } finally {
    await borrarTodos();
  }
});

async function setBilletera(patch) {
  const { error } = await supabase.from('billetera_config').update(patch).eq('id', 1);
  if (error) throw new Error(error.message);
}

testDb(test, 'modo simple: un bono con rollover no pega (requisito queda 0)', async () => {
  await setBilletera({ modo_avanzado: false });
  const p = await jugador();
  await rpc('dar_bono_manual', {
    p_player_id: p.id, p_monto: 1000, p_rollover: 1,
    p_nota: 'test', p_actor: 'test',
  });
  const j = await leer(p.id);
  assert.equal(n(j.balance), 1000);
  assert.equal(n(j.saldo_bono), 0);
  assert.equal(n(j.requisito_apuesta), 0);
});

testDb(test, 'modo avanzado: el bono suma requisito y se libera apostándolo', async () => {
  await setBilletera({ modo_avanzado: true, retener_ganancias: false, tope_conversion_mult: 0 });
  const p = await jugador();
  await rpc('dar_bono_manual', {
    p_player_id: p.id, p_monto: 1000, p_rollover: 1,
    p_nota: 'test rollover', p_actor: 'test',
  });

  let j = await leer(p.id);
  assert.equal(n(j.balance), 1000);
  assert.equal(n(j.saldo_bono), 1000);
  assert.equal(n(j.requisito_apuesta), 1000);

  await rpc('slot_jugada', {
    p_player_id: p.id, p_game_slug: 'fortune',
    p_bet: 1000, p_win: 0, p_detalle: { test: 'liberar' },
    p_client_id: `lib-${p.id}`,
  });

  j = await leer(p.id);
  assert.equal(n(j.balance), 0);
  assert.equal(n(j.saldo_bono), 0);
  assert.equal(n(j.requisito_apuesta), 0);
});

testDb(test, 'retirar con rollover pendiente forfeita el bono, no la plata', async () => {
  await setBilletera({ modo_avanzado: true, retener_ganancias: false, tope_conversion_mult: 0 });
  const p = await jugador();

  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 5000,
    p_note: 'plata real', p_created_by: 'test',
  });
  await rpc('dar_bono_manual', {
    p_player_id: p.id, p_monto: 1000, p_rollover: 1,
    p_nota: 'pegajoso', p_actor: 'test',
  });

  let j = await leer(p.id);
  assert.equal(n(j.balance), 6000);
  assert.equal(n(j.saldo_bono), 1000);

  // retirable = 6000 - 1000 (forfeit) = 5000. Pedimos 4000, queda 1000 de su plata.
  await rpc('solicitar_retiro', {
    p_player_id: p.id, p_amount: 4000, p_nota: 'test',
    p_metodo_tipo: 'alias', p_alias_tipo: 'ci', p_alias_valor: 'test',
  });

  j = await leer(p.id);
  assert.equal(n(j.saldo_bono), 0);
  assert.equal(n(j.requisito_apuesta), 0);
  assert.equal(n(j.balance), 1000, 'tenía que perder el bono (1000) y los 4000 del retiro');
});

testDb(test, 'tope de conversión recorta lo ganado con el bono al liberar', async () => {
  await setBilletera({
    modo_avanzado: true, retener_ganancias: false, tope_conversion_mult: 2,
  });
  const p = await jugador();
  await rpc('dar_bono_manual', {
    p_player_id: p.id, p_monto: 1000, p_rollover: 1,
    p_nota: 'con tope', p_actor: 'test',
  });

  // Gana 10x. Atribuible = 1000 (bono) + 9000 (ganancia neta) = 10000.
  // Tope = 1000 * 2 = 2000. Se recortan 8000. Saldo final 2000.
  await rpc('slot_jugada', {
    p_player_id: p.id, p_game_slug: 'fortune',
    p_bet: 1000, p_win: 10000, p_detalle: { test: 'tope' },
    p_client_id: `tope-${p.id}`,
  });

  const j = await leer(p.id);
  assert.equal(n(j.requisito_apuesta), 0);
  assert.equal(n(j.saldo_bono), 0);
  assert.equal(n(j.balance), 2000);
});

testDb(test, 'con requisito pendiente no se puede retirar más de lo retirable', async () => {
  await setBilletera({ modo_avanzado: true, retener_ganancias: false, tope_conversion_mult: 0 });
  const p = await jugador();
  await rpc('dar_bono_manual', {
    p_player_id: p.id, p_monto: 2000, p_rollover: 1,
    p_nota: 'solo bono', p_actor: 'test',
  });

  const msg = await rpcFalla('solicitar_retiro', {
    p_player_id: p.id, p_amount: 2000, p_nota: 'todo',
    p_metodo_tipo: 'alias', p_alias_tipo: 'ci', p_alias_valor: 'test',
  });
  assert.match(msg, /podés retirar hasta/i);
  assert.equal(n((await leer(p.id)).balance), 2000);
});
