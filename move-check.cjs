const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync('apps-script')?'apps-script':'.',ctx=vm.createContext({});
for(const f of ['Config.gs','Inventory.gs','Move.gs'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx);
let held=false,calls,invalidations,failBatch,sheets,indexCache;
const blank=width=>Array(width).fill('');
const shown=v=>v===true?'TRUE':String(v??'');
function makeSheet(id,name,headers,rows){
  const data=[headers,...rows].map(r=>r.slice());
  return {data,getSheetId:()=>id,getName:()=>name,getLastColumn:()=>headers.length,getLastRow:()=>data.length,getMaxRows:()=>100,getMaxColumns:()=>30,
    getDataRange(){return this.getRange(1,1,data.length,headers.length);},
    getRange(r,c,h=1,w=1){return {getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>data[r+i-1]?.[c+j-1]??'')),getDisplayValues(){return this.getValues().map(row=>row.map(shown));},getNotes:()=>Array.from({length:h},()=>blank(w)),getFormulas:()=>Array.from({length:h},()=>blank(w))};}
  };
}
const carpetHeaders=['Name of carpet','Location','Total on hand','confirmed','Time stamp','','Inventory ID'];
const tileHeaders=['Name of Tile','Location','Boxes','SF/Box','Total on hand','R-L','Inventory ID'];
let ss;
function reset(category='carpet'){
  held=false;calls=[];invalidations=[];failBatch=false;indexCache=null;
  const headers=category==='carpet'?carpetHeaders:tileHeaders;
  const row=category==='carpet'?['TEST','A','E-95',true,45678,'Keep note','ID']:['TEST','C',10,12.5,125,'Left','ID'];
  sheets=[makeSheet(1,'Bay 1',headers,[row]),makeSheet(2,'Bay 2',headers,[['DO NOT OVERWRITE','D',1],blank(headers.length)]),makeSheet(3,'App History',['Timestamp'],[])];
  ss={getId:()=> 'TEST-COPY',getSheetByName:name=>sheets.find(s=>s.getName()===name),getSheets:()=>sheets};
}
ctx.requireSession_=(token)=>{if(token==='view')throw Error('No write permission');return {name:'Tester',email:'test@example.invalid'};};
ctx.LockService={getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;},releaseLock(){held=false;}})};
ctx.CacheService={getScriptCache:()=>({get:()=>indexCache,put:(key,value)=>{indexCache=value;},remove:key=>invalidations.push(key)})};
ctx.Utilities={formatDate:()=> '2026-10-29 14:00:00'};ctx.Session={getScriptTimeZone:()=> 'America/New_York'};
ctx.getSpreadsheet_=()=>ss;
ctx.findRecordById_=(category,id)=>id==='missing'?null:{sheet:sheets[0],rowNumber:2,map:ctx.makeHeaderMap_(sheets[0].data[0]),row:sheets[0].data[1].slice(),displayRow:sheets[0].data[1].map(shown)};
ctx.Sheets={Spreadsheets:{batchUpdate(body,id){
  assert.equal(id,'TEST-COPY');assert.equal(held,true);calls.push(body);
  // Model an all-or-nothing Google request: rejection must leave both tabs untouched.
  if(failBatch)throw Error('Batch rejected');
  for(const r of body.requests){
    if(r.cutPaste){const x=r.cutPaste,src=sheets.find(s=>s.getSheetId()===x.source.sheetId),dest=sheets.find(s=>s.getSheetId()===x.destination.sheetId);dest.data[x.destination.rowIndex]??=[];dest.data[x.destination.rowIndex][x.destination.columnIndex]=src.data[x.source.startRowIndex][x.source.startColumnIndex];src.data[x.source.startRowIndex][x.source.startColumnIndex]='';}
    if(r.updateCells){const x=r.updateCells,s=sheets.find(s=>s.getSheetId()===x.range.sheetId);s.data[x.range.startRowIndex]??=[];s.data[x.range.startRowIndex][x.range.startColumnIndex]=x.rows[0].values[0].userEnteredValue.stringValue;}
  }
}}};
const payload=(extra={})=>({category:'carpet',inventoryId:'ID',sheetName:'Bay 2',location:'B',bay:'Keep note',expected:{sourceSheet:'Bay 1',location:'A',bay:'Keep note'},...extra});
reset();const result=ctx.moveInventory('employee',payload());
assert.equal(calls.length,1);assert.equal(result.item.id,'ID');assert.equal(result.item.quantityDisplay,'E-95');assert.equal(result.item.sourceSheet,'Bay 2');assert.equal(result.item.location,'B');
assert.deepEqual(sheets[0].data[1],blank(7));assert.deepEqual(sheets[1].data[1],['DO NOT OVERWRITE','D',1]);assert.deepEqual(sheets[1].data[2],['TEST','B','E-95',true,45678,'Keep note','ID']);
assert.equal(calls[0].requests.at(-1).appendCells.rows[0].values[4].userEnteredValue.stringValue,'Moved');assert.ok(invalidations.includes('inventory:carpet'));assert.equal(JSON.parse(indexCache).index.ID.rowNumber,3);assert.equal(JSON.parse(indexCache).index.ID.sheetName,'Bay 2');assert.equal(held,false);
reset();ctx.moveInventory('employee',payload({sheetName:'Bay 1',location:'D'}));assert.equal(calls[0].requests.some(r=>r.cutPaste),false);assert.equal(sheets[0].data[1][1],'D');assert.equal(sheets[0].data[1][2],'E-95');assert.equal(sheets[0].data[1][4],45678);
reset();const noChange=ctx.moveInventory('employee',payload({sheetName:'Bay 1',location:'A'}));assert.equal(noChange.unchanged,true);assert.equal(calls.length,0);
reset();failBatch=true;const snapshot=JSON.stringify(sheets.map(s=>s.data));assert.throws(()=>ctx.moveInventory('employee',payload()),/Batch rejected/);assert.equal(JSON.stringify(sheets.map(s=>s.data)),snapshot);assert.equal(held,false);
reset();assert.throws(()=>ctx.moveInventory('view',payload()),/permission/);assert.throws(()=>ctx.moveInventory('employee',payload({expected:{sourceSheet:'Bay 1',location:'OLD'}})),/moved or edited/);assert.throws(()=>ctx.moveInventory('employee',payload({sheetName:'App History'})),/Choose an inventory bay/);assert.equal(calls.length,0);assert.equal(held,false);
reset('tile');const tile=ctx.moveInventory('employee',payload({category:'tile',bay:'',expected:{sourceSheet:'Bay 1',location:'C',bay:''}}));assert.equal(tile.item.boxes,10);assert.equal(tile.item.totalSf,125);assert.deepEqual(sheets[1].data[2],['TEST','B',10,12.5,125,'Left','ID']);
// Differing column order and unnamed carpet notes map to the correct fields.
const mapped=ctx.moveColumnMap_(carpetHeaders,['Inventory ID','Location','Name of carpet','Total on hand','Bay Notes','Time stamp','Confirmed'],'carpet',['TEST','A','E-95',true,45678,'note','ID'],blank(7),blank(7));
assert.deepEqual(Array.from(mapped),[2,1,3,6,5,4,0]);
assert.throws(()=>ctx.moveColumnMap_(['Name of carpet','Unknown'],['Name of carpet'],'carpet',['TEST','keep me'],['',''],['','']),/no matching column/);
// A blank product cell does not make a row with other values safe to overwrite.
const reserved=makeSheet(9,'Bay 9',carpetHeaders,[['','',45],['','',false],blank(7)]);assert.equal(ctx.emptyMoveRow_(reserved),3);
console.log('Move checks passed: one atomic move/history batch, stable IDs/E-values, tile SF, source clearing, occupied-row safety, location-only edit, no-op, stale/view rejection, failed-batch safety and reordered columns.');
