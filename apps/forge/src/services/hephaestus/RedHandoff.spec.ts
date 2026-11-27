/**
 * The gate failure note a red handoff leaves in its job's folder: every field the resumed session needs instead of rerunning the gate, a
 * long output cut to its first and last 40 lines and at most 8 KB, a diff or a conflicted merge's files where they apply, and facts that
 * read back as written, unreadable ones the unreadable file, never none.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                   from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { RedHandoffFacts }                           from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { GATE_FAILURE_NOTE_OUTPUT_LIMITS, RedHandoff }    from './RedHandoff.ts';
import { keptRedHandoffOf }                               from './testing/KeptRedHandoff.ts';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

function factsIn(jobFolder: string): RedHandoffFacts {
  return {
    kind:                'gate',
    name:                'tests',
    command:             'bun test',
    fixCommand:          'bun run format',
    commit:              '0123456789abcdef0123456789abcdef01234567',
    exitCode:            1,
    gateFailureNotePath: RedHandoff.gateFailureNotePathOf(jobFolder),
    fullLogPath:         join(jobFolder, 'gate.log'),
    resume:              1,
    resumesAllowed:      2,
    callBudget:          30,
    interruptedInstance: 1,
  };
}

function longOutput(lineCount: number, lineText = 'example output line'): string {
  return Array.from({ length: lineCount }, (_unused, i) => `${lineText} ${i + 1}`).join('\n');
}

describe('the gate failure note of a red handoff', () => {
  test('names the gate, its command and fix command, the commit, the exit code and the full log\'s path', () => {
    const jobFolder = createScratchDirectory('red-handoff');
    folders.push(jobFolder);
    const facts = factsIn(jobFolder);
    RedHandoff.writeRedHandoff(jobFolder, facts, 'expected 2, received 3');
    const gateFailureNote = readFileSync(join(jobFolder, 'gate-failure.md'), 'utf8');

    const fields = [
      'Gate: tests',
      'Command: `bun test`',
      'Fix command: `bun run format`',
      `Commit: ${facts.commit}`,
      'Exit code: 1',
      `Full log: ${String(facts.fullLogPath)}`,
      'expected 2, received 3',
    ];
    for (const field of fields) expect(gateFailureNote).toContain(field);
    expect(keptRedHandoffOf(jobFolder)).toEqual(facts);
  });

  test('shows a long output\'s first and last 40 lines only, marking what lies between', () => {
    const excerpt = RedHandoff.outputExcerptOf(longOutput(500));
    const lines = excerpt.split('\n');

    expect(lines.slice(0, GATE_FAILURE_NOTE_OUTPUT_LIMITS.HEAD_LINES)).toEqual(longOutput(40).split('\n'));
    expect(lines[GATE_FAILURE_NOTE_OUTPUT_LIMITS.HEAD_LINES]).toBe('[… 420 lines omitted …]');
    expect(lines.slice(-GATE_FAILURE_NOTE_OUTPUT_LIMITS.TAIL_LINES)).toEqual(longOutput(500).split('\n').slice(-40));
    expect(lines).toHaveLength(81);
  });

  test('cuts an output of long lines to at most 8 KB, keeping its start and its end', () => {
    const excerpt = RedHandoff.outputExcerptOf(longOutput(500, 'x'.repeat(400)));

    expect(Buffer.byteLength(excerpt, 'utf8')).toBeLessThanOrEqual(GATE_FAILURE_NOTE_OUTPUT_LIMITS.BYTES);
    expect(excerpt.startsWith(`${'x'.repeat(400)} 1\n`)).toBe(true);
    expect(excerpt.endsWith(`${'x'.repeat(400)} 500`)).toBe(true);
  });

  test('keeps a short output whole', () => {
    expect(RedHandoff.outputExcerptOf('expected 2, received 3\n')).toBe('expected 2, received 3');
  });

  test('shows the diff in the output\'s place for a gate that changed a file', () => {
    const diff = 'diff --git a/example.ts b/example.ts\n-const example = 1\n+const example = 1;';
    expect(RedHandoff.gateFailureNoteTextOf(factsIn('/example/job'), diff)).toContain(diff);
  });

  test('names the Customs check for a refused Customs check, with no gate', () => {
    const facts: RedHandoffFacts = {
      ...factsIn('/example/job'), kind: 'customs', name: 'V4', command: null, fixCommand: null, exitCode: null, fullLogPath: null
    };
    const gateFailureNote = RedHandoff.gateFailureNoteTextOf(facts, 'the worktree has uncommitted changes');

    expect(gateFailureNote).toContain('Customs check: V4');
    expect(gateFailureNote).toContain('Gate: -');
  });

  test('names the target, the tip it merged and the branch tip for a conflicted merge, and lists each conflicted file', () => {
    const facts: RedHandoffFacts = {
      ...factsIn('/example/job'), kind: 'merge-conflict', name: 'main', command: null, fixCommand: null, exitCode: null, fullLogPath: null, mergedTip: 'f'.repeat(40)
    };
    const gateFailureNote = RedHandoff.gateFailureNoteTextOf(facts, 'basket.ts\ncheckout.ts\n');

    expect(gateFailureNote).toContain('# The merge of `main` conflicts');
    expect(gateFailureNote).toContain(`- Merged tip: ${'f'.repeat(40)}`);
    expect(gateFailureNote).toContain(`- Branch tip: ${facts.commit}`);
    expect(gateFailureNote).toContain('- basket.ts\n- checkout.ts\n');
  });
});

describe('the facts of a red handoff', () => {
  test('that cannot be read are the unreadable file, named inside the board\'s data folder, and a fresh session never adopts over them', () => {
    const trackerDirectory = createScratchDirectory('red-handoff-facts');
    folders.push(trackerDirectory);
    const jobFolder = join(trackerDirectory, 'jobs', 'J4');
    mkdirSync(jobFolder, { recursive: true });
    writeFileSync(join(jobFolder, 'red-handoff.json'), '{"kind": ');

    expect(RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolder)).toMatchObject({ verdict: 'unreadable-file', file: 'jobs/J4/red-handoff.json' });
    RedHandoff.adoptRedHandoff(jobFolder, factsIn(jobFolder));
    expect(readFileSync(join(jobFolder, 'red-handoff.json'), 'utf8')).toBe('{"kind": ');
  });

  test('of a job that never went red are none, and a fresh session adopts the facts it takes over', () => {
    const trackerDirectory = createScratchDirectory('red-handoff-facts');
    folders.push(trackerDirectory);
    const jobFolder = join(trackerDirectory, 'jobs', 'J5');
    mkdirSync(jobFolder, { recursive: true });

    expect(RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolder)).toBeNull();
    RedHandoff.adoptRedHandoff(jobFolder, factsIn(jobFolder));
    expect(RedHandoff.redHandoffFactsOf(trackerDirectory, jobFolder)).toEqual(factsIn(jobFolder));
  });
});
