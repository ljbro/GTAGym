// Validate full coverage against the instruction catalog, not a historical count.
export function selectFullTasks(plan, expectedIds) {
 if(plan.scope!=='all'||!Array.isArray(plan.categories)||!plan.categories.length)throw Error('Expected a full task plan');
 if(!Array.isArray(expectedIds)||!expectedIds.length||new Set(expectedIds).size!==expectedIds.length)throw Error('Invalid expected task catalog');
 const categories=new Set();
 for(const c of plan.categories){
  if(!c.category||categories.has(c.category)||!Array.isArray(c.tasks)||c.available!==c.tasks.length)throw Error('Invalid category selection');
  categories.add(c.category);
 }
 const all=plan.categories.flatMap(c=>c.tasks),actual=new Set(all),expected=new Set(expectedIds);
 if(actual.size!==all.length)throw Error('Duplicate task in full plan');
 const missing=expectedIds.filter(id=>!actual.has(id)),unknown=all.filter(id=>!expected.has(id));
 if(missing.length||unknown.length)throw Error(`Full task coverage mismatch: missing=${missing.join(',')}; unknown=${unknown.join(',')}`);
 const air=plan.categories.find(c=>c.category==='air')?.tasks??[],airSet=new Set(air);
 const interleaved=Array.from({length:Math.max(...plan.categories.map(c=>c.tasks.length))},(_,i)=>plan.categories.flatMap(c=>c.tasks[i]?[c.tasks[i]]:[])).flat();
 return [...air,...interleaved.filter(id=>!airSet.has(id))];
}
