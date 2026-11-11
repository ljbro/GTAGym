import { NAVIGATION_MODES, NAVIGATION_CATEGORIES } from './navigation-world.js';
import {
  createNavigationEncounter,
  advanceNavigationEncounter,
  navigationChaseDistanceEnvelope,
} from './navigation-chase.js';
import { normalizeNavigationTrajectory, navigationTrajectoryPath } from './navigation-trajectory.js';
import { getNavigationRouteIndex } from './navigation-route-index.js';
import { navigationCheckpointRadius } from './navigation-checkpoint-radius.js';
import { navigationArrivalVolume, insideNavigationDestination } from './navigation-arrival.js';
import { helicopterObjectiveSatisfied } from './helicopter-objective.js';
import { advanceHelicopterEncounter } from './helicopter-encounter.js';

export const MAX_NAVIGATION_CHECKPOINTS = 20_000;
const SWEEP_SPEED_LIMIT = { walk: 15, drive: 100, fly: 200, boat: 60, swim: 8 };

/** The interval along a movement segment inside an unchanged checkpoint cylinder. */
export function checkpointIntersection(from, to, target, radius, verticalTolerance, after = 0) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    dy = to.y - from.y;
  const ox = from.x - target[0],
    oz = from.z - target[2];
  let enter = after,
    leave = 1;
  const a = dx * dx + dz * dz;
  const c = ox * ox + oz * oz - radius * radius;
  if (a < 1e-12) {
    if (c > 1e-9) return null;
  } else {
    const b = 2 * (ox * dx + oz * dz);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < -1e-9) return null;
    const root = Math.sqrt(Math.max(0, discriminant));
    enter = Math.max(enter, (-b - root) / (2 * a));
    leave = Math.min(leave, (-b + root) / (2 * a));
  }
  if (Math.abs(dy) < 1e-12) {
    if (Math.abs(from.y - target[1]) > verticalTolerance + 1e-9) return null;
  } else {
    const a = (target[1] - verticalTolerance - from.y) / dy;
    const b = (target[1] + verticalTolerance - from.y) / dy;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  return enter <= leave + 1e-9 ? Math.min(1, enter) : null;
}

export function navigationTravelMode(sample) {
  const occupied = sample.inVehicle ?? sample.vehicle?.occupied;
  const declared = sample.navigationMode ?? sample.navigation?.mode;
  if (declared && !Object.hasOwn(NAVIGATION_MODES, declared)) return null;
  if (['fly', 'boat'].includes(declared)) return occupied === true ? declared : null;
  if (declared === 'swim') return occupied === false ? 'swim' : null;
  if (declared === 'walk' && occupied !== false) return null;
  if (declared === 'drive' && occupied !== true) return null;
  return occupied === true ? 'drive' : occupied === false ? 'walk' : null;
}

/** Record route diagnostics separately from coordinate-based destination settlement. */
export function advanceNavigationProgress(task, progress, position, mode, observation = {}) {
  const nav = task.navigation;
  progress.navigation ??= {
    checkpointIndex: 0,
    totalCheckpoints: nav.path.length,
    completed: false,
    mode: nav.mode,
    encounter: createNavigationEncounter(nav),
    travelledDistanceMetres: 0,
  };
  const state = progress.navigation;
  state.travelledDistanceMetres ??= 0;
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return state;
  const destination = navigationArrivalVolume(task);
  state.arrivalArmed ??= !insideNavigationDestination(
    destination,
    task.player?.spawn?.position ?? nav.path[0],
  );
  const eligible =
    mode === nav.mode &&
    (!(nav.actorType === 'dog' || nav.characterId === 'chop') || observation.characterId === 'chop');
  const last = state.previousObservation;
  const seconds = (observation.elapsedMs - last?.elapsedMs) / 1000;
  const sweep =
    eligible &&
    last?.eligible &&
    seconds > 0 &&
    seconds <= 2 &&
    Math.hypot(position.x - last.position.x, position.y - last.position.y, position.z - last.position.z) <=
      SWEEP_SPEED_LIMIT[mode] * seconds + 1;
  const from = sweep ? last.position : position;
  const atDestination = insideNavigationDestination(destination, position);
  const arrivalSweep =
    last?.continuous &&
    seconds > 0 &&
    seconds <= 2 &&
    Math.hypot(position.x - last.position.x, position.y - last.position.y, position.z - last.position.z) <=
      SWEEP_SPEED_LIMIT[mode ?? nav.mode] * seconds + 1;
  const crossedDestination =
    arrivalSweep &&
    checkpointIntersection(
      last.position,
      position,
      [destination.position.x, destination.position.y, destination.position.z],
      destination.radius,
      destination.height,
    ) !== null;
  state.arrived = Boolean(state.arrived || (state.arrivalArmed && (atDestination || crossedDestination)));
  // A round trip can spawn inside its destination. Leave that volume once
  // before accepting a return, without requiring any recorded checkpoints.
  if (!atDestination) state.arrivalArmed = true;
  if (sweep)
    state.travelledDistanceMetres += Math.hypot(
      position.x - from.x,
      position.y - from.y,
      position.z - from.z,
    );
  const measuredRoute = nav.trajectory?.status === 'measured' ? getNavigationRouteIndex(nav.path) : null;
  // Overlapping checkpoint circles cannot erase a recorded lap while the car
  // stands still. Allow the normal endpoint radius and modest corner cutting,
  // but require observed movement for the remaining calibrated arc length.
  const reachableDistance = state.travelledDistanceMetres * 1.1 + nav.checkpointRadius;
  let intersectionTime = 0;
  while (eligible && state.checkpointIndex < nav.path.length) {
    if (measuredRoute && measuredRoute.cumulativeDistances[state.checkpointIndex] > reachableDistance + 1e-7)
      break;
    const radius = navigationCheckpointRadius(nav, state.checkpointIndex);
    const target = nav.path[state.checkpointIndex];
    const final = state.checkpointIndex === nav.path.length - 1;
    const tolerance = task.goal?.tolerance;
    const goalRadius =
      (typeof tolerance === 'object' ? (tolerance?.horizontalRadius ?? tolerance?.radius) : tolerance) ??
      task.goal?.radius ??
      task.goalTolerance ??
      1.5;
    const goalHeight =
      typeof tolerance === 'object' ? tolerance?.verticalRange : task.goal?.verticalTolerance;
    const hit = checkpointIntersection(
      from,
      position,
      target,
      final && Number.isFinite(goalRadius) ? Math.min(radius, goalRadius) : radius,
      final && Number.isFinite(goalHeight)
        ? Math.min(nav.verticalTolerance, goalHeight)
        : nav.verticalTolerance,
      intersectionTime,
    );
    if (hit === null) break;
    intersectionTime = hit;
    state.checkpointIndex++;
  }
  // Wrong modes, role changes and stale clocks break continuity; they cannot
  // provide the start of a later sweep through unobserved eligible movement.
  const clockContinuous =
    !Number.isFinite(last?.elapsedMs) ||
    !Number.isFinite(observation.elapsedMs) ||
    seconds > 0 ||
    (seconds === 0 &&
      Math.hypot(position.x - last.position.x, position.y - last.position.y, position.z - last.position.z) <
        1e-9);
  state.previousObservation = {
    position: { ...position },
    elapsedMs: observation.elapsedMs,
    eligible: eligible && clockContinuous,
    continuous: clockContinuous,
  };
  state.routeCompleted = state.checkpointIndex === nav.path.length;
  if (nav.helicopter?.encounter)
    state.encounter = advanceHelicopterEncounter(
      nav,
      state.encounter,
      position,
      observation.elapsedMs,
      eligible,
    );
  else
    advanceNavigationEncounter(
      nav,
      state.encounter,
      position,
      observation.elapsedMs,
      state.routeCompleted,
      eligible,
      observation.characterId === 'michael' && observation.abilityActive === true ? 0.35 : 1,
      state.checkpointIndex,
    );
  const orderedAudit = nav.completionPolicy === 'ordered-route';
  state.completionBasis = orderedAudit ? 'ordered-route' : 'destination-position';
  state.completed = orderedAudit
    ? state.routeCompleted && (!state.encounter || state.encounter.status === 'succeeded')
    : state.arrived;
  if (nav.helicopter) {
    state.aircraftObjectiveMet = helicopterObjectiveSatisfied(nav, observation, atDestination);
    state.completed &&= eligible && state.aircraftObjectiveMet;
    if (state.encounter)
      state.completed &&= state.encounter.objectiveMet && state.encounter.status !== 'failed';
  }
  if (nav.helicopter && observation.flight?.damaged) {
    state.completed = false;
    state.failureReason = "Helicopter Destroyed";
  }
  state.failed = !state.completed && (state.encounter?.status === 'failed' || Boolean(state.failureReason));
  return state;
}

export function validateNavigation(task) {
  const nav = task.navigation;
  if (!nav) return;
  if (
    nav.completionPolicy !== undefined &&
    !['destination-position', 'ordered-route'].includes(nav.completionPolicy)
  )
    throw new Error('navigation.completionPolicy must be destination-position or ordered-route');
  if (
    nav.arrivalRadiusMetres !== undefined &&
    (!Number.isFinite(nav.arrivalRadiusMetres) ||
      nav.arrivalRadiusMetres <= 0 ||
      nav.arrivalRadiusMetres > 25)
  )
    throw new Error('navigation.arrivalRadiusMetres must be finite and between 0 and 25 metres');
  if (!Object.hasOwn(NAVIGATION_MODES, nav.mode)) throw new Error('navigation.mode is invalid');
  if (!Object.hasOwn(NAVIGATION_CATEGORIES, nav.category)) throw new Error('navigation.category is invalid');
  if (typeof nav.indoors !== 'boolean') throw new Error('navigation.indoors must be boolean');
  if (nav.targetActorType !== undefined && !['human', 'dog'].includes(nav.targetActorType))
    throw new Error('navigation.targetActorType must be human or dog');
  if (
    nav.targetVehicleType !== undefined &&
    !['car', 'truck', 'motorcycle', 'bicycle', 'bus', 'boat', 'submarine', 'helicopter', 'plane'].includes(
      nav.targetVehicleType,
    )
  )
    throw new Error('navigation.targetVehicleType is invalid');
  navigationChaseDistanceEnvelope(nav, 70);
  if (!Array.isArray(nav.path) || nav.path.length < 2 || nav.path.length > MAX_NAVIGATION_CHECKPOINTS)
    throw new Error(`navigation.path requires 2–${MAX_NAVIGATION_CHECKPOINTS} checkpoints`);
  if (nav.path.some((p) => !Array.isArray(p) || p.length !== 3 || p.some((v) => !Number.isFinite(v))))
    throw new Error('navigation.path coordinates must be finite [x,y,z]');
  for (const field of ['checkpointRadius', 'verticalTolerance']) {
    if (!Number.isFinite(nav[field]) || nav[field] <= 0 || nav[field] > 25)
      throw new Error(`navigation.${field} must be positive and at most 25`);
  }
  if (!Number.isInteger(nav.sourceMissionIndex) || nav.sourceMissionIndex < 1 || nav.sourceMissionIndex > 75)
    throw new Error('navigation.sourceMissionIndex must be 1–75');
  if (
    !Number.isFinite(nav.startSeconds) ||
    !Number.isFinite(nav.endSeconds) ||
    !(nav.endSeconds > nav.startSeconds && nav.startSeconds >= 0)
  )
    throw new Error('navigation evidence interval is invalid');
  if (nav.trajectory) {
    const trajectory = normalizeNavigationTrajectory(nav.trajectory, nav);
    const measuredPath = navigationTrajectoryPath(trajectory);
    if (
      measuredPath.length !== nav.path.length ||
      measuredPath.some((point, index) => point.some((value, axis) => value !== nav.path[index][axis]))
    )
      throw new Error('navigation.path must preserve the complete measured trajectory in metres');
    if (
      nav.reconstruction?.coordinateBasis !== trajectory.coordinateBasis ||
      nav.reconstruction.originalWorldCoordinatesAvailable !==
        (trajectory.coordinateBasis === 'gta-world-metres')
    )
      throw new Error('navigation reconstruction must declare the measured coordinate basis');
    for (let index = 0; index < trajectory.samples.length; index++) {
      if (
        !Number.isFinite(nav.trajectory.samples[index].distanceMetres) ||
        Math.abs(nav.trajectory.samples[index].distanceMetres - trajectory.samples[index].distanceMetres) >
          0.001
      )
        throw new Error('navigation trajectory cumulative distance must match its measured positions');
    }
  } else if (nav.worldRoute) {
    const layout = nav.worldRoute;
    if (
      layout.status !== 'reconstructed' ||
      layout.coordinateBasis !== 'gta-world-metres' ||
      layout.sourceVideo !== nav.sourceVideo ||
      !layout.provenance ||
      nav.reconstruction?.metricStatus !== 'not-measured' ||
      nav.reconstruction?.fidelity !== 'native-map-route-reconstruction' ||
      nav.reconstruction?.coordinateBasis !== layout.coordinateBasis ||
      !Array.isArray(layout.points) ||
      layout.points.length !== nav.path.length ||
      layout.points.some(
        (p, i) => !Array.isArray(p) || p.length !== 3 || p.some((v, axis) => v !== nav.path[i][axis]),
      )
    )
      throw new Error(
        'navigation native layout requires source-bound reconstructed coordinates, not measured status',
      );
    if (
      layout.initialSpeedMps !== undefined &&
      (!Number.isFinite(layout.initialSpeedMps) ||
        layout.initialSpeedMps < 0 ||
        layout.initialSpeedMps > 100 ||
        !layout.initialSpeedEvidence)
    )
      throw new Error('navigation native layout initial speed requires bounded SI units and evidence');
  } else if (
    nav.reconstruction?.coordinateBasis !== undefined &&
    nav.reconstruction.coordinateBasis !== 'local-metres-approximate'
  ) {
    throw new Error('navigation measured coordinate basis requires a complete source trajectory');
  }
  for (const [name, position, target] of [
    ['spawn', task.player?.spawn?.position, nav.path[0]],
    ['goal', task.goal?.position, nav.path.at(-1)],
  ])
    if (
      !Array.isArray(position) ||
      position.length !== 3 ||
      position.some((value, axis) => value !== target[axis])
    )
      throw new Error(`navigation ${name} must match its route endpoint`);
}
