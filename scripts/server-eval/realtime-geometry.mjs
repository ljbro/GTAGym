/** Browser-side broad phases. Every narrow-phase predicate matches the game;
 * no obstacle, road, water boundary or objective is removed or relocated. */
export function installRealtimeGeometry(){
 const w=window.__SHENCHENGJI_CITY__.world,c=w.collision;
 if(w.__evalGeometryIndex)return w.__evalGeometryIndex;
 const cache=new WeakMap();
 const contains=(ring,x,z)=>{
  let index=cache.get(ring);
  if(!index){
   const rows=new Map();let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];minX=Math.min(minX,a[0]);maxX=Math.max(maxX,a[0]);minZ=Math.min(minZ,a[1]);maxZ=Math.max(maxZ,a[1]);
    if(a[1]===b[1])continue;
    for(let row=Math.floor(Math.min(a[1],b[1])/64);row<=Math.floor(Math.max(a[1],b[1])/64);row++){
     const edges=rows.get(row)??[];edges.push([a,b]);rows.set(row,edges);
    }
   }
   index={rows,minX,maxX,minZ,maxZ};cache.set(ring,index);
  }
  if(x<index.minX||x>index.maxX||z<index.minZ||z>index.maxZ)return false;
  let yes=false;
  for(const [a,b]of index.rows.get(Math.floor(z/64))??[])
   if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;
  return yes;
 };
 const distance=(x,z,a,b)=>{
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
 };
 // Warm indexes before starting the realtime clock, including polygon holes.
 for(const polygon of [...c.data.land,...c.data.water.map(p=>p.rings)])for(const ring of polygon)contains(ring,0,0);
 c.blocked=function(x,z,allowWater=false){
  const near=this.nearest(x,z);if(near&&near.d<near.road.width/2-.65)return false;
  for(const ring of this.bCells.get(Math.floor(x/this.size)+','+Math.floor(z/this.size))??[]){
   if(contains(ring,x,z))return true;
   for(let i=1;i<ring.length;i++){
    // Preserve closest()'s arithmetic order at the 1.15 m facade boundary.
    const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dz=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));
    if(Math.hypot(x-(a[0]+dx*t),z-(a[1]+dz*t))<1.15)return true;
   }
  }
  for(const m of this.data.landmarks)if(!m.detailCollision&&m.height>0&&Math.hypot(x-m.x,z-m.z)<(m.id==='civic'?65:m.id==='tencent'?46:24))return true;
  return !allowWater&&(!this.data.land.some(p=>contains(p[0],x,z)&&!p.slice(1).some(r=>contains(r,x,z)))||this.data.water.some(p=>contains(p.rings[0],x,z)&&!p.rings.slice(1).some(r=>contains(r,x,z))));
 };
 const site=w.nativeFootSite;
 // Long imported interiors have a dense ribbon polygon. NPC road clearance
 // calls floorAt() many times even far outside the interior. Preserve the same
 // ray predicate, but reject the exterior and visit only intersecting edges.
 let interiorEdges=0;
 if(site?.long&&Array.isArray(site.ribbon?.ring)&&typeof site.contains==='function'){
  interiorEdges=site.ribbon.ring.length;contains(site.ribbon.ring,0,0);
  const original=site.contains;
  site.contains=function(x,z){return this.long?contains(this.ribbon.ring,x,z):original.call(this,x,z);};
 }
 let railCount=0;
 if(Array.isArray(site?.rails)&&site.layout?.room){
  const cells=new Map(),size=2;
  for(const rail of site.rails){
   const {a,b}=rail;railCount++;
   for(let x=Math.floor((Math.min(a[0],b[0])-.101)/size);x<=Math.floor((Math.max(a[0],b[0])+.101)/size);x++)
    for(let z=Math.floor((Math.min(a[1],b[1])-.101)/size);z<=Math.floor((Math.max(a[1],b[1])+.101)/size);z++){
     const key=x+','+z,rails=cells.get(key)??[];rails.push(rail);cells.set(key,rails);
    }
  }
  site.blocked=function(x,z){
   const r=this.layout.room,dx=x-r.x,dz=z-r.z,cos=Math.cos(r.yaw),sin=Math.sin(r.yaw);
   if(Math.abs(dx*cos-dz*sin)<r.w/2+.08&&Math.abs(dx*sin+dz*cos)<r.d/2+.08)return true;
   return (cells.get(Math.floor(x/size)+','+Math.floor(z/size))??[]).some(({a,b})=>distance(x,z,a,b)<.10);
  };
 }
 return w.__evalGeometryIndex={version:'exact-polygon-ray-stripes-v2',stairRails:railCount,interiorEdges};
}
