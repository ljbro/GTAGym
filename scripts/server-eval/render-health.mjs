import {createRequire} from 'node:module';
const sharp=createRequire(import.meta.url)('sharp');

/** Detect the known green compositor spill, not green scenery. Reference is a
 * synchronous readback of the frozen 3D canvas. Ignore the legitimate HUD box.
 * Requiring several mostly-corrupt tiles avoids isolated AA/JPEG differences. */
export async function inspectMinimapSpill(image,{reference,region,map,allColors=false,exclusions=[]}){
 const options={resolveWithObject:true};
 const shot=await sharp(image).extract(region).removeAlpha().raw().toBuffer(options);
 const base=await sharp(reference).removeAlpha().raw().toBuffer(options);
 if(base.info.width!==region.width||base.info.height!==region.height)throw Error('Render health reference size mismatch');
 let badTiles=0,badPixels=0,eligiblePixels=0;
 const tile=24,margin=8;
 for(let by=0;by+tile<=region.height;by+=tile)for(let bx=0;bx+tile<=region.width;bx+=tile){
  let eligible=0,bad=0;
  for(let y=by;y<by+tile;y++)for(let x=bx;x<bx+tile;x++){
   const sx=x+region.left,sy=y+region.top;
   if(sx>=map.x-margin&&sx<=map.x+map.width+margin&&sy>=map.y-margin&&sy<=map.y+map.height+margin)continue;
   if(exclusions.some(r=>sx>=r.x-margin&&sx<=r.x+r.width+margin&&sy>=r.y-margin&&sy<=r.y+r.height+margin))continue;
   const p=(y*region.width+x)*3;
   const dr=shot.data[p]-base.data[p],dg=shot.data[p+1]-base.data[p+1],db=shot.data[p+2]-base.data[p+2];
   eligible++;
   const delta=Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db));
   if(allColors?delta>30:2*dg-dr-db>18&&delta>12)bad++;
  }
  eligiblePixels+=eligible;badPixels+=bad;
  if(eligible>=tile*tile*.8&&bad/eligible>=.65)badTiles++;
 }
 return {healthy:badTiles<3||badPixels<1200,kind:allColors?'minimap-composite-mismatch':'minimap-green-spill',badTiles,badPixels,eligiblePixels,region,map,exclusions};
}
