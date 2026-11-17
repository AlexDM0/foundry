/**
 * User's setup kinds of the control contract, applied to a Board in a change. What matters: a body is untrusted JSON, so every kind
 * refuses a missing or misshapen nested field as `malformed-setup-command`, naming the field, and never fails on a `TypeError`, with the
 * Board untouched; a draft edit is checked against the revision User saw and the draft it leaves against the `pipeline.json` validator;
 * an update starts from a readable stored pipeline only; a start launches the record's pipeline agent, the only launch besides `advise`,
 * and a start over stops it; an answer, edit, Undo, discard, constitution edit or Continue messages the agent in the same hold, in the
 * words the injected context gives, carrying what changed (the constitution's new text and ticks, each changed draft field's value now),
 * since the agent cannot read the record, logged as the Overseer's so its transcript never reads it as User's words, and opens it again
 * with its conversation when a stop closed it, while a record with no agent,
 * or one that ended otherwise, sends none; and a resume moves the snapshot commit to main's tip when main moved, with the changed paths and a
 * research recheck, naming the paths in its message; a check queues only the gates the draft changes or adds, one at a time, and tells the
 * agent which; a forge without entities never stores a `batch`: a copy to another entity is refused there and its record file stays byte
 * for byte, and an edit that is no copy gets none (`PipelineSetupControls.entities.spec.ts` holds a copy's batch). Git answers from
 * the recordings of `src/testing/RecordedGit.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import type { UnreadablePipelineReading }                         from '../../adapters/pipeline/PipelineFile.ts';
import { PipelineSetupFile }                                      from '../../adapters/pipeline/PipelineSetupFile.ts';
import type { Pipeline }                                          from '../../lib/tracker-model/@types/Pipeline.ts';
import type { MainConstitution, PipelineSetup }                   from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { BoardRefusal }                                           from '../../lib/tracker-model/BoardRefusal.ts';
import type { ControlCommand }                                    from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                                       from '../../shared/OperationRefusal.ts';
import { boardFixture, type BoardFixture }                        from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT, echoedControlContextWith }       from '../../testing/EchoedControlContext.ts';
import type { RecordedGitStep }                                   from '../../testing/RecordedGit.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                  from '../../testing/ToolGuard.ts';
import { writeReadableTracker }                                   from '../../testing/TrackerFileFixtures.ts';
import { writeTracker, type TrackerChange }                       from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor }                                      from '../tracker/Workspace.ts';
import { ControlService }                                         from './ControlService.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';

const SNAPSHOT_COMMIT = '1'.repeat(40);

const MOVED_MAIN_TIP = '2'.repeat(40);

const recordedGit = useRecordedGit();

const WORKSPACE = workspacePathsFor('/example-agency/storefront');

const STORED_PIPELINE: Pipeline = {
  version: 3,
  prepare: [],
  gates:   [{ name: 'test', run: 'bun test' }],
  phases:  { build: ['test'], review: ['test'], merge: ['test'] },
  billing: { mode: 'api', maxBudgetUsd: 40 },
};

function changeOf(fixture: BoardFixture, unreadablePipeline: UnreadablePipelineReading | null = null): TrackerChange {
  return {
    board:                          fixture.board,
    workspace:                      WORKSPACE,
    at:                             CHANGED_AT,
    malformedTickets:               [],
    malformedEpics:                 [],
    malformedDrafts:                [],
    unreadablePipeline,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function apply(fixture: BoardFixture, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(fixture), ECHOED_CONTROL_CONTEXT).result;
}

function thrownBy(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    return error;
  }
  throw new Error('the command was not refused');
}

async function rejectionOf(attempt: () => Promise<unknown>): Promise<unknown> {
  try {
    await attempt();
  } catch (error) {
    return error;
  }
  throw new Error('the command was not refused');
}

function operationRefusalOf(attempt: () => unknown): OperationRefusal {
  const thrown = thrownBy(attempt);
  if (thrown instanceof OperationRefusal) return thrown;
  throw thrown;
}

/** A board whose open record S1 is a first setup at the design step. */
function boardAtDesign(agentJobId: string | null = null): BoardFixture {
  const opened = boardFixture();
  apply(opened, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false });
  for (const step of ['research', 'constitution'] as const) {
    apply(opened, {
      kind: 'pipeline-setup-step', setupId: 'S1', step, move: 'continue'
    });
  }
  const setup = { ...structuredClone(opened.board.pipelineSetup()), agentJobId } as PipelineSetup;
  return boardFixture({ pipelineSetup: { verdict: 'readable', setup } });
}

const MALFORMED_COMMANDS: readonly [string, Record<string, unknown>][] = [
  ['billing', { kind: 'pipeline-setup-start', replacesUnreadablePipeline: false }],
  ['billing', { kind: 'pipeline-setup-start', billing: { mode: 'credit' }, replacesUnreadablePipeline: false }],
  ['billing', { kind: 'pipeline-setup-start', billing: { mode: 'subscription', key: 'secret' }, replacesUnreadablePipeline: false }],
  ['billing', { kind: 'pipeline-setup-start', billing: { mode: 'api', maxBudgetUsd: 'ten' }, replacesUnreadablePipeline: false }],
  ['replacesUnreadablePipeline', { kind: 'pipeline-setup-start', billing: { mode: 'subscription' } }],
  ['setupId', { kind: 'pipeline-setup-billing', billing: { mode: 'subscription' } }],
  ['step', {
    kind: 'pipeline-setup-step', setupId: 'S1', step: 'deploy', move: 'continue'
  }],
  ['move', {
    kind: 'pipeline-setup-step', setupId: 'S1', step: 'design', move: 'reopen'
  }],
  ['setupId', { kind: 'pipeline-setup-start-over', setupId: 7 }],
  ['questionId', { kind: 'pipeline-setup-answer', setupId: 'S1', answer: { form: 'text', text: 'Yes' } }],
  ['answer', {
    kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: 'a'
  }],
  ['answer', {
    kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['A!'] }
  }],
  ['revision', { kind: 'pipeline-constitution-edit', setupId: 'S1', markdown: '# Rules\n' }],
  ['markdown', {
    kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, markdown: 42
  }],
  ['markdown', { kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0 }],
  ['draftedFrom', {
    kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, draftedFrom: { contributing: true }
  }],
  ['draftRevision', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: -1, edits: []
  }],
  ['edits', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: []
  }],
  ['edits[0]', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: ['gate:test']
  }],
  ['edits[0].field', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'gates', value: null }]
  }],
  ['edits[0].field', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'role:janitor', value: null }]
  }],
  ['edits[0].value', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'gate:test', value: 'bun test' }]
  }],
  ['edits[0].value', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'phase-order:build', value: 'test' }]
  }],
  ['edits[0].value', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'approval:merge', value: 'on' }]
  }],
  ['isACopy', {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'approval:merge', value: true }], isACopy: 'yes'
  }],
  ['editId', { kind: 'pipeline-draft-undo', setupId: 'S1' }],
  ['wholeBatch', {
    kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1', wholeBatch: 'yes'
  }],
  ['setupId', { kind: 'pipeline-draft-discard', setupId: '  ' }],
  ['draftRevision', { kind: 'pipeline-apply', setupId: 'S1', resumesBoard: false }],
  ['resumesBoard', {
    kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: 'yes'
  }],
  ['setupId', { kind: 'pipeline-apply-cancel' }],
  ['setupId', { kind: 'pipeline-check', setupId: null }],
];

describe('a misshapen body', () => {
  test.each(MALFORMED_COMMANDS)('refuses malformed-setup-command naming %s, with the Board untouched', (field, body) => {
    const fixture = boardAtDesign();
    const command = body as unknown as ControlCommand;

    const refusal = operationRefusalOf(() => apply(fixture, command));

    expect(refusal.detail).toEqual({ kind: 'malformed-setup-command', commandKind: command.kind, field });
    expect(fixture.records).toEqual([]);
    expect(fixture.board.pipelineSetupWrite()).toEqual({ write: 'unchanged' });
  });
});

describe('starting a record', () => {
  test('pipeline-setup-start opens S1 with the billing sent, and a second start refuses setup-in-progress', () => {
    const fixture = boardFixture();

    apply(fixture, { kind: 'pipeline-setup-start', billing: { mode: 'api', maxBudgetUsd: 25 }, replacesUnreadablePipeline: true });

    expect(fixture.board.pipelineSetup()).toMatchObject({
      setupId: 'S1', mode: 'setup', billing: { mode: 'api', maxBudgetUsd: 25 }, replacesUnreadablePipeline: true
    });
    const thrown = thrownBy(() => apply(fixture, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false }));
    expect(thrown instanceof BoardRefusal ? thrown.detail : thrown).toEqual({ reason: 'setup-in-progress', setupId: 'S1' });
  });

  test('pipeline-update-start opens an update on the stored pipeline, billed as it is', () => {
    const fixture = boardFixture({ pipeline: STORED_PIPELINE });

    apply(fixture, { kind: 'pipeline-update-start' });

    expect(fixture.board.pipelineSetup()).toMatchObject({
      mode: 'update', currentStep: 'design', billing: { mode: 'api', maxBudgetUsd: 40 }, draft: STORED_PIPELINE
    });
  });

  test('pipeline-update-start refuses an older pipeline.json with its own reason, and no pipeline as no-pipeline-to-update', () => {
    const older   = boardFixture();
    const refusal = operationRefusalOf(() => ControlService.apply({ kind: 'pipeline-update-start' }, changeOf(older, { verdict: 'older' }), ECHOED_CONTROL_CONTEXT));
    expect(refusal.detail).toEqual({ kind: 'older-pipeline', filePath: WORKSPACE.pipelineFilePath });

    const thrown = thrownBy(() => apply(boardFixture(), { kind: 'pipeline-update-start' }));
    expect(thrown instanceof BoardRefusal ? thrown.detail : thrown).toEqual({ reason: 'no-pipeline-to-update', mode: 'update' });
  });
});

describe('a draft edit', () => {
  test('writes every field sent at the next revision, as User\'s edits', () => {
    const fixture = boardAtDesign();

    apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [
        { field: 'gate:test', value: { name: 'test', run: 'bun test' } },
        { field: 'phase-order:build', value: ['test'] },
        { field: 'approval:merge', value: true },
      ],
    });

    const setup = fixture.board.pipelineSetup();
    expect(setup?.draftRevision).toBe(1);
    expect(setup?.draft).toMatchObject({ gates: [{ name: 'test', run: 'bun test' }], phases: { build: ['test'] }, approvals: { merge: true } });
    expect(setup?.edits.map((edit) => [edit.editId, edit.by, edit.field])).toEqual([
      ['E1', 'user', 'gate:test'], ['E2', 'user', 'phase-order:build'], ['E3', 'user', 'approval:merge'],
    ]);
  });

  test('a forge without entities never stores a batch: a copy is refused and the record file stays byte for byte', async () => {
    const workspace = workspacePathsFor(createScratchDirectory('pipeline-setup-copy'));
    try {
      mkdirSync(workspace.ticketsDirectory, { recursive: true });
      writeReadableTracker(workspace);
      const setup = boardAtDesign().board.pipelineSetup();
      if (setup === null) throw new Error('no setup record is open');
      writeFileSync(workspace.pipelineSetupFilePath, PipelineSetupFile.contentsOf(setup));
      const storedRecord = readFileSync(workspace.pipelineSetupFilePath, 'utf8');

      const failure = await rejectionOf(() => writeTracker({
        workspace,
        at:     CHANGED_AT,
        now:    () => new Date(CHANGED_AT),
        mutate: (change) => ControlService.apply({
          kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'approval:merge', value: true }], isACopy: true
        }, change, ECHOED_CONTROL_CONTEXT).result,
      }));

      expect(failure instanceof OperationRefusal ? failure.detail : failure).toEqual({ kind: 'draft-copy-outside-entities', setupId: 'S1', fields: [] });
      expect(readFileSync(workspace.pipelineSetupFilePath, 'utf8')).toBe(storedRecord);
      expect(storedRecord).not.toContain('"batch"');
    } finally {
      removeScratchDirectory(workspace.rootDirectory);
    }
  });

  test('an edit that is no copy stores no batch', () => {
    const fixture = boardAtDesign();

    apply(fixture, {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'approval:merge', value: true }]
    });

    expect(Object.hasOwn(fixture.board.pipelineSetup()?.edits[0] ?? {}, 'batch')).toBe(false);
  });

  test('refuses pipeline-draft-invalid with the validator\'s reason when the draft it leaves cannot be stored', () => {
    const fixture = boardAtDesign();

    const refusal = operationRefusalOf(() => apply(fixture, {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 0, edits: [{ field: 'gate:test', value: { name: 'test', run: 'bun test', retries: 3 } }]
    }));

    expect(refusal.detail).toMatchObject({ kind: 'pipeline-draft-invalid', setupId: 'S1' });
    expect(refusal.detail?.kind === 'pipeline-draft-invalid' ? refusal.detail.reason : '').toContain('retries');
  });

  test('an Undo that would leave a gate in no phase refuses pipeline-draft-invalid, so no record is left unreadable', () => {
    const fixture = boardAtDesign();
    apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [{ field: 'gate:test', value: { name: 'test', run: 'bun test' } }, { field: 'phase-order:merge', value: ['test'] }],
    });

    const refusal = operationRefusalOf(() => apply(fixture, { kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2' }));

    expect(refusal.detail).toMatchObject({ kind: 'pipeline-draft-invalid', setupId: 'S1' });
  });

  test('refuses a revision User did not see as pipeline-draft-stale', () => {
    const thrown = thrownBy(() => apply(boardAtDesign(), {
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 4, edits: [{ field: 'review', value: null }]
    }));

    expect(thrown instanceof BoardRefusal ? thrown.detail : thrown).toEqual({
      reason: 'pipeline-draft-stale', setupId: 'S1', revision: 4, currentRevision: 0
    });
  });
});

describe('the message to the pipeline agent', () => {
  function liveAgentBoard(): BoardFixture {
    const fixture = boardAtDesign('J1');
    fixture.board.startPipelineAgent(CHANGED_AT);
    fixture.records.length = 0;
    return fixture;
  }

  function messagesOf(fixture: BoardFixture): unknown[] {
    const messaged = fixture.records.filter((record) => record.kind === 'job-messaged');
    return messaged.map((record) => ({ jobId: record.jobId, message: JSON.parse(String((record.fields as { text: string }).text)) as unknown }));
  }

  test('a draft edit, its Undo and a discard each message the live agent in the context\'s words, in the same hold, with each changed field\'s value now', () => {
    const fixture = liveAgentBoard();

    apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [
        { field: 'gate:test', value: { name: 'test', run: 'bun test' } },
        { field: 'gate:lint', value: { name: 'lint', run: 'bun run lint' } },
        { field: 'phase-order:merge', value: ['test', 'lint'] },
      ],
    });
    apply(fixture, { kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1' });
    apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

    expect(messagesOf(fixture)).toEqual([
      {
        jobId:   'J1',
        message: {
          kind:          'draft-edited',
          setupId:       'S1',
          draftRevision: 1,
          editIds:       ['E1', 'E2', 'E3'],
          fields:        ['gate:test', 'gate:lint', 'phase-order:merge'],
          changes:       [
            { field: 'gate:test', value: { name: 'test', run: 'bun test' } },
            { field: 'gate:lint', value: { name: 'lint', run: 'bun run lint' } },
            { field: 'phase-order:merge', value: ['test', 'lint'] },
          ],
        }
      },
      {
        jobId:   'J1',
        message: {
          kind:          'draft-edit-undone',
          setupId:       'S1',
          draftRevision: 2,
          editId:        'E1',
          field:         'gate:test',
          changes:       [{ field: 'gate:test', value: null }, { field: 'phase-order:merge', value: ['lint'] }],
        }
      },
      {
        jobId:   'J1',
        message: {
          kind:          'draft-discarded',
          setupId:       'S1',
          draftRevision: 3,
          changes:       [{ field: 'gate:lint', value: null }, { field: 'phase-order:merge', value: [] }],
        }
      },
    ]);
  });

  test('an answer, a constitution edit, which reopens its earlier step, and the Continue out of it each message the live agent', () => {
    const fixture = liveAgentBoard();
    fixture.board.askSetupQuestion('S1', {
      step: 'design', subject: null, question: 'Run the tests in review?', context: '', optionTexts: ['Yes', 'No'], recommendedLetters: ['a'], multiple: false
    }, CHANGED_AT);

    apply(fixture, {
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['a'] }
    });
    apply(fixture, {
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, markdown: '# Example Agency\n\n- Keep the basket fast.\n'
    });
    apply(fixture, {
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'constitution', move: 'continue'
    });

    expect(messagesOf(fixture)).toEqual([
      {
        jobId:   'J1',
        message: {
          kind: 'question-answered', setupId: 'S1', questionId: 'Q1', reply: { letters: ['a'] }
        }
      },
      {
        jobId:   'J1',
        message: {
          kind: 'constitution-edited', setupId: 'S1', revision: 1, markdown: '# Example Agency\n\n- Keep the basket fast.\n', draftedFrom: null
        }
      },
      {
        jobId:   'J1',
        message: {
          kind: 'step-continued', setupId: 'S1', mode: 'setup', step: 'constitution', currentStep: 'design'
        }
      },
    ]);
  });

  test('a constitution edit of the SOURCES ticks alone carries the new ticks and no text', () => {
    const fixture = liveAgentBoard();
    apply(fixture, {
      kind: 'pipeline-constitution-edit', setupId: 'S1', revision: 0, draftedFrom: { contributing: false, research: true, installedDefault: false }
    });
    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J1',
      message: {
        kind: 'constitution-edited', setupId: 'S1', revision: 1, markdown: null, draftedFrom: { contributing: false, research: true, installedDefault: false }
      }
    }]);
  });

  test('a check messages the live agent with the gates the Overseer runs', () => {
    const fixture = liveAgentBoard();
    apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [{ field: 'gate:test', value: { name: 'test', run: 'bun test' } }, { field: 'phase-order:merge', value: ['test'] }],
    });
    fixture.records.length = 0;

    apply(fixture, { kind: 'pipeline-check', setupId: 'S1' });

    expect(messagesOf(fixture)).toEqual([{
      jobId:   'J1',
      message: {
        kind: 'check-requested', setupId: 'S1', draftRevision: 1, gateNames: ['test']
      }
    }]);
  });

  test('a record with no agent, or an agent no longer on the board, sends no message and still takes the move', () => {
    for (const fixture of [boardAtDesign(), boardAtDesign('J5')]) {
      apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

      expect(fixture.records.map((record) => record.kind)).toEqual(['pipeline-draft-discarded']);
    }
  });

  test('an agent a stop closed opens again with its conversation on User\'s next move, in its next Watcher instance', () => {
    const fixture = liveAgentBoard();
    fixture.board.requestJobStop('J1', 'stop', CHANGED_AT);

    apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

    expect(fixture.records.map((record) => record.kind)).toEqual(['job-stop-requested', 'job-ended', 'pipeline-draft-discarded', 'job-reopened']);
    expect(fixture.board.jobById('J1')).toMatchObject({ state: 'running', watcherInstance: 2 });
  });

  test('the setup move\'s message and the reopening it makes are logged as the Overseer\'s, and User\'s own job message is not', () => {
    const fixture = liveAgentBoard();
    apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });
    apply(fixture, { kind: 'job-message', jobId: 'J1', text: 'Keep the lint gate.' });
    fixture.board.requestJobStop('J1', 'stop', CHANGED_AT);
    apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

    const sentRecords = fixture.records.filter((record) => record.kind === 'job-messaged' || record.kind === 'job-reopened');
    expect(sentRecords.map((record) => [record.kind, 'byOverseer' in record.fields ? record.fields.byOverseer : null])).toEqual([
      ['job-messaged', true],
      ['job-messaged', null],
      ['job-reopened', true],
    ]);
  });

  test('an agent that ended other than by a stop is not opened again: the record is what a later agent starts from', () => {
    const fixture = liveAgentBoard();
    fixture.board.endJob('J1', { outcome: 'replaced' }, CHANGED_AT);
    fixture.records.length = 0;

    apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

    expect(fixture.records.map((record) => record.kind)).toEqual(['pipeline-draft-discarded']);
  });
});

describe('the record\'s pipeline agent', () => {
  test('pipeline-setup-start launches it, recorded launching with no ticket, and the record names it', () => {
    const fixture = boardFixture();

    apply(fixture, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false });

    expect(fixture.board.jobs().map((job) => [job.id, job.kind, job.state, job.ticketIds])).toEqual([['J1', 'pipeline-agent', 'launching', []]]);
    expect(fixture.board.pipelineSetup()?.agentJobId).toBe('J1');
  });

  test('pipeline-update-start launches none: an update has no agent until User asks for one', () => {
    const fixture = boardFixture({ pipeline: STORED_PIPELINE });

    apply(fixture, { kind: 'pipeline-update-start' });

    expect(fixture.board.jobs()).toEqual([]);
  });

  test('a start over stops its live agent in the same hold', () => {
    const fixture = boardAtDesign('J1');
    fixture.board.startPipelineAgent(CHANGED_AT);
    fixture.board.moveJob('J1', 'running', CHANGED_AT);

    apply(fixture, { kind: 'pipeline-setup-start-over', setupId: 'S1' });

    expect(fixture.board.pipelineSetup()).toBeNull();
    expect(fixture.board.jobById('J1')).toMatchObject({ state: 'stopping', stopRequest: 'stop' });
  });
});

describe('a resume', () => {
  const mainLineRead: RecordedGitStep = {
    gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    answeredAs:   GIT_CALL_SHAPES.CURRENT_BRANCH,
    filledIn:     { [RECORDED_PLACEHOLDERS.BRANCH]: 'main' },
  };

  function mainTipRead(commit: string): RecordedGitStep {
    return {
      gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', 'main^{commit}'],
      answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
      filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: commit },
    };
  }

  /** S1 at the design step, its snapshot at `SNAPSHOT_COMMIT`, its agent J1 closed by a stop. */
  function closedAgentBoard(): BoardFixture {
    const fixture = boardAtDesign('J1');
    fixture.board.startPipelineAgent(CHANGED_AT);
    fixture.board.requestJobStop('J1', 'stop', CHANGED_AT);
    fixture.board.attachSetupAgent('S1', 'J1', SNAPSHOT_COMMIT);
    fixture.records.length = 0;
    return fixture;
  }

  testWhenGitIsRecorded('after main moved it takes main\'s tip and the changed paths, sends research to a recheck and opens the agent naming them', async () => {
    const fixture = closedAgentBoard();
    const moveRead: RecordedGitStep[] = [
      mainLineRead,
      mainTipRead(MOVED_MAIN_TIP),
      { gitArguments: ['rev-list', '--count', '--end-of-options', `${SNAPSHOT_COMMIT}..${MOVED_MAIN_TIP}`], answeredAs: GIT_CALL_SHAPES.COMMITS_AHEAD_ONE },
      {
        gitArguments: ['diff', '--name-only', '--no-renames', '-z', SNAPSHOT_COMMIT, MOVED_MAIN_TIP, '--'],
        answeredAs:   GIT_CALL_SHAPES.FILES_CHANGED_UP_TO_A_COMMIT,
        filledIn:     { [RECORDED_PLACEHOLDERS.PATH]: 'package.json' },
      },
    ];

    await recordedGit.playStage(moveRead, async () => apply(fixture, { kind: 'pipeline-setup-resume', setupId: 'S1' }));

    expect(fixture.board.pipelineSetup()).toMatchObject({ snapshotCommit: MOVED_MAIN_TIP, stepStates: { research: 'needs-recheck' } });
    const reopened = fixture.records.find((record) => record.kind === 'job-reopened');
    expect(reopened?.kind === 'job-reopened' ? JSON.parse(reopened.fields.text) as unknown : null).toEqual({
      kind: 'setup-resumed', setupId: 'S1', mainMovedByCommits: 1, changedPaths: ['package.json']
    });
    expect(fixture.records.map((record) => record.kind)).toEqual(['pipeline-setup-resumed', 'job-reopened']);
  });

  testWhenGitIsRecorded('with main where the snapshot is, it moves nothing and only opens the agent', async () => {
    const fixture = closedAgentBoard();

    await recordedGit.playStage([mainLineRead, mainTipRead(SNAPSHOT_COMMIT)], async () => apply(fixture, { kind: 'pipeline-setup-resume', setupId: 'S1' }));

    expect(fixture.board.pipelineSetup()?.snapshotCommit).toBe(SNAPSHOT_COMMIT);
    expect(fixture.records.map((record) => record.kind)).toEqual(['job-reopened']);
  });

  testWhenGitIsRecorded('a record with no agent gets a new one, and one with no open record is refused no-setup-open', async () => {
    const fixture = boardFixture({ pipeline: STORED_PIPELINE });
    apply(fixture, { kind: 'pipeline-update-start' });

    await recordedGit.playStage([], async () => apply(fixture, { kind: 'pipeline-setup-resume', setupId: 'S1' }));

    expect(fixture.board.pipelineSetup()?.agentJobId).toBe('J1');
    expect(fixture.board.jobs().map((job) => job.kind)).toEqual(['pipeline-agent']);
    const thrown = thrownBy(() => apply(fixture, { kind: 'pipeline-setup-resume', setupId: 'S9' }));
    expect(thrown instanceof BoardRefusal ? thrown.detail : thrown).toEqual({ reason: 'no-setup-open', setupId: 'S9' });
  });
});

describe('Apply', () => {
  const MAIN_CONSTITUTION: MainConstitution = { path: 'CONSTITUTION.md', markdown: '# Example Agency\n\n- Keep the basket page fast.\n', blob: 'c'.repeat(40) };
  const MAIN_HOLDS_THE_TEXT = echoedControlContextWith({ verdict: 'read', constitution: MAIN_CONSTITUTION });

  function applyIn(fixture: BoardFixture, command: ControlCommand, context = ECHOED_CONTROL_CONTEXT, unreadablePipeline: UnreadablePipelineReading | null = null): unknown {
    return ControlService.apply(command, changeOf(fixture, unreadablePipeline), context).result;
  }

  test('a first setup opens on main\'s CONSTITUTION.md with its blob id, so an Apply of a new text waits for its commit', () => {
    const fixture = boardFixture();
    applyIn(fixture, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false }, MAIN_HOLDS_THE_TEXT);
    expect(fixture.board.pipelineSetup()?.constitution).toMatchObject({ markdown: MAIN_CONSTITUTION.markdown, baseBlob: MAIN_CONSTITUTION.blob });
    fixture.board.setConstitution('S1', { markdown: `${MAIN_CONSTITUTION.markdown}- Name things in full.\n`, annotations: [] }, CHANGED_AT);

    expect(applyIn(fixture, {
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: false
    }, MAIN_HOLDS_THE_TEXT)).toMatchObject({ outcome: 'committing' });
  });

  test('an update opens on main\'s CONSTITUTION.md with its blob id and the stored sources of that very blob', () => {
    const annotation = {
      lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
    } as const;
    const fixture = boardFixture({
      pipeline:            STORED_PIPELINE,
      constitutionSources: {
        verdict: 'readable',
        sources: {
          formatVersion: 1, blob: MAIN_CONSTITUTION.blob, annotations: [annotation], extra: []
        }
      },
    });

    applyIn(fixture, { kind: 'pipeline-update-start' }, MAIN_HOLDS_THE_TEXT);

    expect(fixture.board.pipelineSetup()?.constitution).toMatchObject({ markdown: MAIN_CONSTITUTION.markdown, baseBlob: MAIN_CONSTITUTION.blob, annotations: [annotation] });
  });

  test('the stored sources of another text never reach the record', () => {
    const fixture = boardFixture({
      pipeline:            STORED_PIPELINE,
      constitutionSources: {
        verdict: 'readable',
        sources: {
          formatVersion: 1,
          blob:          'd'.repeat(40),
          annotations:   [{
            lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
          }],
          extra: []
        }
      },
    });

    applyIn(fixture, { kind: 'pipeline-update-start' }, MAIN_HOLDS_THE_TEXT);

    expect(fixture.board.pipelineSetup()?.constitution?.annotations).toEqual([]);
  });

  test('advise opens an advise record on the stored pipeline and launches its pipeline agent', () => {
    const fixture = boardFixture({ pipeline: STORED_PIPELINE });

    applyIn(fixture, { kind: 'pipeline-agent-advise' }, MAIN_HOLDS_THE_TEXT);

    expect(fixture.board.pipelineSetup()).toMatchObject({
      mode: 'advise', agentJobId: 'J1', draft: STORED_PIPELINE, constitution: { baseBlob: MAIN_CONSTITUTION.blob }
    });
    expect(fixture.board.jobs().map((job) => job.kind)).toEqual(['pipeline-agent']);
  });

  test('a gate verb after an update opened makes its Apply refuse pipeline-moved; a changed CONSTITUTION.md refuses constitution-moved', () => {
    const fixture = boardFixture({ pipeline: STORED_PIPELINE });
    applyIn(fixture, { kind: 'pipeline-update-start' }, MAIN_HOLDS_THE_TEXT);
    const changedOnMain = echoedControlContextWith({ verdict: 'read', constitution: { ...MAIN_CONSTITUTION, markdown: '# Another text\n', blob: 'e'.repeat(40) } });

    const movedConstitution = thrownBy(() => applyIn(fixture, {
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: false
    }, changedOnMain));
    applyIn(fixture, { kind: 'pipeline-gate-add', gate: { name: 'lint', run: 'bun run lint' } });
    const movedPipeline = thrownBy(() => applyIn(fixture, {
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: false
    }, MAIN_HOLDS_THE_TEXT));

    expect(movedConstitution instanceof BoardRefusal ? movedConstitution.detail : movedConstitution).toMatchObject({ reason: 'constitution-moved' });
    expect(movedPipeline instanceof BoardRefusal ? movedPipeline.detail : movedPipeline).toMatchObject({ reason: 'pipeline-moved' });
  });

  test('an unreadable pipeline.json is replaced only by a record opened to replace it', () => {
    const older: UnreadablePipelineReading = { verdict: 'older' };
    const keeping = boardFixture();
    applyIn(keeping, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false });
    const replacing = boardFixture();
    applyIn(replacing, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: true });
    const command: ControlCommand = {
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: false
    };

    expect(operationRefusalOf(() => applyIn(keeping, command, ECHOED_CONTROL_CONTEXT, older)).detail).toMatchObject({ kind: 'older-pipeline' });
    expect(applyIn(replacing, command, ECHOED_CONTROL_CONTEXT, older)).toMatchObject({ outcome: 'applied' });
    expect(replacing.board.pipelineChanged()).toBe(true);
  });

  test('a main whose CONSTITUTION.md git cannot read refuses main-constitution-unreadable, with the Board untouched', () => {
    const fixture = boardAtDesign();
    const unreadable = echoedControlContextWith({ verdict: 'unreadable', reason: 'git could not be started' });

    const refusal = operationRefusalOf(() => applyIn(fixture, {
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: false
    }, unreadable));

    expect(refusal.detail).toEqual({ kind: 'main-constitution-unreadable', reason: 'git could not be started' });
    expect(fixture.board.pipelineSetupWrite()).toEqual({ write: 'unchanged' });
  });

  test('apply-cancel clears a waiting request, and with none refuses no-apply-pending', () => {
    const fixture = boardAtDesign();
    fixture.board.setConstitution('S1', { markdown: MAIN_CONSTITUTION.markdown, annotations: [] }, CHANGED_AT);
    applyIn(fixture, {
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 0, resumesBoard: false
    });
    expect(fixture.board.pipelineSetup()?.applyRequest?.state).toBe('committing');

    applyIn(fixture, { kind: 'pipeline-apply-cancel', setupId: 'S1' });

    expect(fixture.board.pipelineSetup()?.applyRequest).toBeNull();
    const thrown = thrownBy(() => applyIn(fixture, { kind: 'pipeline-apply-cancel', setupId: 'S1' }));
    expect(thrown instanceof BoardRefusal ? thrown.detail : thrown).toEqual({ reason: 'no-apply-pending', setupId: 'S1' });
  });
});

describe('a check', () => {
  const STORED_WITH_THREE_GATES: Pipeline = {
    version: 3,
    prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }],
    gates:   [{ name: 'test', run: 'bun test' }, { name: 'types', run: 'tsc' }, { name: 'format', run: 'prettier --check .' }],
    phases:  { build: ['test', 'types', 'format'], review: ['test'], merge: ['test'] },
  };

  /** An update of the three gates: `test` changed, `types` removed, `format` as stored, `lint` new. */
  function updateWithTouchedGates(): BoardFixture {
    const fixture = boardFixture({ pipeline: STORED_WITH_THREE_GATES });
    apply(fixture, { kind: 'pipeline-update-start' });
    apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [
        { field: 'gate:test', value: { name: 'test', run: 'bun test --bail' } },
        { field: 'gate:types', value: null },
        { field: 'gate:lint', value: { name: 'lint', run: 'eslint .' } },
        { field: 'phase-order:build', value: ['test', 'format', 'lint'] },
      ],
    });
    fixture.records.length = 0;
    return fixture;
  }

  test('queues only the gates the draft changes or adds, in draft order, logged with the revision', () => {
    const fixture = updateWithTouchedGates();

    apply(fixture, { kind: 'pipeline-check', setupId: 'S1' });

    expect(fixture.board.pipelineSetup()?.check).toEqual({
      draftRevision: 1, gateNames: ['test', 'lint'], state: 'queued', result: null, reason: null
    });
    expect(fixture.records).toEqual([{
      at: CHANGED_AT, kind: 'pipeline-check-requested', setupId: 'S1', fields: { revision: 1, gateNames: ['test', 'lint'] }
    }]);
  });

  test('a second press while the check waits refuses pipeline-check-running, with the Board untouched', () => {
    const fixture = updateWithTouchedGates();
    apply(fixture, { kind: 'pipeline-check', setupId: 'S1' });
    fixture.records.length = 0;

    const thrown = thrownBy(() => apply(fixture, { kind: 'pipeline-check', setupId: 'S1' }));

    expect(thrown instanceof BoardRefusal ? thrown.detail : thrown).toEqual({ reason: 'pipeline-check-running', setupId: 'S1' });
    expect(fixture.records).toEqual([]);
  });

  test('a draft that touches no gate refuses no-gate-to-check, and another record refuses no-setup-open', () => {
    const fixture = boardFixture({ pipeline: STORED_WITH_THREE_GATES });
    apply(fixture, { kind: 'pipeline-update-start' });

    const untouched = thrownBy(() => apply(fixture, { kind: 'pipeline-check', setupId: 'S1' }));
    const otherRecord = thrownBy(() => apply(fixture, { kind: 'pipeline-check', setupId: 'S9' }));

    expect(untouched instanceof BoardRefusal ? untouched.detail : untouched).toEqual({ reason: 'no-gate-to-check', setupId: 'S1' });
    expect(otherRecord instanceof BoardRefusal ? otherRecord.detail : otherRecord).toEqual({ reason: 'no-setup-open', setupId: 'S9' });
    expect(fixture.board.pipelineSetup()?.check).toBeUndefined();
  });
});
