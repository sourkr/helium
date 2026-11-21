# Helium

Helium is a browser-based 3D voxel sandbox and terrain builder with survival, creative building, crafting, smelting, day/night lighting, mobs, and a Minecraft-inspired texture/UI style.

The game runs entirely in the browser today. Gameplay state is simulated by an in-process authoritative server; rendering and UI are handled by a presentation-only client.

> **Note:** Helium is not intended for touch play. It can only be played with a keyboard and mouse; touch-only devices are unsupported.

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
- Entirely canvas-rendered UI (title, HUD, containers, recipe book, settings, and world manager)
- GUI Scale setting with Auto (recommended) and fixed 1x–4x levels
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

Open **Settings → GUI Scale** to choose Auto (recommended) or a fixed 1x–4x scale. Auto picks the largest integer scale that fits the window; fixed scales stay crisp even when they overflow smaller windows.

## Project structure

```text
src/
  shared/       Pure gameplay, world, and protocol code (no THREE/DOM/React)
  server/       Authoritative GameServer and simulation systems
  client/       GameClient, renderer, input, audio, HUD, and client-side visuals
  game/         Browser-specific helpers: atlas, assets, meshing, entities, audio, OPFS
  gui/          Canvas GUI renderer, textures, hit-testing, and GUI scale handling
  components/   Legacy React UI overlays (retained for reference; not mounted)
assets/
  gui/          Declarative menu layouts (for example main_menu.xml)
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
- React only mounts `GameClient` and the canvas GUI; there is no `src/game/engine.ts` facade.
- Screens can be declared in `assets/gui/*.xml`. `<screen>` fills the viewport and may contain a `<panorama>` (repeated, darkened dirt tiles) or `<game>` background plus a non-rendering `<components>` block. `<column>` stacks children vertically with no gap by default; `gap="10px"` adds spacing, `padding-top="8px"` offsets the first child, and `align-items` controls both axes (`center` means `center-center`; `top-center` is also valid). `<row>` lays children out horizontally, `<button>` renders a Minecraft button, `<text>` renders a label, `<text-field>` renders an editable field (`placeholder="..."` sets the placeholder, with the element body as a fallback), and `<image src="stem" size="32px">` draws an asset found by file stem and sizes it as a square (default `16px`). `<components>` defines reusable `<component name="...">` templates: `<attr name="..."/>` declares an attribute, `<var name="..." type="bool|number|string">` declares a per-instance variable with an initial value, and `onhover="var = event.inside"` (or `<event name="hover">...</event>`) updates it from pointer hover. `<event name="..."/>` declares a custom component event; `onclick="trigger(name)"` fires it, and JS listens through `CanvasGui`'s `onGuiEvent` prop, which receives the event name, component name, attributes, and variables. Custom elements such as `<world-info name="...">` expand the template, replacing `$name` in text. `<box size="32px">` overlays its children in the same square; `<image>` supports `size`, `hover_src`, `visible="$var"`, and `background-color`. `<column id="list.world" source="world" item="world-info"/>` is data-bound and filled by the game from saved worlds; a text field with `id="field.search"` filters those instances by their attribute values. Only `align-items` is accepted for alignment. All canvas text is drawn directly from `assets/font/ascii.png` in its normal, non-bold form with no drop shadow. The FPS counter is a viewport-anchored debug overlay, not part of the XML UI. `src/gui/menuLayout.ts` parses `main_menu.xml` and `world_list.xml`, and reports ignored/invalid elements in `menuErrors`/`worldMenuErrors` on the canvas for debugging.

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
