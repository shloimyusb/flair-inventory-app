// ONE-TIME SETUP HELPERS
// 1) In Apps Script > Project Settings > Script Properties add:
//    CARPET_SPREADSHEET_ID
//    TILE_SPREADSHEET_ID
//    VINYL_SPREADSHEET_ID (later, when ready)
// 2) Run initializeInventory() once from the Apps Script editor.
// 3) Run setInventoryUser(email, name, role, pin) for each approved user.
// 4) Deploy as a Web App: execute as Me, access Anyone.
//    The app itself requires an approved email + PIN.

function initializeInventory_() {
  const result = {};
  ['carpet', 'tile', 'vinyl'].forEach(category => {
    try {
      const sheets = getInventorySheets_(category);
      sheets.forEach(sheet => ensureInventoryIdColumn_(sheet, category));
      result[category] = { ok: true, sheets: sheets.map(s => s.getName()) };
    } catch (e) {
      result[category] = { ok: false, error: e.message };
    }
  });
  return result;
}

function listConfiguredInventorySheets_() {
  const result = {};
  ['carpet', 'tile', 'vinyl'].forEach(category => {
    try {
      result[category] = getInventorySheets_(category).map(s => s.getName());
    } catch (e) {
      result[category] = [];
    }
  });
  return result;
}

