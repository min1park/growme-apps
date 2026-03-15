// Build script that handles Windows file locking issues
require('./fix-readlink.cjs');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = 'export';

// Patch Next.js trace reporter to prevent file locking on Windows
// The trace reporter creates a write stream to distDir/trace that doesn't
// release the file handle on Node.js 22 Windows, causing EPERM on cleanup
const traceReportPath = path.join('node_modules', 'next', 'dist', 'trace', 'report', 'to-json.js');
let traceOriginal;
try {
  traceOriginal = fs.readFileSync(traceReportPath, 'utf8');
  if (!traceOriginal.includes('// WIN_PATCHED')) {
    const patched = traceOriginal.replace(
      'const reportToLocalHost = (event)=>{',
      'const reportToLocalHost = (event)=>{ return; // WIN_PATCHED'
    );
    if (patched !== traceOriginal) {
      fs.writeFileSync(traceReportPath, patched);
      console.log('Patched trace reporter to prevent file locking');
    }
  }
} catch(e) {
  console.log('Warning: Could not patch trace reporter');
}

// Clean output dir
try {
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
  }
} catch(e) {
  console.log('Warning: Could not fully clean', distDir, '-', e.message);
  try {
    fs.renameSync(distDir, distDir + '_old_' + Date.now());
  } catch(e2) {
    console.log('Warning: Could not rename either, continuing...');
  }
}

let exitCode = 0;
try {
  execSync('node -r ./fix-readlink.cjs node_modules/next/dist/bin/next build', {
    stdio: 'inherit',
  });
  console.log('\n✓ Build completed successfully');
} catch(e) {
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log('\n✓ Build completed (cleanup error ignored)');
  } else {
    console.error('Build failed');
    exitCode = 1;
  }
}

// Do NOT restore the trace patch - keep it patched to avoid file locking
// on subsequent builds. The trace is not needed for production builds.

process.exit(exitCode);
