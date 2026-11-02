function addTileItem(token,data){
  const user=requireSession_(token,true),lock=LockService.getScriptLock();lock.waitLock(30000);
  try{return addTileItem_(user,data||{});}finally{lock.releaseLock();}
}
function addTileItem_(user,data){
  const name=String(data.name||'').trim(),sheetName=String(data.sheetName||''),location=String(data.location||'').trim(),side=String(data.side||'').trim(),sku=String(data.sku||'').trim();
  const boxes=Number(data.boxes),sfPerBox=Number(data.sfPerBox),totalSf=rounded_(boxes*sfPerBox,2);
  if(!name || name.length>200)throw new Error('Enter a tile name, up to 200 characters.');
  if(!Number.isInteger(boxes)||boxes<0)throw new Error('Enter a whole number of boxes, zero or greater.');
  if(!Number.isFinite(sfPerBox)||sfPerBox<=0||!Number.isFinite(totalSf))throw new Error('Enter valid square feet per box, greater than zero.');
  if(!['','Left','Right'].includes(side))throw new Error('Choose Left, Right or Not set.');
  if(location.length>100||sku.length>100)throw new Error('Please shorten the location or SKU.');
  if(data.price!=='' && data.price!=null && (!Number.isFinite(Number(data.price))||Number(data.price)<0))throw new Error('Price must be a valid nonnegative number.');
  const ss=getSpreadsheet_('tile'),sheet=ss.getSheetByName(sheetName);
  if(!sheet || !isInventorySheet_(sheet,'tile'))throw new Error('Choose an inventory bay from the list.');
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getDisplayValues()[0],requests=[];let map=makeHeaderMap_(headers);
  if(['name','boxes','sfPerBox','onHand'].some(field=>getColumn_(map,'tile',field)<0))throw new Error('The selected bay needs name, boxes, SF/box and on-hand columns. No item was added.');
  if(side && getColumn_(map,'tile','side')<0)throw new Error('The selected bay needs an R-L / Side column.');
  if(sku && getColumn_(map,'tile','sku')<0)throw new Error('The selected bay needs a SKU column to store this item code.');
  if(getColumn_(map,'tile','inventoryId')<0){
    headers.push(APP.INVENTORY_ID_HEADER);map=makeHeaderMap_(headers);
    if(headers.length>sheet.getMaxColumns())requests.push({appendDimension:{sheetId:sheet.getSheetId(),dimension:'COLUMNS',length:headers.length-sheet.getMaxColumns()}});
    requests.push(inventoryCellWrite_(sheet.getSheetId(),1,headers.length-1,APP.INVENTORY_ID_HEADER));
  }
  const rowNumber=emptyMoveRow_(sheet);validateRollLocation_(sheet,rowNumber,getColumn_(map,'tile','location'),location,'item');
  if(rowNumber>sheet.getMaxRows()){
    requests.push({appendDimension:{sheetId:sheet.getSheetId(),dimension:'ROWS',length:rowNumber-sheet.getMaxRows()}});
    for(const pasteType of ['PASTE_FORMAT','PASTE_DATA_VALIDATION'])requests.push({copyPaste:{source:{sheetId:sheet.getSheetId(),startRowIndex:1,endRowIndex:2,startColumnIndex:0,endColumnIndex:sheet.getLastColumn()},destination:{sheetId:sheet.getSheetId(),startRowIndex:rowNumber-1,endRowIndex:rowNumber,startColumnIndex:0,endColumnIndex:sheet.getLastColumn()},pasteType}});
  }
  const id='TILE-'+Utilities.getUuid().toUpperCase(),row=Array(headers.length).fill(''),display=row.slice();
  const put=(field,value)=>{const column=getColumn_(map,'tile',field);if(column<0)return;requests.push(inventoryCellWrite_(sheet.getSheetId(),rowNumber,column,value));row[column]=value;display[column]=value instanceof Date?Utilities.formatDate(value,Session.getScriptTimeZone(),'M/d/yyyy'):typeof value==='boolean'?String(value).toUpperCase():String(value);};
  put('inventoryId',id);put('name',name);put('sku',sku);put('location',location);put('side',side);put('boxes',boxes);put('sfPerBox',sfPerBox);put('onHand',totalSf);put('confirmed',false);put('timestamp',new Date());
  if(data.price!==''&&data.price!=null)put('price',Number(data.price));
  appendInventoryHistoryBatch_(requests,ss,'tile',{inventoryId:id,product:name,action:'New Tile Added',amount:boxes,unit:'boxes',before:'',after:boxes+' boxes / '+trimNumber_(totalSf)+' SF',employee:user.name,email:user.email,reason:'Manual inventory entry',notes:String(data.notes||'').slice(0,2000),sourceSheet:sheetName});
  Sheets.Spreadsheets.batchUpdate({requests},ss.getId());cacheInventoryChange_('tile',sheet,rowNumber,id);
  return {ok:true,id,name,sheetName,rowNumber,item:normalizeRow_('tile',sheetName,rowNumber,row,display,map)};
}
