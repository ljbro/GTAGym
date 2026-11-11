import { getNavigationRouteIndex } from './navigation-route-index.js';

const turnIntervals = new WeakMap();

/** A real reversing manoeuvre must not disappear inside overlapping 8m checkpoints. */
export function navigationCheckpointRadius(navigation, index) {
  const radius = navigation.checkpointRadius;
  if (navigation.mode !== 'drive' || navigation.trajectory?.status !== 'measured' || radius <= 2)
    return radius;
  const route = getNavigationRouteIndex(navigation.path);
  if (!turnIntervals.has(navigation)) {
    const intervals = [];
    for (let i = 1; i < navigation.path.length - 1; i++) {
      const along = route.cumulativeDistances[i];
      if (along < 4 || along > route.totalDistance - 4) continue;
      const a = route.pointAt(along - 4).position;
      const b = navigation.path[i];
      const c = route.pointAt(along + 4).position;
      const ax = b[0] - a.x,
        az = b[2] - a.z;
      const bx = c.x - b[0],
        bz = c.z - b[2];
      const before = Math.hypot(ax, az),
        after = Math.hypot(bx, bz);
      // Centimetre radar jitter has no meaningful four-metre approach/departure.
      if (before < 2 || after < 2 || (ax * bx + az * bz) / (before * after) > -0.5) continue;
      const previous = intervals.at(-1);
      if (previous && previous.end >= along - 4) previous.end = along + 4;
      else intervals.push({ start: along - 4, end: along + 4 });
    }
    turnIntervals.set(navigation, intervals);
  }
  const intervals = turnIntervals.get(navigation);
  const along = route.cumulativeDistances[index];
  let low = 0,
    high = intervals.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (intervals[middle].end < along) low = middle + 1;
    else high = middle;
  }
  return intervals[low]?.start <= along ? 2 : radius;
}
