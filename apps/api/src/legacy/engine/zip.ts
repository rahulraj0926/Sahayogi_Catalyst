/**
 * engine/zip.ts - minimal ZIP reader on node:zlib (no dependencies). Reads the central directory, then inflates single
 * entries on demand (stored and deflate only). Guards: entry count, per-entry and total inflated size (zip bombs), path
 * names are never used for file access. Not supported: encryption, ZIP64, multi-disk archives (reported as errors).
 */
import * as zlib from 'node:zlib';

const MAX_ENTRIES = 5000;
const MAX_ENTRY_BYTES = 60 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

class ZipError extends Error {}

class ZipReader {
  buf: any;
  entries: any;
  inflated: any;
  constructor(buf) {
    if (!Buffer.isBuffer(buf)) throw new ZipError('not a buffer');
    this.buf = buf;
    this.entries = new Map();
    this.inflated = 0;
    this._parse();
  }

  static isZip(buf) { return buf.length > 22 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 3 || buf[2] === 5); }

  _parse() {
    const b = this.buf;
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new ZipError('end of central directory not found (not a zip, or truncated)');
    const total = b.readUInt16LE(eocd + 10);
    const cdSize = b.readUInt32LE(eocd + 12);
    const cdOff = b.readUInt32LE(eocd + 16);
    if (total === 0xffff || cdOff === 0xffffffff) throw new ZipError('ZIP64 archives are not supported');
    if (total > MAX_ENTRIES) throw new ZipError(`too many entries (${total})`);
    if (cdOff + cdSize > b.length) throw new ZipError('central directory is out of range (truncated file)');
    let p = cdOff;
    for (let n = 0; n < total; n++) {
      if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new ZipError('bad central directory entry');
      const flags = b.readUInt16LE(p + 8); const method = b.readUInt16LE(p + 10);
      const csize = b.readUInt32LE(p + 20); const usize = b.readUInt32LE(p + 24);
      const nlen = b.readUInt16LE(p + 28); const xlen = b.readUInt16LE(p + 30); const clen = b.readUInt16LE(p + 32);
      const off = b.readUInt32LE(p + 42);
      const name = b.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nlen);
      this.entries.set(name, { name, method, csize, usize, off, flags });
      p += 46 + nlen + xlen + clen;
    }
  }

  names() { return [...this.entries.keys()]; }
  has(name) { return this.entries.has(name); }

  /** Inflated bytes of one entry. */
  read(name) {
    const e = this.entries.get(name);
    if (!e) throw new ZipError(`entry not found: ${name}`);
    if (e.flags & 1) throw new ZipError(`entry ${name} is encrypted`);
    if (e.usize > MAX_ENTRY_BYTES) throw new ZipError(`entry ${name} is too large (${e.usize} bytes)`);
    const b = this.buf;
    if (e.off + 30 > b.length || b.readUInt32LE(e.off) !== 0x04034b50) throw new ZipError(`bad local header for ${name}`);
    const start = e.off + 30 + b.readUInt16LE(e.off + 26) + b.readUInt16LE(e.off + 28);
    if (start + e.csize > b.length) throw new ZipError(`entry ${name} is truncated`);
    const raw = b.subarray(start, start + e.csize);
    let out;
    if (e.method === 0) out = Buffer.from(raw);
    else if (e.method === 8) { try { out = zlib.inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }); } catch (err) { throw new ZipError(`cannot inflate ${name}: ${err.message}`); } } else throw new ZipError(`entry ${name} uses unsupported compression method ${e.method}`);
    this.inflated += out.length;
    if (this.inflated > MAX_TOTAL_BYTES) throw new ZipError('archive inflates beyond the safety limit');
    return out;
  }

  text(name) { return this.read(name).toString('utf8').replace(/^﻿/, ''); }
  tryText(name) { try { return this.entries.has(name) ? this.text(name) : null; } catch (e) { return null; } }
}

export { ZipReader, ZipError };
