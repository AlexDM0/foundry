/**
 * The pipeline agent's first message names the grammar its proposed lines run in on this machine, filled from the shell line port's
 * `lineGrammar`, so a pipeline agent on Windows writes cmd.exe lines and one on macOS or Linux POSIX shell lines.
 */
import { expect, test } from 'bun:test';

import type { ShellLineGrammar } from '../../src/lib/shell-line/ShellLine.ts';
import type { Job }              from '../../src/lib/tracker-model/@types/Job.ts';
import type { JobLaunchFacts }   from '../../src/services/overseer/DrivePass.ts';
import { LINE_GRAMMAR_WORDING }  from '../LineGrammarWording.ts';
import { OverseerWording }       from './OverseerWording.ts';

const PIPELINE_AGENT_JOB = {
  id: 'J9', kind: 'pipeline-agent', ticketIds: [], attempt: 1
} as unknown as Readonly<Job>;

function pipelineAgentMessageOf(lineGrammar: ShellLineGrammar, confinement: JobLaunchFacts['confinement'] = 'confined'): string {
  const facts: JobLaunchFacts = {
    confinement,
    tickets:                [],
    checksLine:             null,
    gates:                  null,
    earlierSessionReplaced: false,
    intake:                 null,
    airlock:                null,
    assistant:              null,
    pipelineAgent:          { mode: 'setup', gateHistory: [], lineGrammar },
    instructions:           '',
  };
  return OverseerWording.launchTextOf(PIPELINE_AGENT_JOB, facts).firstMessage;
}

test('claims the pipeline agent has no network and writes only its Hatch folder where its sandbox enforces it', () => {
  expect(pipelineAgentMessageOf('posix-shell', 'confined')).toContain('You may write only your Hatch folder, and you have no network.');
});

test('gives the Hatch-only and no-network limits as rules, never as limits a sandbox enforces, in a session unconfined by design', () => {
  const message = pipelineAgentMessageOf('windows-cmd', 'unconfined-by-design');
  expect(message).toContain('Write only to your Hatch folder, and do not use the network. No sandbox runs on this machine');
  expect(message).not.toContain('you have no network');
});

test.each(['posix-shell', 'windows-cmd'] as const)('names the %s grammar as the one each line is written in', (lineGrammar) => {
  expect(pipelineAgentMessageOf(lineGrammar)).toContain(`Write each prepare and gate line in the grammar it runs in on this machine: ${LINE_GRAMMAR_WORDING[lineGrammar]}.`);
  expect(pipelineAgentMessageOf(lineGrammar)).not.toContain('{{');
});
