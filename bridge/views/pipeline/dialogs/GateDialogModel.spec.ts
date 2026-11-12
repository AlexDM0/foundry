/**
 * The gate dialog's model. What matters: a stored gate's form ticks the phases it runs in and keeps its options, a new gate ticks the
 * phase it was opened from; a gate with no phase, no name or no command cannot be saved, a prepare step needs no phase; a Save sends the
 * definition, keeping fields the dialog does not show, and the order of only the phases whose box changed; a new prepare step also sends
 * the prepare order; Remove is one `null` edit of the gate or the step; the kicker says the phase, the place and the mark; and the profile
 * box follows the newest run of the gate in that phase, its stream's lines shown as output keyed by their number.
 */
import { describe, expect, test } from 'bun:test';

import type { Pipeline }                           from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { GateProfileRunFacts }                from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { GateDialogModel, type GateDialogSubject } from './GateDialogModel.ts';

const DRAFT: Pipeline = {
  version: 2,
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }],
  gates:   [
    { name: 'typecheck', run: 'bun run typecheck', writes: ['~/.cache/example'] },
    { name: 'browser-tests', run: 'bun run test:browser', network: ['registry.example.com'] },
  ],
  phases: { build: ['typecheck'], review: [], merge: ['typecheck', 'browser-tests'] },
};

const TYPECHECK: GateDialogSubject = { rowKind: 'gate', name: 'typecheck', phase: 'build' };

const NEW_REVIEW_GATE: GateDialogSubject = { rowKind: 'gate', name: null, phase: 'review' };

function profileRun(state: GateProfileRunFacts['state'], elapsedMilliseconds: number | null): GateProfileRunFacts {
  return {
    profileRunId: 'P1', gateName: 'typecheck', phase: 'build', state, elapsedMilliseconds,
  };
}

describe('the form', () => {
  test('a stored gate ticks the phases it runs in, and its network is on with its domains', () => {
    expect(GateDialogModel.formOf(TYPECHECK, DRAFT).phases).toEqual({ build: true, review: false, merge: true });
    expect(GateDialogModel.formOf({ rowKind: 'gate', name: 'browser-tests', phase: 'merge' }, DRAFT)).toMatchObject({ networkIsOn: true, networkText: 'registry.example.com', });
  });

  test('a new gate ticks the phase it was opened from', () => {
    expect(GateDialogModel.formOf(NEW_REVIEW_GATE, DRAFT)).toMatchObject({ name: '', run: '', phases: { build: false, review: true, merge: false } });
  });

  test('a gate with no phase ticked, no name or no command cannot be saved; a prepare step needs no phase', () => {
    const form = GateDialogModel.formOf(TYPECHECK, DRAFT);
    expect(GateDialogModel.canSave(TYPECHECK, form)).toBe(true);
    expect(GateDialogModel.canSave(TYPECHECK, { ...form, phases: { build: false, review: false, merge: false } })).toBe(false);
    expect(GateDialogModel.canSave(TYPECHECK, { ...form, run: '  ' })).toBe(false);
    const prepare: GateDialogSubject = { rowKind: 'prepare', name: 'install', phase: 'build' };
    expect(GateDialogModel.canSave(prepare, GateDialogModel.formOf(prepare, DRAFT))).toBe(true);
  });
});

describe('a Save', () => {
  test('sends the definition, keeping what the dialog does not show, and only the phase orders that changed', () => {
    const form = GateDialogModel.formOf(TYPECHECK, DRAFT);
    const edits = GateDialogModel.saveEditsOf(TYPECHECK, { ...form, fix: 'bun run typecheck --fix', phases: { build: true, review: true, merge: false }, }, DRAFT);
    expect(edits).toEqual([
      {
        field: 'gate:typecheck',
        value: {
          name: 'typecheck', run: 'bun run typecheck', writes: ['~/.cache/example'], fix: 'bun run typecheck --fix',
        },
      },
      { field: 'phase-order:review', value: ['typecheck'] },
      { field: 'phase-order:merge', value: ['browser-tests'] },
    ]);
  });

  test('a network switched off drops the domains', () => {
    const subject: GateDialogSubject = { rowKind: 'gate', name: 'browser-tests', phase: 'merge' };
    const [gateEdit] = GateDialogModel.saveEditsOf(subject, { ...GateDialogModel.formOf(subject, DRAFT), networkIsOn: false }, DRAFT);
    expect(gateEdit?.value).toEqual({ name: 'browser-tests', run: 'bun run test:browser' });
  });

  test('a new gate is defined and appended to its phase', () => {
    const form = { ...GateDialogModel.formOf(NEW_REVIEW_GATE, DRAFT), name: 'lint', run: 'bun run lint' };
    expect(GateDialogModel.saveEditsOf(NEW_REVIEW_GATE, form, DRAFT)).toEqual([
      { field: 'gate:lint', value: { name: 'lint', run: 'bun run lint' } },
      { field: 'phase-order:review', value: ['lint'] },
    ]);
  });

  test('a prepare step sends its command; a new one also the prepare order', () => {
    const stored: GateDialogSubject = { rowKind: 'prepare', name: 'install', phase: 'build' };
    expect(GateDialogModel.saveEditsOf(stored, { ...GateDialogModel.formOf(stored, DRAFT), run: 'bun install' }, DRAFT)).toEqual([
      { field: 'prepare:install', value: { name: 'install', run: 'bun install' } },
    ]);
    const added: GateDialogSubject = { rowKind: 'prepare', name: null, phase: 'build' };
    const form = { ...GateDialogModel.formOf(added, DRAFT), name: 'generate', run: 'bun run generate' };
    expect(GateDialogModel.saveEditsOf(added, form, DRAFT)).toEqual([
      { field: 'prepare:generate', value: { name: 'generate', run: 'bun run generate' } },
      { field: 'prepare-order', value: ['install', 'generate'] },
    ]);
  });
});

test('Remove is one null edit of the gate, or of the prepare step', () => {
  expect(GateDialogModel.removeEditsOf(TYPECHECK)).toEqual([{ field: 'gate:typecheck', value: null }]);
  expect(GateDialogModel.removeEditsOf({ rowKind: 'prepare', name: 'install', phase: 'build' })).toEqual([{ field: 'prepare:install', value: null }]);
  expect(GateDialogModel.removeEditsOf(NEW_REVIEW_GATE)).toEqual([]);
});

describe('the words', () => {
  test('the kicker says the phase, the place among its gates and the mark', () => {
    expect(GateDialogModel.kickerOf({ rowKind: 'gate', name: 'browser-tests', phase: 'merge' }, DRAFT, 'proposed')).toBe('Merge gate 2 · proposed');
    expect(GateDialogModel.kickerOf(TYPECHECK, DRAFT, 'unchanged')).toBe('Build gate 1');
    expect(GateDialogModel.kickerOf(NEW_REVIEW_GATE, DRAFT, 'unchanged')).toBe('New review gate');
    expect(GateDialogModel.titleOf(NEW_REVIEW_GATE)).toBe('Add review gate');
  });
});

describe('the profile box', () => {
  test('with no run it offers a first one', () => {
    expect(GateDialogModel.profileBoxViewOf('typecheck', 'build', [])).toEqual({ state: 'none', startLabel: 'Profile' });
  });

  test('a queued or running run is profiling; a run of another phase is not this one', () => {
    expect(GateDialogModel.profileBoxViewOf('typecheck', 'build', [profileRun('running', 4000)]).state).toBe('profiling');
    expect(GateDialogModel.profileBoxViewOf('typecheck', 'build', [profileRun('queued', null)]).state).toBe('profiling');
    expect(GateDialogModel.profileBoxViewOf('typecheck', 'merge', [profileRun('running', 4000)]).state).toBe('none');
  });

  test('a result is worded with its seconds, and only a red run shows its output', () => {
    const textOf = (run: GateProfileRunFacts) => {
      const view = GateDialogModel.profileBoxViewOf('typecheck', 'build', [run]);
      return view.state === 'result' ? [view.tone, view.text, view.showsOutput, view.startLabel] : null;
    };
    expect(textOf(profileRun('passed', 58_000))).toEqual(['passed', 'Passed in 58 s', false, 'Profile again']);
    expect(textOf(profileRun('timed-out', 120_000))).toEqual(['timed-out', 'Last profile: timed out at 120 s', false, 'Profile again']);
    expect(textOf(profileRun('stopped', 3000))).toEqual(['stopped', 'Stopped · no result', false, 'Profile again']);
    expect(textOf(profileRun('red', 9000))).toEqual(['red', 'Red after 9 s', true, 'Profile again']);
  });
});

describe('the profile log', () => {
  test('each stream line is output, keyed by its line number', () => {
    expect(GateDialogModel.logTailLinesOf([{ lineNumber: 4, text: 'Running 12 tests' }, { lineNumber: 5, text: '12 passed' }])).toEqual([
      { key: '4', text: 'Running 12 tests', kind: 'output' },
      { key: '5', text: '12 passed', kind: 'output' },
    ]);
  });
});
