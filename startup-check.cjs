const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync('apps-script')?'apps-script':'.';
let authenticated=0,reads=0;
const server=vm.createContext({console,Date,PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},ScriptApp:{getService:()=>({getUrl:()=> 'https://example.invalid/app'})},APP:{CATEGORIES:['carpet','tile','vinyl']},requireSession_(){authenticated++;return {email:'employee@example.invalid'};},CacheService:{getScriptCache:()=>({get:()=>null})},getSpreadsheetId_:()=> 'test-copy',getSpreadsheet_(){reads++;throw Error('Cold workbook must not block session validation');}});
vm.runInContext(fs.readFileSync(root+'/Inventory.gs','utf8'),server);
server.getInventory_=()=>{reads++;throw Error('Unexpected inventory read');};
let data=server.getAppBootstrap('saved-session');
assert.equal(authenticated,1);assert.equal(reads,0);assert.equal(data.inventoryLoaded,false);assert.equal(Object.keys(data.preloadedInventory).length,0);
server.cachedInventory_=category=>category==='tile'?[{id:'TILE-1'}]:null;
data=server.getAppBootstrap('saved-session');assert.equal(data.preloadedInventory.tile[0].id,'TILE-1');assert.equal(data.inventoryLoaded,false);assert.equal(reads,0);
server.requireSession_=()=>{throw Error('revoked');};assert.throws(()=>server.getAppBootstrap('revoked'),/revoked/);assert.throws(()=>server.getInventorySheetNames('revoked'),/revoked/);

const source=fs.readFileSync(root+'/AppJs.html','utf8');
const makeElement=()=>({value:'',textContent:'',classList:{hidden:false,add(){this.hidden=true;},remove(){this.hidden=false;},toggle(_name,hidden){this.hidden=hidden;}}});
const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,makeElement());return elements.get(id);};
element('appView').classList.hidden=true;element('initialScanCategory').value='tile';
const state={token:'saved-session',category:'carpet',loadedCategories:{},cardSize:285,viewMode:'cards',historyRevision:0};
let finishStock,finishPreferences,finishBootstrap,renders=0;
const ui=vm.createContext({state,Date,Promise,Error,setTimeout,clearTimeout,$:element,call:()=>new Promise(resolve=>finishBootstrap=resolve),loginHostNonce:()=>true,loginHostRequest:()=>new Promise(resolve=>finishPreferences=resolve),readInventoryView:()=> 'cards',readCardSize:()=>285,validCardSize:Number,applyCardSize(){},renderInventory(){renders++;},switchView(){},populateRollSheets(){},openManualItem(){},fetchInventoryCategory:()=>Promise.resolve([]),window:{scrollTo(){}},useScannedSearch:category=>{state.category=category;return new Promise(resolve=>finishStock=resolve);}});
vm.runInContext(source.slice(source.indexOf('async function bootstrap('),source.indexOf('function showLogin(')),ui);
ui.ensureSheetNames=()=>Promise.resolve();
const payload={user:{email:'employee@example.invalid'},inventory:[],inventoryLoaded:false,preloadedInventory:{},inventorySheets:{},carpetSheets:[],environment:'test'};
const flush=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
(async()=>{
  const pending=ui.bootstrap();finishBootstrap(payload);await flush();
  assert.equal(element('appView').classList.hidden,false,'Show authenticated app before uncached stock or browser preferences finish');
  assert.equal(element('loginView').classList.hidden,true);
  assert.equal(state.category,'tile','Start with the requested category');
  assert.equal(state.loadedCategories.carpet,undefined,'A cache miss is not an empty loaded carpet inventory');
  state.token='another-user';finishPreferences({ok:true,size:140,view:'table'});await flush();assert.equal(state.viewMode,'cards');assert.equal(renders,0,'Late preferences cannot render after session change');
  finishStock();await pending;

  state.token='saved-session';element('appView').classList.hidden=true;
  const late=ui.bootstrap();state.token='signed-out';finishBootstrap(payload);await late;
  assert.equal(element('appView').classList.hidden,true,'Late bootstrap cannot reveal inventory after sign-out');

  let timeout;const requests=[];
  const timed=vm.createContext({Promise,Error,setTimeout:fn=>{timeout=fn;return 1;},clearTimeout(){},call:()=>new Promise(resolve=>requests.push(resolve))});
  vm.runInContext(source.slice(source.indexOf('function startupCall('),source.indexOf('function ensureSheetNames(')),timed);
  const slow=timed.startupCall('getAppBootstrap','saved-session');timeout();await assert.rejects(slow,/saved sign-in is still here/);requests[0](payload);

  let namesResolve,nameCalls=0;state.token='saved-session';state.inventorySheets={};state.sheetNamesPending=null;
  ui.startupCall=()=>{nameCalls++;return new Promise(resolve=>namesResolve=resolve);};
  vm.runInContext(source.slice(source.indexOf('function ensureSheetNames('),source.indexOf('function showLogin(')),ui);
  const first=ui.ensureSheetNames(),second=ui.ensureSheetNames('tile');assert.equal(nameCalls,1);
  namesResolve({carpet:['Bay 1'],tile:['Bay 1','Bay 2'],vinyl:[]});await Promise.all([first,second]);assert.equal(state.inventorySheets.tile.length,2);
  state.inventorySheets={};const stale=ui.ensureSheetNames('carpet');state.token='signed-out';namesResolve({carpet:['PRIVATE']});await assert.rejects(stale,/Session changed/);assert.equal(state.carpetSheets.includes('PRIVATE'),false);
  console.log('Startup checks passed: authenticated cache-only bootstrap, no cold workbook reads, selected category, app shown before inventory/preferences, timeout with saved login retained, shared bay lookup and session isolation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
