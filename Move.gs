function moveInventory(token, payload) {
  const user=requireSession_(token,true);
  payload=payload||{};
  const category=String(payload.category||'');
  if(!APP.CATEGORIES.includes(category))throw new Error('Invalid inventory category.');
  const location=String(payload.location??'').trim(),bay=String(payload.bay??'').trim();
  if(location.length>100 || bay.length>500)throw new Error('Please shorten the location or bay notes.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const found=findRecordById_(category,payload.inventoryId);
    if(!found)throw new Error('Item not found. Refresh and try again.');
    const {sheet,rowNumber,map,displayRow}=found,ss=getSpreadsheet_(category);
    const before=normalizeRow_(category,sheet.getName(),rowNumber,found.row,displayRow,map);
    const editingSide=category==='tile' && Object.prototype.hasOwnProperty.call(payload,'side');
    const side=editingSide?String(payload.side??'').trim():String(before.side||'');
    if(editingSide && !['','Left','Right'].includes(side))throw new Error('Choose Left, Right or Not set.');
    const expected=payload.expected||{};
    if(expected.sourceSheet!==before.sourceSheet || String(expected.location||'')!==before.location || String(expected.bay||'')!==String(before.bay||''))throw new Error('This item was moved or edited since you opened it. Refresh and try again.');
    if(editingSide && String(expected.side||'').trim()!==String(before.side||'').trim())throw new Error('Right / Left changed since you opened this item. Refresh and try again.');
    const destination=ss.getSheetByName(String(payload.sheetName||''));
    if(!destination || !isInventorySheet_(destination,category))throw new Error('Choose an inventory bay from the list.');
    const changingSheet=destination.getSheetId()!==sheet.getSheetId();
    const sourceHeaders=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    const headers=changingSheet?destination.getRange(1,1,1,Math.max(destination.getLastColumn(),1)).getDisplayValues()[0]:sourceHeaders.slice();
    let destinationMap=makeHeaderMap_(headers);
    const locationCol=getColumn_(destinationMap,category,'location');
    if(locationCol<0)throw new Error('The selected bay needs a Location column.');
    const sideCol=getColumn_(destinationMap,category,'side');
    if(editingSide && sideCol<0)throw new Error('The selected bay needs an R-L or Side column.');
    const sourceBayCol=moveBayColumn_(sourceHeaders,map,category);
    const destinationBayCol=moveBayColumn_(headers,destinationMap,category);
    if(destinationBayCol<0 && bay)throw new Error('The selected bay has no bay-notes column. Clear the bay notes or choose another bay.');
    if(!changingSheet && location===before.location && bay===String(before.bay||'') && (!editingSide || side===String(before.side||'')))return {ok:true,item:before,unchanged:true};
    const requests=[];
    if(getColumn_(destinationMap,category,'inventoryId')<0){
      headers.push(APP.INVENTORY_ID_HEADER);destinationMap=makeHeaderMap_(headers);
      requests.push(moveCellWrite_(destination.getSheetId(),1,headers.length-1,APP.INVENTORY_ID_HEADER));
    }
    if(headers.length>destination.getMaxColumns())requests.unshift({appendDimension:{sheetId:destination.getSheetId(),dimension:'COLUMNS',length:headers.length-destination.getMaxColumns()}});
    let destinationRow=rowNumber;
    if(changingSheet){
      destinationRow=emptyMoveRow_(destination);
      if(destinationRow>destination.getMaxRows())requests.push({appendDimension:{sheetId:destination.getSheetId(),dimension:'ROWS',length:destinationRow-destination.getMaxRows()}});
      const sourceRange=sheet.getRange(rowNumber,1,1,sourceHeaders.length),notes=sourceRange.getNotes()[0],formulas=sourceRange.getFormulas()[0];
      const columns=moveColumnMap_(sourceHeaders,headers,category,found.row,notes,formulas);
      columns.forEach((targetCol,sourceCol)=>{
        if(targetCol<0)return;
        requests.push({cutPaste:{source:moveGrid_(sheet.getSheetId(),rowNumber,sourceCol),destination:{sheetId:destination.getSheetId(),rowIndex:destinationRow-1,columnIndex:targetCol},pasteType:'PASTE_NORMAL'}});
      });
    }
    requests.push(moveCellWrite_(destination.getSheetId(),destinationRow,locationCol,location));
    if(destinationBayCol>=0)requests.push(moveCellWrite_(destination.getSheetId(),destinationRow,destinationBayCol,bay));
    if(editingSide)requests.push(moveCellWrite_(destination.getSheetId(),destinationRow,sideCol,side));
    const after=Object.assign({},before,{sourceSheet:destination.getName(),location});
    if(category==='tile')after.side=side;
    if(sourceBayCol>=0 || destinationBayCol>=0)after.bay=bay;
    addMoveHistory_(requests,ss,category,payload.inventoryId,before,after,user);
    // Google validates the whole batch before applying any move or history write.
    Sheets.Spreadsheets.batchUpdate({requests},ss.getId());
    try {
      const cache=CacheService.getScriptCache(),raw=cache.get('recordIndex:'+category);
      let info=raw?JSON.parse(raw):null;
      if(!info || info.spreadsheetId!==ss.getId())info={spreadsheetId:ss.getId(),index:{}};
      info.index[payload.inventoryId]={sheetName:destination.getName(),rowNumber:destinationRow};
      cache.put('recordIndex:'+category,JSON.stringify(info),APP.CACHE_SECONDS);
      cache.remove('inventory:'+category);
    }catch(cacheError){console.warn('Move saved; cache refresh unavailable: '+cacheError.message);}
    return {ok:true,item:after};
  } finally {lock.releaseLock();}
}

function moveGrid_(sheetId,rowNumber,column){return {sheetId,startRowIndex:rowNumber-1,endRowIndex:rowNumber,startColumnIndex:column,endColumnIndex:column+1};}
function moveCellWrite_(sheetId,rowNumber,column,value){return {updateCells:{range:moveGrid_(sheetId,rowNumber,column),rows:[{values:[{userEnteredValue:{stringValue:String(value)}}]}],fields:'userEnteredValue'}};}

function moveBayColumn_(headers,map,category){
  const col=getColumn_(map,category,'bay');
  if(col>=0)return col;
  const date=getColumn_(map,category,'timestamp');
  return category==='carpet' && date>=0 && date+1<headers.length && !normalizeHeader_(headers[date+1])?date+1:-1;
}

function moveColumnMap_(sourceHeaders,targetHeaders,category,row,notes,formulas){
  const sourceMap=makeHeaderMap_(sourceHeaders),targetMap=makeHeaderMap_(targetHeaders),used=new Set();
  const sourceBay=moveBayColumn_(sourceHeaders,sourceMap,category),targetBay=moveBayColumn_(targetHeaders,targetMap,category);
  return sourceHeaders.map((header,index)=>{
    let target=-1;
    if(index===sourceBay)target=targetBay;
    else {
      const field=Object.keys(HEADER_ALIASES[category]).find(key=>getColumn_(sourceMap,category,key)===index);
      if(field)target=getColumn_(targetMap,category,field);
      else if(normalizeHeader_(header))target=targetHeaders.findIndex(h=>normalizeHeader_(h)===normalizeHeader_(header));
      else if(index<targetHeaders.length && !normalizeHeader_(targetHeaders[index]))target=index;
    }
    if(target<0 || used.has(target)){
      if((row[index]!=='' && row[index]!==null && row[index]!==undefined) || notes[index] || formulas[index])throw new Error('The selected bay has no matching column for '+(header||'column '+(index+1))+'. No changes were saved.');
      return -1;
    }
    used.add(target);return target;
  });
}

function emptyMoveRow_(sheet){
  const lastRow=sheet.getLastRow(),width=Math.max(sheet.getLastColumn(),1);
  const map=makeHeaderMap_(sheet.getRange(1,1,1,width).getDisplayValues()[0]);
  // Locate candidates using the product column, then inspect only the candidate row.
  const nameCol=Object.values(HEADER_ALIASES).map(aliases=>resolveColumn_(map,aliases.name)).find(c=>c>=0);
  if(nameCol===undefined)throw new Error('The destination bay has no product-name column.');
  const names=lastRow>1?sheet.getRange(2,nameCol+1,lastRow-1,1).getDisplayValues():[];
  for(let r=2;r<=lastRow;r++){
    if(String(names[r-2][0]||'').trim())continue;
    const range=sheet.getRange(r,1,1,width),values=range.getValues()[0],formulas=range.getFormulas()[0],notes=range.getNotes()[0];
    if(values.every((value,c)=>(value==='' || value===null || value===false) && !formulas[c] && !notes[c]))return r;
  }
  return Math.max(2,lastRow+1);
}

function addMoveHistory_(requests,ss,category,inventoryId,before,after,user){
  let history=ss.getSheetByName(APP.HISTORY_SHEET),id;
  if(history)id=history.getSheetId();
  else {
    const ids=new Set(ss.getSheets().map(s=>s.getSheetId()));id=1;while(ids.has(id))id++;
    requests.push({addSheet:{properties:{sheetId:id,title:APP.HISTORY_SHEET,gridProperties:{rowCount:1000,columnCount:14,frozenRowCount:1}}}});
    requests.push({appendCells:{sheetId:id,rows:[{values:['Timestamp','Category','Inventory ID','Product','Action','Amount','Unit','Before','After','Employee','Email','Reason','Notes','Source Sheet'].map(s=>({userEnteredValue:{stringValue:s}}))}],fields:'userEnteredValue'}});
  }
  const describe=item=>item.sourceSheet+' · Location '+(item.location||'not set')+(item.category==='tile'?' · Right / Left '+(item.side||'not set'):'')+(item.bay?' · '+item.bay:'');
  const cells=[Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss'),category,inventoryId,before.name,'Moved','', '',describe(before),describe(after),user.name,user.email,'Location / bay change','Quantity and confirmation date unchanged',after.sourceSheet];
  requests.push({appendCells:{sheetId:id,rows:[{values:cells.map(value=>({userEnteredValue:{stringValue:String(value)}}))}],fields:'userEnteredValue'}});
}
