# Flair Flooring Inventory

Mobile inventory app hosted by Google Apps Script, with Google Sheets as the source of truth. GitHub Pages hosts the separate camera/OCR scanner.

## Features

- Carpet search, location/bay, add/subtract feet, and add new rolls into the first row with a blank carpet name.
- Estimated quantities retain their E- prefix. Dimension remnants such as E-11x10 are displayed and cannot receive linear-foot adjustments.
- Tile search, SKU/location/side, whole-box changes, and total SF recalculated as boxes times SF/box.
- History records employee, timestamp, source tab, action, and before/after quantities.
- Approved email/PIN login with admin, employee, and view roles. Login attempts are limited; sessions expire and revoked users lose access.
- Vinyl remains scaffolded until its sheet is configured.
- Scanner supports camera capture, photo upload, OCR, and manual correction. The scanner opens as a full page and returns the detected code/thickness to the validated Apps Script app URL. Inventory credentials are never sent to the scanner.

## Files and deployment

This GitHub repository keeps Apps Script files at its root, alongside scanner.html. Copy .clasp.json.example to .clasp.json and set the existing script ID. Never commit .clasprc.json or employee credentials.

The local working copy groups Apps Script files in apps-script/, the scanner in docs/, and checks in tests/. Its local .clasp.json uses rootDir apps-script.

Use Google's clasp tool to push source, create a version, and update the existing deployment. Keep the webapp section in appsscript.json; otherwise a command-line version can lose its web-app entry point. The employee email/PIN deployment uses ANYONE_ANONYMOUS, executing as USER_DEPLOYING, so browsers can open the sign-in page without a Google account. Every inventory read/write requires an active approved employee session. This access setting does not make the source workbooks public or switch the configured test copies to live inventory. Use MYSELF if a future deployment should be restricted to its Google owner.

Publish GitHub Pages from main / root. The scanner URL is https://shloimyusb.github.io/flair-inventory-app/scanner.html.

## Safe setup

Run setupTestInventory_ from the Apps Script editor as the project owner. It creates separate TEST carpet/tile workbooks, initializes IDs there, and creates test employee/view accounts. The generated test PIN is stored only in Script Properties as TEST_LOGIN_PIN. The function refuses to repeat an existing setup.

After validating the hosted app and obtaining explicit approval for live-workbook activation, run setupProductionInventory_ as the owner. It verifies both live workbook schemas, copies their tabs into backup workbooks, adds Inventory ID columns/IDs without changing quantities, configures the supplied live spreadsheet IDs, removes test accounts, and creates the owner's admin login. Backup IDs and initial admin credentials are stored in Script Properties. The function refuses to repeat a completed production setup.

All editor setup commands and internal helpers end in an underscore and cannot be called through google.script.run. Setup commands also check the active/effective Google account. Browser-callable inventory endpoints reject missing, expired or revoked employee sessions before accessing workbooks.

## Add employees

In the editor, create a temporary wrapper that calls setInventoryUser_ with the approved email, name, role (admin, employee, or view), and a unique strong PIN. Start the wrapper with requireProjectOwner_(). Run it once, then remove the wrapper before pushing source. Keep all employee details out of GitHub. The initial admin PIN can also be rotated this way; remove INITIAL_ADMIN_PIN afterward.

## Validation

Run node check.cjs in this repository, or node tests/check.cjs in the grouped local copy. Checks cover syntax, E- preservation, dimension blocking, box/SF writes, history, invalid quantities, missing sessions, view-only rejection, and lock release.

Hosted checks use only TEST workbooks: subtract/add carpet footage, add a new roll, subtract/add tile boxes, inspect history, test view-only access, and verify scanner results return to the app. Live production quantities should only be read during deployment verification.

Stock adjustments, new rolls and moves send their inventory fields and audit entry in one Sheets batch; rejected batches save neither. New rolls validate the destination location before any write and skip rows containing other values, formulas or notes. Existing formats and validations are preserved. Carpet confirmation retains its rollback path. The script lock serializes app writes; users should refresh and check history before retrying after a connection error because a lost response can occur after a successful save. Direct concurrent edits in Google Sheets remain outside the app lock. Run atomic-write-check.cjs (or node tests/atomic-write-check.cjs locally) for validation and rejected-batch checks.


## Loading performance
The UI uses cached search text per item, one-pass bay/location counts, a single delegated inventory action handler and fragment rendering. Saves return the updated item and patch the session cache instead of rereading every bay. A category revision prevents earlier background reads from replacing a successful edit. Bootstrap authenticates once, reuses workbook handles within the request, and includes cached tile stock when available. History reads at most the requested recent rows per workbook, sorts by real dates, and shares a short-lived session cache; Refresh always reads again. Invalidating history on every successful edit prevents stale activity. History read failures are visible rather than silently returning partial data. The scanner loads OCR only when a photo is read and prevents overlapping OCR jobs.

The visual system lives in one Styles.html sheet with shared color, spacing and control rules. The mobile Filters & display panel starts collapsed, while active filters remain visible beside the result count. All three layouts preserve the same controls and permissions. View and size preferences use first-party storage at app.html, separately by employee, with local-only fallback for the direct Google URL. No inventory is written to persistent browser storage. Run cleanup-check.cjs (or node tests/cleanup-check.cjs locally) for request, history and mutation-cache checks.

Startup returns the initial carpet inventory with the app configuration. Carpet tabs are read once each, and the inventory cache uses small chunks to stay below Google's per-entry limit. Previously loaded categories remain immediately available throughout the signed-in session; after two minutes they refresh in the background. Other configured categories preload after startup. Refresh bypasses the inventory cache, and app writes invalidate it. Direct sheet edits are checked when a tab is revisited after two minutes; use Refresh when current quantities are required. A validated row index accelerates adjustments; moved rows fall back to an ID search. The interface initially renders 60 matching cards; search and filters still use the complete inventory.
Run node performance-check.cjs (or node tests/performance-check.cjs in the grouped local copy) to check cache sizing, invalidation, forced refresh, workbook isolation and row-index validation.



## Carpet confirmation
Confirm carpet checks the existing confirmation box and updates the existing sheet date for the selected permanent inventory ID, without changing footage. Confirmation history records the employee and old/new status and date. Confirm again refreshes the date for a later physical check. View-only users cannot confirm. If the required columns are absent, the action fails before writing. The app updates the card directly after success and prevents an older background read from overwriting the new confirmation.



## Remember me
The sign-in form offers an unchecked Remember me for 30 days option. Normal sign-in stores a six-hour session token in session storage. Remembered sign-in stores only an opaque session token in local storage, with a hashed-token record in Script Properties that survives cache eviction. No PIN is saved in browser storage. Sign out clears browser storage and revokes the server token. Expiry, current role, disabled/removed accounts and PIN changes are checked server-side. Browser storage restrictions and the separate Google account login can still require signing in. Automated coverage is in auth-check.cjs and login-storage-check.cjs.

For reliable saved sign-in on iPhone Safari, open https://shloimyusb.github.io/flair-inventory-app/app.html and sign in once with Remember me selected. The app.html page and login-host.js keep the opaque token in first-party browser storage while the inventory UI, API and sheet access remain in Apps Script. The host never receives the employee PIN. A random per-load nonce, exact message origins and pinned window source protect the storage bridge. The host refuses to run inside another site's frame. Apps Script only enables embedding for the hosted entry point and verifies the host before loading inventory. The original Apps Script link remains available with a link to the saved-sign-in entry point. Scanner results can return to either approved entry point.

Restoration prefers remembered tokens over old tab sessions and removes only an expired/revoked token, rather than deleting every saved login. Connection failures offer Retry saved sign-in without requesting credentials again. A persistent notice reports storage failures. Safari can still clear site data after extended inactivity or when users clear browser data; private browsing does not retain sign-in after its session ends. Added checks are login-host-check.cjs and login-restore-check.cjs.

## Quick location and bay moves
Tap an item's Location or Bay field, choose its destination bay tab, edit the location and optional carpet bay notes, then save. Changing a bay transfers the complete record between tabs in the same category workbook. Permanent IDs, quantities, formulas, confirmation and sheet date are preserved. Bay notes remain separate from the bay tab used by the inventory filter.

Move.gs uses the advanced Sheets v4 service enabled in appsscript.json. The transfer, location changes and history entry are submitted in one batch so a rejected request cannot leave half a move. Fields map by recognized headers; unrecognized populated columns block incompatible transfers. Occupied destination rows are skipped, stale location edits are rejected, and view-only accounts cannot move items. The card and filters update directly after saving. Run node move-check.cjs (or node tests/move-check.cjs in the grouped local copy) for move safety checks.

## Personal inventory views

Cards view includes a Card size slider (smaller to larger). It adjusts card width, spacing and type size locally without reloading inventory. Smaller cards keep bay, location and tile Right / Left visible and tuck secondary fields under Details. Size is remembered per employee in browser storage; the app.html entry point stores the preference on its first-party page for Safari. Compact list and Table keep their own layouts.
The View selector offers Cards, Compact list, and Table. Switching layouts uses loaded inventory without a server request and preserves search, bay/location filters, sorting, and the visible item count. Table offers sideways scrolling on phones and expandable details; all layouts keep move, adjustment and carpet confirmation controls for employees. View-only accounts see no write controls. Each employee's selected layout is remembered in that browser's local storage, separately by email; blocked storage falls back to Cards on the next visit. Run node view-check.cjs (or node tests/view-check.cjs locally) to check persistence, safe rendering and role controls.

Tile cards and compact rows always show Right / Left, including Not set for blank values. Table includes a dedicated Right / Left column. Employees can tap the field to choose Left, Right or Not set, optionally changing bay/location at the same time. The server updates the existing R-L / Side column in the same atomic move/history batch, checks for stale side edits, and preserves quantities and dates. View-only users cannot edit it.


