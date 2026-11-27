/**
 * The design step against fake controls: the proposal's phases and changes, open questions holding Apply, the agent's newest change with its Undo,
 * and in monorepo mode each entity's own level and the forge's.
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
import { useState } from 'react';

import type { BoardDocument }                               from '../../../../@types/board/BoardDocument.ts';
import type { BoardRoute }                                  from '../../../../shared/BoardRouter.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';
import {
  exampleGate,
  pipelineBoardStateOf,
  pipelineViewServicesOf,
  type PipelineFixtureName,
  withPipelineFacts
} from '../../../testing/PipelineFixture.ts';
import { PipelineView } from '../PipelineView.tsx';

const DESIGN_ROUTE: BoardRoute = { tab: 'pipeline', item: 'setup/design' };

afterEach(cleanup);

function renderDesign(name: PipelineFixtureName = 'A2') {
  const controls = fakeControls();
  let showBoard: (next: BoardDocument) => void = () => undefined;

  function Host() {
    const [shown, setShown] = useState(pipelineBoardStateOf(name));
    showBoard = setShown;
    return <PipelineView facts={shown} route={DESIGN_ROUTE} {...pipelineViewServicesOf()} />;
  }
  controls.render(onBoard(<Host />));
  return { controls, show: (next: BoardDocument) => act(() => showBoard(next)) };
}

function stepOf(nodeId: string): HTMLElement {
  const step = document.querySelector<HTMLElement>(`[data-step-node-id="${nodeId}"]`);
  if (step === null) throw new Error(`no step ${nodeId}`);
  return step;
}

function phaseTab(name: RegExp): HTMLElement {
  return within(screen.getByRole('group', { name: 'Pipeline phases' })).getByRole('button', { name });
}

function footer(): HTMLElement {
  return screen.getByRole('region', { name: 'Pipeline design actions' });
}

function applyButton(): HTMLButtonElement {
  return within(footer()).getByRole<HTMLButtonElement>('button', { name: 'Apply pipeline' });
}

describe('the proposal on the flow', () => {
  test('opens on its title row and the Build phase, with no change marked', () => {
    renderDesign();
    expect(screen.getByRole('heading', { level: 2, name: 'Design your pipeline' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Phase 2: Build' }).getAttribute('data-stage')).toBe('proposal');
    expect(document.querySelectorAll('[data-step-node-id]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-step-node-id][data-change], .board-pipeline-gate-row[data-change]')).toHaveLength(0);
  });

  test('before the agent proposes a draft, the flow and the agent strip say it is designing, and nothing says the proposal is ready', () => {
    renderDesign('A2-designing');
    expect(screen.getByText('The pipeline agent is designing…')).toBeDefined();
    expect(screen.getByText('Designing the pipeline')).toBeDefined();
    expect(screen.queryByText('Proposal ready')).toBeNull();
  });
});

describe('a node that waits on a question', () => {
  test('shows its pill on its card and its phase tab, and opens on the question, while another step opens its own dialog', async () => {
    const { controls } = renderDesign('A2-question-open');
    fireEvent.doubleClick(stepOf('builder'));
    expect(screen.getByRole('dialog', { name: 'Builder' })).toBeDefined();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Builder' }), { key: 'Escape' });

    expect(within(phaseTab(/^Merge/)).getByText('1 question')).toBeDefined();
    await clickSettled(phaseTab(/^Merge/));
    const asking = stepOf('gates-merge');
    expect(within(asking).getByRole('button', { name: '1 question' })).toBeDefined();
    expect(asking.getAttribute('aria-label')).toBe('Answer the question on the Gates step');
    expect(within(stepOf('merge-in-airlock')).queryByText('1 question')).toBeNull();

    fireEvent.keyDown(asking, { key: 'Enter' });
    const dialog = screen.getByRole('dialog', { name: 'Gates' });
    expect(within(dialog).getByText('Should the example browser tests run before every merge?')).toBeDefined();
    expect(asking.querySelector('.design-system-card')?.hasAttribute('data-selected')).toBe(true);
    fireEvent.click(within(dialog).getByRole('radio', { name: /^a\. /u }));
    await clickSettled(within(dialog).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q3', answer: { form: 'letters', choices: ['a'] },
    }]);
    expect(screen.queryByRole('dialog', { name: 'Gates' })).toBeNull();
  });
});

describe('Apply pipeline', () => {
  test('is disabled exactly while a question is open, with its reason and the hint', () => {
    renderDesign('A2-question-open');
    expect(applyButton().disabled).toBe(true);
    expect(applyButton().closest('.board-pipeline-design-apply')?.getAttribute('title')).toBe('Answer the open question first');
    expect(within(footer()).getByText('Answer the open question to apply')).toBeDefined();
  });

  test('once every question is answered it is enabled, says so, and opens the apply step', async () => {
    const { show } = renderDesign('A2-question-open');
    show(pipelineBoardStateOf('A2'));
    expect(applyButton().disabled).toBe(false);
    expect(applyButton().closest('.board-pipeline-design-apply')?.hasAttribute('title')).toBe(false);
    expect(within(footer()).getByText('All questions answered')).toBeDefined();
    await clickSettled(applyButton());
    expect(applyButton().getAttribute('aria-expanded')).toBe('true');
  });
});

describe('the pipeline agent\'s panel', () => {
  test('opens on the Conversation beside the Changes, with the agent\'s state in its head', () => {
    renderDesign();
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Conversation', expect.stringMatching(/^Changes\d+$/u)]);
    expect(within(panel).getByRole('tabpanel', { name: 'Chat with the pipeline agent' })).toBeDefined();
    expect(within(panel).getByRole('heading', { name: 'Pipeline agent' })).toBeDefined();
  });

  test('the strip waits while a design question is open, and the proposal is ready once it is answered and the agent says so', () => {
    const { show } = renderDesign('A2-question-open');
    const flint = screen.getByRole('img', { name: 'Flint, the pipeline agent' });
    expect([flint.dataset['size'], flint.dataset['ground']]).toEqual(['60x50', 'page']);
    expect(screen.getByText('Waiting for your answer')).toBeDefined();
    const answered = pipelineBoardStateOf('A2');
    const answeredSetup = answered.pipeline.setup;
    if (answeredSetup === null || answeredSetup === undefined) throw new Error('the fixture A2 has no setup');
    show(answered);
    expect(screen.getByText('Designing the pipeline', { selector: '.board-pipeline-agent-strip *' })).toBeDefined();
    show(withPipelineFacts(answered, { setup: { ...answeredSetup, record: { ...answeredSetup.record, readyToContinue: ['design'] } } }));
    expect(screen.getByText('Proposal ready', { selector: '.board-pipeline-agent-strip *' })).toBeDefined();
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
  });
});

describe('the footer', () => {
  test('says nothing is stored beside the dashed Proposal pill, and leaves the counting of steps and gates to the phase tabs', () => {
    renderDesign();
    const proposalPill = within(footer()).getByText('Proposal');
    expect([proposalPill.dataset['stateTone'], proposalPill.hasAttribute('data-dashed')]).toEqual(['accent-outline', true]);
    expect(within(footer()).getByText('Nothing is stored until you apply.')).toBeDefined();
    expect(within(footer()).queryByText(/build gates/)).toBeNull();
  });

  test('Discard proposal sends pipeline-draft-discard', async () => {
    const { controls } = renderDesign();
    await clickSettled(within(footer()).getByRole('button', { name: 'Discard proposal' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-discard', setupId: 'S1' }]);
  });
});

describe('the Changes tab', () => {
  test('counts the change list, lists one card per change, and Undo sends that edit', async () => {
    const { controls } = renderDesign();
    const changeCount = pipelineBoardStateOf('A2').pipeline.flow?.changeList.length;
    const tab = screen.getByRole('tab', { name: `Changes, ${changeCount} changes` });
    expect(tab.querySelector('.design-system-count-badge')?.textContent).toBe(String(changeCount));
    await clickSettled(tab);
    const panel = screen.getByRole('tabpanel', { name: 'Changes' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(changeCount ?? -1);
    await clickSettled(within(panel).getByRole('button', { name: 'Undo the change to Review' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2', wholeBatch: false
    }]);
  });
});

describe('the agent\'s newest change', () => {
  test('it is named by its own label and repeats no summary; its link opens its gate\'s phase and selects its row; Undo sends the edit', async () => {
    const { controls } = renderDesign();
    const change = screen.getByRole('region', { name: 'The agent\'s newest change' });
    expect(change.firstElementChild?.id).toBe(change.getAttribute('aria-labelledby') ?? 'no label');
    expect(within(change).queryByText('Example: typecheck runs in every phase.')).toBeNull();
    await clickSettled(phaseTab(/^Merge/));
    await clickSettled(within(change).getByRole('button', { name: 'Build · typecheck' }));
    expect(phaseTab(/^Build/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Open the typecheck gate' }).hasAttribute('data-selected')).toBe(true);
    expect(controls.sent).toEqual([]);
    await clickSettled(within(change).getByRole('button', { name: 'Undo the change to typecheck' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1', wholeBatch: false
    }]);
  });
});

describe('profiling', () => {
  test('a proposal, and a new one arriving, send no profile; only a time chip press does', async () => {
    const { controls, show } = renderDesign('A2-question-open');
    show(pipelineBoardStateOf('A2'));
    expect(controls.sent.filter((command) => command.kind === 'gate-profile-start')).toEqual([]);
    const lintRow = screen.getByRole('group', { name: /^Open the lint / });
    await clickSettled(within(lintRow).getByRole('button', { name: /not measured/ }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'gate-profile-start', setupId: 'S1', gateName: 'lint', phase: 'build', entity: null
    }]);
  });
});

describe('monorepo mode', () => {
  const entityRoute = (key: string): BoardRoute => ({ tab: 'pipeline', item: `entity/${key}/setup/design` });
  const FORGE_ROUTE: BoardRoute = { tab: 'pipeline', item: 'forge/setup/design' };

  function renderLevel(route: BoardRoute) {
    const controls = fakeControls();
    let showRoute: (next: BoardRoute) => void = () => undefined;

    function Host() {
      const [shownRoute, setShownRoute] = useState(route);
      showRoute = setShownRoute;
      return <PipelineView facts={pipelineBoardStateOf('mono-design')} route={shownRoute} {...pipelineViewServicesOf()} />;
    }
    controls.render(onBoard(<Host />));
    return { controls, moveTo: (next: BoardRoute) => act(() => showRoute(next)) };
  }

  function phaseTabNames(): string[] {
    return within(screen.getByRole('group', { name: 'Pipeline phases' })).getAllByRole('button').map((tab) => tab.getAttribute('data-phase') ?? '');
  }

  function gateNamesShown(): string[] {
    return [...document.querySelectorAll<HTMLElement>('[data-gate-row-key]')].map((row) => row.dataset['gateRowKey'] ?? '');
  }

  test('an entity draws its three phases, its own gates and its own chat under its breadcrumb', () => {
    renderLevel(entityRoute('web'));
    expect(screen.getByRole('navigation', { name: 'Level' }).textContent).toBe('Pipeline›web');
    expect(screen.getByRole('heading', { level: 2, name: 'Design web’s pipeline' })).toBeDefined();
    expect(phaseTabNames()).toEqual(['build', 'review', 'merge']);
    expect(screen.getByRole('region', { name: 'Phase 1: Build' })).toBeDefined();
    expect(gateNamesShown()).toEqual(['prepare:install', 'gate:typecheck', 'gate:unit-tests']);
    expect(within(screen.getByRole('complementary', { name: 'Pipeline agent' })).getByRole('heading', { name: 'Pipeline agent · web' })).toBeDefined();
  });

  test('a press on the rail keeps the screen and moves the level; the flow, the chat and the changes follow it', async () => {
    const { moveTo } = renderLevel(entityRoute('web'));
    await clickSettled(within(screen.getByRole('navigation', { name: 'Pipeline levels' })).getByRole('button', { name: /^design-system,/u }));
    expect(window.location.hash).toBe('#forge/example-tracker/pipeline/entity/design-system/setup/design');
    moveTo(entityRoute('design-system'));
    expect(gateNamesShown()).toEqual(['gate:typecheck']);
    const panel = screen.getByRole('complementary', { name: 'Pipeline agent' });
    expect(within(panel).getByRole('heading', { name: 'Pipeline agent · design-system' })).toBeDefined();
    expect(within(panel).getByText('1 question in another entity')).toBeDefined();
    await clickSettled(within(panel).getByRole('tab', { name: /^Changes/u }));
    expect(within(panel).getByText('No changes at this level yet.')).toBeDefined();
  });

  test('a dialog\'s Save at an entity edits the entity\'s own field', async () => {
    const { controls } = renderLevel(entityRoute('web'));
    fireEvent.doubleClick(stepOf('builder'));
    await clickSettled(within(screen.getByRole('dialog', { name: 'Builder' })).getByRole('button', { name: 'Save' }));
    expect(controls.sent).toHaveLength(1);
    expect(controls.sent[0]).toMatchObject({
      ...SENT_COMMAND_VERSION,
      kind:    'pipeline-draft-edit',
      setupId: 'S1',
      edits:   [{ target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'builder' } }],
      isACopy: false,
    });
  });

  test('a profile at an entity names the entity', async () => {
    const { controls } = renderLevel(entityRoute('web'));
    const typecheckRow = screen.getByRole('group', { name: /^Open the typecheck / });
    await clickSettled(within(typecheckRow).getByRole('button', { name: /not measured/ }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'gate-profile-start', setupId: 'S1', gateName: 'typecheck', phase: 'build', entity: 'web'
    }]);
  });

  test('at an entity, Human code review is set at the forge, and the merge step saves only the entity\'s conflict re-reviewer', async () => {
    const { controls } = renderLevel(entityRoute('web'));
    await clickSettled(phaseTab(/^Review/));
    const codeReview = stepOf('human-code-review');
    expect(within(codeReview).queryByRole('switch')).toBeNull();
    expect(within(codeReview).getByRole('link', { name: 'Set at the Forge level' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/forge/setup/design');
    await clickSettled(phaseTab(/^Merge/));
    fireEvent.doubleClick(stepOf('merge-in-airlock'));
    const dialog = screen.getByRole('dialog', { name: 'Merge main into the tree' });
    expect(within(dialog).getByRole<HTMLButtonElement>('switch').disabled).toBe(true);
    await clickSettled(within(dialog).getByRole('button', { name: 'Save' }));
    expect(controls.sent).toHaveLength(1);
    expect(controls.sent[0]).toMatchObject({
      ...SENT_COMMAND_VERSION,
      kind:    'pipeline-draft-edit',
      edits:   [{ target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'conflictReReviewer' } }],
      isACopy: false,
    });
  });

  test('the forge draws its page and no gates; its switches and the Airlock edit the forge\'s own fields', async () => {
    const { controls } = renderLevel(FORGE_ROUTE);
    expect(screen.getByRole('heading', { level: 2, name: 'Design the Forge level' })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Pipeline phases' })).toBeNull();
    expect(document.querySelector('[data-gates-table]')).toBeNull();
    expect(screen.getByText('No gates at the Forge level.')).toBeDefined();
    const entities = screen.getByRole('table', { name: 'Entities' });
    expect(within(entities).getByRole('link', { name: 'Open web' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/entity/web/setup/design');
    expect(within(entities).getByText('1 question')).toBeDefined();

    await clickSettled(screen.getByRole('switch', { name: 'Human code review' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: expect.any(Number),
      edits:         [{ target: 'approval', approval: 'merge', value: true }],
      isACopy:       false,
    }]);
    await clickSettled(screen.getByRole('button', { name: 'Change the conflict re-review' }));
    const airlock = screen.getByRole('dialog', { name: 'The Airlock' });
    expect(within(airlock).queryByRole('combobox')).toBeNull();
    await clickSettled(within(airlock).getByRole('button', { name: 'Save' }));
    expect(controls.sent.at(-1)).toMatchObject({
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', edits: [{ target: 'airlock' }], isACopy: false
    });
  });

  test('the board limit is the board\'s own control, sent at once in jobs', async () => {
    const { controls } = renderLevel(FORGE_ROUTE);
    const limit = screen.getByRole('region', { name: 'Board limit' });
    expect(within(limit).getByText('2 jobs at once')).toBeDefined();
    await clickSettled(within(limit).getByRole('button', { name: 'More jobs at once' }));
    await clickSettled(within(limit).getByRole('button', { name: 'Set now' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'concurrency-set', limit: 3 }]);
  });

  test('a question in an entity holds Apply at every level', () => {
    renderLevel(FORGE_ROUTE);
    expect(applyButton().disabled).toBe(true);
    expect(within(footer()).getByText('Answer the open question to apply')).toBeDefined();
    expect(within(footer()).getByText('3 entities · 3 gates')).toBeDefined();
  });

  test('a copy of a phase\'s gates to another entity sends one copy of the edits that change something', async () => {
    const { controls } = renderLevel(entityRoute('web'));
    const table = screen.getByRole('region', { name: 'Build gates' });
    await clickSettled(within(table).getByRole('button', { name: 'Copy to another entity' }));
    const menu = screen.getByRole('dialog', { name: 'Copy web’s build gates to' });
    await clickSettled(within(menu).getByRole('checkbox', { name: /^design-system/u }));
    await clickSettled(within(menu).getByRole('button', { name: 'Copy 2 gates' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:          'pipeline-draft-edit',
      setupId:       'S1',
      draftRevision: expect.any(Number),
      edits:         [
        { target: 'within-entity', entityKey: 'design-system', edit: { target: 'gate', name: 'unit-tests', value: exampleGate('unit-tests', 'bun test') } },
        { target: 'within-entity', entityKey: 'design-system', edit: { target: 'phase-order', phase: 'build', names: ['typecheck', 'unit-tests'] } },
      ],
      isACopy: true,
    }]);
    expect(screen.getByText('Copied to design-system · 2 edits in Changes')).toBeDefined();
  });
});
