import {createRequire} from 'node:module';

// libvips/Pango rasterises on the server CPU; never draw this in WebGL/Canvas.
const sharp=createRequire(import.meta.url)('sharp');
export const INSTRUCTION_PRESENTATION={mode:'initial-image',position:'top-left',style:'gta-help-black-panel-v3',
 width:1280,height:720,margin:20,marginTop:12,padding:10,fontFamily:'Nimbus Sans L',fontSize:20,minFontSize:18,
 maxTextWidth:400,background:'#000000',backgroundOpacity:0.85};
const escapeMarkup=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

/** Preserve the complete objective, including CJK/line breaks, without cropping the scene. */
export async function renderInstructionImage(image,{instruction,mimeType='image/jpeg'}={}){
 if(typeof instruction!=='string'||!instruction.trim())throw Error('An initial-image task instruction is required');
 if(!['image/jpeg','image/png'].includes(mimeType))throw Error('Unsupported instruction image MIME type');
 const p=INSTRUCTION_PRESENTATION,metadata=await sharp(image).metadata();
 if(metadata.width!==p.width||metadata.height!==p.height)throw Error('Harness observations must be 1280x720');
 const text=escapeMarkup(instruction.replace(/\r\n?/g,'\n').trim());
 let body,textWidth=p.maxTextWidth;
 const rasterise=fontSize=>sharp({text:{text:`<span foreground="white">${text}</span>`,
  font:`${p.fontFamily} ${fontSize}`,width:textWidth,wrap:'word-char',spacing:5,rgba:true,dpi:72}}).png().toBuffer({resolveWithObject:true});
 for(const size of [p.fontSize,19,p.minFontSize]){
  body=await rasterise(size);
  if(body.info.height<=250)break;
 }
 if(body.info.height>250){textWidth=p.width-2*p.margin-2*p.padding;body=await rasterise(p.minFontSize);}
 const width=body.info.width+2*p.padding,height=body.info.height+2*p.padding;
 if(height>p.height-p.marginTop-p.margin)throw Error('Task instruction is too long to display completely in the initial image');
 // Prologue 74s / 215s: compact, square-cornered black help panel with
 // white text. No title, border, gradient, or darkening outside the panel.
 const panel=await sharp({create:{width,height,channels:4,
  background:{r:0,g:0,b:0,alpha:p.backgroundOpacity}}})
  .composite([{input:body.data,left:p.padding,top:p.padding}]).png().toBuffer();
 const output=sharp(image).composite([{input:panel,left:p.margin,top:p.marginTop}]);
 return mimeType==='image/png'?output.png().toBuffer():output.jpeg({quality:95,chromaSubsampling:'4:4:4'}).toBuffer();
}

export function initialInstructionOverlay(instruction){
 return async(image,{round,mimeType})=>round===1?renderInstructionImage(image,{instruction,mimeType}):image;
}
