// How the PATH key is spelled through Object.entries(process.env), and which spellings a lookup answers.
import { probe } from './support/probe.js';
import { runProgram } from './support/programs.js';

const pathKeysSource = `console.log(JSON.stringify(Object.keys(process.env).filter((key) => key.toLowerCase() === 'path')))`;

await probe({
  unknown: 'path-variable-spelling',
  observe: async () => ({
    keysThroughEntries: Object.entries(process.env).map(([key]) => key).filter((key) => key.toLowerCase() === 'path'),
    lookupIsSet: {
      PATH: process.env['PATH'] !== undefined,
      Path: process.env['Path'] !== undefined,
      path: process.env['path'] !== undefined,
    },
    keysInAChildGivenACopiedEnvironment: await runProgram([process.execPath, '-e', pathKeysSource], { env: { ...process.env } }),
  }),
});
