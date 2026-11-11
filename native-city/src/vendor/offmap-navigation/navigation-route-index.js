const routeIndexes = new WeakMap();
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function coordinates(value, label) {
  const point = Array.isArray(value) ? value : [value?.x, value?.y, value?.z];
  if (point.length !== 3 || !point.every(Number.isFinite))
    throw new TypeError(`${label} requires three finite coordinates`);
  return [point[0], point[1], point[2]];
}

/** Return the first index satisfying a monotone predicate, or length. */
function lowerBound(length, predicate) {
  let low = 0,
    high = length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (predicate(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/**
 * An immutable 3D arc-length snapshot of a route. Duplicate spatial samples keep
 * their original indexes and cumulative distances, but create no zero-length
 * division. Sampling is O(log n); projection is O(log n + window segments).
 */
export class NavigationRouteIndex {
  #segments;

  constructor(path) {
    if (!Array.isArray(path) || path.length === 0) throw new TypeError('A route requires at least one point');
    this.points = Object.freeze(path.map((point) => Object.freeze(coordinates(point, 'Route point'))));
    const cumulative = [0];
    const segments = [];
    let total = 0;
    for (let index = 0; index < this.points.length - 1; index++) {
      const from = this.points[index],
        to = this.points[index + 1];
      const delta = to.map((value, axis) => value - from[axis]);
      const span = Math.hypot(...delta);
      if (!Number.isFinite(span) || !Number.isFinite(total + span))
        throw new RangeError('Route arc length must be finite');
      if (span > 0)
        segments.push({
          index,
          from,
          delta,
          span,
          start: total,
          end: total + span,
          yaw: delta[0] === 0 && delta[2] === 0 ? 0 : Math.atan2(-delta[0], -delta[2]),
        });
      total += span;
      cumulative.push(total);
    }
    this.#segments = segments;
    this.totalDistance = total;
    this.cumulativeDistances = Object.freeze(cumulative);
  }

  #sample(segment, along) {
    const fraction = (along - segment.start) / segment.span;
    const [x, y, z] = segment.from.map((value, axis) => value + segment.delta[axis] * fraction);
    return { position: { x, y, z }, yaw: segment.yaw, along, segmentIndex: segment.index, fraction };
  }

  #stationary() {
    const [x, y, z] = this.points[0];
    return { position: { x, y, z }, yaw: 0, along: 0, segmentIndex: null, fraction: 0 };
  }

  /**
   * Negative distance extends the first moving segment backwards, matching an
   * escape pursuer starting behind the spawn. Beyond the end stays at the end.
   * At a shared vertex, use the incoming segment and its original heading.
   */
  pointAt(distance = 0) {
    if (!Number.isFinite(distance)) throw new TypeError('Route distance must be finite');
    if (!this.#segments.length) return this.#stationary();
    const along = Math.min(distance, this.totalDistance);
    const index = lowerBound(this.#segments.length, (index) => this.#segments[index].end >= along);
    return this.#sample(this.#segments[index], along);
  }

  /**
   * Project only onto the specified arc-length window. Bounds are inclusive and
   * clamped to the route, including partially intersecting segments. `lateral`
   * is full 3D distance, so an overpass is distinct from the street below it.
   * Use a window around previous progress for loops; an unbounded projection
   * cannot distinguish different visits to the same spatial point. Equal-distance
   * candidates choose the earlier arc position deterministically.
   */
  project(position, { minDistance = 0, maxDistance = this.totalDistance, preferredSegmentIndex } = {}) {
    const point = coordinates(position, 'Projection point');
    if (
      typeof minDistance !== 'number' ||
      typeof maxDistance !== 'number' ||
      Number.isNaN(minDistance) ||
      Number.isNaN(maxDistance) ||
      minDistance > maxDistance
    )
      throw new RangeError('Projection window requires ordered numeric distances');
    const minimum = clamp(minDistance, 0, this.totalDistance);
    const maximum = clamp(maxDistance, 0, this.totalDistance);
    if (!this.#segments.length) {
      const sample = this.#stationary();
      return { ...sample, lateral: Math.hypot(...point.map((value, axis) => value - this.points[0][axis])) };
    }
    const first = lowerBound(this.#segments.length, (index) => this.#segments[index].end >= minimum);
    const stop = lowerBound(this.#segments.length, (index) => this.#segments[index].start > maximum);
    let nearest;
    for (let index = first; index < stop; index++) {
      const segment = this.#segments[index];
      const offset = point.reduce(
        (sum, value, axis) => sum + (value - segment.from[axis]) * (segment.delta[axis] / segment.span),
        0,
      );
      const along = clamp(
        segment.start + offset,
        Math.max(minimum, segment.start),
        Math.min(maximum, segment.end),
      );
      const sample = this.#sample(segment, along);
      const lateral = Math.hypot(
        point[0] - sample.position.x,
        point[1] - sample.position.y,
        point[2] - sample.position.z,
      );
      const preferredTie =
        nearest &&
        Number.isInteger(preferredSegmentIndex) &&
        Math.abs(lateral - nearest.lateral) < 1e-8 &&
        Math.abs(sample.segmentIndex - preferredSegmentIndex) <
          Math.abs(nearest.segmentIndex - preferredSegmentIndex);
      if (!nearest || lateral < nearest.lateral - 1e-8 || preferredTie) nearest = { ...sample, lateral };
    }
    return nearest;
  }
}

/** Task paths are immutable: replace the array, or explicitly construct a new index after editing it. */
export function getNavigationRouteIndex(path) {
  if (!routeIndexes.has(path)) routeIndexes.set(path, new NavigationRouteIndex(path));
  return routeIndexes.get(path);
}
