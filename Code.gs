function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialScanCode = String(e && e.parameter && e.parameter.scanCode || '').slice(0,80);
  template.initialScanThickness = String(e && e.parameter && e.parameter.scanThickness || '').slice(0,20);
  return template.evaluate()
    .setTitle('Flair Flooring Inventory');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

