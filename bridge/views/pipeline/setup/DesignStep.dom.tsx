/**
 * The design step (A2Proposal) in a happy-dom document, against fake controls. What matters: every proposed node and gate row is drawn as
 * proposed and Review carries its "proposed" chip; a node that waits on an open question shows a marker and opens on the question while
 * every other node keeps its own dialog, and the answer sends `pipeline-setup-answer` and closes it; Apply pipeline is disabled exactly
 * while a question is open, with its reason and hint, and opens the apply step otherwise; the Changes tab counts the facts' change list
 * and lists one card per change with Undo; the footer counts the steps and gates from the facts; neither a proposal nor a new one sends a
 * profile, only a stopwatch press does; the agent's newest change shows its step on the flow and undoes it; Discard proposal sends
 * `pipeline-draft-discard`; before a draft the flow says the agent is designing.
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

function nodeOf(nodeId: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(`[data-flow-node-id="${nodeId}"] .bridge-flow-node`);
  if (node === null) throw new Error(`no node ${nodeId}`);
  return node;
}

function footer(): HTMLElement {
  return screen.getByRole('region', { name: 'Pipeline design actions' });
}

function applyButton(): HTMLButtonElement {
  return within(footer()).getByRole<HTMLButtonElement>('button', { name: 'Apply pipeline' });
}

describe('the proposal on the flow', () => {
  test('every node and gate row is drawn as proposed, and Review carries the "proposed" chip', () => {
    renderDesign();
    const nodes = [...document.querySelectorAll<HTMLElement>('.bridge-flow-node')];
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes.every((node) => node.getAttribute('data-mark') === 'proposed')).toBe(true);
    const rows = [...document.querySelectorAll<HTMLElement>('.bridge-pipeline-gate-row')];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.hasAttribute('data-proposed'))).toBe(true);
    expect(within(nodeOf('review')).getByText('proposed')).toBeDefined();
    expect(within(nodeOf('builder')).queryByText('proposed')).toBeNull();
    expect(screen.getByRole('region', { name: 'Pipeline flow' }).getAttribute('data-stage')).toBe('proposal');
  });

  test('before the agent proposes a draft, the flow says it is designing', () => {
    renderDesign('A2-designing');
    expect(screen.getByText('The pipeline agent is designing…')).toBeDefined();
  });
});

describe('a node that waits on a question', () => {
  test('shows a marker and opens on the question, while another node opens its own dialog', async () => {
    const { controls } = renderDesign('A2-question-open');
    const asking = nodeOf('gates-merge');
    expect(within(asking).getByText('Question')).toBeDefined();
    expect(within(nodeOf('gates-build')).queryByText('Question')).toBeNull();
    expect(asking.getAttribute('aria-label')).toBe('Answer the question on the Gates step');

    fireEvent.doubleClick(nodeOf('builder'));
    expect(screen.getByRole('dialog', { name: 'Builder' })).toBeDefined();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Builder' }), { key: 'Escape' });

    fireEvent.keyDown(asking, { key: 'Enter' });
    const dialog = screen.getByRole('dialog', { name: 'Gates' });
    expect(within(dialog).getByText('Should the example browser tests run before every merge?')).toBeDefined();
    expect(asking.hasAttribute('data-selected')).toBe(true);
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

describe('the footer', () => {
  test('counts the proposed steps and gates from the facts, beside the Proposal chip', () => {
    renderDesign();
    expect(within(footer()).getByText('Proposal')).toBeDefined();
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
    expect(tab.querySelector('.bridge-count-badge')?.textContent).toBe(String(changeCount));
    await clickSettled(tab);
    const panel = screen.getByRole('tabpanel', { name: 'Changes' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(changeCount ?? -1);
    await clickSettled(within(panel).getByRole('button', { name: 'Undo the change to Review' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2' }]);
  });
});

describe('the agent\'s newest change', () => {
  test('shows its gate on the flow, selecting the Gates node and its tab, and Undo sends that edit', async () => {
    const { controls } = renderDesign();
    const change = screen.getByRole('region', { name: 'The agent\'s newest change' });
    expect(within(change).getByText('Example: typecheck runs in every phase.')).toBeDefined();
    const gates = screen.getByRole('region', { name: 'Gates' });
    await clickSettled(within(gates).getByRole('tab', { name: 'Merge, 3 gates' }));
    await clickSettled(within(change).getByRole('button', { name: 'Show typecheck on the flow' }));
    expect(nodeOf('gates-build').hasAttribute('data-selected')).toBe(true);
    expect(within(gates).getByRole('tab', { selected: true }).getAttribute('aria-label')).toBe('Build, 3 gates');
    expect(controls.sent).toEqual([]);
    await clickSettled(within(change).getByRole('button', { name: 'Undo the change to typecheck' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1' }]);
  });
});

describe('profiling', () => {
  test('a proposal, and a new one arriving, send no profile; only a stopwatch press does', async () => {
    const { controls, show } = renderDesign('A2-question-open');
    show(pipelineBoardStateOf('A2'));
    expect(controls.sent.filter((command) => command.kind === 'gate-profile-start')).toEqual([]);
    const lintRow = screen.getByRole('group', { name: /^Open the lint / });
    await clickSettled(within(lintRow).getByRole('button', { name: /not profiled/ }));
    expect(controls.sent).toEqual([{
      kind: 'gate-profile-start', setupId: 'S1', gateName: 'lint', phase: 'build'
    }]);
  });
});
