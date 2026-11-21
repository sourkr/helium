import * as THREE from 'three';

// Pure gameplay constants live in shared; re-export so existing call sites work.
export {
  RENDER_RADIUS,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  EYE_HEIGHT,
  GRAVITY,
  JUMP_SPEED,
  WALK_SPEED,
  SPRINT_SPEED,
  FLY_SPEED,
  TIME_PRESET_VALUES,
  SNAPSHOT_INTERVAL,
} from '../../shared/constants';

// Module-scoped zero-GC math helpers (client rendering only).
export const _forward = new THREE.Vector3();
export const _right = new THREE.Vector3();
export const _moveDir = new THREE.Vector3();
export const _rayOrigin = new THREE.Vector3();
export const _rayDir = new THREE.Vector3();
export const _skyDay = new THREE.Color('#8bc6f7');
export const _skySunset = new THREE.Color('#e38b5b');
export const _skyDawn = new THREE.Color('#f0a875');
export const _skyNight = new THREE.Color('#0f192b');
export const _curSky = new THREE.Color();
export const _sunColorDay = new THREE.Color('#fff5dc');
export const _sunColorWarm = new THREE.Color('#ffaa66');
export const _sunColorNight = new THREE.Color('#6b88c9');
export const _curSunColor = new THREE.Color();
export const _hemiSkyDay = new THREE.Color('#9ad0ff');
export const _hemiSkyNight = new THREE.Color('#2a3d66');
export const _curHemiSky = new THREE.Color();
export const _hemiGroundDay = new THREE.Color('#5a6b4e');
export const _hemiGroundNight = new THREE.Color('#161b24');
export const _curHemiGround = new THREE.Color();
export const _cloudDay = new THREE.Color('#ffffff');
export const _cloudWarm = new THREE.Color('#ffd4b0');
export const _cloudNight = new THREE.Color('#2d3e5e');
export const _curCloud = new THREE.Color();
export const _underwaterSky = new THREE.Color('#1d6ca3');
