# Flair Flooring Inventory — MVP

A mobile-friendly internal inventory app for Flair Flooring using:

- **GitHub** for source control
- **Google Apps Script** for the main live app and secure server-side logic
- **GitHub Pages** only for the camera-scanner helper page
- **Google Sheets** as the inventory source of truth

No Vercel or Lovable is required.

## Current MVP scope

### Carpet
- View/search current rolls and locations
- Preserve `E-95` style estimated footage
- Add/subtract footage
- Add a new carpet roll from the app
- Write changes directly to the existing carpet workbook

### Tile
- View/search tile inventory
- Show boxes, SF/box, total SF, location, side, SKU, grout
- Add/subtract whole boxes
- Recalculate total SF from `boxes × SF/box`
- Write changes directly to the existing tile workbook

### Vinyl
- Adapter is included and becomes active when `VINYL_SPREADSHEET_ID` is configured
- Designed for code + thickness + boxes + SF/box
- Camera OCR helper reads printed labels such as `1194-1` and `4.5 mm`

### History
- Every app adjustment is appended to an `App History` sheet in the corresponding workbook
- Records user, timestamp, before/after quantity, reason, notes, and source sheet

## Security model

The live Apps Script web app is deployed as the owner, so employees do **not** need direct access to the Google Sheets.

The app has its own approved-user list using email + PIN. PINs are stored as SHA-256 hashes in Apps Script Script Properties. Login sessions expire from Apps Script cache after approximately 6 hours.

For a small internal warehouse MVP this is simple and works with employees who have different email providers. A stronger SSO layer can be added later without changing the inventory architecture.

## One-time setup

### 1. Create an Apps Script project

Create a standalone Apps Script project and copy these files into it, or use `clasp` to push the repository.

### 2. Script Properties

In **Apps Script → Project Settings → Script Properties**, add:

- `CARPET_SPREADSHEET_ID` = the ID from the carpet Google Sheet URL
- `TILE_SPREADSHEET_ID` = the ID from the tile Google Sheet URL
- `VINYL_SPREADSHEET_ID` = add later when the vinyl workbook is ready
- `SCANNER_URL` = the GitHub Pages URL for `scanner.html` once Pages is enabled

Only the raw spreadsheet ID is needed, not the entire URL.

### 3. Initialize IDs

Run this function once from the Apps Script editor:

```javascript
initializeInventory_()
```

It detects inventory tabs by their headers, skips tabs containing `Master`, adds an `Inventory ID` column where needed, and gives populated rows a permanent ID.

**Important:** this intentionally changes the source sheets by adding the `Inventory ID` column. Make a backup first if you want a rollback copy.

### 4. Add approved users

Run once per user from the editor:

```javascript
setInventoryUser_('employee@example.com', 'Employee Name', 'employee', '4826')
```

Roles:

- `admin` — full access
- `employee` — view/add/subtract/add rolls
- `view` — view only

### 5. Deploy

Apps Script → **Deploy → New deployment → Web app**

- Execute as: **Me**
- Who has access: **Anyone**

The public deployment only shows the app login. Sheet access remains server-side under the Apps Script owner's account.

## Important behavior

### Carpet estimated values

`E-95` is parsed as 95 feet with `estimated = true`.

- subtract 20 → `E-75`
- add 10 → `E-105`

Plain `95` stays exact.

Dimension-style remnants such as `E-11x10` are displayed but are intentionally blocked from numeric add/subtract in this first build because a single linear-foot adjustment is ambiguous.

### Tile / vinyl

Adjustments are in whole boxes. If `SF/Box` exists, `Total on hand` is recalculated automatically.

### New carpet rolls

The app finds the first row where `Name of carpet` is blank rather than appending after thousands of preformatted rows.

## GitHub workflow with clasp

Install clasp locally:

```bash
npm install -g @google/clasp
clasp login
```

Create the Apps Script project first, copy `.clasp.json.example` to `.clasp.json`, paste the Apps Script project ID, then:

```bash
clasp push
```

Later changes can be committed to GitHub and pushed to Apps Script with `clasp push`.

## Next build step

Provide the vinyl Google Sheet so its exact headers can be mapped instead of relying on the generic vinyl aliases in `Config.gs`.

## Camera scanner hosting

Apps Script HTML Service blocks `navigator.mediaDevices.getUserMedia()` because camera/microphone APIs require permissions that its sandbox does not grant. Google recommends hosting camera functionality on a separate domain.

This repository therefore includes `scanner.html`. Publish that single page with GitHub Pages and put its final HTTPS URL into the `SCANNER_URL` Script Property. The scanner opens in a separate window, reads the label locally in the browser with Tesseract.js, then sends only the detected code/thickness back to the Apps Script app with `postMessage`.

The main inventory app still lives in Apps Script and all Google Sheet reads/writes stay server-side.


## Deployment status and safe validation
Local checks passed. Hosted end-to-end testing is still pending Google authorization.
Run configureTestInventory_ first to create isolated test workbooks, then add an approved user through an editor-only helper calling setInventoryUser_. Test E-95 subtract 20 = E-75, add 10 = E-85; add a new roll; tile 10 boxes subtract 2 = 8 boxes / 100 SF; verify history and view-only rejection. Do not switch to configureProduction_ until these checks pass.
The public GitHub repository uses flat Apps Script source files plus scanner.html; deploy Pages from main/root. Locally the app sources are in apps-script and scanner in docs.
Setup helpers have trailing underscores and cannot be invoked through google.script.run. Writes use a script lock. No credentials or employee PINs belong in GitHub.

