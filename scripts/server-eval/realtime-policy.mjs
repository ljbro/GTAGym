export function realtimeRoundBudget(originalSeconds,fallback=300){
 if(!Number.isFinite(originalSeconds)||originalSeconds<0)throw Error('Invalid original task duration');
 const rounds=originalSeconds>0?Math.ceil(originalSeconds/1):fallback;
 if(!Number.isInteger(rounds)||rounds<1||rounds>100000)throw Error('Invalid derived round budget');
 return {originalDurationSeconds:originalSeconds,referenceActionSeconds:1,maxRounds:rounds,source:originalSeconds>0?'original-task-duration':'original-300-round-fallback'};
}
export function realtimeRules(rules){
 return rules.replace('Keys held through the end of a turn retain their state. Including the same key in the next turn continues the hold.',
  'Each keyboard key is released when its specified hold duration expires. The game continues running while you reason between observations; vehicles may coast and NPCs keep moving.')
  .replace('Keyboard holds then start together or continue from the previous turn.','Keyboard holds then start together.');
}
export function realtimeInstructions(instructions){
 // All existing countdown objectives are deliberately preserved as timed exceptions.
 return {...instructions};
}
