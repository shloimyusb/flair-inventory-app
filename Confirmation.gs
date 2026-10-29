function confirmCarpet(token, inventoryId) {
  const user=requireSession_(token,true);
  if(!inventoryId)throw new Error('Choose a carpet roll to confirm.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try {
    const found=findRecordById_('carpet',inventoryId);
    if(!found)throw new Error('Carpet roll not found. Refresh and try again.');
    const {sheet,rowNumber,map,displayRow}=found;
    const confirmedCol=getColumn_(map,'carpet','confirmed'),dateCol=getColumn_(map,'carpet','timestamp');
    if(confirmedCol<0 || dateCol<0)throw new Error('This sheet needs both a Confirmed column and a Time stamp column.');
    const checkbox=sheet.getRange(rowNumber,confirmedCol+1),date=sheet.getRange(rowNumber,dateCol+1);
    const oldCheck=checkbox.getValue(),oldDate=date.getValue(),oldCheckFormula=checkbox.getFormula(),oldDateFormula=date.getFormula();
    try {
      checkbox.setValue(true);date.setValue(new Date());
      appendHistory_('carpet',{
        inventoryId,product:String(displayRow[getColumn_(map,'carpet','name')]||''),action:'Carpet Confirmed',
        amount:'',unit:'',before:String(displayRow[confirmedCol]||'Not confirmed')+' · '+String(displayRow[dateCol]||'No date'),
        after:'Confirmed · '+date.getDisplayValue(),employee:user.name,email:user.email,reason:'Physical inventory confirmation',notes:'Quantity unchanged',sourceSheet:sheet.getName()
      });
    } catch(error) {
      try {checkbox.setValue(oldCheckFormula||oldCheck);date.setValue(oldDateFormula||oldDate);} catch(rollbackError) {throw new Error('Could not complete confirmation. Refresh and check the sheet before retrying.');}
      throw error;
    } finally {CacheService.getScriptCache().remove('inventory:carpet');}
    const display=sheet.getRange(rowNumber,1,1,sheet.getLastColumn()).getDisplayValues()[0];
    return {ok:true,item:normalizeRow_('carpet',sheet.getName(),rowNumber,display,display,map)};
  } finally {lock.releaseLock();}
}
