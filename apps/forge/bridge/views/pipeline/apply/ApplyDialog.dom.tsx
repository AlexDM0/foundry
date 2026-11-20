/**
 * The first Apply (A4Confirm) in a happy-dom document, opened from the design step against fake controls. What matters: Apply sends
 * `pipeline-apply` with `resumesBoard` exactly as the checkbox shows, on by default; the checkbox counts the committed tickets and the
 * concurrency limit; a refusal shows verbatim and the dialog stays open; with the facts' `applyState` committing, held or refused, the
 * dialog opens on that state's text from the facts, its Cancel is Cancel apply, which sends `pipeline-apply-cancel`, and a signing
 * failure offers the exact text of CONSTITUTION.md; Cancel, on the foot's start side, closes the dialog; once the facts show the
 * pipeline applied, the view leaves the setup route for the live flow.
 * Over entities (MonoApply): the dialog lists what is stored per level and the constitutions in the one commit; an entity worth a look
 * links to its level and never blocks Apply; the line about pending tickets without an entity shows; E94 shows only in update mode over a
 * stored pipeline without entities, with a link to each ticket and Apply disabled, and never on a first Apply.
 */
import {
  act,
  cleanup,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import { useState } from 'react';

import type { PipelineEntity }                                                    from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetupFacts }                                                from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { BoardStateDocument }                                                from '../../../@types/BoardStateDocument.ts';
import type { BridgeRoute }                                                       from '../../../shell/HashRouter.ts';
import { clickSettled, fakeControls }                                             from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';
import { ApplyDialog }                                                            from './ApplyDialog.tsx';

const DESIGN_ROUTE: BridgeRoute = { tab: 'pipeline', item: 'setup/design' };

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderDesign(name: PipelineFixtureName) {
  const controls = fakeControls();
  let showBoard: (next: BoardStateDocument) => void = () => undefined;

  function Host() {
    const [shown, setShown] = useState(pipelineBoardStateOf(name));
    showBoard = setShown;
    return <PipelineView facts={shown} route={DESIGN_ROUTE} {...pipelineViewServicesOf()} />;
  }
  controls.render(<Host />);
  return { controls, show: (next: BoardStateDocument) => act(() => showBoard(next)) };
}

function applyDialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Apply the pipeline?' });
}

function button(container: HTMLElement, name: string): HTMLButtonElement {
  return within(container).getByRole<HTMLButtonElement>('button', { name });
}

async function openApply(name: PipelineFixtureName = 'A4') {
  const rendered = renderDesign(name);
  await clickSettled(button(screen.getByRole('region', { name: 'Pipeline design actions' }), 'Apply pipeline'));
  return rendered;
}

describe('Resume the board', () => {
  test('is on by default and says how many committed tickets start, and how many at a time', async () => {
    await openApply();
    const checkbox = within(applyDialog()).getByRole<HTMLInputElement>('checkbox', { name: /Resume the board/u });
    expect(checkbox.checked).toBe(true);
    expect(within(applyDialog()).getByText('The 4 committed tickets start building, 2 at a time.')).toBeDefined();
    expect(within(applyDialog()).getByText('Apply commits CONSTITUTION.md to main, then stores the pipeline.')).toBeDefined();
  });

  test('the foot puts Cancel on the start side, before Apply', async () => {
    await openApply();
    const footButtons = [...applyDialog().querySelectorAll('.design-system-dialog-foot button')].map((element) => element.textContent);
    expect(footButtons).toEqual(['Cancel', 'Apply']);
  });

  test('Apply carries resumesBoard exactly as the checkbox shows', async () => {
    const { controls } = await openApply();
    await clickSettled(button(applyDialog(), 'Apply'));
    expect(controls.sent.at(-1)).toEqual({
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 7, resumesBoard: true,
    });
    await clickSettled(within(applyDialog()).getByRole('checkbox', { name: /Resume the board/u }));
    await clickSettled(button(applyDialog(), 'Apply'));
    expect(controls.sent.at(-1)).toEqual({
      kind: 'pipeline-apply', setupId: 'S1', draftRevision: 7, resumesBoard: false,
    });
  });

  test('Cancel closes the dialog and sends nothing', async () => {
    const { controls } = await openApply();
    await clickSettled(button(applyDialog(), 'Cancel'));
    expect(screen.queryByRole('dialog', { name: 'Apply the pipeline?' })).toBeNull();
    expect(controls.sent).toEqual([]);
  });
});

describe('a refusal', () => {
  test('shows verbatim in the dialog, which stays open', async () => {
    const { controls } = await openApply();
    const refusal = 'Pipeline setup S1 has question Q3 open: answer it first. Nothing was written.';
    controls.answerNextWith({ verdict: 'refused', refusal });
    await clickSettled(button(applyDialog(), 'Apply'));
    expect(within(applyDialog()).getByText(refusal)).toBeDefined();
    expect(button(applyDialog(), 'Apply')).toBeDefined();
  });
});

describe('a pending Apply', () => {
  test('while committing, the dialog opens on the facts\' state and Cancel apply sends pipeline-apply-cancel', async () => {
    const { controls } = renderDesign('A4-committing');
    expect(within(applyDialog()).getByText('Waiting for the merge train: 14 is landing')).toBeDefined();
    expect(within(applyDialog()).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(within(applyDialog()).queryByRole('button', { name: 'Apply' })).toBeNull();
    await clickSettled(button(applyDialog(), 'Cancel apply'));
    expect(controls.sent).toEqual([{ kind: 'pipeline-apply-cancel', setupId: 'S1' }]);
  });

  test('turns into the committing state once the facts show the request, and says so with a busy ring', async () => {
    const { show } = await openApply();
    show(pipelineBoardStateOf('A0b-apply-pending'));
    expect(within(applyDialog()).getByRole('progressbar', { name: 'Committing CONSTITUTION.md to main' })).toBeDefined();
    expect(button(applyDialog(), 'Cancel apply')).toBeDefined();
  });

  test('when held, shows the reason and the blocking files from the facts', () => {
    renderDesign('A4-held');
    expect(within(applyDialog()).getByText('Main has uncommitted changes to CONSTITUTION.md.')).toBeDefined();
    expect(button(applyDialog(), 'Cancel apply')).toBeDefined();
    expect(within(applyDialog()).queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  test('when refused for signing, offers the exact text of CONSTITUTION.md and Apply again', async () => {
    const board = pipelineBoardStateOf('A4-refused-unsigned');
    const { controls } = renderDesign('A4-refused-unsigned');
    expect(within(applyDialog()).getByText('Git could not sign the commit, and nothing commits unsigned.')).toBeDefined();
    await clickSettled(button(applyDialog(), 'View CONSTITUTION.md'));
    const textDialog = screen.getByRole('dialog', { name: 'CONSTITUTION.md' });
    expect(textDialog.querySelector('pre')?.textContent).toBe(board.pipelineSetup?.record.constitution?.markdown);
    await clickSettled(button(textDialog, 'Close'));
    await clickSettled(button(applyDialog(), 'Apply'));
    expect(controls.sent.at(-1)).toMatchObject({ kind: 'pipeline-apply', setupId: 'S1', resumesBoard: true });
    await clickSettled(button(applyDialog(), 'Cancel apply'));
    expect(controls.sent.at(-1)).toEqual({ kind: 'pipeline-apply-cancel', setupId: 'S1' });
  });
});

describe('the landing', () => {
  test('once the facts show the pipeline applied, the view leaves the setup route for the live flow', async () => {
    const { show } = await openApply();
    window.location.hash = '#pipeline/setup/design';
    show(pipelineBoardStateOf('A5'));
    expect(screen.queryByRole('dialog', { name: 'Apply the pipeline?' })).toBeNull();
    expect(window.location.hash).toBe('#pipeline');
  });
});

const ADMIN_ENTITY: PipelineEntity = {
  kind: 'app', home: ['/apps/admin'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] },
};

/** The monorepo design with its open question answered away, so Apply can open; with `admin`, an entity worth a look. */
function monorepoBoard(withAdmin: boolean): BoardStateDocument {
  const board = pipelineBoardStateOf('mono-design');
  const setup = board.pipelineSetup ?? null;
  if (setup === null) throw new Error('the fixture mono-design has no setup');
  const { record } = setup;
  const draft = record.draft === null || !withAdmin ? record.draft : { ...record.draft, entities: { ...record.draft.entities, admin: ADMIN_ENTITY } };
  const entities = Object.fromEntries(Object.entries(record.entities ?? {}).map(([entityKey, part]) => [entityKey, { ...part, questions: [] }]));
  const entityFacts = Object.fromEntries(Object.entries(setup.entities ?? {}).map(([entityKey, facts]) => [entityKey, { ...facts, openQuestionCount: 0 }]));
  const monorepoSetup: PipelineSetupFacts = {
    ...setup, openQuestionCount: 0, record: { ...record, draft, entities }, entities: entityFacts,
  };
  return { ...board, pipelineSetup: monorepoSetup };
}

function renderMonorepoDesign(withAdmin: boolean) {
  const controls = fakeControls();
  controls.render(<PipelineView facts={monorepoBoard(withAdmin)} route={DESIGN_ROUTE} {...pipelineViewServicesOf()} />);
  return controls;
}

describe('over entities', () => {
  test('lists what is stored per level and the constitutions the one commit holds', async () => {
    renderMonorepoDesign(false);
    await clickSettled(button(screen.getByRole('region', { name: 'Pipeline design actions' }), 'Apply pipeline'));
    const levels = within(applyDialog()).getByRole('list', { name: 'What is stored, per level' });
    expect(within(levels).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'ForgeHuman ticket review on, human code review off, conflict re-review over 750 lines',
      'webapp · 1 prepare step · 2 build, 2 review and 2 merge gates · review on',
      'design-systempackage · 1 build, 1 review and 1 merge gates · review on',
      'rootroot · Kept for a person: no gates, no constitution',
    ]);
    expect(within(applyDialog()).getByText('1 constitution goes to main in one commit')).toBeDefined();
    expect(within(within(applyDialog()).getByRole('list', { name: 'Constitutions in the commit' })).getByText('web')).toBeDefined();
    expect(within(applyDialog()).getByText('The 4 committed tickets start building, 2 jobs at once.')).toBeDefined();
    expect(within(applyDialog()).getByText('4 committed tickets name no entity. After Apply the product owner gives each one an entity.')).toBeDefined();
    expect(within(applyDialog()).queryByText('Apply is refused')).toBeNull();
  });

  test('an entity worth a look links to its level and never blocks Apply', async () => {
    const controls = renderMonorepoDesign(true);
    await clickSettled(button(screen.getByRole('region', { name: 'Pipeline design actions' }), 'Apply pipeline'));
    const worthALook = within(applyDialog()).getByRole('list', { name: 'Worth a look' });
    expect(within(worthALook).getByText('admin has no gates')).toBeDefined();
    expect(within(worthALook).getAllByRole('link', { name: 'Open admin' })[0]?.getAttribute('href')).toBe('#pipeline/entity/admin/setup/design');
    await clickSettled(button(applyDialog(), 'Apply'));
    expect(controls.sent.at(-1)).toMatchObject({ kind: 'pipeline-apply', setupId: 'S1', resumesBoard: true });
  });
});

describe('E94 before Apply', () => {
  function renderDialog(mode: 'setup' | 'update') {
    const setup = monorepoBoard(false).pipelineSetup ?? null;
    if (setup === null) throw new Error('the monorepo board has a setup');
    const storedPipeline = pipelineBoardStateOf('A5').pipeline;
    if (storedPipeline === undefined) throw new Error('the fixture A5 stores a pipeline');
    const controls = fakeControls();
    controls.render(
      <ApplyDialog
        setup={{ ...setup, record: { ...setup.record, mode } }}
        pendingTicketCount={0}
        concurrencyLimit={2}
        onClose={() => undefined}
        storedPipeline={storedPipeline}
        ticketIdsInFlight={['14']}
      />
    );
    return controls;
  }

  test('in update mode over a stored pipeline without entities, says Apply is refused, links the ticket and keeps Apply disabled', () => {
    renderDialog('update');
    const alert = within(applyDialog()).getByRole('alert');
    expect(within(alert).getByText('Apply is refused')).toBeDefined();
    expect(within(alert).getByRole('link', { name: 'Open 14' }).getAttribute('href')).toBe('#kanban/ticket/14');
    expect(button(applyDialog(), 'Apply').disabled).toBe(true);
    expect(within(applyDialog()).queryByRole('checkbox', { name: /Resume the board/u })).toBeNull();
  });

  test('never shows on a first Apply, where Apply stays enabled', async () => {
    const controls = renderDialog('setup');
    expect(within(applyDialog()).queryByRole('alert')).toBeNull();
    expect(button(applyDialog(), 'Apply').disabled).toBe(false);
    await clickSettled(button(applyDialog(), 'Apply'));
    expect(controls.sent.at(-1)).toMatchObject({ kind: 'pipeline-apply', setupId: 'S1' });
  });
});
