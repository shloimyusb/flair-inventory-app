// Editor-only setup. Trailing underscores prevent browser RPC access.
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
