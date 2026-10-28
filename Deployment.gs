// Editor-only setup. Trailing underscores prevent browser RPC access.
function setupTestInventory() {
  requireProjectOwner_();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TEST_SETUP_COMPLETE')) throw new Error('Test inventory already exists. Use the configured workbooks.');
  const result = configureTestInventory_();
  const pin = String(Math.floor(100000000000 + Math.random() * 900000000000));
  setInventoryUser_('test@example.invalid', 'Test Employee', 'employee', pin);
  setInventoryUser_('view@example.invalid', 'Test Viewer', 'view', pin);
  props.setProperties({TEST_SETUP_COMPLETE: 'true', TEST_LOGIN_PIN: pin});
  console.log(JSON.stringify(result));
  console.log('Test login PIN is in Script Properties: TEST_LOGIN_PIN.');
}

function requireProjectOwner_() {
  const email = Session.getActiveUser().getEmail();
  if (!email || email !== Session.getEffectiveUser().getEmail()) throw new Error('Run setup as the project owner in the Apps Script editor.');
}

function setupProductionInventory() {
  requireProjectOwner_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('PRODUCTION_SETUP_COMPLETE')) throw new Error('Production is already configured.');
    const sourceIds = {carpet:'1lfwroNKPm8i77hofylES5_hqnR1Kel-61U8IPxaWg3s',tile:'1vUJZ_2wWnJYzckOo-k12inYmvTI0f4qcpr7ydGQr2jE'};
    // Check access and schema for both workbooks before changing either one.
    const sources = {};
    Object.keys(sourceIds).forEach(category => {
      const ss = SpreadsheetApp.openById(sourceIds[category]);
      const sheets = ss.getSheets().filter(s => isInventorySheet_(s, category));
      if (!sheets.length) throw new Error('No compatible inventory tabs found for ' + category);
      sheets.forEach(s => {
        const map = makeHeaderMap_(s.getRange(1,1,1,s.getLastColumn()).getDisplayValues()[0]);
        const required = category === 'carpet' ? ['name','onHand'] : ['name','boxes','sfPerBox','onHand'];
        if (required.some(field => getColumn_(map,category,field) < 0)) throw new Error('Missing required headers in ' + s.getName());
      });
      sources[category] = {ss,sheets};
    });
    Object.keys(sources).forEach(category => {
      const backupKey = category.toUpperCase() + '_BACKUP_ID';
      if (!props.getProperty(backupKey)) {
        const backup = SpreadsheetApp.create('Flair Inventory Backup ' + category + ' ' + new Date().toISOString());
        backup.getSheets()[0].setName('Backup Info ' + Utilities.getUuid().slice(0,8));
        sources[category].ss.getSheets().forEach(s => s.copyTo(backup).setName(s.getName()));
        props.setProperty(backupKey, backup.getId());
      }
    });
    Object.keys(sources).forEach(category => sources[category].sheets.forEach(sheet => ensureInventoryIdColumn_(sheet,category)));
    configureProduction_();
    saveUsers_([]);
    const email = Session.getEffectiveUser().getEmail();
    const pin = Utilities.getUuid().replace(/-/g,'').slice(0,16);
    setInventoryUser_(email,'Flair Administrator','admin',pin);
    props.setProperties({PRODUCTION_SETUP_COMPLETE:'true',INITIAL_ADMIN_EMAIL:email,INITIAL_ADMIN_PIN:pin,INVENTORY_ENVIRONMENT:'production'});
    props.deleteProperty('TEST_LOGIN_PIN');
    CacheService.getScriptCache().removeAll(['inventory:carpet','inventory:tile','inventory:vinyl']);
    console.log('Production configured. Backup IDs and initial admin credentials are in Script Properties. Test accounts have been removed.');
  } finally { lock.releaseLock(); }
}

function configureProduction_() {
  PropertiesService.getScriptProperties().setProperties({
    CARPET_SPREADSHEET_ID: '1lfwroNKPm8i77hofylES5_hqnR1Kel-61U8IPxaWg3s',
    TILE_SPREADSHEET_ID: '1vUJZ_2wWnJYzckOo-k12inYmvTI0f4qcpr7ydGQr2jE',
    SCANNER_URL: 'https://shloimyusb.github.io/flair-inventory-app/scanner.html'
  });
}

// Creates isolated test workbooks; never changes the production workbooks.
// Run this before configureProduction_, then exercise the deployed UI.
function configureTestInventory_() {
  const carpet = SpreadsheetApp.create('Flair Inventory TEST Carpet');
  carpet.getSheets()[0].setName('Test Carpet').getRange(1,1,3,5).setValues([
    ['Name of carpet','Location','Total amount ordered','Total on hand','Bay'],
    ['TEST Estimated Roll','TEST',100,'E-95','TEST'],
    ['TEST Exact Roll','TEST',100,80,'TEST']
  ]);
  const tile = SpreadsheetApp.create('Flair Inventory TEST Tile');
  tile.getSheets()[0].setName('Test Tile').getRange(1,1,2,7).setValues([
    ['Name of Tile','Location','Boxes','SF/Box','Total on hand','SKU','R-L'],
    ['TEST Tile','TEST',10,12.5,125,'TEST-SKU','R']
  ]);
  PropertiesService.getScriptProperties().setProperties({
    CARPET_SPREADSHEET_ID:carpet.getId(), TILE_SPREADSHEET_ID:tile.getId(),
    SCANNER_URL:'https://shloimyusb.github.io/flair-inventory-app/scanner.html'
  });
  return initializeInventory_();
}
