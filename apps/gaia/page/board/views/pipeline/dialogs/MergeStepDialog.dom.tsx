/**
 * The merge step dialog in a happy-dom document, opened through the dialog host: the derived meter and its tooltip, no model or effort
 * control for the merge itself, the off note, and Save sending the merge train's re-review and the conflict re-reviewer.
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

import type { BoardDocument }                               from '../../../../@types/board/BoardDocument.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, type PipelineFixtureName }   from '../../../testing/PipelineFixture.ts';
import type { FlowOpenRequest }                             from '../flow/PipelineFlowModel.ts';
import { PipelineDialogs }                                  from './PipelineDialogs.tsx';

afterEach(cleanup);

const MERGE_REQUEST: FlowOpenRequest = { kind: 'node', nodeId: 'merge-in-airlock', action: { kind: 'dialog', dialog: 'merge-step', focusesReReview: false } };

function DialogHarness({ facts }: { readonly facts: BoardDocument }) {
  const [request, setRequest] = useState<FlowOpenRequest | null>(MERGE_REQUEST);
  return <PipelineDialogs facts={facts} request={request} onClose={() => setRequest(null)} />;
}

function renderDialog(name: PipelineFixtureName = 'A2') {
  const controls = fakeControls();
  controls.render(onBoard(<DialogHarness facts={pipelineBoardStateOf(name)} />));
  return controls;
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Merge main into the tree' });
}

function derivedMeter(): HTMLElement {
  const meter = dialog().querySelector<HTMLElement>('.design-system-effort-meter[data-derived]');
  if (meter === null) throw new Error('no derived meter');
  return meter;
}

describe('the derived meter', () => {
  test('takes the focus and is described by its tooltip', () => {
    renderDialog();
    const meter = derivedMeter();
    expect(meter.tabIndex).toBe(0);
    act(() => meter.focus());
    expect(document.activeElement).toBe(meter);
    const tooltip = within(dialog()).getByRole('tooltip');
    expect(meter.getAttribute('aria-describedby')).toBe(tooltip.id);
    expect(tooltip.textContent).toContain('Derived from the last worker');
  });

  test('the dialog has no model or effort control for the merge itself', () => {
    renderDialog();
    expect(within(dialog()).queryByRole('group', { name: 'Model' })).toBeNull();
    expect(within(dialog()).queryByRole('group', { name: 'Effort' })).toBeNull();
    expect(within(dialog()).queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(within(dialog()).getByRole('combobox', { name: 'Re-review model' })).toBeDefined();
  });

  test('the tooltip body follows derivedFrom: the last worker, or the builder when no review runs', () => {
    renderDialog('A2');
    expect(within(dialog()).getByRole('tooltip').textContent).toContain('This ticket\'s reviewer, or its builder when no review ran. Change it on that step.');
    cleanup();
    renderDialog('A7');
    expect(within(dialog()).getByRole('tooltip').textContent).toContain('The builder, since no review runs. Change it on the Builder step.');
  });
});

describe('the re-review after a conflict merge', () => {
  test('switched off, the off note says the re-review leaves the merge train', () => {
    renderDialog();
    act(() => within(dialog()).getByRole('switch', { name: 'Re-review after a conflict merge' }).click());
    expect(screen.getByText('Off: the Re-review step leaves the merge train, and a conflict fix goes straight to the merge gates.')).toBeDefined();
  });

  test('every brief the re-review reads offers Open, as the facts resolve its text on main', () => {
    renderDialog();
    const instructions = within(dialog()).getByRole('group', { name: 'Re-review brief' });
    const rows = [...instructions.querySelectorAll<HTMLElement>('.design-system-listed-file')];
    expect(rows.map((row) => [row.querySelector('.design-system-listed-file-name')?.textContent, within(row).queryByRole('button', { name: 'Open' }) !== null]))
      .toEqual([['constitution.md', false], ['reviewer.md', true], ['conflictReReviewer.md', true]]);
  });

  test('Save sends the merge train\'s re-review and the conflict re-reviewer', async () => {
    const controls = renderDialog();
    await clickSettled(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(controls.sent[0]).toMatchObject({
      ...SENT_COMMAND_VERSION,
      kind:  'pipeline-draft-edit',
      edits: [
        { target: 'airlock', value: { reReview: { thresholdLines: 750 } } },
        { target: 'role', role: 'conflictReReviewer', value: { model: 'sonnet', effort: 'high' } },
      ],
      isACopy: false
    });
  });
});
