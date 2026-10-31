// The one verdict line every probe prints: raw observations, never a judgement. A probe that throws still prints its
// line and exits 0, the throw recorded in `observed`, so one failing probe never hides another's result.
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { errorFactsOf } from './programs.js';
import { removableFolders } from './scratch.js';

const PROBES_FOLDER = join(dirname(fileURLToPath(import.meta.url)), '..');

export const EVERY_OPERATING_SYSTEM = ['darwin', 'linux', 'win32'];

export function optionValue(optionName) {
  const optionIndex = process.argv.indexOf(optionName);
  return optionIndex === -1 ? null : (process.argv[optionIndex + 1] ?? null);
}

export function claudeProgramOption() {
  return optionValue('--claude-program');
}

/** The seconds a probe waits after a session's last `result` for a turn that should not come; a spec's stub passes 0. */
export function settleMilliseconds(defaultSeconds) {
  return Number(optionValue('--settle-seconds') ?? defaultSeconds) * 1000;
}

/** Where a probe saves what does not fit its line, such as a stream fixture; `.platform-probes/.gitignore` covers it. */
export function resultsFolder() {
  const folder = optionValue('--results-folder') ?? join(PROBES_FOLDER, 'results', `${process.platform}-${process.arch}`);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function verdictLineOf(unknown, applicable, observed) {
  return JSON.stringify({
    unknown,
    os: process.platform,
    architecture: process.arch,
    bunVersion: Bun.version,
    applicable,
    observed,
  });
}

function whyNotApplicable(appliesTo, needsClaudeProgram) {
  if (!appliesTo.includes(process.platform)) return `this probe applies to ${appliesTo.join(', ')} only`;
  if (needsClaudeProgram && claudeProgramOption() === null) return 'no --claude-program was given, so no session was spent';
  return null;
}

async function observedOrThrowFacts(observe) {
  try {
    return await observe();
  } catch (error) {
    return { probeThrew: errorFactsOf(error) };
  }
}

function removeScratchFolders() {
  for (const folder of removableFolders) {
    try {
      rmSync(folder, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // A held scratch folder stays in the temp folder; the verdict line matters more than the tidy-up.
    }
  }
}

export async function probe({ unknown, appliesTo = EVERY_OPERATING_SYSTEM, needsClaudeProgram = false, observe }) {
  const reason = whyNotApplicable(appliesTo, needsClaudeProgram);
  if (reason !== null) {
    console.log(verdictLineOf(unknown, false, { whyNotApplicable: reason }));
    process.exit(0);
  }
  const observed = await observedOrThrowFacts(observe);
  removeScratchFolders();
  console.log(verdictLineOf(unknown, true, observed));
  process.exit(0);
}
