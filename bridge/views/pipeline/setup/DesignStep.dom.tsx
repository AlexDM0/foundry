/**
 * The design step (A2Proposal) in a happy-dom document, against fake controls. What matters: the proposal opens on its title row and the
 * Build phase with no change marked; a step that waits on an open question shows its pill on its card and its phase tab and opens on the
 * question while every other step keeps its own dialog, and the answer sends `pipeline-setup-answer` and closes it; Apply pipeline is disabled exactly
 * while a question is open, with its reason and hint, and opens the apply step otherwise; the Changes tab counts the facts' change list
 * and lists one card per change with Undo; the footer counts the steps and gates from the facts; neither a proposal nor a new one sends a
 * profile, only a time chip press does; the agent's newest change opens its phase, selects its gate row and undoes it; Discard
 * proposal sends `pipeline-draft-discard`; before a draft a line over the phases and the agent strip say the agent is designing; the
 * agent's panel opens on the Conversation, and its one Flint slot waits while a design question is open and is ready once proposed.
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

import type { BoardStateDocument }                                                from '../../../@types/BoardStateDocument.ts';
import type { BridgeRoute }                                                       from '../../../shell/HashRouter.ts';
import { clickSettled, fakeControls }                                             from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

const DESIGN_ROUTE: BridgeRoute = { tab: 'pipeline', item: 'setup/design' };

afterEach(cleanup);

function renderDesign(name: PipelineFixtureName = 'A2') {
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
    expect(document.querySelectorAll('[data-step-node-id][data-change], .bridge-pipeline-gate-row[data-change]')).toHaveLength(0);
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
    await clickSettled(within(dialog).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q3', answer: { form: 'letters', choices: ['a'] },
    }]);
    expect(screen.queryByRole('dialog', { name: 'Gates' })).toBeNull();
  });
});

describe('Apply pipeline', () => {
  test('is disabled exactly while a question is open, with its reason and the hint', () => {
    renderDesign('A2-question-open');
    expect(applyButton().disabled).toBe(true);
    expect(applyButton().closest('.bridge-pipeline-design-apply')?.getAttribute('title')).toBe('Answer the open question first');
    expect(within(footer()).getByText('Answer the open question to apply')).toBeDefined();
  });

  test('once every question is answered it is enabled, says so, and opens the apply step', async () => {
    const { show } = renderDesign('A2-question-open');
    show(pipelineBoardStateOf('A2'));
    expect(applyButton().disabled).toBe(false);
    expect(applyButton().closest('.bridge-pipeline-design-apply')?.hasAttribute('title')).toBe(false);
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

  test('Flint waits while a design question is open, and the proposal is ready once it is answered and the agent says so', () => {
    const { show } = renderDesign('A2-question-open');
    const flint = () => screen.getByRole('img', { name: 'Flint, the pipeline agent' });
    expect([flint().dataset['size'], flint().dataset['ground'], flint().dataset['flintPose']]).toEqual(['76', 'page', 'waiting']);
    expect(screen.getByText('Waiting for your answer')).toBeDefined();
    const answered = pipelineBoardStateOf('A2');
    const answeredSetup = answered.pipelineSetup;
    if (answeredSetup === null || answeredSetup === undefined) throw new Error('the fixture A2 has no setup');
    show(answered);
    expect(flint().dataset['flintPose']).toBe('thinking');
    show({ ...answered, pipelineSetup: { ...answeredSetup, record: { ...answeredSetup.record, readyToContinue: ['design'] } } });
    expect(flint().dataset['flintPose']).toBe('happy');
    expect(screen.getByText('Proposal ready', { selector: '.bridge-pipeline-agent-strip *' })).toBeDefined();
    expect(document.querySelectorAll('.design-system-flint-slot')).toHaveLength(1);
  });
});

describe('the footer', () => {
  test('counts the proposed steps and gates from the facts, beside the Proposal chip', () => {
    renderDesign();
    expect(within(footer()).getByText('Proposal')).toBeDefined();
    expect(within(footer()).getByText('Nothing is stored until you apply.')).toBeDefined();
    expect(within(footer()).getByText('1 prepare step · 3 build gates · 3 review gates · 3 merge gates')).toBeDefined();
  });

  test('Discard proposal sends pipeline-draft-discard', async () => {
    const { controls } = renderDesign();
    await clickSettled(within(footer()).getByRole('button', { name: 'Discard proposal' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-discard', setupId: 'S1' }]);
  });
});

describe('the Changes tab', () => {
  test('counts the change list, lists one card per change, and Undo sends that edit', async () => {
    const { controls } = renderDesign();
    const changeCount = pipelineBoardStateOf('A2').pipelineFlow?.changeList.length;
    const tab = screen.getByRole('tab', { name: `Changes, ${changeCount} changes` });
    expect(tab.querySelector('.design-system-count-badge')?.textContent).toBe(String(changeCount));
    await clickSettled(tab);
    const panel = screen.getByRole('tabpanel', { name: 'Changes' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(changeCount ?? -1);
    await clickSettled(within(panel).getByRole('button', { name: 'Undo the change to Review' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2' }]);
  });
});

describe('the agent\'s newest change', () => {
  test('Show opens its gate\'s phase and selects its row, and Undo sends that edit', async () => {
    const { controls } = renderDesign();
    const change = screen.getByRole('region', { name: 'The agent\'s newest change' });
    expect(within(change).getByText('Example: typecheck runs in every phase.')).toBeDefined();
    await clickSettled(phaseTab(/^Merge/));
    await clickSettled(within(change).getByRole('button', { name: 'Show typecheck on the flow' }));
    expect(phaseTab(/^Build/).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Open the typecheck gate' }).hasAttribute('data-selected')).toBe(true);
    expect(controls.sent).toEqual([]);
    await clickSettled(within(change).getByRole('button', { name: 'Undo the change to typecheck' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1' }]);
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
      kind: 'gate-profile-start', setupId: 'S1', gateName: 'lint', phase: 'build'
    }]);
  });
});
