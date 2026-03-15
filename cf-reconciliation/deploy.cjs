// Deploy: copy build output to parent repo for GitHub Pages
const fs = require('fs');
const path = require('path');

const exportDir = path.join(__dirname, 'export');
const targetDir = __dirname; // cf-reconciliation/ root

if (!fs.existsSync(path.join(exportDir, 'index.html'))) {
  console.error('No build output found. Run "npm run build" first.');
  process.exit(1);
}

// Files/dirs to copy from export/ to cf-reconciliation/ root
const items = ['index.html', '404.html', '_next', 'favicon.ico'];

for (const item of items) {
  const src = path.join(exportDir, item);
  if (!fs.existsSync(src)) continue;

  const dest = path.join(targetDir, item);

  // Remove old version
  try {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  } catch(e) {
    console.log('Warning: could not clean', item, '-', e.message);
  }

  // Copy
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    copyDirSync(src, dest);
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log('  ✓', item);
}

console.log('\n✓ Deploy files copied to cf-reconciliation/');
console.log('  Now commit and push from the parent repo.');

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}
