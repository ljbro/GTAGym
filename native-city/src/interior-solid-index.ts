import type {InteriorSolid} from './native-interior-layout.ts';

/** Conservative broad phase only. Exact existing predicates still decide every
 * collision. Late imported obstacles append to the shared array and rebuild it. */
export class InteriorSolidIndex{
 private indexedLength=-1;
 private cells=new Map<string,InteriorSolid[]>();
 constructor(private solids:readonly InteriorSolid[],private cellSize=16){}
 private key(x:number,z:number){return x+','+z;}
 private refresh(){
  if(this.indexedLength===this.solids.length)return;
  this.cells.clear();
  for(const s of this.solids){
   const c=Math.abs(Math.cos(s.yaw??0)),r=Math.abs(Math.sin(s.yaw??0));
   const hx=c*(s.w/2+.24)+r*(s.d/2+.24)+1e-7,hz=r*(s.w/2+.24)+c*(s.d/2+.24)+1e-7;
   for(let x=Math.floor((s.x-hx)/this.cellSize);x<=Math.floor((s.x+hx)/this.cellSize);x++)
    for(let z=Math.floor((s.z-hz)/this.cellSize);z<=Math.floor((s.z+hz)/this.cellSize);z++){
     const key=this.key(x,z),cell=this.cells.get(key)??[];cell.push(s);this.cells.set(key,cell);
    }
  }
  this.indexedLength=this.solids.length;
 }
 query(x:number,z:number,radius=0){
  this.refresh();
  if(!radius)return this.cells.get(this.key(Math.floor(x/this.cellSize),Math.floor(z/this.cellSize)))??[];
  const found=new Set<InteriorSolid>();
  for(let a=Math.floor((x-radius)/this.cellSize);a<=Math.floor((x+radius)/this.cellSize);a++)
   for(let b=Math.floor((z-radius)/this.cellSize);b<=Math.floor((z+radius)/this.cellSize);b++)
    for(const solid of this.cells.get(this.key(a,b))??[])found.add(solid);
  return [...found];
 }
}
