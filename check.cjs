const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const ctx=vm.createContext({});
const sourceRoot=fs.existsSync('apps-script')?'apps-script':'.';
for(const f of fs.readdirSync(sourceRoot)) {
  const source=fs.readFileSync(sourceRoot+'/'+f,'utf8');
  if(f.endsWith('.gs')) vm.runInContext(source,ctx,{filename:f});
  if(f.endsWith('.html')) for(const m of source.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1],{filename:f});
}
assert.equal(vm.runInContext("parseCarpetQuantity_('E-95').quantity",ctx),95);
assert.equal(vm.runInContext("parseCarpetQuantity_('E-95').estimated",ctx),true);
assert.equal(vm.runInContext("parseCarpetQuantity_('E-11x10').mode",ctx),'dimension');
assert.equal(vm.runInContext("parseCarpetQuantity_('').quantity",ctx),null);
assert.equal(vm.runInContext("rounded_(8 * 12.5,2)",ctx),100);
assert.equal(vm.runInContext('typeof setInventoryUser',ctx),'undefined');
assert.equal(vm.runInContext('typeof initializeInventory',ctx),'undefined');
for(const name of ['setupTestInventory','setupProductionInventory','useCopiedTestInventory'])assert.equal(vm.runInContext('typeof '+name,ctx),'undefined');
assert.throws(()=>vm.runInContext("requireSession_('',true)",ctx),/session has expired/);
ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
for(const name of ['getAppBootstrap','getInventory','getHistory','adjustInventory','addCarpetRoll','confirmCarpet','moveInventory'])assert.throws(()=>ctx[name](''),/session has expired/,name+' must reject missing login before accessing inventory');
console.log('Syntax, estimated quantities, dimension blocking, SF calculation, private setup and missing-session checks passed.');
let cells,history,held=false;
ctx.LockService={getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;},releaseLock(){held=false;}})};
ctx.CacheService={getScriptCache:()=>({remove(){}})};
ctx.requireSession_=(_token,write)=>{if(write && _token==='view')throw Error('No write permission');return {name:'Test',email:'test@example.invalid'};};
ctx.updateTimestamp_=()=>{};
ctx.appendHistory_=(_category,entry)=>{history.push(entry);};
ctx.findRecordById_=(category)=>{
  const headers=category==='carpet'?['Name of carpet','Total on hand']:['Name of Tile','Boxes','SF/Box','Total on hand'];
  return {sheet:{getName:()=> 'TEST',getRange:(_r,c)=>({setValue:v=>{cells[c-1]=v;}})},rowNumber:2,
    map:ctx.makeHeaderMap_(headers),row:cells.slice(),displayRow:cells.map(String)};
};
cells=['TEST','E-95'];history=[];
ctx.adjustInventory('employee',{category:'carpet',inventoryId:'TEST',action:'subtract',amount:20});
assert.equal(cells[1],'E-75');assert.equal(history[0].before,'E-95');assert.equal(history[0].after,'E-75');assert.equal(held,false);
ctx.adjustInventory('employee',{category:'carpet',inventoryId:'TEST',action:'add',amount:10});assert.equal(cells[1],'E-85');
assert.throws(()=>ctx.adjustInventory('employee',{category:'carpet',inventoryId:'TEST',action:'subtract',amount:1000}),/negative/);assert.equal(held,false);assert.equal(cells[1],'E-85');
cells=['TEST',10,12.5,125];history=[];
ctx.adjustInventory('employee',{category:'tile',inventoryId:'TEST',action:'subtract',amount:2});
assert.equal(cells[1],8);assert.equal(cells[3],100);assert.equal(history.length,1);
assert.throws(()=>ctx.adjustInventory('employee',{category:'tile',inventoryId:'TEST',action:'add',amount:0.5}),/whole number/);
assert.throws(()=>ctx.adjustInventory('view',{category:'tile',action:'add',amount:1}),/permission/);assert.equal(held,false);
console.log('Isolated adjustment tests passed: E- preservation, tile box/SF writes, history, negative/fractional rejection, view-only rejection, lock release.');

