// Shared primitives for atomic stock changes and their audit entries.
function inventoryCellValue_(value) {
  if(value instanceof Date){
    const local=Utilities.formatDate(value,Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm:ss');
    return {userEnteredValue:{numberValue:Date.parse(local.replace(' ','T')+'Z')/86400000+25569},userEnteredFormat:{numberFormat:{type:'DATE_TIME',pattern:'yyyy-mm-dd hh:mm:ss'}}};
  }
  if(typeof value==='number')return {userEnteredValue:{numberValue:value}};
  if(typeof value==='boolean')return {userEnteredValue:{boolValue:value}};
  return {userEnteredValue:{stringValue:String(value??'')}};
}
function inventoryCellWrite_(sheetId,rowNumber,column,value){
  const cell=inventoryCellValue_(value);
  if(value instanceof Date)cell.userEnteredFormat.numberFormat={type:'DATE',pattern:'m/d/yyyy'};
  return {updateCells:{range:moveGrid_(sheetId,rowNumber,column),rows:[{values:[cell]}],fields:value instanceof Date?'userEnteredValue,userEnteredFormat.numberFormat':'userEnteredValue'}};
}
function appendInventoryHistoryBatch_(requests,ss,category,entry){
  const history=ss.getSheetByName(APP.HISTORY_SHEET);let id=history&&history.getSheetId();
  if(!history){
    const ids=new Set(ss.getSheets().map(s=>s.getSheetId()));id=1;while(ids.has(id))id++;
    requests.push({addSheet:{properties:{sheetId:id,title:APP.HISTORY_SHEET,gridProperties:{rowCount:1000,columnCount:14,frozenRowCount:1}}}});
    requests.push({appendCells:{sheetId:id,rows:[{values:['Timestamp','Category','Inventory ID','Product','Action','Amount','Unit','Before','After','Employee','Email','Reason','Notes','Source Sheet'].map(inventoryCellValue_)}],fields:'userEnteredValue'}});
  }
  const values=[new Date(),category,entry.inventoryId,entry.product,entry.action,entry.amount,entry.unit,entry.before,entry.after,entry.employee,entry.email,entry.reason,entry.notes,entry.sourceSheet];
  requests.push({appendCells:{sheetId:id,rows:[{values:values.map(inventoryCellValue_)}],fields:'userEnteredValue,userEnteredFormat.numberFormat'}});
}
function cacheInventoryChange_(category,sheet,rowNumber,id){
  try{
    const cache=CacheService.getScriptCache();cache.remove('inventory:'+category);
    const raw=cache.get('recordIndex:'+category),info=raw?JSON.parse(raw):null;
    if(info && info.spreadsheetId===getSpreadsheetId_(category)){
      info.index[id]={sheetName:sheet.getName(),rowNumber};cache.put('recordIndex:'+category,JSON.stringify(info),APP.CACHE_SECONDS);
    }
  }catch(error){console.warn('Inventory saved; cache refresh unavailable: '+error.message);}
}
function validateRollLocation_(sheet,rowNumber,column,location){
  if(column<0 || !location)return;
  const rule=sheet.getRange(rowNumber>sheet.getMaxRows()?2:rowNumber,column+1).getDataValidation();
  if(!rule || rule.getAllowInvalid())return;
  const kind=String(rule.getCriteriaType()),args=rule.getCriteriaValues();let allowed;
  if(kind==='VALUE_IN_LIST')allowed=args[0];
  else if(kind==='VALUE_IN_RANGE')allowed=args[0].getDisplayValues().flat();
  else throw new Error('This location uses a custom sheet rule. Add the roll in Google Sheets. No roll was added.');
  if(!allowed.map(String).includes(location))throw new Error('Choose an allowed location: '+allowed.filter(Boolean).join(', ')+'. No roll was added.');
}

