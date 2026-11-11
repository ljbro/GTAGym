import taskCategories from '../../configs/task-categories.json' with {type:'json'};
export type NativeTaskChoice={id:string;title:string;category:string};
const CATEGORY_LABELS:Record<string,string>=Object.fromEntries(taskCategories.categories.map(row=>[row.category,row.name]));

/** Shared by the task menu and terminal dialog; never modifies the catalog. */
export function createNativeTaskPicker(category:HTMLSelectElement,picker:HTMLSelectElement,tasks:readonly NativeTaskChoice[],changed:()=>void=()=>{}){
 category.replaceChildren(new Option(`All Categories (${tasks.length})`,'all'));
 const counts=new Map<string,number>();
 for(const task of tasks)counts.set(task.category,(counts.get(task.category)??0)+1);
 for(const key of [...Object.keys(CATEGORY_LABELS),...counts.keys()].filter((key,i,keys)=>keys.indexOf(key)===i)){
  const count=counts.get(key);if(count)category.add(new Option(`${CATEGORY_LABELS[key]??key} (${count})`,key));
 }
 function refresh(preferred=picker.value){
  const visible=tasks.filter(task=>category.value==='all'||task.category===category.value);
  picker.replaceChildren(...visible.map(task=>new Option(`${task.id.toUpperCase()} · ${task.title}`,task.id)));
  if(visible.some(task=>task.id===preferred))picker.value=preferred;
 }
 category.onchange=()=>{refresh();changed();};
 refresh();
 return {
  select(id:string){const task=tasks.find(task=>task.id===id);if(!task)return;
   if(category.value!=='all'&&category.value!==task.category)category.value='all';
   refresh(id);
  },
 };
}
