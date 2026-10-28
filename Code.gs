function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Flair Flooring Inventory');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

