const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync('apps-script')?'apps-script':'.',js=fs.readFileSync(root+'/AppJs.html','utf8');
const local=new Map(),session=new Map();
const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
const window={localStorage:storage(local),sessionStorage:storage(session)},ctx=vm.createContext({window});
vm.runInContext(js.slice(js.indexOf('function readLoginToken('),js.indexOf('const call =')),ctx);
(async()=>{
assert.equal(await ctx.storeLoginToken('remembered-test-token',true),true);assert.equal(local.get('flairInventoryToken'),'remembered-test-token');assert.equal(session.size,0);
assert.equal(ctx.readLoginToken(),'remembered-test-token');
assert.equal(await ctx.storeLoginToken('temporary-test-token',false),true);assert.equal(local.size,0);assert.equal(session.get('flairInventoryToken'),'temporary-test-token');
await ctx.clearLoginToken();assert.equal(ctx.readLoginToken(),'');assert.equal(local.size,0);assert.equal(session.size,0);
local.set('flairInventoryToken','remembered');session.set('flairInventoryToken','stale-tab');assert.equal(ctx.readLoginToken(),'remembered');
await ctx.forgetLoginToken('stale-tab');assert.equal(local.get('flairInventoryToken'),'remembered');assert.equal(session.size,0);
await ctx.clearLoginToken();
Object.defineProperty(window,'localStorage',{get(){throw Error('Storage blocked');},configurable:true});
assert.equal(ctx.readLoginToken(),'');assert.equal(await ctx.storeLoginToken('blocked-test-token',true),false);await ctx.clearLoginToken();
assert.equal(await ctx.storeLoginToken('session-test-token',false),true);assert.equal(ctx.readLoginToken(),'session-test-token');
// The first-party host remains usable when Safari blocks the iframe's storage.
let hostTokens=[];ctx.loginHostNonce=()=> 'a'.repeat(64);ctx.loginHostRequest=async(action,data)=>{
  if(action==='store'){hostTokens=[data.token];return {ok:true,saved:true};}
  if(action==='read')return {ok:true,tokens:hostTokens};
  if(action==='clear')hostTokens=[];
  return {ok:true};
};
assert.equal(await ctx.storeLoginToken('hosted-test-token',true),true);assert.deepEqual(Array.from(await ctx.savedLoginTokens()),['hosted-test-token']);await ctx.clearLoginToken();assert.equal(hostTokens.length,0);
console.log('Browser storage checks passed: persistent preference over stale tab tokens, selective cleanup, blocked storage, first-party host storage and sign-out.');
})().catch(error=>{console.error(error);process.exitCode=1;});
