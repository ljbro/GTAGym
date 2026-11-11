/** Metre-based physics/model fit. Source GLBs are unchanged; normalisation is
 * uniform and the local +Z axis always points towards the bow. */
export type WatercraftKind='yacht'|'zodiac'|'jetski';
export const WATERCRAFT={
 yacht:{file:'motoryacht-35.glb',length:10.7,heading:Math.PI,waterline:.55,halfWidth:1.65,
  driver:[.72,1.65,-1.10],
  boarding:[0,-6.6],platform:[0,-4.7],platformHeight:.575,railHeight:.575,cameraDistance:11},
 // The four-seat source was underscaled at 4.2m: adult hips floated over its
 // tiny chairs. Fit the entire rigid GLB uniformly, including its contacts.
 zodiac:{file:'zodiac.glb',length:6.3,heading:Math.PI,waterline:.36,halfWidth:1.20,
  driver:[.39,.76,-1.20],
  boarding:[-2.05,-.975],platform:[-.18,-.975],platformHeight:.09,railHeight:.48,cameraDistance:8},
 jetski:{file:'seadoo-gti.glb',length:3.4,heading:0,waterline:.13,halfWidth:.65,
  driver:[0,.75,-.2],
  boarding:[-1.15,-.55],platform:[0,-.2],platformHeight:.62,railHeight:.62,cameraDistance:6},
} as const;
