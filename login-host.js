'use strict';
const INVENTORY_APP_URL='https://script.google.com/macros/s/AKfycbzU4qdMk-f_v_8kUMvZzydexGX4hPLTCszIQiJSjQKIJZpsa-JITlQ6HRYPhEcO8A7mOQ/exec';
const LOGIN_KEY='flairInventoryToken';

function hostLoginTokens(){
  const tokens=[];
  for(const name of ['localStorage','sessionStorage'])try{const token=window[name].getItem(LOGIN_KEY);if(token && !tokens.includes(token))tokens.push(token);}catch(error){}
  return tokens;
}
function hostForgetLogin(token){
  for(const name of ['localStorage','sessionStorage'])try{if(!token || window[name].getItem(LOGIN_KEY)===token)window[name].removeItem(LOGIN_KEY);}catch(error){}
}
function hostStoreLogin(token,remember){
  hostForgetLogin();
  try{const storage=window[remember?'localStorage':'sessionStorage'];storage.setItem(LOGIN_KEY,token);return storage.getItem(LOGIN_KEY)===token;}catch(error){return false;}
}
function hostCardSizeKey(email){return 'flairInventoryCardSize:'+String(email||'').trim().toLowerCase();}
function hostCardSize(email){try{const size=Number(window.localStorage.getItem(hostCardSizeKey(email)));return Number.isFinite(size) && size>=140 && size<=440?Math.round(size/5)*5:285;}catch(error){return 285;}}
function hostViewKey(email){return 'flairInventoryView:'+String(email||'').trim().toLowerCase();}
function hostView(email){try{const view=window.localStorage.getItem(hostViewKey(email));return ['cards','compact','table'].includes(view)?view:'cards';}catch(error){return 'cards';}}
function validLoginHostMessage(event,nonce,client){
  const data=event.data;
  return /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(event.origin) &&
    data && data.type==='flair-login-request' && data.nonce===nonce && Number.isSafeInteger(data.id) &&
    event.source && (!client || (event.source===client.source && event.origin===client.origin));
}
function startInventoryHost(){
  const frame=document.getElementById('inventoryFrame'),status=document.getElementById('connectionStatus'),message=document.getElementById('connectionMessage'),retry=document.getElementById('retryConnection'),direct=document.getElementById('directLink');
  // The login-storage page must itself be a first-party page, never an embed.
  if(window.top!==window.self){message.textContent='Open Flair Inventory directly to use saved sign-in.';direct.href='https://shloimyusb.github.io/flair-inventory-app/app.html';direct.hidden=false;return;}
  const bytes=crypto.getRandomValues(new Uint8Array(32)),nonce=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  let client=null;
  const timer=setTimeout(()=>{message.textContent='The inventory app is taking longer to connect. Try again, or open it directly.';retry.hidden=false;direct.hidden=false;},25000);
  retry.addEventListener('click',()=>location.reload());
  window.addEventListener('message',event=>{
    if(!validLoginHostMessage(event,nonce,client))return;
    const data=event.data;client=client||{source:event.source,origin:event.origin};
    const reply={type:'flair-login-response',nonce,id:data.id,ok:true};
    switch(data.action){
      case 'ping':break;
      case 'read':reply.tokens=hostLoginTokens();break;
      case 'store':
        if(typeof data.token!=='string' || !/^[A-Za-z0-9-]{32,200}$/.test(data.token) || typeof data.remember!=='boolean')return;
        reply.saved=hostStoreLogin(data.token,data.remember);break;
      case 'forget':if(typeof data.token!=='string')return;hostForgetLogin(data.token);break;
      case 'clear':hostForgetLogin();break;
      case 'read-card-size':
        if(typeof data.email!=='string' || data.email.length>254)return;
        reply.size=hostCardSize(data.email);reply.view=hostView(data.email);break;
      case 'write-view':
        if(typeof data.email!=='string' || data.email.length>254 || !['cards','compact','table'].includes(data.view))return;
        try{window.localStorage.setItem(hostViewKey(data.email),data.view);reply.saved=true;}catch(error){reply.saved=false;}
        break;
      case 'write-card-size':
        if(typeof data.email!=='string' || data.email.length>254 || !Number.isInteger(data.size) || data.size<140 || data.size>440)return;
        try{window.localStorage.setItem(hostCardSizeKey(data.email),String(data.size));reply.saved=true;}catch(error){reply.saved=false;}
        break;
      default:return;
    }
    clearTimeout(timer);status.hidden=true;
    event.source.postMessage(reply,event.origin);
  });
  const url=new URL(INVENTORY_APP_URL),query=new URLSearchParams(location.search);
  url.searchParams.set('loginHostNonce',nonce);
  for(const [key,max] of [['scanCode',80],['scanThickness',20]])if(query.has(key))url.searchParams.set(key,query.get(key).slice(0,max));
  const category=query.get('scanCategory');if(['carpet','tile','vinyl'].includes(category))url.searchParams.set('scanCategory',category);
  if(query.get('scanAction')==='add')url.searchParams.set('scanAction','add');
  frame.hidden=false;frame.src=url.toString();
}
startInventoryHost();
