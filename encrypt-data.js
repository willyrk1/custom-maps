#!/usr/bin/env node
// Encrypts a plaintext JSON map-data file into data.encrypted, which is the
// only data file that gets committed / published. The browser decrypts it in
// memory using the same password. AES-256-GCM, key derived with PBKDF2-SHA256.
//
// Usage:
//   node encrypt-data.js <password> [infile] [outfile]
//   MAP_PASSWORD=secret node encrypt-data.js            (reads password from env)
//
// Defaults: infile = data.json, outfile = data.encrypted
// Tip: copy data.example.json to data.json, edit it, then run this.

const fs = require('fs');
const crypto = require('crypto');

const password = process.argv[2] || process.env.MAP_PASSWORD;
const infile = process.argv[3] || 'data.json';
const outfile = process.argv[4] || 'data.encrypted';

if (!password) {
  console.error('No password given.\nUsage: node encrypt-data.js <password> [infile] [outfile]');
  process.exit(1);
}
if (!fs.existsSync(infile)) {
  console.error(`Input file not found: ${infile}\n(Copy data.example.json to data.json and edit it first.)`);
  process.exit(1);
}

// Validate it's real JSON before encrypting, so you can't ship a typo.
const raw = fs.readFileSync(infile, 'utf8');
try { JSON.parse(raw); } catch (e) {
  console.error(`${infile} is not valid JSON: ${e.message}`);
  process.exit(1);
}

const iterations = 250000;
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(Buffer.from(password, 'utf8'), salt, iterations, 32, 'sha256');

const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(Buffer.from(raw, 'utf8')), cipher.final()]);
const tag = cipher.getAuthTag();

// Web Crypto expects the auth tag appended to the ciphertext.
const payload = {
  v: 1,
  iterations,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  data: Buffer.concat([ct, tag]).toString('base64')
};

fs.writeFileSync(outfile, JSON.stringify(payload));
console.log(`Encrypted ${infile} -> ${outfile}  (${raw.length} bytes plaintext)`);
console.log('Commit data.encrypted (NOT data.json) to the repo.');
