import { getNavigationRouteIndex } from './navigation-route-index.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const angle = (n) => Math.atan2(Math.sin(n), Math.cos(n));

/** Deterministic mission actors shared by browser and telemetry scoring.
 * Ground convoy paths are independently sampled from the native road graph;
 * military pursuit integrates movement instead of snapping a prop behind the pilot.
 * These are explicit browser adaptations, not the original RAGE AI scripts.
 */
export function advanceHelicopterEncounter(nav, previous, position, elapsedMs, eligible) {
  const config = nav.helicopter?.encounter;
  if (!config) return previous;
  const elapsed = Math.max(0, Number(elapsedMs) / 1000 || 0);
  const state = previous ?? {
    category: config.kind === 'convoy' ? 'follow' : 'escape',
    status: 'active',
    objectiveMet: false,
    trackedSeconds: 0,
    lostSeconds: 0,
    clearSeconds: 0,
    requiredTrackingSeconds: config.requiredTrackingSeconds ?? 20,
    desiredDistance: 90,
    lastElapsed: elapsed,
    actors: [],
    wantedLevel: config.kind === 'military' ? 4 : 0,
  };
  const dt = clamp(elapsed - state.lastElapsed, 0, 2);
  state.lastElapsed = elapsed;
  if (config.kind === 'convoy') {
    const route = getNavigationRouteIndex(config.path);
    state.totalDistance = route.totalDistance;
    state.targetDistance = Math.min(route.totalDistance, elapsed * config.speedMps + 45);
    state.actors = [0, 1].map((index) => {
      const sample = route.pointAt(Math.max(0, state.targetDistance - index * 24));
      return {
        id: `stockade-convoy-${index}`,
        kind: 'vehicle',
        role: 'target',
        vehicleType: 'car',
        model: 'stockade',
        position: sample.position,
        yaw: sample.yaw,
        speed: state.targetDistance < route.totalDistance ? config.speedMps : 0,
        state: 'following-route',
      };
    });
    state.target = state.actors[0];
    state.distance = Math.hypot(position.x - state.target.position.x, position.z - state.target.position.z);
    const visible = eligible && state.distance < 550 && Math.abs(position.y - state.target.position.y) < 400;
    state.trackedSeconds += visible ? dt : 0;
    state.lostSeconds = visible ? 0 : state.lostSeconds + dt;
    state.objectiveMet =
      state.targetDistance >= route.totalDistance - 1 &&
      state.trackedSeconds >= state.requiredTrackingSeconds;
    if (state.lostSeconds >= 25) {
      state.status = 'failed';
      state.failureReason = "Lost the armored truck";
    }
  } else {
    if (!state.target)
      state.target = {
        id: 'zancudo-lazer',
        kind: 'vehicle',
        role: 'pursuer',
        vehicleType: 'plane',
        model: 'lazer',
        position: { x: config.spawn[0], y: config.spawn[1], z: config.spawn[2] },
        yaw: config.yaw ?? 0,
        speed: 72,
        state: 'pursuing',
        pitch: 0,
        roll: 0,
      };
    const jet = state.target;
    const toPlayer = Math.hypot(position.x - jet.position.x, position.z - jet.position.z);
    const fromBase = Math.hypot(position.x - nav.path[0][0], position.z - nav.path[0][2]);
    // A fast jet must complete its turn after an overflight; it cannot orbit at zero radius.
    const returning = fromBase > 2400;
    jet.state = returning ? 'returning-to-base' : 'pursuing';
    const heading = returning
      ? Math.atan2(jet.position.x - config.spawn[0], jet.position.z - config.spawn[2])
      : toPlayer > 140
        ? Math.atan2(jet.position.x - position.x, jet.position.z - position.z)
        : jet.yaw;
    const turning = clamp(angle(heading - jet.yaw), -0.55 * dt, 0.55 * dt);
    jet.yaw = angle(jet.yaw + turning);
    jet.roll = dt > 0 ? (-turning / dt) * 0.8 : 0;
    jet.position.x -= Math.sin(jet.yaw) * jet.speed * dt;
    jet.position.z -= Math.cos(jet.yaw) * jet.speed * dt;
    const vy = clamp(position.y + 45 - jet.position.y, -16, 24);
    jet.position.y += vy * dt;
    jet.pitch = Math.atan2(vy, jet.speed);
    state.distance = toPlayer;
    const clear = fromBase > 2500 && toPlayer > 350;
    state.clearSeconds = clear && eligible ? state.clearSeconds + dt : 0;
    state.objectiveMet = state.clearSeconds >= 8;
    state.wantedLevel = state.objectiveMet ? 0 : 4;
    state.actors = state.objectiveMet ? [] : [jet];
  }
  if (state.objectiveMet && state.status !== 'failed') state.status = 'succeeded';
  return state;
}
