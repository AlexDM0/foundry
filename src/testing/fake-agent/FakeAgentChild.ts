/**
 * The fake agent session `src/testing/FakeAgentAdapter.ts` launches: plays the scenario file its one argument names, step by step, each
 * line it prints a recorded `claude` line. It ends as the real `claude` does on what the probes showed it refuses. An entry point, so it
 * runs on load.
 */
import { readFileSync } from 'node:fs';

import { FAKE_HEAD_PLACEHOLDER, type FakeAgentStep } from '../FakeAgentAdapter.ts';
import { recordedLineOf, recordedSessionOf }         from './RecordedClaudeLines.ts';

/** A scenario line no recording holds: the spec that wrote it fails, as no real `claude` would print it. */
const UNRECORDED_LINE_EXIT_CODE = 3;

function headCommit(): string {
  return Bun.spawnSync({ cmd: ['git', 'rev-parse', 'HEAD'], stderr: 'ignore' }).stdout.toString().trim();
}

function lineIsJson(line: string): boolean {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

/** The real `claude` reads every stdin line as JSON; on one that is not, it prints nothing more, names it on stderr and exits. */
function endAsOnAnUnreadableLine(): void {
  const { ending } = recordedSessionOf('unreadable-input-line');
  process.stderr.write(ending.stderr);
  process.exitCode = ending.exitCode ?? 1;
}

function printedLineOf(line: string): string | null {
  try {
    const recordedLine = recordedLineOf(line);
    return recordedLine.includes(FAKE_HEAD_PLACEHOLDER) ? recordedLine.replaceAll(FAKE_HEAD_PLACEHOLDER, headCommit()) : recordedLine;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = UNRECORDED_LINE_EXIT_CODE;
    return null;
  }
}

async function playScenario(scenarioPath: string): Promise<void> {
  const steps = JSON.parse(readFileSync(scenarioPath, 'utf8')) as FakeAgentStep[];
  const stdinLines = console[Symbol.asyncIterator]();
  for (const step of steps) {
    if (step.kind === 'print') {
      const printedLine = printedLineOf(step.line);
      if (printedLine === null) return;
      process.stdout.write(`${printedLine}\n`);
    } else if (step.kind === 'shell') {
      Bun.spawnSync({ cmd: ['/bin/sh', '-c', step.command], stdout: 'ignore', stderr: 'ignore' });
    } else if (step.kind === 'await-line') {
      const read = await stdinLines.next();
      if (read.done === true) return;
      if (read.value.trim() !== '' && !lineIsJson(read.value)) {
        endAsOnAnUnreadableLine();
        return;
      }
    } else if (step.kind === 'exit') {
      process.exitCode = step.code;
      return;
    } else {
      process.kill(process.pid, 'SIGKILL');
    }
  }
}

await playScenario(process.argv[2] ?? '');
