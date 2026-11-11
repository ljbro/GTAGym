type LinkedTaskMenu={tasks:readonly {id:string}[];open:(id?:string)=>unknown};

/** Deep links select a task without starting its clock during page loading. */
export function openLinkedTask(search:string,menu:LinkedTaskMenu,notify:(message:string)=>void=()=>{}){
 const values=new URLSearchParams(search).getAll('task');
 if(!values.length)return false;
 const id=values.length===1?values[0]:'';
 if(!/^c\d{2}-n\d{2,3}$/.test(id)||!menu.tasks.some(task=>task.id===id)){
  menu.open();notify('Unknown task link. Select a benchmark task from the menu.');return false;
 }
 menu.open(id);return true;
}
