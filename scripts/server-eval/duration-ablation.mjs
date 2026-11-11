import {createActionAdapter} from './actions.mjs';

export const DURATION_VARIANTS=Object.freeze([
 Object.freeze({id:'duration-0.5s-rounds-600',maxSeconds:0.5,maxRounds:600}),
 Object.freeze({id:'duration-2s-rounds-300',maxSeconds:2,maxRounds:300}),
]);

/** Deliberately narrow prompt edits: preserve every task/control instruction. */
export function durationPrompt(source,maxSeconds){
 createActionAdapter({maxSeconds});
 const replacements=[
  ['at most one, measured in game seconds',`at most ${maxSeconds}, measured in game seconds`],
  ['Durations above one second are rejected.',`Durations above ${maxSeconds} seconds are rejected.`],
  ['at most one, allowed only with `keys:[]`',`at most ${maxSeconds}, allowed only with \`keys:[]\``],
  ['to run for one second,',`to run for ${maxSeconds} seconds,`],
  ['"duration_seconds": 1',`"duration_seconds": ${maxSeconds}`],
 ];
 let text=source;
 for(const [before,after] of replacements){
  if(!text.includes(before))throw Error('Prompt template changed; review duration edit: '+before);
  text=text.replaceAll(before,after);
 }
 // Validate every complete JSON example with the same parser used in the run.
 const adapter=createActionAdapter({maxSeconds});
 for(const match of text.matchAll(/```json\s*\n([\s\S]*?)\n```/g))adapter.parse(match[1]);
 return text;
}
