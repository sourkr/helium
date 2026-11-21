/** Module-scoped scratch vectors for the server simulation (zero-GC hot paths). */
import { Vec3 } from '../../shared/vec';

export const _forward = new Vec3();
export const _right = new Vec3();
export const _moveDir = new Vec3();
export const _rayOrigin = new Vec3();
export const _rayDir = new Vec3();
