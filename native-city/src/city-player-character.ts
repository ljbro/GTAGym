/** Player-only replacement; cafe staff retain their independently configured assets. */
export const PLAYER_CHARACTER={
 id:'franklin' as const,name:'Franklin',file:'franklin.glb',
 displayHeight:1.78,sourceHeight:1.933,bytes:2198232,triangles:20897,
 // Play the supplied cycles at their native rate at normal walking/running speed.
 gait:{walk:{cycleSeconds:1,authoredSpeed:1.6},run:{cycleSeconds:17/24,authoredSpeed:4.2}},
};
export const PLAYER_ASSET_BASE='/characters/offmapbench';
export const PLAYER_CREDIT="Franklin · Rockstar North / Vados · OffMapBench Animation Adaptation";
