/**
 * The first Apply (A4Confirm) in a happy-dom document, opened from the design step against fake controls. What matters: Apply sends
 * `pipeline-apply` with `resumesBoard` exactly as the checkbox shows, on by default; the checkbox counts the pending tickets and the
 * concurrency limit; a refusal shows verbatim and the dialog stays open; with the facts' `applyState` committing, held or refused, the
 * dialog opens on that state's text from the facts, its Cancel is Cancel apply, which sends `pipeline-apply-cancel`, and a signing
 * failure offers the exact text of CONSTITUTION.md; Cancel closes the dialog; once the facts show the pipeline applied, the view leaves
 * the setup route for the live flow.
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

import type { BoardStateDocument }                                                from '../../../@types/BoardStateDocument.ts';
import type { BridgeRoute }                                                       from '../../../shell/HashRouter.ts';
import { clickSettled, fakeControls }                                             from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

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
  test('is on by default and says how many pending tickets start, and how many at a time', async () => {
    await openApply();
    const checkbox = within(applyDialog()).getByRole<HTMLInputElement>('checkbox', { name: /Resume the board/u });
    expect(checkbox.checked).toBe(true);
    expect(within(applyDialog()).getByText('The 4 pending tickets start building, 2 at a time.')).toBeDefined();
    expect(within(applyDialog()).getByText('Apply commits CONSTITUTION.md to main, then stores the pipeline.')).toBeDefined();
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
