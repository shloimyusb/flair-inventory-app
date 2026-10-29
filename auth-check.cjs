const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const props=new Map(),cache=new Map();let locked=false;
const ctx=vm.createContext({
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>Array.from(crypto.createHash('sha256').update(s).digest())},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
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
ctx.setInventoryUser_('employee@example.invalid','Employee','employee','987654321012');
const remembered=ctx.loginUser('employee@example.invalid','987654321012',true);
assert.equal(remembered.remembered,true);assert.ok(remembered.expiresAt-Date.now()>29*86400000);
assert.equal('pinVersion' in remembered.user,false);
const rememberedKey=ctx.rememberedSessionKey_(remembered.token);
assert.ok(props.has(rememberedKey));assert.equal(rememberedKey.includes(remembered.token),false);
assert.equal(props.get(rememberedKey).includes('987654321012'),false);
cache.clear();assert.equal(ctx.requireSession_(remembered.token,true).email,'employee@example.invalid');
ctx.logoutUser(remembered.token);cache.clear();assert.equal(props.has(rememberedKey),false);assert.throws(()=>ctx.requireSession_(remembered.token,false),/expired/);
const temporary=ctx.loginUser('employee@example.invalid','987654321012',false);
assert.equal(temporary.remembered,false);assert.ok(temporary.expiresAt-Date.now()<=6*3600000);cache.clear();assert.throws(()=>ctx.requireSession_(temporary.token,false),/expired/);
const expired=ctx.loginUser('employee@example.invalid','987654321012',true),expiredKey=ctx.rememberedSessionKey_(expired.token);
const expiredRecord=JSON.parse(props.get(expiredKey));expiredRecord.expiresAt=Date.now()-1000;props.set(expiredKey,JSON.stringify(expiredRecord));cache.clear();assert.throws(()=>ctx.requireSession_(expired.token,false),/expired/);assert.equal(props.has(expiredKey),false);
const pinChanged=ctx.loginUser('employee@example.invalid','987654321012',true);
ctx.setInventoryUser_('employee@example.invalid','Employee','employee','111222333444');cache.clear();assert.throws(()=>ctx.requireSession_(pinChanged.token,false),/revoked/);
const removed=ctx.loginUser('employee@example.invalid','111222333444',true);
const currentUsers=JSON.parse(props.get('USERS_JSON'));currentUsers.find(u=>u.email==='employee@example.invalid').active=false;props.set('USERS_JSON',JSON.stringify(currentUsers));cache.clear();assert.throws(()=>ctx.requireSession_(removed.token,false),/revoked/);
console.log('Remember-me checks passed: 30-day expiry, cache eviction recovery, hashed persistent keys, no PIN storage, session-only login, logout, PIN changes and revocation.');

