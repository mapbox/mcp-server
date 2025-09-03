const fs = require('fs');
const path = require('path');

const filePathCJS = path.resolve(__dirname, '../dist/commonjs/index.js');
const filePathESM = path.resolve(__dirname, '../dist/esm/index.js');
addShebang(filePathCJS);
addShebang(filePathESM);

function addShebang(filePath) {
  const shebang = '#!/usr/bin/env node\n';

  let content = fs.readFileSync(filePath, 'utf-8');

  if (!content.startsWith(shebang)) {
    content = shebang + content;
    fs.writeFileSync(filePath, content);
    console.log('Shebang added to dist/index.js');
  } else {
    console.log('Shebang already exists in dist/index.js');
  }
}
