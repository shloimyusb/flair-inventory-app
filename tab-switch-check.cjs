const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync('apps-script')?'apps-script':'.';
const source=fs.readFileSync(root+'/AppJs.html','utf8');
const elements=new Map(),requests=[];
const state={category:'tile',token:'test-session',inventoryRequest:0,loadedCategories:{},pendingCategories:{},categoryRevisions:{},allInventory:[],inventory:[],vinylConfigured:false};
const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',disabled:false,value:''});return elements.get(id);};
const ctx=vm.createContext({state,Date,Error,Promise,$:element,esc:s=>s,populateBayFilter(){},populateLocationFilter(){},toast(){},applyInventoryFilters(){state.inventory=state.allInventory;element('statusLine').textContent='loaded '+state.inventory.map(i=>i.id).join(',');},call:(_fn,_token,category,_query,force)=>new Promise((resolve,reject)=>requests.push({category,force,resolve,reject}))});
vm.runInContext(source.slice(source.indexOf('async function loadInventory('),source.indexOf('function populateBayFilter(')),ctx);
(async()=>{
 state.loadedCategories.tile={items:[{id:'old-tile'}],loadedAt:Date.now()-300000};
 const first=ctx.loadInventory(false);
 assert.equal(state.inventory[0].id,'old-tile');assert.match(element('statusLine').textContent,/Checking/);assert.equal(requests.length,1);
 const second=ctx.loadInventory(false);assert.equal(requests.length,1,'Repeated clicks must share an in-flight request');
 state.category='vinyl';await ctx.loadInventory(false);assert.equal(state.inventory.length,0);assert.match(element('inventoryGrid').innerHTML,/Sheet is connected/);
 requests[0].resolve([{id:'new-tile'}]);await Promise.all([first,second]);
 assert.equal(state.inventory.length,0,'Late tile response must not replace vinyl');assert.equal(state.loadedCategories.tile.items[0].id,'new-tile');
 state.category='tile';await ctx.loadInventory(false);assert.equal(state.inventory[0].id,'new-tile');assert.equal(requests.length,1);
 const refresh=ctx.loadInventory(true);assert.equal(state.inventory[0].id,'new-tile');assert.equal(requests[1].force,true);requests[1].resolve([{id:'refreshed-tile'}]);await refresh;assert.equal(state.inventory[0].id,'refreshed-tile');
 state.category='carpet';const cold=ctx.loadInventory(false);assert.equal(state.inventory.length,0);assert.match(element('inventoryGrid').innerHTML,/Loading carpet/);requests[2].resolve([{id:'carpet'}]);await cold;
 const revoked=ctx.fetchInventoryCategory('tile',true);state.token='another-session';requests[3].resolve([{id:'wrong-session-data'}]);await assert.rejects(revoked,/Session changed/);assert.equal(state.loadedCategories.tile.items[0].id,'refreshed-tile');
 console.log('Tab switching checks passed: immediate stale display, request deduplication, preloading results, rapid-switch race safety, uncached Refresh, correct-category loading and session isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});


