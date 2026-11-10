// Sends User's message with one picture to a job, as the Bridge's Intake composer does: uploads the picture to the
// demo's Overseer, then posts the job-message command naming it. No CLI verb takes pictures, so this speaks to the
// Overseer's routes with the token of its newest Baton, as session-code.js does.
// Usage: bun send-picture.js <tracker folder> <job id> <picture file> <text>
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const [trackerFolder, jobId, picturePath, text] = process.argv.slice(2);
if (!trackerFolder || !jobId || !picturePath || !text) throw new Error('usage: bun send-picture.js <tracker folder> <job id> <picture file> <text>');
const overseerFolder = join(trackerFolder, 'overseer');
const batonNumberOf = (fileName) => Number(/^baton-(\d+)\.json$/.exec(fileName)?.[1] ?? -1);
const newestBatonName = readdirSync(overseerFolder)
  .filter((fileName) => batonNumberOf(fileName) >= 0)
  .sort((a, b) => batonNumberOf(a) - batonNumberOf(b))
  .at(-1);
if (!newestBatonName) throw new Error(`no Baton in ${overseerFolder}`);
const baton = JSON.parse(readFileSync(join(overseerFolder, newestBatonName), 'utf8'));
const authorization = `Bearer ${readFileSync(baton.tokenFile, 'utf8').trim()}`;

const uploaded = await fetch(new URL('api/pictures', baton.url), {
  method: 'POST', headers: { authorization, 'content-type': 'image/png' }, body: readFileSync(picturePath),
});
if (!uploaded.ok) throw new Error(`the Overseer took no picture: HTTP ${uploaded.status} ${await uploaded.text()}`);
const { pictureId } = await uploaded.json();
const command = { kind: 'job-message', jobId, text, pictures: [{ pictureId, name: basename(picturePath) }] };
const sent = await fetch(new URL('api/commands', baton.url), {
  method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(command),
});
if (!sent.ok) throw new Error(`the Overseer refused the message: HTTP ${sent.status} ${await sent.text()}`);
