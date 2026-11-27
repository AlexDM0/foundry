/**
 * The gates table's model: counts and empty sentences, prepare rows before gates, the orders a reorder or Delete sends, removed rows as
 * their own band, and the time chip's words, tone and cache mark from each line's newest served run.
 */
import { describe, expect, test }                                                           from 'bun:test';
import type { BoardGateProfileRunDocument, BoardGateRowDocument, BoardStepRunTimeDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { ReorderIndexUtil }                                                                 from '../../../../lib/design-system/DesignSystemInterface.ts';
import { GatesAreaModel }                                                                   from './GatesAreaModel.ts';

function gateRow(name: string, changes: Partial<BoardGateRowDocument> = {}): BoardGateRowDocument {
  return {
    rowKind: 'gate', name, run: `bun run ${name}`, fix: null, runsIn: null, network: [], alsoInPhases: [], mark: 'unchanged', ...changes,
  };
}

function prepareRow(name: string, changes: Partial<BoardGateRowDocument> = {}): BoardGateRowDocument {
  return gateRow(name, { rowKind: 'prepare', run: 'bun install', ...changes });
}

const BUILD_ROWS: readonly BoardGateRowDocument[] = [
  prepareRow('install'),
  prepareRow('seed'),
  gateRow('tests', { alsoInPhases: ['review', 'merge'] }),
  gateRow('lint', { fix: 'bun run lint:fix' }),
  gateRow('typecheck', { network: ['registry.example.com'] }),
  gateRow('old-lint', { mark: 'removed' }),
];

function profileRun(
  state: BoardGateProfileRunDocument['state'],
  elapsedMilliseconds: number | null,
  cacheReport: BoardGateProfileRunDocument['cacheReport'] = null,
): BoardGateProfileRunDocument {
  return {
    profileRunId: 'P1', entity: null, gateName: 'tests', phase: 'build', state, elapsedMilliseconds, cacheReport,
  };
}

describe('a phase\'s head', () => {
  test('counts the gates that run, leaving out prepare and removed rows, and names the phase and its line', () => {
    expect(GatesAreaModel.gateCountOf(BUILD_ROWS)).toBe(3);
    expect([GatesAreaModel.titleOf('build'), GatesAreaModel.lineOf('build'), GatesAreaModel.addGateLabelOf('merge')])
      .toEqual(['Build gates', 'What the builder must pass before review', 'Add merge gate']);
  });

  test('a phase with no gate says so, and the review phase says when no review runs', () => {
    expect(GatesAreaModel.emptyTextOf('build', true)).toBe('No build gates. No command checks a ticket after its build.');
    expect(GatesAreaModel.emptyTextOf('review', true)).toBe('No review gates. No command checks the reviewer\'s fixes.');
    expect(GatesAreaModel.emptyTextOf('review', false)).toBe('No review gates, since no review runs.');
  });
});

describe('the rows', () => {
  test('a prepare row is P and gates count from 1; each row words its kind, phases and network', () => {
    const views = GatesAreaModel.rowViewsOf(BUILD_ROWS, 'build', []);
    expect(views.map((view) => [view.positionText, view.name, view.tagText, view.alsoInText, view.networkText])).toEqual([
      ['P', 'install', 'prepare', '', 'off'],
      ['P', 'seed', 'prepare', '', 'off'],
      ['1', 'tests', null, 'review, merge', 'off'],
      ['2', 'lint', 'has a fix', '', 'off'],
      ['3', 'typecheck', null, '', 'on · registry.example.com'],
      ['4', 'old-lint', null, '', 'off'],
    ]);
  });

  test('the grip names the row\'s place in its band, and a removed row is a band of its own', () => {
    const views = GatesAreaModel.rowViewsOf(BUILD_ROWS, 'build', []);
    expect(views.map((view) => view.grabLabel)).toEqual([
      'Move install, position 1 of 2',
      'Move seed, position 2 of 2',
      'Move tests, position 1 of 3',
      'Move lint, position 2 of 3',
      'Move typecheck, position 3 of 3',
      'Move old-lint, position 1 of 1',
    ]);
    const bands = views.map((view) => view.band);
    expect(ReorderIndexUtil.clampedToBand(bands, 2, 0)).toBe(2);
    expect(ReorderIndexUtil.clampedToBand(bands, 4, 5)).toBe(4);
    expect(ReorderIndexUtil.clampedToBand(bands, 5, 2)).toBe(5);
  });

  test('a removed row is struck, opens nothing and its chip takes no press', () => {
    const removed = GatesAreaModel.rowViewsOf(BUILD_ROWS, 'build', []).at(-1);
    expect(removed?.removed).toBe(true);
    expect(removed?.change).toBe('removed');
    expect(removed?.openLabel).toBeNull();
    expect(removed?.profileChip?.pressable).toBe(false);
  });
});

describe('the edits', () => {
  test('moving a gate sends the phase\'s new run order without the removed gate', () => {
    expect(GatesAreaModel.reorderEditsOf(BUILD_ROWS, 'build', 4, 2)).toEqual([{ target: 'phase-order', phase: 'build', names: ['typecheck', 'tests', 'lint'] }]);
  });

  test('moving a prepare row sends the prepare steps\' order', () => {
    expect(GatesAreaModel.reorderEditsOf(BUILD_ROWS, 'build', 1, 0)).toEqual([{ target: 'prepare-order', names: ['seed', 'install'] }]);
  });

  test('a drop in place or of a removed row sends nothing', () => {
    expect(GatesAreaModel.reorderEditsOf(BUILD_ROWS, 'build', 3, 3)).toEqual([]);
    expect(GatesAreaModel.reorderEditsOf(BUILD_ROWS, 'build', 5, 4)).toEqual([]);
  });

  test('Delete takes a gate out of this phase alone, removes a prepare step, and sends nothing for a removed row', () => {
    expect(GatesAreaModel.deleteEditsOf(BUILD_ROWS, 'review', 3)).toEqual([{ target: 'phase-order', phase: 'review', names: ['tests', 'typecheck'] }]);
    expect(GatesAreaModel.deleteEditsOf(BUILD_ROWS, 'build', 0)).toEqual([{ target: 'prepare', name: 'install', value: null }]);
    expect(GatesAreaModel.deleteEditsOf(BUILD_ROWS, 'build', 5)).toEqual([]);
  });

  test('Delete and Backspace delete a focused row', () => {
    expect(['Delete', 'Backspace', 'Enter'].map(GatesAreaModel.keyDeletesRow)).toEqual([true, true, false]);
  });

  test('a gate row opens the Gate dialog in the tab\'s phase and a prepare row its prepare variant', () => {
    expect(GatesAreaModel.openRequestOf(gateRow('tests'), 'merge')).toEqual({ kind: 'gate', gateName: 'tests', phase: 'merge' });
    expect(GatesAreaModel.openRequestOf(prepareRow('install'), 'build')).toEqual({ kind: 'prepare-step', name: 'install' });
    expect(GatesAreaModel.openRequestOf(gateRow('old', { mark: 'removed' }), 'build')).toBeNull();
  });

  test('the live region says where the row now stands, and that it is back in place on a cancel', () => {
    expect(GatesAreaModel.announcementOf(BUILD_ROWS, 4, 2)).toBe('typecheck, now position 1 of 3');
    expect(GatesAreaModel.announcementOf(BUILD_ROWS, 4, 4)).toBe('typecheck, back at position 3 of 3');
  });
});

describe('the time chip', () => {
  test('words each profile state in its tone; a prepare row has none', () => {
    const chipOf = (run: BoardGateProfileRunDocument | null) => GatesAreaModel.rowViewsOf([gateRow('tests')], 'build', run === null ? [] : [run])[0]?.profileChip;
    expect(chipOf(null)).toMatchObject({
      text: 'not measured', tone: 'waiting', pressable: true, title: 'Profile tests in the build phase'
    });
    expect(chipOf(profileRun('running', 4000))).toMatchObject({ text: 'measuring', busy: true, pressable: false });
    expect(chipOf(profileRun('passed', 41_000))).toMatchObject({ text: '41 s', tone: 'pass', pressable: true });
    expect(chipOf(profileRun('timed-out', 600_000))).toMatchObject({ text: 'timed out', tone: 'fail', title: 'Profile tests again in the build phase' });
    expect(chipOf(profileRun('red', 9000))).toMatchObject({ text: 'red · 9 s', tone: 'fail' });
    expect(chipOf(profileRun('stopped', null))).toMatchObject({ text: 'stopped', tone: 'waiting' });
    expect(GatesAreaModel.rowViewsOf([prepareRow('install')], 'build', [])[0]?.profileChip).toBeNull();
  });

  test('marks the time of a run whose gate reported every task or some cached, and nothing else', () => {
    const chipTextOf = (run: BoardGateProfileRunDocument) => GatesAreaModel.rowViewsOf([gateRow('tests')], 'build', [run])[0]?.profileChip?.text;
    expect([
      chipTextOf(profileRun('passed', 400, 'hit')),
      chipTextOf(profileRun('red', 9000, 'partial')),
      chipTextOf(profileRun('passed', 41_000, 'miss')),
      chipTextOf(profileRun('passed', 41_000, null)),
    ]).toEqual(['0.4 s · cached', 'red · 9 s · partly cached', '41 s', '41 s']);
  });

  test('a gate an edit changed or added asks to be measured', () => {
    expect(['changed', 'new'].map((mark) => GatesAreaModel.rowViewsOf([gateRow('tests', { mark: mark as 'changed' | 'new' })], 'build', [])[0]?.profileChip?.text))
      .toEqual(['measure', 'measure']);
  });

  test('a run of the same gate in another phase is not this phase\'s', () => {
    const otherPhase = { ...profileRun('passed', 41_000), phase: 'merge' as const };
    expect(GatesAreaModel.rowViewsOf([gateRow('tests')], 'build', [otherPhase])[0]?.profileChip?.text).toBe('not measured');
  });

  test('times read in seconds under a minute, then minutes and seconds', () => {
    expect([12_000, 59_400, 220_000].map(GatesAreaModel.profileTimeTextOf)).toEqual(['12 s', '59 s', '3 m 40 s']);
  });

  test('a run shorter than half a second reads in tenths, never as no time at all', () => {
    expect([380, 499, 500, 20, 0].map(GatesAreaModel.profileTimeTextOf)).toEqual(['0.4 s', '0.5 s', '1 s', '0.1 s', '0.1 s']);
  });

  test('the start command names the record, or none on a live board, the gate and the phase', () => {
    expect(GatesAreaModel.profileStartCommandOf(null, 'e2e', 'merge')).toEqual({
      entity:              null,
      boardCommandVersion: 3,
      kind:                'gate-profile-start',
      setupId:             null,
      gateName:            'e2e',
      phase:               'merge'
    });
  });
});

describe('the last run', () => {
  const runTime = (changes: Partial<BoardStepRunTimeDocument>): BoardStepRunTimeDocument => ({
    entity: null, stepKind: 'gate', stepName: 'tests', phase: 'build', runMilliseconds: 41_000, ending: 'passed', at: '2026-11-12T09:00:00', ...changes,
  });

  test('a gate row reads its run in the tab\'s phase and the entity in view, and none of another phase or entity', () => {
    const runTimes = [runTime({ phase: 'merge', runMilliseconds: 5_000 }), runTime({ entity: 'web', runMilliseconds: 7_000 }), runTime({})];
    expect(GatesAreaModel.lineRunTimeOf(gateRow('tests'), 'build', runTimes, null)?.text).toBe('41 s');
    expect(GatesAreaModel.lineRunTimeOf(gateRow('tests'), 'build', runTimes, 'web')?.text).toBe('7 s');
    expect(GatesAreaModel.lineRunTimeOf(gateRow('tests'), 'review', runTimes, null)).toBeNull();
  });

  test('a prepare row reads the newer of its install run and its run in the phase', () => {
    const install = runTime({
      stepKind: 'prepare', stepName: 'install', phase: null, runMilliseconds: 3_000, at: '2026-11-12T09:10:00'
    });
    const inBuild = runTime({
      stepKind: 'prepare', stepName: 'install', phase: 'build', runMilliseconds: 9_000, at: '2026-11-12T09:20:00'
    });
    expect(GatesAreaModel.lineRunTimeOf(prepareRow('install'), 'build', [install, inBuild], null)?.text).toBe('9 s');
    expect(GatesAreaModel.lineRunTimeOf(prepareRow('install'), 'merge', [install, inBuild], null)?.text).toBe('3 s');
  });

  test('a line its bound stopped carries the bound\'s mark, and each ending says how it ended', () => {
    expect(GatesAreaModel.lineRunTimeOf(gateRow('tests'), 'build', [runTime({ runMilliseconds: 900_000, ending: 'time-bound' })], null)).toEqual({
      text: '15 m 0 s', ending: 'time-bound', boundMarkText: 'bound', label: 'Last run 15 m 0 s, stopped at its time bound',
    });
    expect(GatesAreaModel.lineRunTimeOf(gateRow('tests'), 'build', [runTime({ ending: 'failed' })], null)?.label).toBe('Last run 41 s, failed');
  });
});
