// Packs dist-extension/ into dist/william-tool-extension.zip, the file the "Tải extension" button serves, and
// publishes its build id as dist/extension-version.json — installed extensions compare it with their own.
// A tiny zip writer (deflate + the zip headers) so the build needs no extra dependency.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const SRC = 'dist-extension';
const OUT = 'dist/william-tool-extension.zip';
// unzipped, the files land in one folder — the one to pick in "Load unpacked"
const ROOT = 'william-tool-extension/';

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));

const d = new Date();
const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

const locals = [];
const centrals = [];
let offset = 0;
for (const file of walk(SRC).sort()) {
  const name = Buffer.from(ROOT + relative(SRC, file).split('\\').join('/'));
  const data = readFileSync(file);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  // header fields shared by the local and central records, from "version needed" on
  const common = Buffer.alloc(26);
  common.writeUInt16LE(20, 0); // version needed
  common.writeUInt16LE(0x0800, 2); // utf-8 names
  common.writeUInt16LE(8, 4); // deflate
  common.writeUInt16LE(time, 6);
  common.writeUInt16LE(date, 8);
  common.writeUInt32LE(crc, 10);
  common.writeUInt32LE(packed.length, 14);
  common.writeUInt32LE(data.length, 18);
  common.writeUInt16LE(name.length, 22);
  common.writeUInt16LE(0, 24); // extra length

  const local = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), common, name, packed]);
  const tail = Buffer.alloc(14); // comment length, disk, attributes, offset of the local record
  tail.writeUInt32LE(offset, 10);
  centrals.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02, 20, 0]), common, tail, name]));
  locals.push(local);
  offset += local.length;
}

const dir = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(centrals.length, 8);
end.writeUInt16LE(centrals.length, 10);
end.writeUInt32LE(dir.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync('dist', { recursive: true });
writeFileSync(OUT, Buffer.concat([...locals, dir, end]));
writeFileSync('dist/extension-version.json', readFileSync(join(SRC, 'build.json')));
console.log(`${OUT}: ${centrals.length} files, ${(statSync(OUT).size / 1024).toFixed(0)} kB`);
