// Node.js 22 Windows 버그 대응: readlink가 EINVAL 대신 EISDIR 반환
// Webpack/Next.js가 이 에러코드를 처리하지 못해 빌드 실패
const fs = require('fs');
const fsp = require('fs/promises');

// fs.readlink (callback)
const origReadlink = fs.readlink;
fs.readlink = function(path, ...args) {
  const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
  origReadlink.call(fs, path, ...args, (err, ...results) => {
    if (err && err.code === 'EISDIR') {
      err.code = 'EINVAL';
      err.errno = -22;
    }
    if (cb) cb(err, ...results);
  });
};

// fs.readlinkSync
const origReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function(path, options) {
  try { return origReadlinkSync.call(fs, path, options); }
  catch(e) {
    if (e.code === 'EISDIR') { e.code = 'EINVAL'; e.errno = -22; }
    throw e;
  }
};

// fs/promises.readlink
const origReadlinkP = fsp.readlink;
fsp.readlink = async function(path, options) {
  try { return await origReadlinkP.call(fsp, path, options); }
  catch(e) {
    if (e.code === 'EISDIR') { e.code = 'EINVAL'; e.errno = -22; }
    throw e;
  }
};
