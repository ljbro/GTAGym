/** Adapt the shared English rules to image-only MCP observations. */
import {durationPrompt} from '../server-eval/duration-ablation.mjs';
export function harnessRules(system,{language='en',maxSeconds=1}={}){
 if(!['en','zh'].includes(language))throw Error('Unsupported rules locale');
 // Older locale selectors remain aliases; all bundled release text is English.
 if(maxSeconds!==1)system=durationPrompt(system,maxSeconds);
 const objective='The task instruction appears only in the top-left of the initial screenshot supplied by the evaluator in the initial user message. Subsequent action results do not repeat it.';
 const metadataSentence='No task receives additional round-number or elapsed-time metadata.';
 const [introduction,...sections]=system.split(/(?=^## )/m);
 const intro=introduction.includes(metadataSentence)?introduction.replace(metadataSentence,objective):introduction.trimEnd()+' '+objective+'\n\n';
 const content=intro+sections.filter(section=>!/^## History\r?\n/i.test(section)).join('');
 return content.replace(/^Control the game through the unified action interface\.[^\n]*$/m,
  'Control the game through the unified action interface. Submit the complete JSON object as `game_step.action`, together with a unique `request_id`; reuse the same `request_id` and identical action when retrying an uncertain call. The action object may contain only the top-level fields `keys`, `mouse`, and `wait_seconds`. `keys` is required; use `[]` when there is no keyboard input. `mouse` is optional; `{}` means no mouse operation.');
}
