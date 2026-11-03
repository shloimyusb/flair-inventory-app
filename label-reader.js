'use strict';
function labelScanCategory(value){return ['carpet','tile','vinyl'].includes(value)?value:'vinyl';}
function labelScanText(value){return String(value??'').replace(/[–—−]/g,'-').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/(\d)\s*[x×]\s*(?=\d)/gi,'$1 x ').replace(/\s+/g,' ').trim();}
function labelScanThickness(text){
  return (String(text).match(/Overall\s+Thickness\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*mm/i)||String(text).match(/\b(\d+(?:\.\d+)?)\s*mm/i)||[])[1]||'';
}
function labelCarpetDraft(value){
  value=value||{};
  const length=String(value.lengthFeet??'').trim();
  return {styleName:labelScanText(value.styleName).slice(0,80),colorName:labelScanText(value.colorName).slice(0,80),lengthFeet:/^\d{1,6}(?:\.\d{1,4})?$/.test(length)&&Number(length)>0?String(Math.round(Number(length)*100)/100):''};
}
function labelCarpetFields(text,words){
  const lines=String(text||'').slice(0,6000).split(/\r?\n/).map(labelScanText).filter(Boolean);
  const result={styleName:'',colorName:'',lengthFeet:''};
  const boundary='(?=\\s+(?:STYLE|COLOU?R|WIDTH|LENGTH|DYE|ROLL|MILL|ORDER|SHADE|SKU)\\b|$)';
  for(const [key,label] of [['styleName','STYLE(?:\\s+NAME)?'],['colorName','COLOU?R(?:\\s+NAME)?']]){
    const field=new RegExp('(?:^|\\b)'+label+'(?!\\s*(?:NO\\b|NUMBER\\b|CODE\\b|#))\\s*[:=-]?\\s*(.*?)'+boundary,'i');
    for(let i=0;i<lines.length;i++){
      const match=lines[i].match(field);if(!match)continue;
      const candidate=match[1]||lines[i+1]||'';
      if(/^(?:NAME|STYLE|COLOU?R|WIDTH|LENGTH|FT|IN|DYE|ROLL|MILL|ORDER|SHADE|SKU)\b/i.test(candidate))continue;
      if(!/[a-z]{3}/i.test(candidate)||/\b(?:LLC|COMPANY|SHIPPING|TRUCK)\b/i.test(candidate))continue;
      result[key]=candidate;break;
    }
  }
  const feet=(ft,inch=0)=>{
    ft=Number(ft);inch=Number(inch);return Number.isFinite(ft)&&ft>=0&&Number.isFinite(inch)&&inch>=0&&inch<12&&ft+inch/12>0?String(Math.round((ft+inch/12)*100)/100):'';
  };
  const flat=lines.join(' '),length=flat.match(/\b(?:ROLL\s+)?LENGTH\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*(?:FT\b|FEET\b|FOOT\b|'|′)(?:\s*(\d{1,2})\s*(?:IN\b|INCH(?:ES)?\b|"|″))?/i);
  if(length)result.lengthFeet=feet(length[1],length[2]||0);
  const unitHeader=flat.match(/\b(?:ROLL\s+)?LENGTH\s*(?:\(\s*(?:FT|FEET)\s*\)|FT(?:\s*\/?\s*IN)?)\s*[:=-]?\s*(\d+(?:\.\d+)?)(?:\s+(\d{1,2})(?=\s|$))?/i);
  if(!result.lengthFeet&&unitHeader)result.lengthFeet=feet(unitHeader[1],unitHeader[2]||0);
  // A Shaw width/length table has two FT / IN pairs. The second pair is length.
  const table=lines.findIndex(line=>/\bWIDTH\b.*\bLENGTH\b/i.test(line));
  if(!result.lengthFeet&&table>=0){
    const section=lines.slice(table,table+5).join(' ');
    if(/\bFT\s*\/?\s*IN\b.*\bFT\s*\/?\s*IN\b/i.test(section)){
      for(const row of lines.slice(table+1,table+5)){
        const n=row.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{1,6}(?:\.\d+)?)\s+(\d{1,2})(?=\s|$)/);
        if(n&&Number(n[1])>=3&&Number(n[1])<=20&&Number(n[2])<12){result.lengthFeet=feet(n[3],n[4]);break;}
      }
    }
  }
  // Word positions keep adjacent table columns (width, length, dye lot) separate.
  const positioned=Array.isArray(words)?words.filter(w=>w&&w.bbox&&Number.isFinite(w.bbox.x0)&&Number.isFinite(w.bbox.y0)&&Number.isFinite(w.bbox.x1)&&Number.isFinite(w.bbox.y1)).map(w=>({text:labelScanText(w.text),...w.bbox})).filter(w=>w.text):[];
  const token=w=>w.text.toUpperCase().replace(/[^A-Z0-9]/g,''),height=w=>Math.max(1,w.y1-w.y0),sameRow=(a,b)=>Math.abs((a.y0+a.y1-b.y0-b.y1)/2)<Math.max(height(a),height(b))*.65;
  const anchors=[];
  for(const word of positioned){
    const type=token(word),isColor=/^(?:COLOR|COLOUR|C0L0R|C0LOR)$/.test(type);
    if(type!=='STYLE'&&!isColor&&type!=='WIDTH'&&type!=='LENGTH'&&type!=='DYE')continue;
    const next=positioned.filter(w=>w.x0>=word.x1&&sameRow(w,word)).sort((a,b)=>a.x0-b.x0)[0];
    const suffix=next&&next.x0-word.x1<height(word)*3?token(next):'';
    anchors.push({...word,key:type==='STYLE'&&suffix==='NAME'?'styleName':isColor&&suffix==='NAME'?'colorName':type==='LENGTH'?'lengthFeet':'other',end:suffix==='NAME'?next.x1:word.x1});
  }
  for(const anchor of anchors){
    if(anchor.key==='other')continue;
    const h=height(anchor),right=anchors.filter(a=>a.x0>anchor.end&&sameRow(a,anchor)).sort((a,b)=>a.x0-b.x0)[0],left=anchors.filter(a=>a.x1<anchor.x0&&sameRow(a,anchor)).sort((a,b)=>b.x1-a.x1)[0];
    const x0=anchor.key==='lengthFeet'&&left?(left.x1+anchor.x0)/2:anchor.x0-h;
    const x1=right?right.x0:anchor.end+h*20;
    const below=positioned.filter(w=>w.y0>=anchor.y1-h*.2&&w.y1>anchor.y1+h*.3&&w.y0<anchor.y1+h*(anchor.key==='lengthFeet'?6:3.5)&&w.x0>=x0&&w.x1<=x1);
    const rows=[];
    for(const word of below.sort((a,b)=>a.y0-b.y0||a.x0-b.x0)){
      const row=rows.find(r=>sameRow(r[0],word));if(row)row.push(word);else rows.push([word]);
    }
    if(anchor.key==='lengthFeet'){
      if(!below.some(w=>/^(?:FT|FEET)$/i.test(token(w))))continue;
      for(const row of rows){const numbers=row.sort((a,b)=>a.x0-b.x0).map(w=>w.text).join(' ').match(/^(\d{1,6}(?:\.\d+)?)(?:\s+(\d{1,2}))?$/);if(numbers){result.lengthFeet=feet(numbers[1],numbers[2]||0);break;}}
    }else{
      const row=rows.find(r=>r.some(w=>/[a-z]{3}/i.test(w.text))&&!r.some(w=>/^(?:STYLE|COLOU?R|WIDTH|LENGTH|NAME|NO|NUMBER)$/i.test(token(w))));
      if(row)result[anchor.key]=row.sort((a,b)=>a.x0-b.x0).map(w=>w.text).join(' ');
    }
  }
  return labelCarpetDraft(result);
}
function labelScanCandidates(text,category){
  category=labelScanCategory(category);
  const lines=String(text??'').slice(0,6000).split(/\r?\n/).map(labelScanText).filter(Boolean),found=new Map();
  const add=(value,label,rank)=>{
    value=labelScanText(value).replace(/^[\s:#=-]+|[\s,;]+$/g,'').split(/\s+(?=(?:SKU|Size|Color|Colour|Lot|Batch|Quantity|Qty)\s*[:#])/i)[0].slice(0,80).trim();
    if(/name/i.test(label))value=value.replace(/([A-Z])\/+(?=[A-Z])/gi,'$1 ');
    if(!value || /^(?:N\/?A|none|not found|unknown|label|inventory|product|carpet|tile|vinyl)$/i.test(value))return;
    const key=value.toLowerCase(),previous=found.get(key);
    if(!previous || previous.rank<rank)found.set(key,{value,label,rank});
  };
  const nameField=/^(?:style(?:\s*(?:name|no\.?|number|#))?|product(?:\s*(?:name|description))?|carpet(?:\s*name)?|tile(?:\s*name)?|name|description|pattern)(?=\s|[:#=-]|$)\s*[:#=-]?\s*(.*)$/i;
  const codeField=/^(?:sku|item(?:\s*(?:no\.?|number|code|#))?|model(?:\s*(?:no\.?|number|#))?|product\s*code|style\s*code|code|roll(?:\s*(?:no\.?|number|id|#))?)(?=\s|[:#=-]|$)\s*[:#=-]?\s*(.*)$/i;
  lines.forEach((line,index)=>{
    const sku=line.match(/^(?:SKU\s*[:#=-]?\s*|KU\s*[:#=-]?\s+)([A-Z0-9][A-Z0-9._\/-]{2,})/i);
    if(sku){add(sku[1],'SKU',category==='carpet'?110:140);const parts=sku[1].split('/');if(category==='carpet'&&parts.length>=2)add(parts[0]+' '+parts[1],'Style + color',118);}
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
function labelScanReturnUrl(base,category,query,thickness,action,carpet){
  const allowed=['https://shloimyusb.github.io/flair-inventory-app/app.html','https://script.google.com/macros/s/AKfycbzU4qdMk-f_v_8kUMvZzydexGX4hPLTCszIQiJSjQKIJZpsa-JITlQ6HRYPhEcO8A7mOQ/exec'];
  if(!allowed.includes(base))return null;
  const url=new URL(base);category=labelScanCategory(category);url.searchParams.set('scanCategory',category);
  const code=labelScanText(query).slice(0,80);if(code)url.searchParams.set('scanCode',code);
  if(category==='vinyl' && thickness)url.searchParams.set('scanThickness',labelScanText(thickness).slice(0,20));
  if(action==='add' && category!=='vinyl')url.searchParams.set('scanAction','add');
  if(action==='add' && category==='carpet'){
    const draft=labelCarpetDraft(carpet);
    for(const [key,value] of [['scanStyle',draft.styleName],['scanColor',draft.colorName],['scanLength',draft.lengthFeet]])if(value)url.searchParams.set(key,value);
  }
  return url.toString();
}
function labelScanFailures(count,outcome){return outcome==='accepted'?0:outcome==='failed'?Math.min(3,Math.max(0,Number(count)||0)+1):Math.max(0,Number(count)||0);}
function labelPhotoTransform(width,height,turns,tilt){const angle=((Number(turns)||0)*90+(Number(tilt)||0))*Math.PI/180,cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));return {angle,width:Math.max(1,Math.ceil(width*cos+height*sin-1e-9)),height:Math.max(1,Math.ceil(width*sin+height*cos-1e-9))};}
if(typeof module!=='undefined' && module.exports)module.exports={labelScanCategory,labelScanText,labelScanThickness,labelCarpetDraft,labelCarpetFields,labelScanCandidates,labelScanReturnUrl,labelScanFailures,labelPhotoTransform};
