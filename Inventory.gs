function getAppBootstrap(token) {
  const user = requireSession_(token, false);
  return {
    user,
    categories: APP.CATEGORIES,
    carpetSheets: safeSheetNames_('carpet'),
    vinylConfigured: !!PropertiesService.getScriptProperties().getProperty('VINYL_SPREADSHEET_ID'),
    scannerUrl: PropertiesService.getScriptProperties().getProperty('SCANNER_URL') || '',
    appUrl: ScriptApp.getService().getUrl(),
    environment: PropertiesService.getScriptProperties().getProperty('INVENTORY_ENVIRONMENT') || 'test',
  };
}

function safeSheetNames_(category) {
  try {
    return getInventorySheets_(category).map(s => s.getName());
  } catch (e) {
    return [];
  }
}

function getInventory(token, category, query) {
  requireSession_(token, false);
  category = String(category || '').toLowerCase();
  if (!APP.CATEGORIES.includes(category)) throw new Error('Invalid inventory category.');

  const cacheKey = `inventory:${category}`;
  const cache = CacheService.getScriptCache();
  let items;
  const cached = cache.get(cacheKey);
  if (cached) {
    items = JSON.parse(cached);
  } else {
    items = readInventory_(category);
    try { cache.put(cacheKey, JSON.stringify(items), APP.CACHE_SECONDS); } catch (e) {}
  }

  const q = String(query || '').trim().toLowerCase();
  if (!q) return items;
  const terms = q.split(/\s+/);
  return items.filter(item => terms.every(term => JSON.stringify(item).toLowerCase().includes(term)));
}

function readInventory_(category) {
  const sheets = getInventorySheets_(category);
  const all = [];
  sheets.forEach(sheet => {
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return;

    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const display = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    const headers = display[0];
    const map = makeHeaderMap_(headers);
    const nameCol = getColumn_(map, category, 'name');
    if (nameCol < 0) return;

    for (let r = 1; r < values.length; r++) {
      const name = String(display[r][nameCol] || '').trim();
      if (!name) continue;
      all.push(normalizeRow_(category, sheet.getName(), r + 1, values[r], display[r], map));
    }
  });
  return all.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function normalizeRow_(category, sheetName, rowNumber, row, displayRow, map) {
  const value = field => {
    const i = getColumn_(map, category, field);
    return i >= 0 ? row[i] : '';
  };
  const shown = field => {
    const i = getColumn_(map, category, field);
    return i >= 0 ? displayRow[i] : '';
  };
  const id = shown('inventoryId') || `${category}:${sheetName}:${rowNumber}`;

  if (category === 'carpet') {
    const parsed = parseCarpetQuantity_(shown('onHand'));
    return {
      id,
      category,
      sourceSheet: sheetName,
      name: shown('name'),
      location: shown('location'),
      bay: shown('bay') || fallbackBayNote_(displayRow, map, category),
      originalQty: shown('originalQty'),
      quantity: parsed.quantity,
      quantityDisplay: shown('onHand'),
      quantityMode: parsed.mode,
      estimated: parsed.estimated,
      unit: 'ft',
      sample: shown('sample'),
      needsReprice: shown('reprice'),
      price: shown('price'),
      confirmed: shown('confirmed'),
      timestamp: shown('timestamp'),
    };
  }

  if (category === 'tile') {
    const boxes = numeric_(value('boxes'));
    const sfPerBox = numeric_(value('sfPerBox'));
    const totalSf = numeric_(value('onHand')) ?? (boxes !== null && sfPerBox !== null ? rounded_(boxes * sfPerBox, 2) : null);
    return {
      id,
      category,
      sourceSheet: sheetName,
      name: shown('name'),
      sku: shown('sku'),
      location: shown('location'),
      side: shown('side'),
      boxes,
      sfPerBox,
      totalSf,
      quantity: boxes,
      quantityDisplay: boxes === null ? '' : String(boxes),
      unit: 'boxes',
      price: shown('price'),
      grout: shown('grout'),
      confirmed: shown('confirmed'),
      timestamp: shown('timestamp'),
    };
  }

  const boxes = numeric_(value('boxes'));
  const sfPerBox = numeric_(value('sfPerBox'));
  const totalSf = numeric_(value('onHand')) ?? (boxes !== null && sfPerBox !== null ? rounded_(boxes * sfPerBox, 2) : null);
  return {
    id,
    category,
    sourceSheet: sheetName,
    name: shown('name'),
    code: shown('code'),
    thickness: shown('thickness'),
    sku: shown('sku'),
    location: shown('location'),
    bay: shown('bay'),
    boxes,
    sfPerBox,
    totalSf,
    quantity: boxes,
    quantityDisplay: boxes === null ? '' : String(boxes),
    unit: 'boxes',
    timestamp: shown('timestamp'),
  };
}

function fallbackBayNote_(displayRow, map, category) {
  const ts = getColumn_(map, category, 'timestamp');
  if (ts >= 0 && ts + 1 < displayRow.length && ts + 1 !== getColumn_(map, category, 'inventoryId')) return String(displayRow[ts + 1] || '').trim();
  return '';
}

function parseCarpetQuantity_(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { quantity: null, estimated: false, mode: 'unknown' };
  const estimated = /^\s*E\s*-/i.test(text);
  if (/\d\s*[x×]\s*\d/i.test(text)) return { quantity: null, estimated, mode: 'dimension' };
  const cleaned = text.replace(/^\s*E\s*-\s*/i, '').replace(/,/g, '');
  const n = Number(cleaned);
  return { quantity: Number.isFinite(n) ? n : null, estimated, mode: Number.isFinite(n) ? 'linear' : 'unknown' };
}

function adjustInventory(token, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return adjustInventory_(token, payload); } finally { lock.releaseLock(); }
}

function adjustInventory_(token, payload) {
  const user = requireSession_(token, true);
  payload = payload || {};
  const category = String(payload.category || '').toLowerCase();
  const action = String(payload.action || '').toLowerCase();
  const amount = Number(payload.amount);
  if (category !== 'carpet' && !Number.isInteger(amount)) throw new Error('Enter a whole number of boxes.');
  if (!APP.CATEGORIES.includes(category)) throw new Error('Invalid category.');
  if (!['add', 'subtract'].includes(action)) throw new Error('Action must be add or subtract.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a quantity greater than zero.');

  const found = findRecordById_(category, payload.inventoryId);
  if (!found) throw new Error('Inventory item was not found. Refresh and try again.');
  const { sheet, rowNumber, map, displayRow, row } = found;

  let before;
  let after;
  let unit;
  let beforeDisplay;
  let afterDisplay;

  if (category === 'carpet') {
    const onHandCol = getColumn_(map, category, 'onHand');
    if (onHandCol < 0) throw new Error('Total on hand column was not found.');
    const parsed = parseCarpetQuantity_(displayRow[onHandCol]);
    if (parsed.mode === 'dimension') throw new Error('This carpet is stored as dimensions (for example 11x10). Use the sheet directly for this item for now.');
    if (parsed.quantity === null) throw new Error('Current carpet quantity is not numeric.');
    before = parsed.quantity;
    after = rounded_(action === 'add' ? before + amount : before - amount, 2);
    if (after < 0) throw new Error('This adjustment would make inventory negative.');
    beforeDisplay = displayRow[onHandCol];
    afterDisplay = `${parsed.estimated ? 'E-' : ''}${trimNumber_(after)}`;
    sheet.getRange(rowNumber, onHandCol + 1).setValue(afterDisplay);
    unit = 'ft';
  } else {
    const boxesCol = getColumn_(map, category, 'boxes');
    if (boxesCol < 0) throw new Error('Boxes column was not found.');
    before = numeric_(row[boxesCol]);
    if (before === null) throw new Error('Current box quantity is not numeric.');
    after = action === 'add' ? before + amount : before - amount;
    if (after < 0) throw new Error('This adjustment would make inventory negative.');
    if (!Number.isInteger(after)) throw new Error('Box adjustments must result in a whole number of boxes.');
    sheet.getRange(rowNumber, boxesCol + 1).setValue(after);
    beforeDisplay = String(before);
    afterDisplay = String(after);
    unit = 'boxes';

    const sfCol = getColumn_(map, category, 'sfPerBox');
    const onHandCol = getColumn_(map, category, 'onHand');
    const sfPerBox = sfCol >= 0 ? numeric_(row[sfCol]) : null;
    if (onHandCol >= 0 && sfPerBox !== null) {
      sheet.getRange(rowNumber, onHandCol + 1).setValue(rounded_(after * sfPerBox, 2));
    }
  }

  updateTimestamp_(sheet, rowNumber, map, category);
  appendHistory_(category, {
    inventoryId: payload.inventoryId,
    product: String(displayRow[getColumn_(map, category, 'name')] || ''),
    action: action === 'add' ? 'Add' : 'Subtract',
    amount,
    unit,
    before: beforeDisplay,
    after: afterDisplay,
    employee: user.name,
    email: user.email,
    reason: payload.reason || '',
    notes: payload.notes || '',
    sourceSheet: sheet.getName(),
  });

  CacheService.getScriptCache().remove(`inventory:${category}`);
  return { ok: true, before: beforeDisplay, after: afterDisplay };
}

function addCarpetRoll(token, data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return addCarpetRoll_(token, data); } finally { lock.releaseLock(); }
}

function addCarpetRoll_(token, data) {
  const user = requireSession_(token, true);
  data = data || {};
  const name = String(data.name || '').trim();
  const sheetName = String(data.sheetName || '').trim();
  const originalQty = Number(data.originalQty);
  const currentQty = Number(data.currentQty);
  if (!name) throw new Error('Carpet name is required.');
  if (!sheetName) throw new Error('Choose a carpet sheet.');
  if (!Number.isFinite(originalQty) || originalQty <= 0) throw new Error('Original footage must be greater than zero.');
  if (!Number.isFinite(currentQty) || currentQty < 0) throw new Error('Current footage must be zero or greater.');
  if (data.price !== '' && data.price !== undefined && data.price !== null && (!Number.isFinite(Number(data.price)) || Number(data.price) < 0)) throw new Error('Price must be a valid nonnegative number.');

  const ss = getSpreadsheet_('carpet');
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || !isInventorySheet_(sheet, 'carpet')) throw new Error('Selected carpet sheet is not valid.');

  ensureInventoryIdColumn_(sheet, 'carpet');
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const map = makeHeaderMap_(headers);
  const nameCol = getColumn_(map, 'carpet', 'name');
  const rowNumber = firstBlankInventoryRow_(sheet, nameCol);
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),rowNumber-sheet.getMaxRows());
  const id = `CAR-${Utilities.getUuid().slice(0, 8).toUpperCase()}`;

  setIfPresent_(sheet, rowNumber, map, 'carpet', 'inventoryId', id);
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'name', name);
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'location', data.location || '');
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'originalQty', originalQty);
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'onHand', `${data.estimated ? 'E-' : ''}${trimNumber_(currentQty)}`);
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'pending', '');
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'photo', data.photo || '');
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'sample', data.sample || '');
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'reprice', data.reprice || '');
  if (data.price !== '' && data.price !== null && data.price !== undefined) setIfPresent_(sheet, rowNumber, map, 'carpet', 'price', Number(data.price));
  setIfPresent_(sheet, rowNumber, map, 'carpet', 'confirmed', data.confirmed === true);
  updateTimestamp_(sheet, rowNumber, map, 'carpet');

  const bayCol = getColumn_(map, 'carpet', 'bay');
  if (bayCol >= 0) {
    sheet.getRange(rowNumber, bayCol + 1).setValue(literalValue_(data.bay || ''));
  } else {
    const tsCol = getColumn_(map, 'carpet', 'timestamp');
    if (tsCol >= 0 && tsCol + 1 < sheet.getMaxColumns() && tsCol + 1 !== getColumn_(map, 'carpet', 'inventoryId')) sheet.getRange(rowNumber, tsCol + 2).setValue(literalValue_(data.bay || ''));
  }

  appendHistory_('carpet', {
    inventoryId: id,
    product: name,
    action: 'New Roll Added',
    amount: currentQty,
    unit: 'ft',
    before: '',
    after: `${data.estimated ? 'E-' : ''}${trimNumber_(currentQty)}`,
    employee: user.name,
    email: user.email,
    reason: '',
    notes: data.notes || '',
    sourceSheet: sheetName,
  });

  CacheService.getScriptCache().remove('inventory:carpet');
  return { ok: true, id, name, rowNumber, sheetName };
}

function getHistory(token, limit) {
  requireSession_(token, false);
  limit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const rows = [];
  APP.CATEGORIES.forEach(category => {
    try {
      const ss = getSpreadsheet_(category);
      const sheet = ss.getSheetByName(APP.HISTORY_SHEET);
      if (!sheet || sheet.getLastRow() < 2) return;
      const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();
      values.forEach(r => rows.push({
        timestamp: r[0], category: r[1], inventoryId: r[2], product: r[3], action: r[4],
        amount: r[5], unit: r[6], before: r[7], after: r[8], employee: r[9], email: r[10],
        reason: r[11], notes: r[12], sourceSheet: r[13],
      }));
    } catch (e) {}
  });
  return rows.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, limit);
}

function findRecordById_(category, inventoryId) {
  const sheets = getInventorySheets_(category);
  for (const sheet of sheets) {
    ensureInventoryIdColumn_(sheet, category);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) continue;
    const display = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
    const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const map = makeHeaderMap_(display[0]);
    const idCol = getColumn_(map, category, 'inventoryId');
    if (idCol < 0) continue;
    for (let r = 1; r < display.length; r++) {
      if (String(display[r][idCol]).trim() === String(inventoryId).trim()) {
        return { sheet, rowNumber: r + 1, map, displayRow: display[r], row: values[r] };
      }
    }
  }
  return null;
}

function ensureInventoryIdColumn_(sheet, category) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  let map = makeHeaderMap_(headers);
  let idCol = getColumn_(map, category, 'inventoryId');
  if (idCol < 0) {
    idCol = lastCol;
    if (idCol >= sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(),1);
    sheet.getRange(1, idCol + 1).setValue(APP.INVENTORY_ID_HEADER);
    map = makeHeaderMap_(sheet.getRange(1, 1, 1, idCol + 1).getDisplayValues()[0]);
  }
  const nameCol = getColumn_(map, category, 'name');
  const currentLastRow = sheet.getLastRow();
  if (nameCol < 0 || currentLastRow < 2) return;
  const names = sheet.getRange(2, nameCol + 1, currentLastRow - 1, 1).getDisplayValues();
  const ids = sheet.getRange(2, idCol + 1, currentLastRow - 1, 1).getDisplayValues();
  const prefix = category === 'carpet' ? 'CAR' : category === 'tile' ? 'TILE' : 'VIN';
  let changed = false;
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() && !String(ids[i][0]).trim()) {
      ids[i][0] = `${prefix}-${Utilities.getUuid().toUpperCase()}`;
      changed = true;
    }
  }
  if (changed) sheet.getRange(2,idCol+1,ids.length,1).setValues(ids);
}

function firstBlankInventoryRow_(sheet, nameCol) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const names = sheet.getRange(2, nameCol + 1, lastRow - 1, 1).getDisplayValues();
  for (let i = 0; i < names.length; i++) {
    if (!String(names[i][0]).trim()) return i + 2;
  }
  return lastRow + 1;
}

function setIfPresent_(sheet, rowNumber, map, category, field, value) {
  const col = getColumn_(map, category, field);
  if (col >= 0) sheet.getRange(rowNumber, col + 1).setValue(literalValue_(value));
}

function updateTimestamp_(sheet, rowNumber, map, category) {
  const col = getColumn_(map, category, 'timestamp');
  if (col >= 0) sheet.getRange(rowNumber, col + 1).setValue(new Date());
}

function appendHistory_(category, entry) {
  const ss = getSpreadsheet_(category);
  let sheet = ss.getSheetByName(APP.HISTORY_SHEET);
  if (!sheet) sheet = ss.insertSheet(APP.HISTORY_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp','Category','Inventory ID','Product','Action','Amount','Unit','Before','After','Employee','Email','Reason','Notes','Source Sheet']);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow([
    new Date(), category, entry.inventoryId, entry.product, entry.action, entry.amount, entry.unit,
    entry.before, entry.after, entry.employee, entry.email, entry.reason, entry.notes, entry.sourceSheet,
  ].map(literalValue_));
}

function literalValue_(value) {
  return typeof value === 'string' && /^[=+@]/.test(value) ? "'" + value : value;
}

function trimNumber_(n) {
  return Number.isInteger(Number(n)) ? String(Number(n)) : String(rounded_(Number(n), 2));
}
