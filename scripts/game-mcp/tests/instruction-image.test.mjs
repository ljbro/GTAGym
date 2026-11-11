import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {renderInstructionImage,initialInstructionOverlay,INSTRUCTION_PRESENTATION} from '../instruction-image.mjs';
import {harnessRules} from '../rules.mjs';

const sharp=createRequire(import.meta.url)('sharp');
const image=await sharp({create:{width:1280,height:720,channels:3,background:'#427b93'}}).png().toBuffer();

test('initial objective uses a black rectangular panel, white text and unchanged scene elsewhere',async()=>{
 const output=await renderInstructionImage(image,{instruction:'Drive the van to the garage.',mimeType:'image/png'});
 const info=await sharp(output).metadata();assert.equal(info.width,1280);assert.equal(info.height,720);assert.equal(info.format,'png');
 const pixel=async(input,left,top)=>sharp(input).removeAlpha().extract({left,top,width:1,height:1}).raw().toBuffer();
 assert.equal(INSTRUCTION_PRESENTATION.background,'#000000');
 assert.equal(INSTRUCTION_PRESENTATION.style,'gta-help-black-panel-v3');
 for(const [x,y] of [[0,0],[10,60],[20,11],[400,100],[1100,30],[50,600],[640,360]])assert.deepEqual(await pixel(output,x,y),await pixel(image,x,y));
 // The square corner and empty padding must be dark too, not just glyphs.
 for(const [x,y] of [[20,12],[21,13],[25,17]]){
  const rgba=await pixel(output,x,y);assert(rgba.every(v=>v<30),'black panel covers the padding');
 }
 const strip=await sharp(output).removeAlpha().extract({left:20,top:20,width:600,height:100}).raw().toBuffer();
 const original=await sharp(image).removeAlpha().extract({left:20,top:20,width:600,height:100}).raw().toBuffer();
 let changed=0,white=0,black=0;
 for(let i=0;i<strip.length;i+=3){
  if(strip[i]!==original[i]||strip[i+1]!==original[i+1]||strip[i+2]!==original[i+2])changed++;
  if(strip[i]>240&&strip[i+1]>240&&strip[i+2]>240)white++;
  if(strip[i]<30&&strip[i+1]<30&&strip[i+2]<30)black++;
 }
 assert(changed>4000&&changed<25000,'compact panel must not darken the whole image');
 assert(white>100,'white task text must be visible');assert(black>1000,'black panel must be visible');
 assert(output.length>image.length);assert.deepEqual(await renderInstructionImage(image,{instruction:'Drive the van to the garage.',mimeType:'image/png'}),output);
});
test('black panel keeps white text readable on white and black scenery',async()=>{
 for(const background of ['white','black']){
  const scene=await sharp({create:{width:1280,height:720,channels:3,background}}).png().toBuffer();
  const output=await renderInstructionImage(scene,{instruction:'Walk upstairs to the vault.',mimeType:'image/png'});
  const stats=await sharp(output).extract({left:20,top:20,width:600,height:100}).stats();
  assert(stats.channels.slice(0,3).every(c=>c.min<45&&c.max>245));
 }
});
test('full multilingual instructions, markup characters, long words and newlines are safe',async()=>{
 for(const instruction of ["Enter the bank, Find the stairs and go upstairs. \nIn front of the vault, press E.",'Find the person wearing <red> & "black"; do not shoot the other person.',
  'Reach the garage. '.repeat(80),'x'.repeat(200)]){
  const output=await renderInstructionImage(image,{instruction,mimeType:'image/jpeg'});
  const info=await sharp(output).metadata();assert.equal(info.format,'jpeg');assert.equal(info.width,1280);assert.equal(info.height,720);
 }
});
test('only the initial observation is changed; no-op rounds do not repeat the task overlay',async()=>{
 const transform=initialInstructionOverlay('Follow the blue car.');
 assert.notDeepEqual(await transform(image,{round:1,mimeType:'image/png'}),image);
 for(const round of [2,11,20,101])assert.equal(await transform(image,{round,mimeType:'image/png'}),image);
});
test('invalid or unrenderably long objectives fail explicitly instead of silently clipping',async()=>{
 for(const instruction of ['', ' ',null,'a\n'.repeat(2000)])await assert.rejects(renderInstructionImage(image,{instruction,mimeType:'image/png'}));
 const wrong=await sharp({create:{width:640,height:360,channels:3,background:'black'}}).png().toBuffer();
 await assert.rejects(renderInstructionImage(wrong,{instruction:'Go.'}),/1280x720/);
});
test('harness rules preserve environment knowledge but omit fixed history and bare-JSON chat requirements',async()=>{
 for(const language of ['en','zh']){
  const file=new URL(`../../server-eval/system-prompt${language==='en'?'.en':''}.md`,import.meta.url);
  const original=await fs.readFile(file,'utf8'),rules=harnessRules(original,{language});
  assert(!rules.includes('at most 10 screenshots'));assert(!rules.includes("Contains at most 10 sheets"));
  assert(!rules.includes('Output nothing other than JSON'));assert(!rules.includes("Do not output anything except JSON content other than"));
  assert(rules.includes('game_step.action'));assert(rules.includes('Numpad5'));assert(rules.includes('mouse.buttons'));
  assert.equal(await fs.readFile(file,'utf8'),original,'source Markdown must not be edited');
 }
});
