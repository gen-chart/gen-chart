#!/usr/bin/env node
// Builds a deterministic gen-chart.zip for manual skill installation.
// Byte-identical across runs and machines: entries are sorted, timestamps
// are pinned to the ZIP epoch, and no extra fields or comments are written.
// Pure Node — no archiver dependency.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const PREFIX = 'gen-chart/';

// Runtime files only: the skill must work without tests, build scripts, or
// node_modules. Example HTML twins are omitted; `demo` re-renders them.
const INCLUDE_DIRS = ['bin', 'renderers', 'schemas', 'references', 'assets'];
const INCLUDE_FILES = ['SKILL.md', 'package.json'];
const EXCLUDE = /(^|\/)(node_modules|test|scripts)(\/|$)/;

function walk(dir, acc = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const rel = relative(root, full).split(sep).join('/');
    if (EXCLUDE.test(rel)) continue;
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(rel);
  }
  return acc;
}

function collect() {
  const files = [];
  for (const f of INCLUDE_FILES) files.push(f);
  for (const d of INCLUDE_DIRS) files.push(...walk(join(root, d)));
  // Example specs teach field shape; their rendered HTML is regenerable.
  for (const f of readdirSync(join(root, 'examples')).sort()) {
    if (/\.(cartesian|distribution|proportion|matrix)\.json$/.test(f)) files.push(`examples/${f}`);
  }
  return files.sort();
}

// 1980-01-01 00:00:00, the earliest timestamp the ZIP format can express.
const DOS_TIME = 0;
const DOS_DATE = 0x0021;

function localHeader(entry) {
  const b = Buffer.alloc(30);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(20, 4); // version needed
  b.writeUInt16LE(0, 6); // flags
  b.writeUInt16LE(8, 8); // deflate
  b.writeUInt16LE(DOS_TIME, 10);
  b.writeUInt16LE(DOS_DATE, 12);
  b.writeUInt32LE(entry.crc, 14);
  b.writeUInt32LE(entry.compressed.length, 18);
  b.writeUInt32LE(entry.raw.length, 22);
  b.writeUInt16LE(entry.nameBuf.length, 26);
  b.writeUInt16LE(0, 28); // extra length
  return Buffer.concat([b, entry.nameBuf, entry.compressed]);
}

function centralEntry(entry) {
  const b = Buffer.alloc(46);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(0x031e, 4); // made by: UNIX, spec 3.0
  b.writeUInt16LE(20, 6);
  b.writeUInt16LE(0, 8);
  b.writeUInt16LE(8, 10);
  b.writeUInt16LE(DOS_TIME, 12);
  b.writeUInt16LE(DOS_DATE, 14);
  b.writeUInt32LE(entry.crc, 16);
  b.writeUInt32LE(entry.compressed.length, 20);
  b.writeUInt32LE(entry.raw.length, 24);
  b.writeUInt16LE(entry.nameBuf.length, 28);
  b.writeUInt16LE(0, 30); // extra
  b.writeUInt16LE(0, 32); // comment
  b.writeUInt16LE(0, 34); // disk
  b.writeUInt16LE(0, 36); // internal attrs
  b.writeUInt32LE((entry.mode << 16) >>> 0, 38); // external attrs: unix permissions
  b.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([b, entry.nameBuf]);
}

export function buildZip(files) {
  const parts = [];
  const entries = [];
  let offset = 0;
  for (const rel of files) {
    const raw = readFileSync(join(root, rel));
    const entry = {
      nameBuf: Buffer.from(PREFIX + rel, 'utf8'),
      raw,
      compressed: deflateRawSync(raw, { level: 9 }),
      crc: crc32(raw) >>> 0,
      mode: rel.startsWith('bin/') ? 0o100755 : 0o100644,
      offset
    };
    const local = localHeader(entry);
    parts.push(local);
    offset += local.length;
    entries.push(entry);
  }
  const central = entries.map(centralEntry);
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, eocd]);
}

export function packageFiles() {
  return collect();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? join(root, '..', 'gen-chart.zip');
  const files = collect();
  const zip = buildZip(files);
  writeFileSync(out, zip);
  console.log(`wrote ${out} — ${files.length} files, ${zip.length} bytes`);
}
