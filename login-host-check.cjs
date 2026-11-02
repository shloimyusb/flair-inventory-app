const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const path=fs.existsSync('docs/login-host.js')?'docs/login-host.js':'login-host.js',js=fs.readFileSync(path,'utf8'),local=new Map(),session=new Map();
const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)});
const ctx=vm.createContext({window:{localStorage:storage(local),sessionStorage:storage(session)}});
vm.runInContext(js.slice(0,js.lastIndexOf('startInventoryHost();')),ctx);
assert.equal(ctx.hostStoreLogin('remembered-token',true),true);session.clear();assert.deepEqual(Array.from(ctx.hostLoginTokens()),['remembered-token']);
assert.equal(ctx.hostStoreLogin('temporary-token',false),true);assert.equal(local.size,0);session.clear();assert.equal(ctx.hostLoginTokens().length,0);
ctx.hostStoreLogin('new-token',true);ctx.hostForgetLogin('old-token');assert.deepEqual(Array.from(ctx.hostLoginTokens()),['new-token']);ctx.hostForgetLogin();assert.equal(local.size,0);
local.set(ctx.hostCardSizeKey('employee@example.invalid'),'140');assert.equal(ctx.hostCardSize('EMPLOYEE@EXAMPLE.INVALID'),140);assert.equal(ctx.hostCardSize('other@example.invalid'),285);local.set(ctx.hostCardSizeKey('employee@example.invalid'),'9999');assert.equal(ctx.hostCardSize('employee@example.invalid'),285);
const source={},nonce='a'.repeat(64),event={source,origin:'https://n-test-script.googleusercontent.com',data:{type:'flair-login-request',nonce,id:1}};
local.set(ctx.hostViewKey('employee@example.invalid'),'table');assert.equal(ctx.hostView('EMPLOYEE@EXAMPLE.INVALID'),'table');assert.equal(ctx.hostView('other@example.invalid'),'cards');local.set(ctx.hostViewKey('employee@example.invalid'),'invalid');assert.equal(ctx.hostView('employee@example.invalid'),'cards');
assert.ok(ctx.validLoginHostMessage(event,nonce,null));assert.ok(ctx.validLoginHostMessage(event,nonce,{source,origin:event.origin}));
assert.equal(ctx.validLoginHostMessage({...event,origin:'https://evil.example'},nonce,null),false);assert.equal(ctx.validLoginHostMessage({...event,data:{...event.data,nonce:'b'.repeat(64)}},nonce,null),false);assert.equal(ctx.validLoginHostMessage({...event,source:{}},nonce,{source,origin:event.origin}),false);assert.equal(ctx.validLoginHostMessage({...event,data:{...event.data,id:'1'}},nonce,null),false);
const elements={};ctx.document={getElementById:id=>elements[id]||(elements[id]={})};ctx.window.top={};ctx.window.self={};ctx.startInventoryHost();assert.match(elements.connectionMessage.textContent,/directly/);assert.equal(elements.directLink.href,'https://shloimyusb.github.io/flair-inventory-app/app.html');assert.equal(elements.inventoryFrame.src,undefined);
console.log('First-party login host checks passed: persistence after tab/session close, session-only opt-out, selective removal, strict message origin/nonce/source checks and refusal to run inside another site.');

