'use strict';
// First-party employee session goes only to our Apps Script bridge; never to OpenAI.
const flairLabelAI=(()=>{
  let connection=null,client=null,frame=null,nonce='',sequence=0;const waiting=new Map();
  const originOK=value=>/^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/.test(value);
  function tokens(){const out=[];for(const name of ['localStorage','sessionStorage'])try{const t=window[name].getItem('flairInventoryToken');if(t&&!out.includes(t))out.push(t);}catch(e){}return out;}
  function connect(){
    if(window.top!==window.self)return Promise.reject(new Error('Open the scanner directly from Flair Inventory.'));
    if(connection)return connection;
    nonce=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
    connection=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{window.removeEventListener('message',ready);if(frame)frame.remove();frame=null;connection=null;reject(new Error('Could not connect to the AI reader. Use basic reading or try again.'));},25000);
      function ready(event){const d=event.data;if(!originOK(event.origin)||!event.source||!d||d.type!=='flair-label-ready'||d.nonce!==nonce)return;clearTimeout(timer);window.removeEventListener('message',ready);client={source:event.source,origin:event.origin};resolve(client);}
      window.addEventListener('message',ready);
      frame=document.createElement('iframe');frame.hidden=true;frame.title='Secure label reader';frame.referrerPolicy='no-referrer';
      frame.src='https://script.google.com/macros/s/AKfycbzU4qdMk-f_v_8kUMvZzydexGX4hPLTCszIQiJSjQKIJZpsa-JITlQ6HRYPhEcO8A7mOQ/exec?labelBridge='+nonce;
      document.body.appendChild(frame);
    });return connection;
  }
  window.addEventListener('message',event=>{
    const d=event.data;if(!client||event.source!==client.source||event.origin!==client.origin||!d||d.type!=='flair-label-response'||d.nonce!==nonce||!waiting.has(d.id))return;
    const request=waiting.get(d.id);waiting.delete(d.id);clearTimeout(request.timer);d.ok?request.resolve(d.result):request.reject(new Error(String(d.result||'Label reading failed.')));
  });
  async function rpc(action,request){
    const saved=tokens();if(!saved.length)throw new Error('Sign in to inventory first, then open the scanner again.');
    const target=await connect();
    for(let index=0;index<saved.length;index++)try{
      return await new Promise((resolve,reject)=>{
        const id=++sequence,timer=setTimeout(()=>{waiting.delete(id);reject(new Error('The label reader is taking too long. Try later or enter details manually.'));},action==='read'?90000:15000);
        waiting.set(id,{resolve,reject,timer});target.source.postMessage({type:'flair-label-request',nonce,id,action,token:saved[index],request},target.origin);
      });
    }catch(error){if(!/session has expired|access has been revoked/i.test(error.message)||index===saved.length-1)throw error;}
  }
  return {status:()=>rpc('status'),read:image=>rpc('read',{id:crypto.randomUUID(),image})};
})();
