/**
 * The pipeline agent's setup kinds, applied as the Bouncer admitted them: stamped with the setup it serves. What matters: a misshapen
 * payload or a missing setup is `malformed-setup-command` naming the field, with the Board untouched; a question takes two to four
 * options and exactly one recommendation unless it takes several, and never "Other"; a proposed edit outside the closed field union, or
 * one that leaves a draft the `pipeline.json` validator refuses, is refused; the constitution is stored byte for byte, and an empty,
 * overlong, unanchored or doubly sourced one, or one with a malformed source path, is refused; a ready step is a suggestion only; and only
 * the first proposal reads the snapshot's tree from git's index, each finding a note.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineSetup }                                    from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { BoardRefusal }                                          from '../../lib/tracker-model/BoardRefusal.ts';
import { CONSTITUTION_LIMIT_CHARACTERS }                         from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import type { ControlCommand, ControlCommandOf }                 from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                                      from '../../shared/OperationRefusal.ts';
import { boardFixture, type BoardFixture }                       from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                                from '../../testing/EchoedControlContext.ts';
import { GIT_CALL_SHAPES, type RecordedGitStep, useRecordedGit } from '../../testing/RecordedGit.ts';
import { testWhenGitIsRecorded }                                 from '../../testing/ToolGuard.ts';
import type { TrackerChange }                                    from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor }                                     from '../tracker/Workspace.ts';
import { ControlService }                                        from './ControlService.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';

const SNAPSHOT_COMMIT = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

const UNPORTABLE_TREE: RecordedGitStep = { gitArguments: ['ls-tree', '-r', '-z', '--full-tree', SNAPSHOT_COMMIT], answeredAs: GIT_CALL_SHAPES.TREE_OF_AN_UNPORTABLE_COMMIT };

const recordedGit = useRecordedGit();

const CONSTITUTION_TEXT = '# Example Agency\r\n\r\n- Keep it small.\r\n- Keep it small.\r\n';

function changeOf(fixture: BoardFixture): TrackerChange {
  return {
    board:                          fixture.board,
    workspace:                      workspacePathsFor('/example-agency/storefront'),
    at:                             CHANGED_AT,
    malformedTickets:               [],
    malformedEpics:                 [],
    malformedDrafts:                [],
    unreadablePipeline:             null,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function apply(fixture: BoardFixture, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(fixture), ECHOED_CONTROL_CONTEXT).result;
}

function refusalDetailOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    if (error instanceof BoardRefusal || error instanceof OperationRefusal) return error.detail;
    throw error;
  }
  throw new Error('the command was not refused');
}

/** A board whose open first setup S1 is at `step`, its agent J4. */
function boardAt(step: 'research' | 'design'): BoardFixture {
  const opened = boardFixture();
  apply(opened, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false });
  const continued = step === 'research' ? ['billing'] as const : ['billing', 'research', 'constitution'] as const;
  for (const doneStep of continued) {
    apply(opened, {
      kind: 'pipeline-setup-step', setupId: 'S1', step: doneStep, move: 'continue'
    });
  }
  const setup = { ...structuredClone(opened.board.pipelineSetup()), agentJobId: 'J4' } as PipelineSetup;
  return boardFixture({ pipelineSetup: { verdict: 'readable', setup } });
}

function question(overrides: Partial<ControlCommandOf<'pipeline-question-ask'>> = {}): ControlCommandOf<'pipeline-question-ask'> {
  return {
    kind:        'pipeline-question-ask',
    jobId:       'J4',
    setupId:     'S1',
    step:        'research',
    subject:     null,
    question:    'Is the type check a gate?',
    context:     '',
    options:     ['Yes', 'No'],
    recommended: ['a'],
    multiple:    false,
    ...overrides,
  };
}

function constitution(markdown: string, sources: ControlCommandOf<'pipeline-constitution-draft'>['sources']): ControlCommandOf<'pipeline-constitution-draft'> {
  return {
    kind: 'pipeline-constitution-draft', jobId: 'J4', setupId: 'S1', markdown, sources
  };
}

describe('a misshapen command', () => {
  test.each([
    ['setupId', { kind: 'pipeline-step-ready', jobId: 'J4', step: 'research' }],
    ['step', {
      kind: 'pipeline-step-ready', jobId: 'J4', setupId: 'S1', step: 'apply'
    }],
    ['label', {
      kind: 'pipeline-finding-record', jobId: 'J4', setupId: 'S1', topic: 'note'
    }],
    ['options[1]', question({ options: ['Yes', 'Other'] })],
    ['edits[0].field', {
      kind: 'pipeline-draft-propose', jobId: 'J4', setupId: 'S1', edits: [{ field: 'phases', value: {}, summary: 'Every phase.' }]
    }],
    ['sources[0].path', constitution(CONSTITUTION_TEXT, [{
      lineText: '- Keep it small.', occurrence: 1, kind: 'research', path: '../elsewhere.md'
    }])],
  ])('refuses malformed-setup-command naming %s, with the Board untouched', (field, body) => {
    const fixture = boardAt('design');
    const command = body as unknown as ControlCommand;

    expect(refusalDetailOf(() => apply(fixture, command))).toEqual({ kind: 'malformed-setup-command', commandKind: command.kind, field });
    expect(fixture.records).toEqual([]);
    expect(fixture.board.pipelineSetupWrite()).toEqual({ write: 'unchanged' });
  });
});

describe('a finding', () => {
  test('is recorded as F1 on the setup the Bouncer stamped', () => {
    const fixture = boardAt('research');
    apply(fixture, {
      kind: 'pipeline-finding-record', jobId: 'J4', setupId: 'S1', topic: 'scripts', label: 'Unit tests', value: 'bun test', sourcePaths: ['package.json'], script: null
    });
    expect(fixture.board.pipelineSetup()?.findings).toEqual([{
      findingId: 'F1', topic: 'scripts', label: 'Unit tests', value: 'bun test', sourcePaths: ['package.json'], script: null, needsRecheck: false
    }]);
  });
});

describe('a question', () => {
  test('two to four options with one recommendation is asked as Q1, lettered a, b', () => {
    const fixture = boardAt('research');
    apply(fixture, question());
    expect(fixture.board.pipelineSetup()?.questions[0]).toMatchObject({
      questionId: 'Q1', options: [{ letter: 'a', text: 'Yes' }, { letter: 'b', text: 'No' }], recommended: ['a'], answer: null
    });
  });

  test.each([
    ['one option', question({ options: ['Yes'] }), 'setup-question-option-count'],
    ['five options', question({ options: ['A', 'B', 'C', 'D', 'E'] }), 'setup-question-option-count'],
    ['no recommendation', question({ recommended: [] }), 'setup-question-without-recommendation'],
    ['two recommendations on a single choice', question({ recommended: ['a', 'b'] }), 'several-letters-on-single-select-setup-question'],
    ['a recommendation outside the options', question({ recommended: ['c'] }), 'unknown-setup-option-letters'],
  ])('%s is refused %s', (_what, command, reason) => {
    expect(refusalDetailOf(() => apply(boardAt('research'), command))).toMatchObject({ reason });
  });

  test('a question taking several answers may recommend several', () => {
    const fixture = boardAt('research');
    apply(fixture, question({ options: ['Lint', 'Test', 'Build'], recommended: ['a', 'b'], multiple: true }));
    expect(fixture.board.pipelineSetup()?.questions[0]?.recommended).toEqual(['a', 'b']);
  });
});

describe('a proposal', () => {
  test('lands as the agent\'s edits, each with its own summary, at the next revision', () => {
    const fixture = boardAt('design');
    apply(fixture, {
      kind:    'pipeline-draft-propose',
      jobId:   'J4',
      setupId: 'S1',
      edits:   [
        { field: 'gate:test', value: { name: 'test', run: 'bun test' }, summary: 'Run the unit tests.' },
        { field: 'phase-order:build', value: ['test'], summary: 'Run them while building.' },
      ],
    });
    const setup = fixture.board.pipelineSetup();
    expect(setup?.draftRevision).toBe(1);
    expect(setup?.edits).toEqual([
      {
        editId: 'E1', by: 'agent', field: 'gate:test', summary: 'Run the unit tests.', undone: false
      },
      {
        editId: 'E2', by: 'agent', field: 'phase-order:build', summary: 'Run them while building.', undone: false
      },
    ]);
  });

  testWhenGitIsRecorded('the first records what the snapshot\'s tree cannot hold on every OS, read from git\'s index; a later one reads nothing', async () => {
    const fixture = boardAt('design');
    const pinned  = { ...structuredClone(fixture.board.pipelineSetup()), snapshotCommit: SNAPSHOT_COMMIT } as PipelineSetup;
    const pinnedFixture = boardFixture({ pipelineSetup: { verdict: 'readable', setup: pinned } });
    const proposal = (gateName: string, buildGates: readonly string[]): ControlCommand => ({
      kind:    'pipeline-draft-propose',
      jobId:   'J4',
      setupId: 'S1',
      edits:   [
        { field: `gate:${gateName}`, value: { name: gateName, run: 'bun test' }, summary: 'Run the unit tests.' },
        { field: 'phase-order:build', value: buildGates, summary: 'Run them while building.' },
      ],
    });

    await recordedGit.playStage([UNPORTABLE_TREE], () => Promise.resolve(apply(pinnedFixture, proposal('test', ['test']))));
    await recordedGit.playStage([], () => Promise.resolve(apply(pinnedFixture, proposal('unit', ['test', 'unit']))));

    const findings = pinnedFixture.board.pipelineSetup()?.findings ?? [];
    expect(findings.map((finding) => [finding.topic, finding.label])).toEqual(expect.arrayContaining([
      ['note', 'reserved-name'], ['note', 'symbolic-link'], ['note', 'case-collision'],
    ]));
    expect(findings.every((finding) => finding.topic === 'note' && finding.sourcePaths.length > 0 && finding.value === null)).toBe(true);
  });

  test('a proposal leaving a draft the validator refuses, a gate in no phase, is refused pipeline-draft-invalid', () => {
    const fixture = boardAt('design');
    const detail  = refusalDetailOf(() => apply(fixture, {
      kind: 'pipeline-draft-propose', jobId: 'J4', setupId: 'S1', edits: [{ field: 'gate:test', value: { name: 'test', run: 'bun test' }, summary: 'Run the unit tests.' }]
    }));
    expect(detail).toMatchObject({ kind: 'pipeline-draft-invalid', setupId: 'S1' });
  });
});

describe('the constitution', () => {
  const source = {
    lineText: '- Keep it small.', occurrence: 2, kind: 'contributing', path: 'CONTRIBUTING.md'
  } as const;

  test('is stored byte for byte with its sources, line endings kept', () => {
    const fixture = boardAt('design');
    apply(fixture, constitution(CONSTITUTION_TEXT, [source]));
    expect(fixture.board.pipelineSetup()?.constitution).toMatchObject({ markdown: CONSTITUTION_TEXT, annotations: [source], revision: 1 });
  });

  test.each([
    ['an empty text', constitution(' \n', []), { reason: 'constitution-empty' }],
    ['an overlong text', constitution('x'.repeat(CONSTITUTION_LIMIT_CHARACTERS + 1), []), { reason: 'constitution-too-long' }],
    ['a line the text does not hold', constitution(CONSTITUTION_TEXT, [{ ...source, lineText: '- Keep it big.' }]), { reason: 'constitution-source-unanchored' }],
    ['a line held fewer times than named', constitution(CONSTITUTION_TEXT, [{ ...source, occurrence: 3 }]), { reason: 'constitution-source-unanchored' }],
    ['two sources on one line', constitution(CONSTITUTION_TEXT, [source, { ...source, kind: 'research' }]), { reason: 'constitution-source-repeated' }],
  ])('%s is refused', (_what, command, detail) => {
    const fixture = boardAt('design');
    expect(refusalDetailOf(() => apply(fixture, command))).toMatchObject(detail);
    expect(fixture.board.pipelineSetup()?.constitution).toBeNull();
  });
});

describe('a ready step', () => {
  test('is kept as a suggestion once, logged once, and moves no step', () => {
    const fixture = boardAt('research');
    const command: ControlCommand = {
      kind: 'pipeline-step-ready', jobId: 'J4', setupId: 'S1', step: 'research'
    };
    apply(fixture, command);
    apply(fixture, command);
    const setup = fixture.board.pipelineSetup();
    expect(setup?.readyToContinue).toEqual(['research']);
    expect(setup?.currentStep).toBe('research');
    expect(fixture.records.map((record) => record.kind)).toEqual(['pipeline-step-ready-suggested']);
  });

  test('a step that is not the current one is refused setup-step-not-current', () => {
    expect(refusalDetailOf(() => apply(boardAt('research'), {
      kind: 'pipeline-step-ready', jobId: 'J4', setupId: 'S1', step: 'design'
    }))).toEqual({
      reason: 'setup-step-not-current', setupId: 'S1', step: 'design', currentStep: 'research'
    });
  });
});
