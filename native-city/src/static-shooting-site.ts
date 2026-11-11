export type StaticSite={canvas:HTMLCanvasElement;render:()=>void;screenshot:()=>string;stepGui:(action:unknown)=>unknown;trace:()=>unknown;snapshot:()=>{done:boolean;hit:boolean;reason:string};dispose:()=>void};
export async function loadStaticShootingSite(row:unknown,options:unknown):Promise<StaticSite>{
 const url=new URL('./tasks/runtime.mjs?v=training-v2',document.baseURI).href;
 const {StaticShootingSite}=await import(/* @vite-ignore */ url);
 const site=new StaticShootingSite(row,options);
 try{await site.load();return site;}catch(error){site.dispose();throw error;}
}
