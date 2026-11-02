#!/usr/bin/env node
// Encrypts data.json into data.encrypted, then commits and pushes it along with
// any changed build-*.js configs. Asks for the password at a hidden prompt, so it
// never lands on a command line, in shell history, or in terminal scrollback.
//
// Usage:
//   node publish.js "Commit message"
//   MAP_PASSWORD=secret node publish.js "Commit message"     (skips the prompt)
//
// Run the build first (node build-combined.js). Refuses to publish a stale
// data.json, or one that has somehow become tracked by git.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const DATA = path.join(ROOT, 'data.json');
const ENCRYPTED = path.join(ROOT, 'data.encrypted');
const message = process.argv[2] || 'Update map data';

function die(msg) {
  console.error(`\n${msg}\nNothing was committed.`);
  process.exit(1);
}

function git(...args) {
  return spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
}

// Run a git command with its output visible, stopping the script if it fails.
function gitOrDie(...args) {
  const r = spawnSync('git', args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n"git ${args[0]}" failed. See the output above.`);
    process.exit(1);
  }
}

function promptHidden(label) {
  return new Promise(resolve => {
    const stdin = process.stdin;
    let value = '';
    process.stdout.write(label);
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    const onData = chunk => {
      for (const ch of chunk) {
        if (ch === '\u0003') { // Ctrl-C (raw mode stops it arriving as a signal)
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\r' || ch === '\n') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          return resolve(value);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else if (ch >= ' ') value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function getPassword() {
  if (process.env.MAP_PASSWORD) return process.env.MAP_PASSWORD;
  if (!process.stdin.isTTY) die('No terminal to prompt in. Run this from a terminal, or set MAP_PASSWORD.');
  const password = await promptHidden('Password: ');
  if (!password) die('Password is empty.');
  if (await promptHidden('Confirm password: ') !== password) die('Passwords do not match.');
  return password;
}

function checkData() {
  if (!fs.existsSync(DATA)) die('data.json not found. Run: node build-combined.js');
  JSON.parse(fs.readFileSync(DATA, 'utf8')); // a half-written build throws here

  const builtAt = fs.statSync(DATA).mtimeMs;
  const newer = fs.readdirSync(ROOT).filter(f => /^build-.*\.js$/.test(f) &&
    fs.statSync(path.join(ROOT, f)).mtimeMs > builtAt);
  if (newer.length) die(`${newer.join(', ')} changed after data.json was built. Run: node build-combined.js`);

  if (git('ls-files', '--', 'data.json', '*/data.json').stdout.trim()) {
    die('A plaintext data.json is tracked by git. It must never be committed; fix that first.');
  }
}

// Decrypts the new file the way the browser will, so a bad file can't ship.
function verify(password) {
  const p = JSON.parse(fs.readFileSync(ENCRYPTED, 'utf8'));
  const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), Buffer.from(p.salt, 'base64'), p.iterations, 32, 'sha256');
  const blob = Buffer.from(p.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(p.iv, 'base64'));
  decipher.setAuthTag(blob.subarray(blob.length - 16));
  const plain = Buffer.concat([decipher.update(blob.subarray(0, blob.length - 16)), decipher.final()]);
  if (!plain.equals(fs.readFileSync(DATA))) die('data.encrypted does not decrypt back to data.json.');
}

(async () => {
  checkData();
  const password = await getPassword();

  const enc = spawnSync(process.execPath, ['encrypt-data.js'], {
    cwd: ROOT,
    env: { ...process.env, MAP_PASSWORD: password },
    stdio: ['ignore', 'ignore', 'inherit']
  });
  if (enc.status !== 0) die('Encryption failed.');
  verify(password);
  console.log('Encrypted data.json and verified it decrypts.');

  gitOrDie('add', '--', 'data.encrypted', 'build-*.js');
  gitOrDie('commit', '-q', '-m', message);
  gitOrDie('push', '-q');

  console.log(`Pushed: ${git('log', '--oneline', '-1').stdout.trim()}`);
  console.log('Live in about 10 minutes.');
})();
