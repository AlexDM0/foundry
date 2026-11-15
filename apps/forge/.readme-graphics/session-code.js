// Prints a one-time Bridge session code from the newest Overseer Baton in the given tracker folder, as `open` asks for one,
// without opening a browser. shoot.js trades it for the session cookie by loading `<url>#session=<code>` first.
// Usage: bun session-code.js <tracker folder>
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const trackerFolder = process.argv[2];
if (!trackerFolder) throw new Error('usage: bun session-code.js <tracker folder>');
const overseerFolder = join(trackerFolder, 'overseer');
const batonNumberOf = (fileName) => Number(/^baton-(\d+)\.json$/.exec(fileName)?.[1] ?? -1);
const newestBatonName = readdirSync(overseerFolder)
  .filter((fileName) => batonNumberOf(fileName) >= 0)
  .sort((a, b) => batonNumberOf(a) - batonNumberOf(b))
  .at(-1);
if (!newestBatonName) throw new Error(`no Baton in ${overseerFolder}`);
const baton = JSON.parse(readFileSync(join(overseerFolder, newestBatonName), 'utf8'));
const token = readFileSync(baton.tokenFile, 'utf8').trim();
const response = await fetch(new URL('api/session-codes', baton.url), { method: 'POST', headers: { authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`the Overseer gave no session code: HTTP ${response.status}`);
const { code } = await response.json();
console.log(code);
