/**
 * exFAT 드라이브에서 fs.readlinkSync EISDIR 에러 패치
 *
 * NTFS: 일반 파일에 readlinkSync → EINVAL (심볼릭 링크 아님)
 * exFAT: 일반 파일에 readlinkSync → EISDIR (잘못된 에러코드)
 *
 * webpack/enhanced-resolve가 readlinkSync를 사용하므로
 * exFAT에서 Next.js 빌드가 실패함. 이 패치로 EISDIR를 처리.
 */
const fs = require('fs');

function makeEinval(originalError, path) {
  const err = new Error(`EINVAL: invalid argument, readlink '${path}'`);
  err.code = 'EINVAL';
  err.errno = -22;
  err.syscall = 'readlink';
  err.path = typeof path === 'string' ? path : path.toString();
  return err;
}

const _origReadlinkSync = fs.readlinkSync;
fs.readlinkSync = function patchedReadlinkSync(p, options) {
  try {
    return _origReadlinkSync.call(fs, p, options);
  } catch (e) {
    if (e.code === 'EISDIR') {
      // exFAT: EISDIR → EINVAL로 변환 (NTFS 동작과 동일하게)
      throw makeEinval(e, p);
    }
    throw e;
  }
};

const _origReadlink = fs.readlink;
fs.readlink = function patchedReadlink(p, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }
  _origReadlink.call(fs, p, options, (err, linkString) => {
    if (err && err.code === 'EISDIR') {
      callback(makeEinval(err, p));
    } else {
      callback(err, linkString);
    }
  });
};

// promises API도 패치
const origReadlinkPromise = fs.promises.readlink;
fs.promises.readlink = async function patchedReadlinkPromise(p, options) {
  try {
    return await origReadlinkPromise.call(fs.promises, p, options);
  } catch (e) {
    if (e.code === 'EISDIR') {
      throw makeEinval(e, p);
    }
    throw e;
  }
};
