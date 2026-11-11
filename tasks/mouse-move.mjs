/** Model-facing pixel displacement: right/up positive; never absolute pixels. */
export function validateMouseMove(move){
 if(!move||typeof move!=='object'||Array.isArray(move)||Object.keys(move).some(k=>!['dx','dy'].includes(k))||![move.dx,move.dy].every(Number.isFinite))throw Error('mouse.move requires finite numeric dx/dy (positive right/up); move_to and x/y are unsupported');
 if(Math.abs(move.dx)>640||Math.abs(move.dy)>360)throw Error('mouse.move outside displacement range: require -640 <= dx <= 640 and -360 <= dy <= 360');
 return {dx:move.dx,dy:move.dy};
}
