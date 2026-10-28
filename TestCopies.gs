// Owner-only command: connect the app exclusively to the user's TEST COPY workbooks.
function useCopiedTestInventory() {
  requireProjectOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const copies = {
      carpet:'1n-6gVi12HXFWbpeNqoggDXWTbvp7eIP9uJyAg-An1Zk',
      tile:'14_WMEvurpW6MK-dU0exs1fnHlZ9l6YteUX5wLgvEA58'
    };
    const opened = {};
    Object.keys(copies).forEach(category => {
      const ss = SpreadsheetApp.openById(copies[category]);
      if (!ss.getName().startsWith('TEST COPY')) throw new Error('Refusing to modify a workbook that is not a TEST COPY.');
      const sheets = ss.getSheets().filter(sheet => isInventorySheet_(sheet,category));
      if (!sheets.length) throw new Error('No inventory tabs recognized in test copy: ' + category);
      opened[category] = {ss,sheets};
    });
    Object.keys(opened).forEach(category => opened[category].sheets.forEach(sheet => ensureInventoryIdColumn_(sheet,category)));
    PropertiesService.getScriptProperties().setProperties({
      CARPET_SPREADSHEET_ID:copies.carpet,
      TILE_SPREADSHEET_ID:copies.tile,
      TEST_COPY_CARPET_ID:copies.carpet,
      TEST_COPY_TILE_ID:copies.tile,
      INVENTORY_ENVIRONMENT:'test-copies'
    });
    CacheService.getScriptCache().removeAll(['inventory:carpet','inventory:tile','inventory:vinyl']);
    Object.keys(opened).forEach(category => console.log(category + ': ' + opened[category].sheets.map(s => s.getName()).join(', ')));
    console.log('Test app connected to workbook copies only. Live workbooks were not modified.');
  } finally { lock.releaseLock(); }
}
