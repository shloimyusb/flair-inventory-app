const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const props=new Map(),cache=new Map();let locked=false;
const ctx=vm.createContext({
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>Array.from(crypto.createHash('sha256').update(s).digest())},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},
 CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},
 LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},releaseLock(){locked=false;}})}
});
const root=fs.existsSync('apps-script')?'apps-script':'.';
for(const f of ['Config.gs','Auth.gs'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx);
ctx.setInventoryUser_('viewer@example.invalid','Viewer','view','123456789012');
const login=ctx.loginUser('viewer@example.invalid','123456789012');
assert.equal(ctx.requireSession_(login.token,false).role,'view');
assert.throws(()=>ctx.requireSession_(login.token,true),/permission/);
const users=JSON.parse(props.get('USERS_JSON'));users[0].active=false;props.set('USERS_JSON',JSON.stringify(users));
assert.throws(()=>ctx.requireSession_(login.token,false),/revoked/);
ctx.logoutUser(login.token);assert.throws(()=>ctx.requireSession_(login.token,false),/expired/);
for(let i=0;i<5;i++)assert.throws(()=>ctx.loginUser('unknown@example.invalid','wrong'),/Invalid/);
assert.throws(()=>ctx.loginUser('unknown@example.invalid','wrong'),/Too many/);
assert.equal(locked,false);
console.log('Authentication checks passed: view role, revocation, logout, failed-login limit, and lock release.');
