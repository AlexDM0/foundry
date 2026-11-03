/**
 * What `bun run record src/testing/fake-agent/` records: it runs the Claude probes that save their sessions' lines, against the installed
 * `claude`, and returns one answer for each scenario the fake agent plays. Only this starts a real `claude`; `bun run verify` never does.
 */
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join }   from 'node:path';

import type { RecordedAnswer }                               from '../BoundaryRecordings.ts';
import { CLAUDE_WIRE_SCENARIOS, type RecordedClaudeSession } from './RecordedClaudeLines.ts';

/** P10 the rate-limit sessions, P18 the refused input line, P19 the other scenarios; each reaches only a local stand-in API. */
const RECORDING_PROBES = ['claude-p10-rate-limit-events', 'claude-p18-unreadable-input-line', 'claude-p19-scenarios-against-a-stand-in'];
const SETTLE_SECONDS = '1';

export type ClaudeWireRecordingOutcome =
  | { readonly kind: 'recorded'; readonly answers: readonly RecordedAnswer[] }
  | { readonly kind: 'failed'; readonly reason: string };

export function recordClaudeWire(repositoryRoot: string): ClaudeWireRecordingOutcome {
  const claudeProgram = Bun.which('claude');
  if (claudeProgram === null) return { kind: 'failed', reason: 'No claude program is on the PATH.' };
  const wireFolder = mkdtempSync(join(tmpdir(), 'agent-progress-claude-wire-'));
  try {
    for (const probeName of RECORDING_PROBES) {
      console.log(`Running ${probeName} against ${claudeProgram}.`);
      Bun.spawnSync(
        [
          process.execPath,
          join(repositoryRoot, '.platform-probes', 'run-all.js'),
          '--claude-program',
          claudeProgram,
          '--only',
          probeName,
          '--settle-seconds',
          SETTLE_SECONDS,
          '--results-folder',
          join(wireFolder, 'results'),
          '--record-wire',
          wireFolder,
        ],
        { cwd: repositoryRoot, stdout: 'inherit', stderr: 'inherit' },
      );
    }
    const missing = CLAUDE_WIRE_SCENARIOS.filter((scenario) => !existsSync(join(wireFolder, `${scenario}.json`)));
    if (missing.length > 0) return { kind: 'failed', reason: `The probes saved no ${missing.join(', ')} session.` };
    return {
      kind:    'recorded',
      answers: CLAUDE_WIRE_SCENARIOS.map((scenario) => ({
        callShape: scenario,
        answer:    JSON.parse(readFileSync(join(wireFolder, `${scenario}.json`), 'utf8')) as RecordedClaudeSession,
      })),
    };
  } finally {
    rmSync(wireFolder, { recursive: true, force: true });
  }
}
