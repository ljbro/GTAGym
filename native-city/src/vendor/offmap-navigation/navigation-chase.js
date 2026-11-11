import { resolveVehicleProfile } from './vehicle-profile.js';
import { getNavigationRouteIndex } from './navigation-route-index.js';
import { navigationCheckpointRadius } from './navigation-checkpoint-radius.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const motionCache = new WeakMap();

function encounterMotion(nav) {
  if (motionCache.has(nav)) return motionCache.get(nav);
  const onFoot = ['walk', 'swim'].includes(nav.mode);
  const profile = onFoot
    ? null
    : resolveVehicleProfile(nav.vehicleModel ?? nav.vehicleType ?? nav.mode, nav.vehiclePhysics);
  const samples = nav.trajectory?.samples;
  const timed =
    Array.isArray(samples) &&
    samples.length > 1 &&
    samples.every(
      (sample, i) =>
        Number.isFinite(sample.timeSeconds) &&
        Number.isFinite(sample.distanceMetres) &&
        sample.timeSeconds >= 0 &&
        sample.distanceMetres >= 0 &&
        (!i ||
          (sample.timeSeconds > samples[i - 1].timeSeconds &&
            sample.distanceMetres >= samples[i - 1].distanceMetres)),
    );
  const dog = nav.actorType === 'dog' || nav.characterId === 'chop';
  const fallbackSpeed = onFoot
    ? nav.mode === 'swim'
      ? 1.8
      : dog
        ? 2.3
        : 1.65
    : profile.maxSpeedMps * (nav.category === 'follow' ? 0.45 : nav.category === 'chase' ? 0.6 : 0.65);
  const motion = { profile, samples: timed ? samples : null, fallbackSpeed };
  motionCache.set(nav, motion);
  return motion;
}

/** Source trajectory timing has priority, including zero-speed stops; otherwise use a declared class proxy. */
export function navigationTargetSpeed(nav, sourceSeconds) {
  const { profile, samples, fallbackSpeed } = encounterMotion(nav);
  if (!samples) return fallbackSpeed;
  if (sourceSeconds < samples[0].timeSeconds || sourceSeconds >= samples.at(-1).timeSeconds) return 0;
  let low = 0,
    high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].timeSeconds <= sourceSeconds) low = middle;
    else high = middle;
  }
  const speed =
    (samples[high].distanceMetres - samples[low].distanceMetres) /
    (samples[high].timeSeconds - samples[low].timeSeconds);
  return Math.min(speed, profile?.maxSpeedMps ?? (nav.mode === 'swim' ? 4.5 : 8));
}

export function hasNavigationEncounter(nav) {
  if (nav?.helicopter) return false;
  return ['chase', 'follow', 'escape'].includes(nav?.category);
}

/** Reviewed visible separation is a lower bound, not a recovered native failure threshold. */
export function navigationChaseDistanceEnvelope(nav, fallbackMetres) {
  const envelope = nav.targetDistanceEnvelope;
  if (envelope === undefined)
    return { maximumDistanceMetres: fallbackMetres, basis: 'generic-simulation-default' };
  if (
    !['chase', 'follow'].includes(nav.category) ||
    envelope.basis !== 'source-visible-separation-plus-engineering-margin' ||
    !Number.isFinite(envelope.observedMaximumDistanceMetres) ||
    envelope.observedMaximumDistanceMetres <= 0 ||
    !Number.isFinite(envelope.engineeringMarginMetres) ||
    envelope.engineeringMarginMetres < 0 ||
    envelope.observedMaximumDistanceMetres + envelope.engineeringMarginMetres > 10000 ||
    typeof envelope.sourceReceipt?.asset !== 'string' ||
    !envelope.sourceReceipt.asset.startsWith('assets/navigation/calibration/') ||
    !/^[a-f0-9]{64}$/.test(envelope.sourceReceipt.sha256 ?? '')
  )
    throw new Error(
      'navigation.targetDistanceEnvelope requires reviewed separation, explicit margin and source evidence',
    );
  return {
    ...envelope,
    maximumDistanceMetres: envelope.observedMaximumDistanceMetres + envelope.engineeringMarginMetres,
    nativeFailureThresholdMeasured: false,
  };
}

/** Arc-length sampling keeps autonomous actors on the same traversable route. */
export function routePoint(path, along) {
  const { position, yaw } = getNavigationRouteIndex(path).pointAt(along);
  return { position, yaw };
}

export function routeDistance(path, position, window) {
  return getNavigationRouteIndex(path).project(position, window).along;
}

export function createNavigationEncounter(nav) {
  if (!hasNavigationEncounter(nav)) return null;
  const onFoot = ['walk', 'swim'].includes(nav.mode);
  const totalDistance = getNavigationRouteIndex(nav.path).totalDistance;
  const motion = encounterMotion(nav);
  const speed = navigationTargetSpeed(nav, 0);
  const distanceEnvelope = navigationChaseDistanceEnvelope(nav, onFoot ? 28 : Math.max(70, speed * 4));
  const targetDistance =
    nav.category === 'escape'
      ? nav.indoors
        ? -1
        : onFoot
          ? -7
          : -16
      : Math.min(onFoot ? 7 : Math.max(16, speed * 1.2), totalDistance * 0.25);
  const state = {
    category: nav.category,
    status: 'active',
    failureReason: '',
    objectiveMet: false,
    targetDistance,
    totalDistance,
    speed,
    movementSpeed: onFoot || motion.samples ? speed : 0,
    sourceTimeSeconds: 0,
    speedBasis: motion.samples ? 'source-trajectory-distance/time' : 'representative-vehicle-profile',
    elapsedSeconds: 0,
    lostSeconds: 0,
    closeSeconds: 0,
    trackedSeconds: 0,
    safeSeconds: 0,
    captureSeconds: 0,
    distance: Math.abs(targetDistance),
    minDistance: onFoot ? 1.3 : 4,
    maxDistance: distanceEnvelope.maximumDistanceMetres,
    distanceEnvelope,
    desiredDistance: onFoot ? 5 : Math.max(13, speed * 1.2),
    captureDistance: onFoot ? 2.8 : 7,
    escapeDistance: Math.min(onFoot ? 10 : 23, totalDistance * 0.4),
    requiredTrackingSeconds: Math.min(6, (totalDistance / Math.max(speed, 0.1)) * 0.3),
    lastElapsedMs: 0,
    lastPosition: { x: nav.path[0][0], y: nav.path[0][1], z: nav.path[0][2] },
    playerDistance: 0,
    lastProjectionPosition: { x: nav.path[0][0], y: nav.path[0][1], z: nav.path[0][2] },
    target: {
      id: `navigation-${nav.category}-target`,
      kind: onFoot ? (nav.targetActorType === 'dog' ? 'dog' : 'human') : 'vehicle',
      motionBasis: 'simulated-along-player-route',
      vehicleType: nav.targetVehicleType ?? nav.vehicleType ?? nav.mode,
      role: nav.category === 'escape' ? 'pursuer' : nav.category === 'chase' ? 'fleeing' : 'leader',
      state: 'active',
      speed,
      ...routePoint(nav.path, targetDistance),
    },
  };
  return state;
}

/** Shared deterministic pursuit model. Only observed time/player motion advances it. */
export function advanceNavigationEncounter(
  nav,
  state,
  position,
  elapsedMs,
  routeCompleted,
  eligible = true,
  targetTimeScale = 1,
  checkpointIndex,
) {
  if (!state || state.status !== 'active' || !Number.isFinite(elapsedMs)) return state;
  if (elapsedMs <= state.lastElapsedMs) return state;
  const dt = Math.min(2, (elapsedMs - state.lastElapsedMs) / 1000);
  const before = state.lastPosition;
  const motion = encounterMotion(nav);
  const routeIndex = getNavigationRouteIndex(nav.path);
  const creditedDistance = Number.isInteger(checkpointIndex)
    ? routeIndex.cumulativeDistances[clamp(checkpointIndex - 1, 0, nav.path.length - 1)]
    : 0;
  const steps = Math.max(1, Math.ceil(dt * 60));
  for (let step = 1; step <= steps && state.status === 'active'; step++) {
    const seconds = dt / steps;
    const targetSeconds = seconds * targetTimeScale;
    const fraction = step / steps;
    const player = {
      x: before.x + (position.x - before.x) * fraction,
      y: before.y + (position.y - before.y) * fraction,
      z: before.z + (position.z - before.z) * fraction,
    };
    state.elapsedSeconds += seconds;
    state.speed = navigationTargetSpeed(nav, state.sourceTimeSeconds + targetSeconds / 2);
    state.sourceTimeSeconds += targetSeconds;
    if (motion.samples || !motion.profile) state.movementSpeed = state.speed;
    else
      state.movementSpeed += clamp(
        state.speed - state.movementSpeed,
        -motion.profile.brakeMps2 * targetSeconds,
        motion.profile.accelerationMps2 * 0.65 * targetSeconds,
      );
    const oldTarget = state.targetDistance;
    // Only nearby route arcs are reachable from the previous observation. A
    // global nearest segment confuses separate visits to a crossing or loop.
    // A modest arc/chord allowance handles bends and still allows reversing.
    const moved = distance(player, state.lastProjectionPosition);
    const maximumSpeed = motion.profile ? motion.profile.maxSpeedMps * 1.2 : nav.mode === 'swim' ? 8 : 15;
    const projectionReach = moved === 0 ? 0 : Math.min(moved, maximumSpeed * seconds) * 1.5 + 1e-7;
    const playerDistance = routeDistance(nav.path, player, {
      minDistance: state.playerDistance - projectionReach,
      // A measured stationary interval can contain a small residual loop. The
      // observed actor need not trace that registration noise exactly. Already
      // credited ordered checkpoints provide a second bound, so projection can
      // leave the local minimum without searching unvisited future route legs.
      maxDistance: Math.max(
        state.playerDistance + projectionReach,
        eligible && moved > 0 ? creditedDistance : 0,
      ),
      // Ordered checkpoints distinguish a task retracing the same street from
      // the earlier leg. The preference only resolves spatial ties inside the
      // reachable window; it never moves the player to an unvisited distant arc.
      preferredSegmentIndex: Number.isInteger(checkpointIndex) ? Math.max(0, checkpointIndex - 1) : undefined,
    });
    state.playerDistance = playerDistance;
    state.lastProjectionPosition = { ...player };
    if (nav.category === 'escape') {
      if (state.elapsedSeconds > 2.5)
        state.targetDistance += clamp(
          playerDistance - state.targetDistance,
          -state.movementSpeed * targetSeconds,
          state.movementSpeed * targetSeconds,
        );
    } else
      state.targetDistance = Math.min(
        state.totalDistance,
        state.targetDistance + state.movementSpeed * targetSeconds,
      );
    Object.assign(state.target, routePoint(nav.path, state.targetDistance));
    state.target.speed = Math.abs(state.targetDistance - oldTarget) / seconds;
    state.distance = distance(player, state.target.position);
    const atEnd = state.targetDistance >= state.totalDistance - 0.01;
    if (nav.category === 'escape') {
      state.captureSeconds =
        state.elapsedSeconds > 2.5 && state.distance < state.captureDistance
          ? state.captureSeconds + seconds
          : 0;
      state.safeSeconds =
        eligible && state.distance >= state.escapeDistance ? state.safeSeconds + seconds : 0;
      if (state.captureSeconds >= 1.2) fail(state, "Intercepted by pursuers");
      else if (routeCompleted && eligible && state.safeSeconds >= 3) succeed(state);
    } else {
      state.lostSeconds = state.distance > state.maxDistance ? state.lostSeconds + seconds : 0;
      if (state.lostSeconds >= 5) fail(state, "Lost the moving target");
      else if (nav.category === 'follow') {
        state.closeSeconds = !atEnd && state.distance < state.minDistance ? state.closeSeconds + seconds : 0;
        if (state.closeSeconds >= 2.5) fail(state, "Following too closely, Detected");
        if (
          eligible &&
          state.distance >= state.minDistance &&
          state.distance <= state.maxDistance &&
          playerDistance <= state.targetDistance + 2
        )
          state.trackedSeconds += seconds;
        if (
          state.status === 'active' &&
          routeCompleted &&
          eligible &&
          atEnd &&
          state.distance <= state.maxDistance &&
          state.trackedSeconds >= state.requiredTrackingSeconds
        )
          succeed(state);
      } else {
        // The final ordered checkpoint already defines the visible arrival area.
        // A smaller hidden pursuit bubble must not leave a valid arrival waiting forever.
        const endpoint = routeIndex.points.at(-1);
        const insideFinalCheckpoint =
          routeCompleted &&
          atEnd &&
          Math.hypot(player.x - endpoint[0], player.z - endpoint[2]) <=
            navigationCheckpointRadius(nav, nav.path.length - 1) &&
          Math.abs(player.y - endpoint[1]) <= (nav.verticalTolerance ?? 0.8);
        state.captureSeconds =
          eligible && (state.distance < state.captureDistance || insideFinalCheckpoint)
            ? state.captureSeconds + seconds
            : 0;
        if (routeCompleted && eligible && atEnd && state.captureSeconds >= 1.2) succeed(state);
      }
    }
  }
  state.lastElapsedMs = elapsedMs;
  state.lastPosition = { ...position };
  state.target.state = state.status;
  return state;
}

function fail(state, reason) {
  state.status = 'failed';
  state.failureReason = reason;
}
function succeed(state) {
  state.status = 'succeeded';
  state.objectiveMet = true;
}
