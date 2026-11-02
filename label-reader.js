'use strict';
function labelScanCategory(value){return ['carpet','tile','vinyl'].includes(value)?value:'vinyl';}
function labelScanText(value){return String(value??'').replace(/[–—−]/g,'-').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/(\d)\s*[x×]\s*(?=\d)/gi,'$1 x ').replace(/\s+/g,' ').trim();}
function labelScanThickness(text){
  return (String(text).match(/Overall\s+Thickness\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*mm/i)||String(text).match(/\b(\d+(?:\.\d+)?)\s*mm/i)||[])[1]||'';
}
function labelScanCandidates(text,category){
  category=labelScanCategory(category);
  const lines=String(text??'').slice(0,6000).split(/\r?\n/).map(labelScanText).filter(Boolean),found=new Map();
  const add=(value,label,rank)=>{
    value=labelScanText(value).replace(/^[\s:#=-]+|[\s,;]+$/g,'').split(/\s+(?=(?:SKU|Size|Color|Colour|Lot|Batch|Quantity|Qty)\s*[:#])/i)[0].slice(0,80).trim();
    if(!value || /^(?:N\/?A|none|not found|unknown|label|inventory|product|carpet|tile|vinyl)$/i.test(value))return;
    const key=value.toLowerCase(),previous=found.get(key);
    if(!previous || previous.rank<rank)found.set(key,{value,label,rank});
  };
  const nameField=/^(?:style(?:\s*(?:name|no\.?|number|#))?|product(?:\s*(?:name|description))?|carpet(?:\s*name)?|tile(?:\s*name)?|name|description|pattern)(?=\s|[:#=-]|$)\s*[:#=-]?\s*(.*)$/i;
  const codeField=/^(?:sku|item(?:\s*(?:no\.?|number|code|#))?|model(?:\s*(?:no\.?|number|#))?|product\s*code|style\s*code|code|roll(?:\s*(?:no\.?|number|id|#))?)(?=\s|[:#=-]|$)\s*[:#=-]?\s*(.*)$/i;
  lines.forEach((line,index)=>{
    const sku=line.match(/^SKU\s*[:#=-]?\s*([A-Z0-9][A-Z0-9._\/-]{2,})/i);
    if(sku)add(sku[1],'SKU',category==='carpet'?110:140);
    if(category==='tile'){
      const pair=line.match(/^((?:[A-Z]{1,3}\d{2,4}|\d{4}))\s+([A-Z]{0,4}\d{3,6}[A-Z][A-Z0-9]*)\b/i);
      if(pair){add(pair[1]+pair[2],'Color + shape code',125);add(pair[1],'Color code',80);add(pair[2],'Shape code',75);}
      const namedColor=line.match(/^(?:[A-Z]{1,3}\d{2,4}|\d{4})\s*-\s*([A-Z][A-Z /'-]{3,})$/i);if(namedColor)add(namedColor[1],'Product / color name',95);
    }
    const code=line.match(codeField),name=line.match(nameField);
    const next=lines[index+1]||'',continuation=/^[a-z][a-z\s.]{0,25}[:#]/i.test(next)||codeField.test(next)||nameField.test(next)?'':next;
    if(code){
      const value=(code[1]||continuation).match(/^([A-Z0-9][A-Z0-9._\/-]*)/i);
      if(value)add(value[1],/^(?:roll)/i.test(line)?'Roll code':'Product code / SKU',category==='carpet'&&/^roll/i.test(line)?85:110);
      if(category==='carpet'&&sku && /^[A-Z][A-Z /'-]{3,60}$/i.test(next) && !/\b(?:COMPANY|LLC|WIDTH|LENGTH|SHIPPING)\b/i.test(next))add(next,'Product name',120);
    }
    else if(name){
      if(/\bCOLOR\b.*\b(?:BACK|WIDTH|LENGTH)\b/i.test(name[1])){const style=next.match(/^([A-Z0-9][A-Z0-9._\/-]*)/i);if(style)add(style[1],'Style code',115);}
      else add(name[1]||continuation,'Style / product name',category==='carpet'?115:100);
    }
    const color=line.match(/^(?:color|colour)\s*[:#=-]\s*(.+)$/i);if(color)add(color[1],'Color',65);
    // Quantity, dimensions and batch information are not useful product searches.
    if(code || name || color || sku || /^(?:size|actual size|nominal size|dimensions?|width|length|weight|thickness|overall|wear|coverage|sf\b|sq\b|box(?:es)?\b|pcs\b|qty\b|quantity|lot\b|batch\b|dye\b|shade\b|teinte\b|date\b|made\b|manufactured|country|tel\b|phone|upc\b|ean\b|barcode|location|bay\b|from\b|to\b|ship\b|mill order|b\/l|p\/l|po\b|sidemark|sscc|dept|store\b)/i.test(line))return;
    if(/\b(?:LLC|COMPANY|AVE(?:NUE)?|STREET|ROAD|BLVD|SUITE|TRUCK|SHIPPING)\b/i.test(line)||/^[A-D]\d?$/.test(line))return;
    if(/^(?:shade|teinte|lot|batch|mill order|po|date)[\s/:#]*$/i.test(lines[index-1]||''))return;
    if(/\d\s*[x×]\s*\d/i.test(line) && !/[a-wyz]{3}/i.test(line))return;
    if(/^(?:[$€£]|\d[\d.,]*\s*(?:mm|ft|feet|in(?:ch(?:es)?)?|m|cm|sf|sq\.?\s*ft|pcs|boxes?)\b)/i.test(line))return;
    if(/^E-\s*\d+(?:\.\d+)?(?:\s*(?:ft|feet))?$/i.test(line)||/^\d+[.,]\d+$/.test(line)||/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(line))return;
    if(/^\d+$/.test(line) && (line.length<2 || line.length>12))return;
    if(line.length<2 || line.length>100 || !/[a-z0-9]/i.test(line))return;
    add(line,'Label text',/^(?=.*\d)[a-z0-9._\/-]+$/i.test(line)?75:40);
  });
  if(category==='vinyl'){
    const code=(String(text).match(/\bCode\s*[:#-]?\s*([A-Z0-9]+(?:[-–—][A-Z0-9]+)+)/i)||String(text).match(/\b([0-9]{3,6}(?:[-–—][0-9A-Z]{1,5})+)\b/i)||[])[1];
    if(code)add(code,'Product code',130);
  }
  return [...found.values()].sort((a,b)=>b.rank-a.rank).slice(0,8).map(({value,label})=>({value,label}));
}
function labelScanReturnUrl(base,category,query,thickness,action){
  const allowed=['https://shloimyusb.github.io/flair-inventory-app/app.html','https://script.google.com/macros/s/AKfycbzU4qdMk-f_v_8kUMvZzydexGX4hPLTCszIQiJSjQKIJZpsa-JITlQ6HRYPhEcO8A7mOQ/exec'];
  if(!allowed.includes(base))return null;
  const url=new URL(base);category=labelScanCategory(category);url.searchParams.set('scanCategory',category);
  const code=labelScanText(query).slice(0,80);if(code)url.searchParams.set('scanCode',code);
  if(category==='vinyl' && thickness)url.searchParams.set('scanThickness',labelScanText(thickness).slice(0,20));
  if(action==='add' && category!=='vinyl')url.searchParams.set('scanAction','add');
  return url.toString();
}
function labelScanFailures(count,outcome){return outcome==='accepted'?0:outcome==='failed'?Math.min(3,Math.max(0,Number(count)||0)+1):Math.max(0,Number(count)||0);}
if(typeof module!=='undefined' && module.exports)module.exports={labelScanCategory,labelScanText,labelScanThickness,labelScanCandidates,labelScanReturnUrl,labelScanFailures};
