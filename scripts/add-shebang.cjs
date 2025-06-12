const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../dist/index.js');
const shebang = '#!/usr/bin/env node\n';

let content = fs.readFileSync(filePath, 'utf-8');

if (!content.startsWith(shebang)) {
    content = shebang + content;
    fs.writeFileSync(filePath, content);
    console.log('Shebang added to dist/index.js');
} else {
    console.log('Shebang already exists in dist/index.js');
}