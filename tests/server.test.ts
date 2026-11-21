/**
 * Headless regression tests for the authoritative server.
 * Run with `npm test`. No browser, DOM or THREE required.
 */
import assert from 'node:assert/strict';
import { GameServer } from '../src/server/GameServer.ts';
import { BlockType } from '../src/shared/blocks.ts';
import { DAY_LENGTH_SECONDS, DOOR_THICKNESS, SERVER_TICK_DT } from '../src/shared/constants.ts';
import {
  CRAFTING_RECIPES, getBlockDrop, getMiningDuration, ItemType, SMELTING_RECIPES,
} from '../src/shared/survival.ts';
import { LocalTransport } from '../src/shared/transport.ts';
import type { ClientCommand, InputCommand, ServerMessage } from '../src/shared/protocol.ts';
import type { ServerSnapshot } from '../src/shared/snapshots.ts';

function harness() {
  const server = new GameServer();
  const messages: ServerMessage[] = [];
  const off = server.onMessage((m) => messages.push(m));
  return {
    server,
    messages,
    send(cmd: ClientCommand) {
      server.receive(cmd);
    },
    step(seconds: number) {
      const frames = Math.ceil(seconds / SERVER_TICK_DT);
      for (let i = 0; i < frames; i++) server.advance(SERVER_TICK_DT);
    },
    snapshot(): ServerSnapshot | null {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.type === 'snapshot') return m.snapshot;
      }
      return null;
    },
    dispose() {
      off();
      server.dispose();
    },
  };
}

let nextSeq = 1;
const input = (heldKeys: string[] = [], extra: Partial<Omit<InputCommand, 'type'>> = {}): ClientCommand => ({
  type: 'input', seq: nextSeq++, heldKeys, lookDx: 0, lookDy: 0, sensitivity: 1, miningHeld: false,
  ...extra,
});

const tests: Array<[string, () => void | Promise<void>]> = [
  ['title phase ignores movement input', () => {
    const h = harness();
    const x = h.server.playerPos.x;
    h.send(input(['KeyW']));
    h.step(1);
    assert.equal(h.server.playerPos.x, x, 'server must not simulate while on the title screen');
    h.dispose();
  }],

  ['playing phase moves the player forward', () => {
    const h = harness();
    h.send({ type: 'setPhase', phase: 'playing' });
    const start = { x: h.server.playerPos.x, z: h.server.playerPos.z };
    h.send(input(['KeyW']));
    h.step(1);
    assert.ok(h.server.playerPos.x > start.x + 0.5, `expected +X motion, got ${h.server.playerPos.x}`);
    assert.ok(h.server.playerPos.z < start.z - 0.5, `expected -Z motion, got ${h.server.playerPos.z}`);
    h.dispose();
  }],

  ['look deltas apply sensitivity exactly once', () => {
    const h = harness();
    const yaw0 = h.server.yaw;
    h.send(input([], { lookDx: 100, lookDy: 40, sensitivity: 0.5 }));
    assert.ok(Math.abs(h.server.yaw - (yaw0 - 100 * 0.0022 * 0.5)) < 1e-9);
    assert.ok(Math.abs(h.server.pitch - (-0.06 - 40 * 0.0022 * 0.5)) < 1e-9);
    h.dispose();
  }],

  ['snapshots are emitted at the configured tick rate', () => {
    const h = harness();
    h.step(1);
    const count = h.messages.filter((m) => m.type === 'snapshot').length;
    assert.ok(count >= 18 && count <= 21, `expected ~20 snapshots, got ${count}`);
    h.dispose();
  }],

  ['snapshot cadence keeps remainder across irregular frames', () => {
    const h = harness();
    for (let i = 0; i < 20; i++) h.server.advance(0.045);
    const count = h.messages.filter((m) => m.type === 'snapshot').length;
    assert.ok(count >= 16, `expected ~18 snapshots from 0.9s, got ${count}`);
    h.dispose();
  }],

  ['input sequence is echoed for look prediction reconciliation', () => {
    const h = harness();
    h.send(input([], { seq: 42 }));
    h.server.advance(SERVER_TICK_DT);
    assert.equal(h.snapshot()?.player.inputSeq, 42);
    h.dispose();
  }],

  ['gravity settles the player on the ground', () => {
    const h = harness();
    h.send({ type: 'setPhase', phase: 'playing' });
    h.step(2);
    assert.equal(h.server.grounded, true, 'player should be grounded after settling');
    const y = h.server.playerPos.y;
    h.step(0.5);
    assert.ok(Math.abs(h.server.playerPos.y - y) < 0.01, 'grounded Y must stay stable');
    h.dispose();
  }],

  ['jump command launches the player', () => {
    const h = harness();
    h.send({ type: 'setPhase', phase: 'playing' });
    h.step(2);
    assert.equal(h.server.grounded, true);
    const y0 = h.server.playerPos.y;
    h.send({ type: 'jump' });
    h.step(0.15);
    assert.ok(h.server.playerPos.y > y0 + 0.1, `expected upward motion, got ${h.server.playerPos.y - y0}`);
    h.dispose();
  }],

  ['inventory commands are reflected in snapshots', () => {
    const h = harness();
    h.send({ type: 'setGameMode', mode: 'creative' });
    h.send({ type: 'setActiveSlot', slot: 4 });
    h.send({ type: 'assignBlockToActiveSlot', item: ItemType.Stone });
    const snap = h.snapshot();
    assert.ok(snap, 'expected a snapshot');
    // assignBlockToActiveSlot selects the existing Stone slot when present.
    assert.equal(snap!.inventory.creativeHotbar[snap!.inventory.activeSlot], ItemType.Stone);
    assert.ok(snap!.inventory.creativeHotbar.includes(ItemType.Stone));
    assert.equal(snap!.inventory.mode, 'creative');
    h.dispose();
  }],

  ['melee hits are rejected outside player reach', () => {
    const h = harness();
    h.send({ type: 'setPhase', phase: 'playing' });
    const far = { kind: 'hostile' as const, x: 500, y: 20, z: 500, killed: true };
    h.send({ type: 'meleeHit', hit: far });
    assert.equal(h.server.mobsDefeated, 0, 'out-of-reach hits must not grant kills');

    const p = h.server.playerPos;
    const near = { kind: 'wildlife' as const, x: p.x + 1, y: p.y + 1, z: p.z + 1, killed: true };
    h.send({ type: 'meleeHit', hit: near });
    assert.equal(h.server.mobsDefeated, 1, 'in-reach hits must be accepted');
    h.dispose();
  }],

  ['destroyStages command configures crack-stage rendering', () => {
    const h = harness();
    h.send({ type: 'destroyStages', count: 10 });
    assert.equal(h.server.destroyStageCount, 10);
    h.send({ type: 'destroyStages', count: 999 });
    assert.equal(h.server.destroyStageCount, 32, 'stage count must be clamped');
    h.dispose();
  }],

  ['chunk edits are sent as sparse deltas', async () => {
    const transport = new LocalTransport();
    const server = new GameServer();
    const received: ServerMessage[] = [];
    transport.onMessage((m) => received.push(m));
    transport.attachServer(server);
    server.sendAllChunks();
    await Promise.resolve();

    const chunkFor = (cx: number, cz: number) =>
      received.filter((m) => m.type === 'chunk' && m.chunk.cx === cx && m.chunk.cz === cz).length;
    const fullCount = chunkFor(0, 0);
    const chunk = server.world.ensureChunk(0, 0);
    const index = 100;
    const previous = chunk[index];
    chunk[index] = previous === 1 ? 2 : 1;
    server.world.markChunkDirty(0, 0);
    server.advance(SERVER_TICK_DT);
    await Promise.resolve();

    assert.equal(chunkFor(0, 0), fullCount, 'the edited chunk should not be resent in full');
    const deltas = received.filter(
      (m) => m.type === 'chunkDelta' && m.delta.cx === 0 && m.delta.cz === 0,
    );
    assert.equal(deltas.length, 1, 'expected exactly one sparse delta for the edited chunk');
    const edits = deltas[0].type === 'chunkDelta' ? deltas[0].delta.edits : [];
    assert.equal(edits.length, 1);
    assert.equal(edits[0].index, index);
    assert.equal(edits[0].block, chunk[index]);

    server.dispose();
    transport.dispose();
  }],

  ['LocalTransport delivers commands and snapshots', async () => {
    const transport = new LocalTransport();
    const server = new GameServer();
    const received: ServerMessage[] = [];
    transport.onMessage((m) => received.push(m));
    transport.attachServer(server);
    transport.send({ type: 'setPhase', phase: 'playing' });
    await Promise.resolve();
    assert.equal(server.phase, 'playing');
    server.advance(SERVER_TICK_DT);
    await Promise.resolve();
    assert.ok(received.some((m) => m.type === 'snapshot'));
    server.dispose();
    transport.dispose();
  }],

  ['ore drops, tools, brick/clay, clock and 24-hour cycle are wired', () => {
    assert.equal(DAY_LENGTH_SECONDS, 24 * 60);
    assert.equal(DOOR_THICKNESS, 4 / 16);
    assert.equal(getBlockDrop(BlockType.GoldOre)?.item, ItemType.RawGold);
    assert.equal(getBlockDrop(BlockType.RedstoneOre)?.item, ItemType.Redstone);
    assert.equal(getBlockDrop(BlockType.Clay)?.item, ItemType.ClayBall);
    assert.equal(getBlockDrop(BlockType.Brick)?.item, ItemType.BrickItem);
    assert.ok(getMiningDuration(BlockType.Dirt, ItemType.WoodShovel) < getMiningDuration(BlockType.Dirt, null));
    assert.ok(SMELTING_RECIPES.some((r) => r.input === ItemType.RawGold && r.output.item === ItemType.GoldIngot));
    assert.ok(SMELTING_RECIPES.some((r) => r.input === ItemType.ClayBall && r.output.item === ItemType.BrickItem));
    assert.ok(CRAFTING_RECIPES.some((r) => r.output.item === ItemType.Clock));
    assert.ok(CRAFTING_RECIPES.some((r) => r.output.item === ItemType.Compass));
    assert.ok(CRAFTING_RECIPES.some((r) => r.output.item === ItemType.WoodShovel));
    assert.ok(CRAFTING_RECIPES.some((r) => r.output.item === ItemType.BirchPlanks));
    for (const tool of [ItemType.GoldPickaxe, ItemType.GoldAxe, ItemType.GoldShovel, ItemType.GoldSword]) {
      assert.ok(CRAFTING_RECIPES.some((r) => r.output.item === tool), `missing recipe for ${tool}`);
    }
    assert.ok(CRAFTING_RECIPES.some((r) => r.id === 'bricks_block'));
    assert.ok(CRAFTING_RECIPES.some((r) => r.id === 'clay_block'));
  }],

  ['lava bucket scoops and pours lava', () => {
    const h = harness();
    h.send({ type: 'setPhase', phase: 'playing' });
    h.send({ type: 'pickupItem', item: ItemType.Bucket, count: 1 });

    h.server.world.setBlock(0, 16, 4, BlockType.Lava);
    h.server.viewDir.set(0, -1, 0);
    h.send({ type: 'placeBlock' });
    assert.equal(h.server.world.getBlock(0, 16, 4), BlockType.Air);
    assert.equal(h.server.survivalSlots[0]?.item, ItemType.LavaBucket);

    h.server.currentTarget = {
      x: 0, y: 15, z: 4, nx: 0, ny: 1, nz: 0,
      block: BlockType.Grass, distance: 2,
    };
    h.send({ type: 'placeBlock' });
    assert.equal(h.server.world.getBlock(0, 16, 4), BlockType.Lava);
    assert.equal(h.server.survivalSlots[0]?.item, ItemType.Bucket);
    h.dispose();
  }],

  ['right-clicking a crafting table reports a phase change', () => {
    const h = harness();
    h.send({ type: 'setPhase', phase: 'playing' });
    h.messages.length = 0;
    h.server.currentTarget = {
      x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0,
      block: BlockType.CraftingTable, distance: 3,
    };
    h.send({ type: 'placeBlock' });
    assert.equal(h.server.phase, 'crafting');
    const phaseEvents = h.messages.filter(
      (m) => m.type === 'event' && m.event.type === 'phase' && m.event.phase === 'crafting',
    );
    assert.equal(phaseEvents.length, 1, 'server must emit exactly one phase event');

    // The client echoes setPhase when it handles that event; the server must not loop.
    h.messages.length = 0;
    h.send({ type: 'setPhase', phase: 'crafting' });
    assert.ok(
      !h.messages.some((m) => m.type === 'event' && m.event.type === 'phase'),
      'echoed setPhase must be a no-op',
    );
    h.dispose();
  }],
];

let failures = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`FAIL  ${name}`);
    console.error(err);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`\n${tests.length} tests passed`);
}
