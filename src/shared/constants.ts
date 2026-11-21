/**
 * Pure gameplay / world constants shared by the server simulation and the client.
 * This module must never import THREE, DOM or browser APIs.
 */
import type { TimePreset } from './blocks';

export const RENDER_RADIUS = 4;
export const PLAYER_HALF_WIDTH = 0.3;
export const PLAYER_HEIGHT = 1.75;
export const EYE_HEIGHT = 1.56;
export const GRAVITY = 24.5;
export const JUMP_SPEED = 8.4;
export const WALK_SPEED = 5.4;
export const SPRINT_SPEED = 8.2;
export const FLY_SPEED = 11.5;

export const TIME_PRESET_VALUES: Record<TimePreset, number> = {
  dawn: 0.24,
  noon: 0.48,
  sunset: 0.74,
  night: 0.96,
};

/** Full day/night cycle: 24 real minutes, split evenly into 12 min day and 12 min night. */
export const DAY_LENGTH_SECONDS = 24 * 60;

/** Closed doors are only four texture pixels (4/16 of a block) deep in Z. */
export const DOOR_THICKNESS = 4 / 16;
export const DOOR_THICKNESS_OFFSET = (1 - DOOR_THICKNESS) / 2;

/** Fixed simulation step for the authoritative server (Minecraft-style 20 TPS). */
export const SERVER_TICK_RATE = 20;
export const SERVER_TICK_DT = 1 / SERVER_TICK_RATE;
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;
/** Hard cap on simulated steps per frame so a slow tab never spirals. */
export const MAX_SUBSTEPS = 3;

/** Snapshot / event broadcast rate (seconds). */
export const SNAPSHOT_INTERVAL = 1 / 20;
export const HUD_INTERVAL = 0.08;
