/** Clearance queries are deterministic; eviction affects cost, never geometry.
 * Bound batch-wide caches rather than retaining millions of sampled positions. */
export class GenerationCache<K,V> extends Map<K,V>{
 constructor(readonly capacity=200000){super();if(!Number.isInteger(capacity)||capacity<1)throw Error('Invalid generation cache capacity');}
 override set(key:K,value:V):this{
  if(!this.has(key)&&this.size>=this.capacity)this.clear();
  return super.set(key,value);
 }
}
