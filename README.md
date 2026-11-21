# Helium

Helium is a browser-based 3D voxel sandbox and terrain builder with survival, creative building, crafting, smelting, day/night lighting, mobs, and a Minecraft-inspired texture/UI style.

The game runs entirely in the browser today. Gameplay state is simulated by an in-process authoritative server; rendering and UI are handled by a presentation-only client.

## Features

- Procedural chunked terrain with four presets: **Meadows**, **Alpine**, **Archipelago**, and **Mesa**
- Survival systems: health, hunger, oxygen, mining, tool durability, mobs, crafting, and smelting
- Creative palette with buildable blocks, tools, buckets, clock, compass, and other items
- 2×2 pocket crafting in the inventory and 3×3 crafting at placed Crafting Tables
- Furnace UI with fuel/cook timing and a searchable, filterable recipe book
- 24-minute day/night cycle (12 minutes of day, 12 minutes of night)
- Animated water and lava, buckets that scoop/pour static liquid blocks, and lava as furnace fuel
- Gold tools, brick/clay blocks and items, birch wood, redstone/gold ore, clock, and compass
- Animated clock and compass items driven by authoritative time and player yaw
- Clouds, player shadow, dropped items, held-item viewmodels, particles, and synthesized audio
- OPFS world saves with localStorage fallback; legacy `voxelvale*` keys are retained for compatibility

Multiplayer is not enabled yet, but the client/server message boundary is isolated behind a transport interface so a Worker or WebSocket transport can be added later.

## Requirements

- Node.js 20+ (a recent Node 20 or 22 release is recommended)
- npm

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

The dev server binds to `0.0.0.0` on port `3000`, so it is also reachable from other devices on the same network.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server on port 3000 |
| `npm run build` | Produce a production build in `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Type-check the project with `tsc --noEmit` |
| `npm test` | Run headless authoritative-server regression tests |
| `npm run clean` | Remove `dist/` and generated server output |

## Controls

| Action | Input |
| --- | --- |
| Move / sprint | `WASD` / `Shift` |
| Jump | `Space` |
| Fly (creative) | `V`, or double-tap `Space` |
| Pause / resume | `Esc` or `P` |
| Mine / attack | Hold left mouse button, or `X` |
| Place / use / eat | Right mouse button, or `B` |
| Inventory / bag | `E` |
| Hotbar slots | `1`–`9` |
| Drop held item | `Q` (`Ctrl`/`Cmd` + `Q` drops the whole stack) |
| Pick targeted block | `F` |
| Mute / unmute | `M` |
| Save menu panorama | `F1` |

Click the world to lock the pointer. In menus, `Shift+Click` inventory slots to quick-load crafting/furnace grids.

## Project structure

```text
src/
  shared/       Pure gameplay, world, and protocol code (no THREE/DOM/React)
  server/       Authoritative GameServer and simulation systems
  client/       GameClient, renderer, input, audio, HUD, and client-side visuals
  game/         Browser-specific helpers: atlas, assets, meshing, entities, audio, OPFS
  components/   React UI overlays and modals
assets/
  texture/      Block, item, GUI, particle, and destroy-stage textures
  models/       Optional Minecraft-style JSON block models
  font/         Bitmap font assets
tests/          Headless server regression tests
```

### Architecture notes

- `src/shared` contains pure rules and data: `blocks.ts`, `survival.ts`, `world.ts`, `constants.ts`, `protocol.ts`, `transport.ts`, `snapshots.ts`, `save.ts`, `types.ts`, `vec.ts`, and `noise.ts`. These modules must not import THREE, DOM, or React.
- `GameServer` owns world state, physics, survival stats, inventory, crafting, furnaces, time, saves, and simulation events. It runs at a fixed 20 TPS.
- `GameClient` owns rendering, camera, input, sound, HUD/UI, entity visuals, and snapshot interpolation. It never advances authoritative time locally.
- `LocalTransport` runs the server in-process and queues messages on a microtask. The `Transport` interface keeps a future Worker/WebSocket implementation isolated from game logic.
- React components consume `GameClient`; there is no `src/game/engine.ts` facade.

## Textures and assets

Drop PNG/JPG/WebP files anywhere under `assets/`; asset discovery uses file stems, so nested folders such as `assets/texture/items/gold/golden_pickaxe.png` work without changing the binding name.

- Block atlas bindings live in `src/game/assetPack.ts`; procedural fallback tiles live in `src/game/textures.ts`.
- Item texture bindings live in `src/game/assetPack.ts`; procedural fallback icons live in `src/shared/survival.ts`.
- The block atlas is 8×7 (56 tiles). New tile indices are defined in `TILE` in `src/shared/blocks.ts`.
- Animated block sheets are vertical frame strips. Their `.mcmeta` `frametime` and explicit `frames` arrays are honored, including lava's ping-pong frame order.
- Animated item frames use numbered files such as `clock_00`…`clock_63` and `compass_00`…`compass_31`.

When adding a block or item, update the relevant shared registry first (`BLOCK_DEFS` / `ITEM_DEFS`), then add atlas/item bindings, recipes, creative entries, and tests as appropriate.

## Verification

```bash
npm run lint
npm test
npm run build
```

Vite may print a chunk-size warning during `npm run build`; it does not fail the build.
