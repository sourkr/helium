import type * as THREE from 'three';

// Compatibility re-exports. Canonical definitions live in src/shared.
export type {
  EngineCallbacks,
  EngineSettings,
  GamePhase,
  HudSnapshot,
} from '../../shared/types';

/** Client-only: the pair of chunk meshes for one chunk column. */
export interface ChunkMeshPair {
  opaque: THREE.Mesh | null;
  transparent: THREE.Mesh | null;
}
