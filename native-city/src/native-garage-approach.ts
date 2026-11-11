/** c01-n02 gameplay approach, not a measured extension of the video clip. */
export const GARAGE_APPROACH=[
 [-11,9],[-25,9],[-31,7],[-35,3],[-36,-2],[-33,-6],
 [-28,-8],[-22,-8],[-17,-6.5],[-13,-3],[-10,-1.925],[-6.22,-1.925],[-1.5,-1.925],
];
export const GARAGE_YARD_BOUNDS={minX:-42,maxX:8,minZ:-15,maxZ:15};
// Connected to the garage frontage: cars must go around the far end, not
// straight from the upper spawn lane into the lower garage approach.
export const GARAGE_DIVIDER={name:'garage-courtyard-divider',x:-17.05,z:2.6,w:21.9,d:2.4,h:.7,material:'wall'};
export const GARAGE_YARD_SOLIDS=[GARAGE_DIVIDER,
 {name:'garage-yard-west',x:-41.5,z:0,w:.4,d:29.4,h:.9,material:'wall'},
 {name:'garage-yard-east',x:7.5,z:0,w:.4,d:29.4,h:.9,material:'wall'},
 ...[-14.5,14.5].map(z=>({name:'garage-yard-boundary-'+z,x:-17,z,w:49.4,d:.4,h:.9,material:'wall'})),
];
