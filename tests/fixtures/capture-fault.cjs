// Test-only deterministic fault injection, loaded explicitly in a disposable child process.
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { syncBuiltinESMExports } = require('node:module');
const rename = fs.rename;
fs.rename = async function (from, to) {
  if (String(from).endsWith('.tmp')) {
    if (process.env.DTM_TEST_FAULT === 'ENOSPC') {
      const error = new Error('Injected disk full before commit');
      error.code = 'ENOSPC';
      throw error;
    }
    if (process.env.DTM_TEST_FAULT === 'PAUSE') {
      process.send({ staged: true });
      await new Promise(() => {});
    }
  }
  return rename.call(this, from, to);
};
if (process.env.DTM_TEST_UUID) crypto.randomUUID = () => process.env.DTM_TEST_UUID;
syncBuiltinESMExports();
