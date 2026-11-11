/** Metric source trajectories preserve recorded distance, turns and stationary intervals. */
export const MAX_TRAJECTORY_SAMPLES = 20_000;

const validPoint = (point) => Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));

export function navigationPathLength(path) {
  return path.slice(1).reduce((total, point, index) => total + distance(path[index], point), 0);
}

/** Infer the starting heading from meaningful displacement, not sub-metre radar jitter. */
export function navigationInitialYaw(path, minimumDisplacement = 2) {
  const start = path[0];
  const target =
    path.find((point) => Math.hypot(point[0] - start[0], point[2] - start[2]) >= minimumDisplacement) ??
    path.find((point) => point[0] !== start[0] || point[2] !== start[2]) ??
    start;
  return Math.atan2(start[0] - target[0], start[2] - target[2]);
}

/** Reject incomplete/unscaled estimates rather than silently presenting them as original metres. */
export function normalizeNavigationTrajectory(trajectory, segment) {
  if (trajectory?.schemaVersion !== 1 || trajectory.status !== 'measured')
    throw new Error('Navigation trajectory requires a measured schemaVersion 1 source');
  if (!['gta-world-metres', 'local-metres-measured'].includes(trajectory.coordinateBasis))
    throw new Error('Navigation trajectory requires calibrated metre coordinates');
  if (
    typeof trajectory.calibration?.method !== 'string' ||
    !trajectory.calibration.method.trim() ||
    !Array.isArray(trajectory.calibration.evidence) ||
    !trajectory.calibration.evidence.length
  )
    throw new Error('Navigation trajectory requires scale calibration evidence');
  if (!Array.isArray(trajectory.gaps) || trajectory.gaps.length)
    throw new Error('Navigation trajectory contains unmeasured gaps');
  if (
    trajectory.initialSpeedMps !== undefined &&
    (!Number.isFinite(trajectory.initialSpeedMps) ||
      trajectory.initialSpeedMps < 0 ||
      trajectory.initialSpeedMps > 100)
  )
    throw new Error('Navigation trajectory initial speed must be finite metres per second');
  const duration = segment?.endSeconds - segment?.startSeconds;
  if (
    !Number.isFinite(segment?.startSeconds) ||
    !Number.isFinite(segment?.endSeconds) ||
    segment.startSeconds < 0 ||
    typeof segment.sourceVideo !== 'string' ||
    !segment.sourceVideo.trim() ||
    !Number.isFinite(trajectory.startSeconds) ||
    !Number.isFinite(trajectory.endSeconds) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    Math.abs(trajectory.startSeconds - segment.startSeconds) > 0.001 ||
    Math.abs(trajectory.endSeconds - segment.endSeconds) > 0.001 ||
    trajectory.sourceVideo !== segment.sourceVideo
  )
    throw new Error('Navigation trajectory does not match the full source video interval');
  const source = trajectory.samples;
  if (!Array.isArray(source) || source.length < 2 || source.length > MAX_TRAJECTORY_SAMPLES)
    throw new Error(`Navigation trajectory requires 2–${MAX_TRAJECTORY_SAMPLES} samples`);
  let previousTime = -Infinity,
    travelled = 0;
  const samples = source.map((sample, index) => {
    if (
      !Number.isFinite(sample.timeSeconds) ||
      sample.timeSeconds <= previousTime ||
      sample.timeSeconds < 0 ||
      sample.timeSeconds > duration + 0.001 ||
      !validPoint(sample.position)
    )
      throw new Error(`Navigation trajectory sample ${index} has invalid time or position`);
    previousTime = sample.timeSeconds;
    if (index) travelled += distance(source[index - 1].position, sample.position);
    return { ...sample, position: [...sample.position], distanceMetres: travelled };
  });
  if (samples[0].timeSeconds > 0.001 || Math.abs(samples.at(-1).timeSeconds - duration) > 0.001)
    throw new Error('Navigation trajectory must cover the beginning and end, including stops');
  if (travelled <= 0) throw new Error('Navigation trajectory contains no measured movement');
  if (trajectory.interiorIntervals !== undefined) {
    if (!Array.isArray(trajectory.interiorIntervals))
      throw new Error('Navigation interior intervals must be an array');
    let previousEnd = trajectory.startSeconds;
    for (const interval of trajectory.interiorIntervals) {
      if (
        !Number.isFinite(interval.startSeconds) ||
        !Number.isFinite(interval.endSeconds) ||
        interval.startSeconds < previousEnd ||
        interval.endSeconds <= interval.startSeconds ||
        interval.endSeconds > trajectory.endSeconds ||
        !Array.isArray(interval.evidence) ||
        !interval.evidence.length
      )
        throw new Error('Navigation interior intervals require ordered source times and doorway evidence');
      previousEnd = interval.endSeconds;
    }
  }
  if (trajectory.sourceTraversalIntervals !== undefined) {
    if (!Array.isArray(trajectory.sourceTraversalIntervals))
      throw new Error('Navigation source traversal intervals require an array');
    const types = new Set(['stair', 'elevator', 'ladder', 'rappel', 'climb', 'window']);
    let previousEnd = trajectory.startSeconds;
    for (const interval of trajectory.sourceTraversalIntervals) {
      if (
        !Number.isFinite(interval?.startSeconds) ||
        !Number.isFinite(interval?.endSeconds) ||
        interval.startSeconds < previousEnd ||
        interval.endSeconds <= interval.startSeconds ||
        interval.endSeconds > trajectory.endSeconds ||
        !types.has(interval.traversalType) ||
        (interval.supportHalfWidthMetres !== undefined &&
          (!Number.isFinite(interval.supportHalfWidthMetres) ||
            interval.supportHalfWidthMetres < 0.35 ||
            interval.supportHalfWidthMetres > 4)) ||
        !Array.isArray(interval.evidence) ||
        interval.evidence.length === 0 ||
        interval.evidence.some(
          (item) =>
            typeof item?.asset !== 'string' ||
            !item.asset.trim() ||
            !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') ||
            typeof item.type !== 'string' ||
            !item.type.startsWith('actual-source-'),
        )
      )
        throw new Error(
          'Navigation source traversal interval requires ordered source bounds, a supported type and original-frame evidence',
        );
      previousEnd = interval.endSeconds;
    }
  }
  return { ...trajectory, durationSeconds: duration, distanceMetres: travelled, samples };
}

/** Convert reviewed doorway times to route metres, independent of the player's driving speed. */
export function navigationInteriorDistanceIntervals(trajectory) {
  if (!trajectory?.interiorIntervals?.length) return [];
  const samples = trajectory.samples;
  let total = 0;
  const distances = samples.map((sample, index) => {
    if (index) total += distance(samples[index - 1].position, sample.position);
    return total;
  });
  const atTime = (sourceTime) => {
    const time = sourceTime - trajectory.startSeconds;
    const index = samples.findIndex((sample) => sample.timeSeconds >= time);
    if (index <= 0) return index === 0 ? 0 : total;
    const a = samples[index - 1],
      b = samples[index];
    return (
      distances[index - 1] +
      ((distances[index] - distances[index - 1]) * (time - a.timeSeconds)) / (b.timeSeconds - a.timeSeconds)
    );
  };
  return trajectory.interiorIntervals.map((interval) => ({
    start: atTime(interval.startSeconds),
    end: atTime(interval.endSeconds),
  }));
}

/** Keep a terminal arrival circle beyond the last reviewed doorway crossing. */
export function navigationEndpointRadius(trajectory, maximumRadius) {
  const intervals = trajectory?.interiorIntervals;
  if (!intervals?.length) return maximumRadius;
  const last = intervals.at(-1);
  const crossing = last.endSeconds < trajectory.endSeconds - 1e-6 ? last.endSeconds : last.startSeconds;
  if (crossing <= trajectory.startSeconds + 1e-6) return maximumRadius;
  const samples = trajectory.samples;
  const time = crossing - trajectory.startSeconds;
  const index = samples.findIndex((sample) => sample.timeSeconds >= time);
  if (index <= 0) return maximumRadius;
  const a = samples[index - 1],
    b = samples[index];
  const amount = (time - a.timeSeconds) / (b.timeSeconds - a.timeSeconds);
  const doorway = a.position.map((value, axis) => value + amount * (b.position[axis] - value));
  const endpoint = samples.at(-1).position;
  const clearance = Math.hypot(endpoint[0] - doorway[0], endpoint[2] - doorway[2]);
  // The source must contain measurable travel after crossing to constrain an
  // arrival circle. An endpoint exactly on a doorway has no defined far side.
  return clearance > 1e-6 ? Math.min(maximumRadius, clearance * 0.8) : maximumRadius;
}

/** Keep every measured bend; remove only exactly stationary duplicate spatial checkpoints. */
export function navigationTrajectoryPath(trajectory) {
  const path = [];
  for (const sample of trajectory.samples) {
    if (!path.length || distance(path.at(-1), sample.position) > 1e-9) path.push([...sample.position]);
  }
  if (path.length < 2) throw new Error('Navigation trajectory requires a nonzero path');
  return path;
}
