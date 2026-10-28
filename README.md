# Flair Flooring Inventory

Mobile inventory app hosted by Google Apps Script, with Google Sheets as the source of truth. GitHub Pages hosts the separate camera/OCR scanner.

## Features

- Carpet search, location/bay, add/subtract feet, and add new rolls into the first row with a blank carpet name.
- Estimated quantities retain their E- prefix. Dimension remnants such as E-11x10 are displayed and cannot receive linear-foot adjustments.
- Tile search, SKU/location/side, whole-box changes, and total SF recalculated as boxes times SF/box.
- History records employee, timestamp, source tab, action, and before/after quantities.
- Approved email/PIN login with admin, employee, and view roles. Login attempts are limited; sessions expire and revoked users lose access.
- Vinyl remains scaffolded until its sheet is configured.
- Scanner supports camera capture, photo upload, OCR, and manual correction. Results return to the app using a checked origin, popup source, and nonce. Inventory credentials are never sent to the scanner.

## Files and deployment

This GitHub repository keeps Apps Script files at its root, alongside scanner.html. Copy .clasp.json.example to .clasp.json and set the existing script ID. Never commit .clasprc.json or employee credentials.

The local working copy groups Apps Script files in apps-script/, the scanner in docs/, and checks in tests/. Its local .clasp.json uses rootDir apps-script.

Use Google's clasp tool to push source, create a version, and update the existing deployment. Keep the webapp section in appsscript.json; otherwise a command-line version can lose its web-app entry point. Use MYSELF during testing and ANYONE_ANONYMOUS for the employee email/PIN deployment, executing as USER_DEPLOYING.

Publish GitHub Pages from main / root. The scanner URL is https://shloimyusb.github.io/flair-inventory-app/scanner.html.

## Safe setup

Run setupTestInventory from the Apps Script editor as the project owner. It creates separate TEST carpet/tile workbooks, initializes IDs there, and creates test employee/view accounts. The generated test PIN is stored only in Script Properties as TEST_LOGIN_PIN. The function refuses to repeat an existing setup.

After validating the hosted app, run setupProductionInventory as the owner. It verifies both live workbook schemas, copies their tabs into backup workbooks, adds Inventory ID columns/IDs without changing quantities, configures the supplied live spreadsheet IDs, removes test accounts, and creates the owner's admin login. Backup IDs and initial admin credentials are stored in Script Properties. The function refuses to repeat a completed production setup.

Editor setup commands check the active/effective Google account. Other internal helpers end in an underscore and cannot be called through google.script.run.

## Add employees

In the editor, create a temporary wrapper that calls setInventoryUser_ with the approved email, name, role (admin, employee, or view), and a unique strong PIN. Start the wrapper with requireProjectOwner_(). Run it once, then remove the wrapper before pushing source. Keep all employee details out of GitHub. The initial admin PIN can also be rotated this way; remove INITIAL_ADMIN_PIN afterward.

## Validation

Run node check.cjs in this repository, or node tests/check.cjs in the grouped local copy. Checks cover syntax, E- preservation, dimension blocking, box/SF writes, history, invalid quantities, missing sessions, view-only rejection, and lock release.

Hosted checks use only TEST workbooks: subtract/add carpet footage, add a new roll, subtract/add tile boxes, inspect history, test view-only access, and verify scanner results return to the app. Live production quantities should only be read during deployment verification.

Google Sheets and Apps Script do not provide a cross-service transaction here. The script lock serializes app writes; users should refresh and check history before retrying an adjustment after a connection error. Direct concurrent edits in Google Sheets are outside the app lock.
