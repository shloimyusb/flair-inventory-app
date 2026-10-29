const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync('apps-script')?'apps-script':'.',ctx=vm.createContext({});
for(const name of ['Config.gs','Inventory.gs','Confirmation.gs'])vm.runInContext(fs.readFileSync(root+'/'+name,'utf8'),ctx);
const headers=['Name of carpet','Total on hand','confirmed','Time stamp','Inventory ID'];
let cells,history,locked=false,auditFails=false,missing=false,invalidations=0;
const shown=value=>Object.prototype.toString.call(value)==='[object Date]'?value.toISOString():String(value??'');
const sheet={getName:()=> 'Bay TEST',getLastColumn:()=>headers.length,getRange:(_r,c,_rows,width)=>({getValue:()=>cells[c-1],getFormula:()=>'',setValue:v=>{cells[c-1]=v;},getDisplayValue:()=>shown(cells[c-1]),getDisplayValues:()=>[width?cells.map(shown):[shown(cells[c-1])]]})};
ctx.requireSession_=token=>{if(token==='view')throw Error('No write permission');return {name:'Tester',email:'test@example.invalid'};};
ctx.LockService={getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})};
ctx.CacheService={getScriptCache:()=>({remove:key=>{assert.equal(key,'inventory:carpet');invalidations++;}})};
ctx.findRecordById_=(_category,id)=>id==='missing'?null:{sheet,rowNumber:2,map:ctx.makeHeaderMap_(missing?headers.map(h=>h==='Time stamp'?'Other':h):headers),displayRow:cells.map(shown),row:cells.slice()};
ctx.appendHistory_=(_category,entry)=>{if(auditFails)throw Error('Audit unavailable');history.push(entry);};
function reset(){cells=['TEST ROLL','E-95',false,'2026-01-01','CAR-TEST'];history=[];auditFails=false;missing=false;}
reset();const first=ctx.confirmCarpet('employee','CAR-TEST');assert.equal(first.ok,true);assert.equal(cells[2],true);assert.equal(cells[1],'E-95');assert.equal(first.item.confirmed,'true');assert.ok(Date.parse(first.item.timestamp)>Date.parse('2026-01-01'));assert.equal(history[0].action,'Carpet Confirmed');assert.equal(history[0].email,'test@example.invalid');assert.equal(locked,false);
const oldDate=cells[3];ctx.confirmCarpet('employee','CAR-TEST');assert.ok(+cells[3]>=+oldDate);assert.equal(history.length,2);
reset();auditFails=true;assert.throws(()=>ctx.confirmCarpet('employee','CAR-TEST'),/Audit unavailable/);assert.equal(cells[2],false);assert.equal(cells[3],'2026-01-01');assert.equal(cells[1],'E-95');assert.equal(locked,false);
reset();missing=true;assert.throws(()=>ctx.confirmCarpet('employee','CAR-TEST'),/both a Confirmed/);assert.equal(cells[2],false);assert.equal(cells[3],'2026-01-01');
assert.throws(()=>ctx.confirmCarpet('view','CAR-TEST'),/permission/);assert.throws(()=>ctx.confirmCarpet('employee','missing'),/not found/);assert.equal(locked,false);assert.ok(invalidations>=3);
console.log('Confirmation checks passed: checkbox/date updates, repeat confirmation, unchanged E- quantity, audit history, rollback, missing columns, view-only rejection and lock release.');
