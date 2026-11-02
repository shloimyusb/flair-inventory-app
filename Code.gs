function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialScanCode = String(e && e.parameter && e.parameter.scanCode || '').slice(0,80);
  template.initialScanThickness = String(e && e.parameter && e.parameter.scanThickness || '').slice(0,20);
  const category=String(e && e.parameter && e.parameter.scanCategory || '');
  template.initialScanCategory=['carpet','tile','vinyl'].includes(category)?category:'';
  template.initialScanAction=e && e.parameter && e.parameter.scanAction==='add'?'add':'';
  const nonce=String(e && e.parameter && e.parameter.loginHostNonce || '');
  template.initialLoginHostNonce=/^[a-f0-9]{64}$/.test(nonce)?nonce:'';
  const output=template.evaluate().setTitle('Flair Flooring Inventory');
  // Only the hosted entry point opts into embedding; the client verifies its host.
  if(template.initialLoginHostNonce)output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

