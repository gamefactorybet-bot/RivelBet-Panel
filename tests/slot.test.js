import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarConfig, CONFIG_DEFECTO, evaluarLinea, girar } from '../lib/slot-engine.js';
import { testDb, jugador, leer, n, rpc, rpcFalla, borrarTodos } from './helper.js';

const cfg = CONFIG_DEFECTO;

test('Fortune (config por defecto) tiene RTP ~91.8%', () => {
  const a = analizarConfig(cfg);
  assert.equal(a.rtp, 91.84);
  assert.equal(a.premioMayor, 330);
  assert.ok(a.volatilidad > 0);
  assert.ok(a.frecuencia > 0 && a.frecuencia < 100);
});

test('una config que paga de más se detecta (RTP > 100)', () => {
  const a = analizarConfig({
    ...cfg,
    pagos: Object.fromEntries(cfg.simbolos.map((s) => [s, 50])),
    pagosDos: Object.fromEntries(cfg.simbolos.map((s) => [s, 20])),
  });
  assert.ok(a.rtp > 100, `RTP ${a.rtp} tenía que pasar de 100`);
});

test('la línea de pago es la del medio; tres iguales pagan, dos solo al inicio', () => {
  assert.equal(evaluarLinea(['cereza', 'cereza', 'cereza'], cfg).tipo, 'tres');
  assert.equal(evaluarLinea(['cereza', 'cereza', 'cereza'], cfg).multiplicador, cfg.pagos.cereza);

  assert.equal(evaluarLinea(['cereza', 'cereza', 'limon'], cfg).tipo, 'dos');
  assert.equal(evaluarLinea(['cereza', 'cereza', 'limon'], cfg).multiplicador, cfg.pagosDos.cereza);

  // Dos iguales pero no al inicio: no pagan. Si esto se rompe, el RTP se dispara.
  assert.equal(evaluarLinea(['limon', 'cereza', 'cereza'], cfg).tipo, 'nada');
  assert.equal(evaluarLinea(['cereza', 'limon', 'cereza'], cfg).tipo, 'nada');
});

test('el wild completa la línea; tres wilds pagan el mayor', () => {
  assert.equal(evaluarLinea(['wild', 'cereza', 'cereza'], cfg).tipo, 'tres');
  assert.equal(evaluarLinea(['cereza', 'wild', 'cereza'], cfg).tipo, 'tres');
  assert.equal(evaluarLinea(['cereza', 'cereza', 'wild'], cfg).tipo, 'tres');

  const tresWild = evaluarLinea(['wild', 'wild', 'wild'], cfg);
  assert.equal(tresWild.tipo, 'tres');
  assert.equal(tresWild.simbolo, 'wild');
  assert.equal(tresWild.multiplicador, cfg.pagos.wild);

  assert.equal(evaluarLinea(['cereza', 'wild', 'limon'], cfg).tipo, 'dos');
});

test('girar() anima un resultado ya resuelto: grilla 3x3, premio >= 0', () => {
  const r = girar({ apuesta: 1000, config: cfg });
  assert.equal(r.grilla.length, 3);
  assert.ok(r.grilla.every((fila) => fila.length === 3));
  assert.deepEqual(r.linea, r.grilla[1]);
  assert.ok(r.premio >= 0);
  assert.equal(r.premio, 1000 * r.detalle.multiplicador);
});

after(borrarTodos);

testDb(test, 'el mismo clientId no cobra dos veces', async () => {
  const p = await jugador();
  await rpc('wallet_movimiento', {
    p_player_id: p.id, p_type: 'carga', p_amount: 10000,
    p_note: 'seed', p_created_by: 'test',
  });

  const args = {
    p_player_id: p.id,
    p_game_slug: 'fortune',
    p_bet: 1000,
    p_win: 0,
    p_detalle: { tipo: 'nada', test: true },
    p_client_id: `cid-${p.id}-1`,
  };

  const a = await rpc('slot_jugada', args);
  const b = await rpc('slot_jugada', args);

  assert.equal(a.id, b.id, 'tenía que devolver la misma ronda');
  assert.equal(n(a.bet), 1000);
  assert.equal(n((await leer(p.id)).balance), 9000);
});

testDb(test, 'sin saldo, sin verificar o baneado no juega', async () => {
  const pobre = await jugador();
  assert.match(await rpcFalla('slot_jugada', {
    p_player_id: pobre.id, p_game_slug: 'fortune',
    p_bet: 1000, p_win: 0, p_detalle: {},
  }), /saldo insuficiente/i);

  const crudo = await jugador({ estado_verificacion: 'sin_verificar' });
  await rpc('wallet_movimiento', {
    p_player_id: crudo.id, p_type: 'carga', p_amount: 5000,
    p_note: 'seed', p_created_by: 'test',
  });
  assert.match(await rpcFalla('slot_jugada', {
    p_player_id: crudo.id, p_game_slug: 'fortune',
    p_bet: 1000, p_win: 0, p_detalle: {},
  }), /identidad/i);

  const baneado = await jugador({ ban_permanente: true });
  assert.match(await rpcFalla('slot_jugada', {
    p_player_id: baneado.id, p_game_slug: 'fortune',
    p_bet: 1000, p_win: 0, p_detalle: {},
  }), /suspendida/i);
});
