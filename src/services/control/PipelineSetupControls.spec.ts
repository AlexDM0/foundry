/**
 * User's setup kinds of the control contract, applied to a Board in a change. What matters: a body is untrusted JSON, so every kind
 * refuses a missing or misshapen nested field as `malformed-setup-command`, naming the field, and never fails on a `TypeError`, with the
 * Board untouched; a draft edit is checked against the revision User saw and the draft it leaves against the `pipeline.json` validator;
 * an update starts from a readable stored pipeline only; and an answer, edit, Undo, discard, constitution edit or Continue messages a live
 * pipeline agent in the same hold, in the words the injected context gives, while a record with no live agent sends none.
 */
import { describe, expect, test } from 'bun:test';

import type { UnreadablePipelineReading }  from '../../adapters/pipeline/PipelineFile.ts';
import type { Pipeline }                   from '../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }              from '../../lib/tracker-model/@types/PipelineSetup.ts';
import { BoardRefusal }                    from '../../lib/tracker-model/BoardRefusal.ts';
import type { ControlCommand }             from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                from '../../shared/OperationRefusal.ts';
import { boardFixture, type BoardFixture } from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }          from '../../testing/EchoedControlContext.ts';
import type { TrackerChange }              from '../tracker/TrackerPipeline.ts';
import { workspacePathsFor }               from '../tracker/Workspace.ts';
import { ControlService }                  from './ControlService.ts';

const CHANGED_AT = '2026-11-12T10:00:00+01:00';

const WORKSPACE = workspacePathsFor('/example-agency/storefront');

const STORED_PIPELINE: Pipeline = {
  version: 2,
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

function operationRefusalOf(attempt: () => unknown): OperationRefusal {
  const thrown = thrownBy(attempt);
  if (thrown instanceof OperationRefusal) return thrown;
  throw thrown;
}

/** A board whose open record S1 is a first setup at the design step. */
function boardAtDesign(agentJobId: string | null = null): BoardFixture {
  const opened = boardFixture();
  apply(opened, { kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false });
  for (const step of ['billing', 'research', 'constitution'] as const) {
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
  ['editId', { kind: 'pipeline-draft-undo', setupId: 'S1' }],
  ['setupId', { kind: 'pipeline-draft-discard', setupId: '  ' }],
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

  test('a draft edit, its Undo and a discard each message the live agent in the context\'s words, in the same hold', () => {
    const fixture = liveAgentBoard();

    apply(fixture, {
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: 0,
      edits:         [{ field: 'gate:test', value: { name: 'test', run: 'bun test' } }, { field: 'phase-order:merge', value: ['test'] }],
    });
    apply(fixture, { kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1' });
    apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

    expect(messagesOf(fixture)).toEqual([
      {
        jobId:   'J1',
        message: {
          kind: 'draft-edited', setupId: 'S1', draftRevision: 1, editIds: ['E1', 'E2'], fields: ['gate:test', 'phase-order:merge']
        }
      },
      {
        jobId:   'J1',
        message: {
          kind: 'draft-edit-undone', setupId: 'S1', draftRevision: 2, editId: 'E1', field: 'gate:test'
        }
      },
      { jobId: 'J1', message: { kind: 'draft-discarded', setupId: 'S1', draftRevision: 3 } },
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
          kind: 'constitution-edited', setupId: 'S1', revision: 1, markdownChanged: true, sourcesChanged: false
        }
      },
      {
        jobId:   'J1',
        message: {
          kind: 'step-continued', setupId: 'S1', step: 'constitution', currentStep: 'design'
        }
      },
    ]);
  });

  test('a record with no agent, or an agent no longer on the board, sends no message and still takes the move', () => {
    for (const fixture of [boardAtDesign(), boardAtDesign('J5')]) {
      apply(fixture, { kind: 'pipeline-draft-discard', setupId: 'S1' });

      expect(fixture.records.map((record) => record.kind)).toEqual(['pipeline-draft-discarded']);
    }
  });
});
