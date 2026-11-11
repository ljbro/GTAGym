/** Avoid invalidating every reflection shader for an unchanged PBR setting.
 * The scene and actual material values remain identical. Self-contained for
 * serialization into the trusted browser; not exposed to the policy. */
export function installRealtimeMaterials(){
 const world=window.__SHENCHENGJI_CITY__.world,scene=world.scene,seen=new WeakSet();
 if(world.__evalMaterialDiagnostics)return world.__evalMaterialDiagnostics;
 const stats={version:'unchanged-reflection-setters-v1',materials:0,skipped:0,changed:0};
 const install=material=>{
  if(seen.has(material))return;seen.add(material);let guarded=false;
  for(const name of ['realTimeFiltering','realTimeFilteringQuality']){
   let owner=material,descriptor;
   while(owner&&!(descriptor=Object.getOwnPropertyDescriptor(owner,name)))owner=Object.getPrototypeOf(owner);
   if(!descriptor?.get||!descriptor?.set||owner===material&&!descriptor.configurable)continue;
   Object.defineProperty(material,name,{configurable:true,enumerable:descriptor.enumerable,
    get(){return descriptor.get.call(this);},
    set(value){if(Object.is(descriptor.get.call(this),value)){stats.skipped++;return;}
     stats.changed++;descriptor.set.call(this,value);}});
   guarded=true;
  }
  if(guarded)stats.materials++;
 };
 for(const material of scene.materials)install(material);
 scene.onNewMaterialAddedObservable.add(install);
 return world.__evalMaterialDiagnostics=stats;
}
