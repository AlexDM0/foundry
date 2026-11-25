/**
 * The entities step against fake controls. What matters: the proposal shows every entity and the root kept for a person, and Continue
 * waits until User decides; Accept opens Continue, which moves the step on; Stay in single mode removes every entity from the draft, the
 * step then says single mode, and once the step is left that way the setup has six steps again; before any proposal, Stay in single mode
 * continues the step with no entity; a fold sends the package's removal and the target's new homes as one gesture; a gesture is sent at
 * once even when the draft it leaves holds a refusal, and nothing is predicted; a refusal the forge serves shows in its sentence with
 * Continue disabled, and its fix sends the fix's edits; a key the forge refuses shows the forge's sentence; choosing the root's gates adds
 * the root entity; how a crossing runs is read-only; and the agent's question at the entities step shows in the panel, while a research question
 * stays on the research step.
 */
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardDocument }                                      from '../../../../@types/board/BoardDocument.ts';
import type { BoardDraftEditDocument, BoardEntityRefusalDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import { entitiesStepBoardOf, entitiesStepDraftOf }                from '../../../testing/EntitiesStepFixture.ts';
import {
  clickSettled,
  fakeControls,
  fakeTranscripts,
  SENT_COMMAND_VERSION
} from '../../../testing/FakeControls.ts';
import { onBoard }                from '../../../testing/OnBoard.ts';
import { pipelineViewServicesOf } from '../../../testing/PipelineFixture.ts';
import { PipelineView }           from '../PipelineView.tsx';

const ENTITIES_ROUTE = { tab: 'pipeline', item: 'setup/entities' } as const;

const STEP_DRAFT_REVISION = entitiesStepBoardOf().pipeline.setup?.record.draftRevision ?? 0;

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderEntities(board: BoardDocument = entitiesStepBoardOf()) {
  const controls = fakeControls();
  controls.render(onBoard(<PipelineView facts={board} route={ENTITIES_ROUTE} {...pipelineViewServicesOf(fakeTranscripts().follow)} />));
  return controls;
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

function continueButton(): HTMLButtonElement {
  return screen.getByRole('button', { name: 'Continue to constitution' }) as HTMLButtonElement;
}

function rowOf(key: string): HTMLElement {
  return within(screen.getByRole('list', { name: 'Entity list' })).getByRole('listitem', { name: key });
}

/** Where an edit lands, `entity:<key>` or `entity:<key>/<target>`, so a case reads which entities a gesture touched. */
function editedPlaceOf(edit: BoardDraftEditDocument): string {
  if (edit.target === 'entity') return `entity:${edit.entityKey}`;
  if (edit.target === 'within-entity') return `entity:${edit.entityKey}/${edit.edit.target}`;
  return edit.target;
}

function sentPlaces(controls: ReturnType<typeof fakeControls>): string[][] {
  return controls.sent.map((command) => (command.kind === 'pipeline-draft-edit' ? command.edits.map(editedPlaceOf) : []));
}

/** The refusal the forge serves for web's whitelist naming config, which has no review step, with a sentence as forge words it. */
const SERVED_REVIEW_REFUSAL: BoardEntityRefusalDocument = {
  reason:     'whitelisted-package-without-review',
  entityKeys: ['web', 'config'],
  shownOn:    'web',
  text:       'Example: web whitelists config, which has no review step. Continue and Apply wait until it is fixed.',
  fix:        {
    label: 'Give config a review step',
    edits: [{ target: 'within-entity', entityKey: 'config', edit: { target: 'review', value: { name: 'review', reReview: null } } }],
  },
};

describe('the proposal', () => {
  test('shows every entity and the root kept for a person, and Continue waits for User\'s decision', () => {
    renderEntities();
    expect(screen.getByRole('heading', { name: 'The entities of Example Agency' })).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Proposal' })).getByText('Research found 5 stand-alone codebases')).toBeDefined();
    expect(within(screen.getByRole('list', { name: 'Entity list' })).getAllByRole('listitem').map((row) => row.getAttribute('aria-label')))
      .toEqual(['web', 'admin', 'ui', 'config', 'docs']);
    expect((screen.getByRole('radio', { name: 'Kept for a person' }) as HTMLInputElement).checked).toBe(true);
    expect(continueButton().disabled).toBe(true);
    expect(screen.getByText('Accept monorepo mode first, or stay in single mode')).toBeDefined();
  });

  test('Accept opens Continue, which moves the step on', async () => {
    const controls = renderEntities();
    fireEvent.click(screen.getByRole('button', { name: 'Accept monorepo mode' }));
    expect(screen.getByRole('region', { name: 'Monorepo mode' })).toBeDefined();
    expect(continueButton().disabled).toBe(false);
    await clickSettled(continueButton());
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'entities', move: 'continue'
    }]);
  });
});

describe('single mode', () => {
  test('Stay in single mode removes every entity from the draft in one edit', async () => {
    const controls = renderEntities();
    fireEvent.click(screen.getByRole('button', { name: 'Stay in single mode' }));
    await settle();
    expect(sentPlaces(controls)).toEqual([['entity:web', 'entity:admin', 'entity:ui', 'entity:config', 'entity:docs']]);
    expect(controls.sent[0]).toMatchObject({
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S1', isACopy: false
    });
  });

  test('before any proposal, Stay in single mode continues the step, which is how a done step with no entity declines', async () => {
    const controls = renderEntities(entitiesStepBoardOf({ draft: entitiesStepDraftOf({}), }));
    expect(continueButton().disabled).toBe(true);
    await clickSettled(within(screen.getByRole('region', { name: 'No proposal yet' })).getByRole('button', { name: 'Stay in single mode' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-step', setupId: 'S1', step: 'entities', move: 'continue'
    }]);
  });

  test('a draft that User emptied says single mode and lets Continue go', () => {
    const board = entitiesStepBoardOf({
      draft: entitiesStepDraftOf({}),
      edits: [{
        editId: 'E1', by: 'user', field: 'entity:web', summary: '', undone: false, batch: null,
      }],
    });
    renderEntities(board);
    expect(screen.getByRole('region', { name: 'Single mode' })).toBeDefined();
    expect(screen.queryByRole('list', { name: 'Entity list' })).toBeNull();
    expect(continueButton().disabled).toBe(false);
  });

  test('once the step is left that way, the setup has six steps and the entities route falls back to the resume summary', () => {
    const board = entitiesStepBoardOf({
      currentStep: 'constitution',
      stepStates:  {
        agent: 'done', billing: 'done', research: 'done', entities: 'done', constitution: 'in-progress', design: 'not-started', apply: 'not-started'
      },
      draft: null,
    });
    renderEntities(board);
    expect(document.querySelector('.board-pipeline')?.getAttribute('data-screen')).toBe('setup-resume');
    expect(within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem')).toHaveLength(6);
  });
});

describe('a fold', () => {
  test('folding a package into an app sends its removal and the app\'s new homes as one gesture', async () => {
    const controls = renderEntities();
    fireEvent.click(within(rowOf('docs')).getByRole('button', { name: 'Fold docs into another entity' }));
    const dialog = screen.getByRole('dialog', { name: 'Fold docs into root?' });
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Fold into' }), { target: { value: 'web' } });
    expect(screen.getByRole('dialog', { name: 'Fold docs into web?' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Fold into web' }));
    await settle();
    expect(sentPlaces(controls)).toEqual([['entity:docs', 'entity:web']]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('folding into the root kept for a person only removes the package', async () => {
    const controls = renderEntities();
    fireEvent.click(within(rowOf('docs')).getByRole('button', { name: 'Fold docs into another entity' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fold into root' }));
    await settle();
    expect(sentPlaces(controls)).toEqual([['entity:docs']]);
  });
});

describe('the refusals before Continue', () => {
  test('a gesture is sent at once, even when the draft it leaves holds a refusal, and nothing is predicted', async () => {
    const controls = renderEntities();
    fireEvent.click(screen.getByRole('button', { name: 'Accept monorepo mode' }));
    fireEvent.change(within(rowOf('ui')).getByRole('combobox', { name: 'Kind of ui' }), { target: { value: 'app' } });
    await settle();
    expect(sentPlaces(controls)).toEqual([['entity:ui']]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a refusal the forge serves shows in its sentence with Continue disabled, and its fix sends the fix\'s edits', async () => {
    const controls = renderEntities(entitiesStepBoardOf({}, { entityRefusals: [SERVED_REVIEW_REFUSAL] }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept monorepo mode' }));
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('Continue is refused')).toBeDefined();
    expect(within(alert).getByText(SERVED_REVIEW_REFUSAL.text)).toBeDefined();
    expect(continueButton().disabled).toBe(true);
    await clickSettled(within(alert).getByRole('button', { name: 'Give config a review step' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: STEP_DRAFT_REVISION,
      edits:         SERVED_REVIEW_REFUSAL.fix?.edits ?? [],
      isACopy:       false
    }]);
  });
});

describe('a key the forge refuses', () => {
  test('a rename to a key with a "/" is sent as typed, and the forge\'s refusal shows in its sentence', async () => {
    const controls = renderEntities();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example: an entity key cannot hold "/".' });
    const keyField = within(rowOf('web')).getByRole('textbox', { name: 'Key of web' }) as HTMLInputElement;
    fireEvent.change(keyField, { target: { value: 'shop/web' } });
    fireEvent.keyDown(keyField, { key: 'Enter' });
    await settle();
    expect(sentPlaces(controls)[0]).toContain('entity:shop/web');
    expect(screen.getByText('Example: an entity key cannot hold "/".')).toBeDefined();
  });
});

describe('the agent\'s question', () => {
  test('a question at the entities step is a card in the panel, answered as any card; a research question stays on research', async () => {
    const askedOn = (questionId: string, step: 'research' | 'entities', question: string) => ({
      questionId,
      step,
      subject:     null,
      question,
      context:     '',
      multiple:    false,
      answer:      null,
      recommended: ['a'],
      options:     [{ letter: 'a', text: 'Fold it into the root' }, { letter: 'b', text: 'Keep it as a package' }],
    });
    const questions = [askedOn('Q1', 'research', 'Do the tests need the network?'), askedOn('Q2', 'entities', 'Is docs an entity of its own?')];
    const controls = renderEntities(entitiesStepBoardOf({ questions }));
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });

    expect(within(panel).queryByRole('group', { name: /Do the tests need the network/u })).toBeNull();
    const card = within(panel).getByRole('group', { name: /Is docs an entity of its own/u });
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q2', answer: { form: 'letters', choices: ['a'] }
    }]);
  });
});

describe('the root and the crossing', () => {
  test('choosing gates for the root adds the root entity over the repository\'s root folder', async () => {
    const controls = renderEntities();
    fireEvent.click(screen.getByRole('radio', { name: 'Gets gates and a constitution' }));
    await settle();
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: STEP_DRAFT_REVISION,
      edits:         [{ target: 'entity', entityKey: 'root', value: { kind: 'root', home: ['/'], summary: null } }],
      isACopy:       false
    }]);
  });

  test('how a crossing runs is read-only: six stages, and Close the one action', () => {
    const controls = renderEntities();
    fireEvent.click(within(rowOf('web')).getByRole('button', { name: 'Expand web' }));
    fireEvent.click(within(rowOf('web')).getByRole('button', { name: 'See how a crossing runs' }));
    const dialog = screen.getByRole('dialog', { name: 'How a web ticket that crosses into ui runs' });
    expect(within(within(dialog).getByRole('list', { name: 'Stages' })).getAllByRole('listitem')).toHaveLength(6);
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(controls.sent).toEqual([]);
  });
});
