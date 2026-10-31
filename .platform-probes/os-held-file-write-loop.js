// A write-then-rename loop under Defender against `HELD_FILE_RETRY_TRIES`: how many tries each round took, by error code.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { probe } from './support/probe.js';
import { runPowershell, sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const HELD_FILE_RETRY_TRIES = 12;
const HELD_FILE_RETRY_STEP_MILLISECONDS = 25;
const WRITE_ROUNDS = 300;
const RETRIED_ERROR_CODES = ['EPERM', 'EBUSY', 'EACCES'];

async function triesOfOneRound(sourcePath, targetPath, errorCounts) {
  for (let tryNumber = 1; tryNumber <= HELD_FILE_RETRY_TRIES; tryNumber += 1) {
    try {
      renameSync(sourcePath, targetPath);
      return tryNumber;
    } catch (error) {
      errorCounts[error.code] = (errorCounts[error.code] ?? 0) + 1;
      if (!RETRIED_ERROR_CODES.includes(error.code)) throw error;
      await sleepMilliseconds(HELD_FILE_RETRY_STEP_MILLISECONDS);
    }
  }
  return null;
}

await probe({
  unknown: 'held-file-write-loop',
  observe: async () => {
    const folder = scratchFolder();
    const targetPath = join(folder, 'target.json');
    const triesHistogram = {};
    const errorCounts = {};
    let exhaustedRounds = 0;
    const startedAt = Date.now();
    for (let i = 0; i < WRITE_ROUNDS; i += 1) {
      const sourcePath = join(folder, `source-${i}.tmp`);
      writeFileSync(sourcePath, JSON.stringify({ round: i }));
      const tries = await triesOfOneRound(sourcePath, targetPath, errorCounts);
      if (tries === null) exhaustedRounds += 1;
      else triesHistogram[tries] = (triesHistogram[tries] ?? 0) + 1;
      readFileSync(targetPath, 'utf8');
    }
    return {
      rounds: WRITE_ROUNDS,
      retryTriesBudget: HELD_FILE_RETRY_TRIES,
      retryStepMilliseconds: HELD_FILE_RETRY_STEP_MILLISECONDS,
      triesHistogram,
      errorCounts,
      exhaustedRounds,
      elapsedMilliseconds: Date.now() - startedAt,
      defenderRealTimeProtection: process.platform === 'win32'
        ? await runPowershell('(Get-MpComputerStatus).RealTimeProtectionEnabled')
        : null,
    };
  },
});
