/** c07-n05's native roof includes a 0.40 m cap above the OSM wall height.
 * Verified against buildings.glb triangles at spawn, approach and roof edge
 * (5.40355 m after GLB quantization, versus 5 m in the route metadata).
 * Keep a small quantization clearance; move the ladder/landing with
 * the support surface, never offset only the rendered character.
 */
export function nativeTaskRoofHeight(id:string,buildingHeight:number,groundY:number){
 return groundY+buildingHeight+(id==='c07-n05'?.425:.08);
}
