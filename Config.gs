const APP = Object.freeze({
  HISTORY_SHEET: 'App History',
  SESSION_SECONDS: 21600,
  INVENTORY_ID_HEADER: 'Inventory ID',
  CACHE_SECONDS: 120,
  CATEGORIES: ['carpet', 'tile', 'vinyl'],
});

const HEADER_ALIASES = Object.freeze({
  carpet: {
    name: ['Name of carpet', 'Name of Carpet', 'Carpets'],
    location: ['Location', 'Location '],
    originalQty: ['Total amount ordered', 'Total Amount Ordered'],
    onHand: ['Total on hand', 'Total On Hand'],
    pending: ['Pending orders', 'Pending Orders'],
    photo: ['link to photos', 'Link to photos', 'Photo', 'Photo Link'],
    sample: ['Has Sample on Rack', 'Sample on Rack'],
    reprice: ['Needs Reprice', 'Needs Reprice?'],
    price: ['$.$$/Yard', '$/Yard', 'Price/Yard', 'Price per Yard'],
    confirmed: ['confirmed', 'Confirmed'],
    timestamp: ['Time stamp', 'Time Stamp', 'Timestamp'],
    bay: ['Bay', 'Bay Notes', 'Location Notes', 'Notes'],
    inventoryId: [APP.INVENTORY_ID_HEADER],
  },
  tile: {
    name: ['Name of Tile', 'Name of Tile ', 'Tile Name'],
    location: ['Location', 'Location '],
    side: ['R-L', 'R/L', 'Side'],
    originalQty: ['Total amount ordered', 'Total Amount Ordered'],
    onHand: ['Total on hand', 'Total On Hand'],
    boxes: ['Boxes', 'Boxes On Hand'],
    pending: ['Pending orders', 'Pending Orders'],
    price: ['$.$$/ft.²', '$/ft²', '$/SF', 'Price/SF'],
    confirmed: ['confirmed', 'Confirmed'],
    timestamp: ['Time stamp', 'Time Stamp', 'Timestamp'],
    sku: ['SKU', 'Sku'],
    sfPerBox: ['SF/Box', 'SF per Box', 'Sq Ft/Box'],
    grout: ['Grout', 'Recommended Grout'],
    inventoryId: [APP.INVENTORY_ID_HEADER],
  },
  vinyl: {
    name: ['Name of Vinyl', 'Vinyl Name', 'Product Name', 'Name'],
    code: ['Code', 'Product Code', 'Box Code'],
    thickness: ['Thickness', 'Thickness mm', 'Overall Thickness'],
    location: ['Location', 'Location '],
    bay: ['Bay', 'Bay Notes'],
    boxes: ['Boxes', 'Boxes On Hand'],
    onHand: ['Total on hand', 'Total On Hand', 'Total SF'],
    sfPerBox: ['SF/Box', 'SF per Box', 'Sq Ft/Box'],
    sku: ['SKU', 'Sku'],
    timestamp: ['Time stamp', 'Time Stamp', 'Timestamp'],
    inventoryId: [APP.INVENTORY_ID_HEADER],
  },
});

function getSpreadsheetId_(category) {
  const props = PropertiesService.getScriptProperties();
  const key = `${String(category).toUpperCase()}_SPREADSHEET_ID`;
  const id = props.getProperty(key);
  if (!id) throw new Error(`${key} is not configured in Script Properties.`);
  return id;
}

function getSpreadsheet_(category) {
  return SpreadsheetApp.openById(getSpreadsheetId_(category));
}

function isInventorySheet_(sheet, category) {
  if (sheet.getName() === APP.HISTORY_SHEET) return false;
  if (/master/i.test(sheet.getName())) return false;
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = makeHeaderMap_(headers);
  return resolveColumn_(map, HEADER_ALIASES[category].name) !== -1;
}

function getInventorySheets_(category) {
  return getSpreadsheet_(category).getSheets().filter(s => isInventorySheet_(s, category));
}

function makeHeaderMap_(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader_(h);
    if (key) map[key] = i;
  });
  return map;
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveColumn_(headerMap, aliases) {
  for (const alias of aliases || []) {
    const idx = headerMap[normalizeHeader_(alias)];
    if (idx !== undefined) return idx;
  }
  return -1;
}

function getColumn_(headerMap, category, field) {
  return resolveColumn_(headerMap, HEADER_ALIASES[category][field] || []);
}

function numeric_(value) {
  if (typeof value === 'number') return value;
  const cleaned = String(value ?? '').replace(/[$,]/g, '').trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function rounded_(n, places) {
  const p = Math.pow(10, places || 2);
  return Math.round((Number(n) + Number.EPSILON) * p) / p;
}
