// Used and adapted from: https://github.com/isaacs/chmodr
/* eslint-disable */

import { lstat, chmod, readdir } from 'fs';
import { resolve as _resolve } from 'path';

// If a party has r, add x
// so that dirs are listable
const dirMode = mode => {
  if (mode & 0o400)
    mode |= 0o100;
  if (mode & 0o40)
    mode |= 0o10;
  if (mode & 0o4)
    mode |= 0o1;
  return mode;
}

const chmodrKid = (p, child, mode, cb) => {
  if (typeof child === 'string')
    return lstat(_resolve(p, child), (er, stats) => {
      if (er)
        return cb(er);
      stats.name = child;
      chmodrKid(p, stats, mode, cb);
    });

  if (child.isDirectory()) {
    chmodr(_resolve(p, child.name), mode, (er) => {
      if (er)
        return cb(er);
      chmod(_resolve(p, child.name), dirMode(mode), cb);
    })
  } else
    chmod(_resolve(p, child.name), mode, cb);
};

const chmodr = async (p, mode, callbackFromChmodRKid) => {
  return new Promise((resolve, reject) => {
    readdir(p, { withFileTypes: true }, (er, children) => {
      // any error other than ENOTDIR means it's not readable, or
      // doesn't exist.  give up.
      if (er && er.code !== 'ENOTDIR') {
        return callbackFromChmodRKid ? callbackFromChmodRKid(er) : reject(er);
      }
      if (er) return chmod(
        p,
        mode,
        callbackFromChmodRKid || ((err) => err ? reject(err) : resolve())
      );
      if (!children.length) return chmod(p, mode, callbackFromChmodRKid || ((err) => err ? reject(err) : resolve()));
  
      let len = children.length
      let errState = null
      const then = (er) => {
        if (errState) return;
        if (er) return callbackFromChmodRKid ? callbackFromChmodRKid(errState = er) : reject(errState = er);
        if (-- len === 0) return chmod(p, dirMode(mode), callbackFromChmodRKid || ((err) => err ? reject(err) : resolve()))
      };

      children.forEach(child => chmodrKid(p, child, mode, then))
    })
  });

};

export default chmodr;
/* eslint-enable */
