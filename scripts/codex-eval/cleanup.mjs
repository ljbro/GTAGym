/** Cleanup must never prevent committing the original failure and usage.
 * Return secondary errors; the caller decides whether a previously successful
 * run must now be marked as an infrastructure failure. */
export async function cleanupHarness({gateway,bridge,session,workspaceCleanup}){
 const errors=[];
 for(const [stage,close] of [
  ['gateway',()=>gateway?.close()],
  ['bridge',()=>bridge?.close()],
  ['game-session',()=>session.close('host_shutdown')],
  ['workspace',()=>workspaceCleanup?.()],
 ]){
  try{await close();}catch(error){errors.push({stage,error});}
 }
 return errors;
}
