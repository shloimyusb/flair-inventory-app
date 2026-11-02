const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=fs.existsSync('apps-script')?'apps-script':'.',js=fs.readFileSync(root+'/AppJs.html','utf8');
const local=new Map(),session=new Map(),elements={},state={token:''};let calls=[],failNetwork=false;
const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
const element=id=>elements[id]||(elements[id]={textContent:'',classList:{hidden:new Set(),add(n){this.hidden.add(n);},remove(n){this.hidden.delete(n);}}});
const window={localStorage:storage(local),sessionStorage:storage(session)};
const ctx=vm.createContext({window,state,$:element,showLogin(){element('loginForm').classList.remove('hidden');},bootstrap:async()=>{calls.push(state.token);if(failNetwork)throw Error('Network unavailable');if(state.token==='expired')throw Error('Your session has expired. Please sign in again.');if(state.token==='revoked')throw Error('Your access has been revoked. Please sign in again.');}});
vm.runInContext(js.slice(js.indexOf('function readLoginToken('),js.indexOf('const call =')),ctx);
const key='flairInventoryToken';
(async()=>{
local.set(key,'remembered');session.set(key,'expired');assert.equal(await ctx.restoreLogin(),true);assert.deepEqual(calls,['remembered']);assert.equal(local.get(key),'remembered');
calls=[];local.set(key,'expired');session.set(key,'valid-tab');assert.equal(await ctx.restoreLogin(),true);assert.deepEqual(calls,['expired','valid-tab']);assert.equal(session.get(key),'valid-tab');assert.equal(local.size,0);
calls=[];local.set(key,'revoked');session.set(key,'expired');assert.equal(await ctx.restoreLogin(),false);assert.equal(local.size+session.size,0);assert.equal(state.token,'');
calls=[];local.set(key,'remembered');failNetwork=true;assert.equal(await ctx.restoreLogin(),true);assert.equal(local.get(key),'remembered');assert.equal(element('retrySavedLoginBtn').classList.hidden.has('hidden'),false);assert.equal(element('loginForm').classList.hidden.has('hidden'),true);
failNetwork=false;calls=[];assert.equal(await ctx.restoreLogin(),true);assert.deepEqual(calls,['remembered']);
console.log('Login restoration checks passed: remembered-token priority, expired-token fallback without erasing valid sessions, revocation cleanup and retry after a connection failure without re-entering credentials.');
})().catch(error=>{console.error(error);process.exitCode=1;});
