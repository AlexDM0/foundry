/**
 * The onboarder's first message names the grammar its proposed lines run in on this machine, filled from the shell line port's
 * `lineGrammar`, so an onboarder on Windows writes cmd.exe lines and one on macOS or Linux POSIX shell lines.
 */
import { expect, test } from 'bun:test';

import type { ShellLineGrammar } from '../../src/lib/shell-line/ShellLine.ts';
import type { Job }              from '../../src/lib/tracker-model/@types/Job.ts';
import type { JobLaunchFacts }   from '../../src/services/overseer/DrivePass.ts';
import { LINE_GRAMMAR_WORDING }  from '../LineGrammarWording.ts';
import { OverseerWording }       from './OverseerWording.ts';

const ONBOARDER_JOB = {
  id: 'J9', kind: 'onboarder', ticketIds: [], attempt: 1
} as unknown as Readonly<Job>;

function onboarderMessageOf(lineGrammar: ShellLineGrammar): string {
  const facts: JobLaunchFacts = {
    tickets:                [],
    checksLine:             null,
    gates:                  null,
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    onboarding:             { mode: 'setup', gateHistory: [], lineGrammar },
    instructions:           '',
  };
  return OverseerWording.launchTextOf(ONBOARDER_JOB, facts).firstMessage;
}

test.each(['posix-shell', 'windows-cmd'] as const)('names the %s grammar as the one each line is written in', (lineGrammar) => {
  expect(onboarderMessageOf(lineGrammar)).toContain(`Write each prepare and gate line in the grammar it runs in on this machine: ${LINE_GRAMMAR_WORDING[lineGrammar]}.`);
  expect(onboarderMessageOf(lineGrammar)).not.toContain('{{');
});
