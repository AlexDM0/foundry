/**
 * The review step dialog (A3cReviewModal) in a happy-dom document, opened through the dialog host. What matters: Review and Re-review are
 * two tabs of one form, so a change on one tab survives a visit to the other and Save sends both; switching the re-review off hides its
 * settings and shows the off note, and Save then drops `review.reReview`; the threshold steps by 50 and stops at 50; Reset puts back the
 * defaults (re-review on at 750, the constitution in both briefs); Remove review asks first and then sends one `null` edit; both tabs
 * offer every model and effort; and opened from the re-review node it opens on the Re-review tab, its switch focused.
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

import type { BoardStateDocument }                        from '../../../@types/BoardStateDocument.ts';
import { clickSettled, fakeControls }                     from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import type { FlowOpenRequest }                           from '../flow/PipelineFlowModel.ts';
import { PipelineDialogs }                                from './PipelineDialogs.tsx';

afterEach(cleanup);

function reviewRequest(focusesReReview: boolean): FlowOpenRequest {
  return { kind: 'node', nodeId: focusesReReview ? 're-review' : 'review', action: { kind: 'dialog', dialog: 'review-step', focusesReReview }, };
}

function DialogHarness({ facts, initialRequest }: { readonly facts: BoardStateDocument; readonly initialRequest: FlowOpenRequest }) {
  const [request, setRequest] = useState<FlowOpenRequest | null>(initialRequest);
  return <PipelineDialogs facts={facts} request={request} onClose={() => setRequest(null)} />;
}

function renderDialog(name: PipelineFixtureName = 'A2', focusesReReview = false) {
  const controls = fakeControls();
  controls.render(<DialogHarness facts={pipelineBoardStateOf(name)} initialRequest={reviewRequest(focusesReReview)} />);
  return controls;
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Review' });
}

function reReviewSwitch(): HTMLElement {
  return within(dialog()).getByRole('switch', { name: 'Re-review' });
}

function openTab(name: 'Review' | 'Re-review'): void {
  act(() => within(dialog()).getByRole('tab', { name }).click());
}

function fileNames(): string[] {
  return [...dialog().querySelectorAll('.design-system-listed-file-name')].map((element) => element.textContent ?? '');
}

function threshold(): string | null {
  return dialog().querySelector('.design-system-number-stepper-value')?.textContent ?? null;
}

describe('the re-review', () => {
  test('switched off, its settings hide and the off note shows; Save then drops review.reReview', async () => {
    const controls = renderDialog();
    openTab('Re-review');
    expect(within(dialog()).getByRole('combobox', { name: 'Re-review model' })).toBeDefined();
    act(() => reReviewSwitch().click());
    expect(within(dialog()).queryByRole('combobox', { name: 'Re-review model' })).toBeNull();
    expect(screen.getByText('Off: the Re-review steps leave the flow, and a large fix goes straight to the gates.')).toBeDefined();
    await clickSettled(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(controls.sent).toHaveLength(1);
    expect(controls.sent[0]).toMatchObject({ kind: 'pipeline-draft-edit', edits: [{ field: 'role:reviewer' }, { field: 'review', value: { name: 'review' } }] });
    expect(JSON.stringify(controls.sent[0])).not.toContain('reReview');
  });

  test('the threshold steps by 50 and stops at 50', () => {
    renderDialog();
    openTab('Re-review');
    act(() => within(dialog()).getByRole('button', { name: 'Raise the threshold' }).click());
    expect(threshold()).toBe('800');
    const lower = within(dialog()).getByRole('button', { name: 'Lower the threshold' });
    for (let i = 0; i < 20; i += 1) act(() => lower.click());
    expect(threshold()).toBe('50');
    expect((lower as HTMLButtonElement).disabled).toBe(true);
  });

  test('Reset puts back the defaults: re-review on at 750, the constitution in both lists', () => {
    renderDialog();
    act(() => within(dialog()).getByRole('button', { name: 'Remove constitution.md' }).click());
    expect(fileNames()).not.toContain('constitution.md');
    openTab('Re-review');
    act(() => reReviewSwitch().click());
    act(() => within(dialog()).getByRole('button', { name: 'Reset to default' }).click());
    expect(reReviewSwitch().getAttribute('aria-checked')).toBe('true');
    expect(threshold()).toBe('750');
    expect(fileNames()).toContain('constitution.md');
    openTab('Review');
    expect(fileNames()).toContain('constitution.md');
  });

  test('opened from the re-review node it opens on the Re-review tab, its switch focused', () => {
    renderDialog('A2', true);
    expect(within(dialog()).getByRole('tab', { name: 'Re-review' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(reReviewSwitch());
  });
});

describe('the two tabs', () => {
  test('the dialog opens on the Review tab, and the Re-review tab holds the re-review', () => {
    renderDialog();
    expect(within(dialog()).getByRole('tab', { name: 'Review' }).getAttribute('aria-selected')).toBe('true');
    expect(within(dialog()).queryByRole('switch', { name: 'Re-review' })).toBeNull();
    openTab('Re-review');
    expect(within(dialog()).getByRole('tabpanel', { name: 'Re-review' })).toBeDefined();
    expect(reReviewSwitch()).toBeDefined();
  });

  test('a change on one tab survives a visit to the other, and Save sends both', async () => {
    const controls = renderDialog();
    fireEvent.change(within(dialog()).getByRole('combobox', { name: 'Model' }), { target: { value: 'haiku' } });
    openTab('Re-review');
    act(() => within(dialog()).getByRole('button', { name: 'Raise the threshold' }).click());
    openTab('Review');
    expect((within(dialog()).getByRole('combobox', { name: 'Model' }) as HTMLSelectElement).value).toBe('haiku');
    await clickSettled(within(dialog()).getByRole('button', { name: 'Save' }));
    const savedEdits = [
      { field: 'role:reviewer', value: { model: 'haiku' } },
      { field: 'role:reReviewer' },
      { field: 'review', value: { reReview: { thresholdLines: 800 } } },
    ];
    expect(controls.sent[0]).toMatchObject({ edits: savedEdits });
  });
});

describe('Remove review', () => {
  test('asks first, then sends one edit with value null', async () => {
    const controls = renderDialog();
    act(() => within(dialog()).getByRole('button', { name: 'Remove review' }).click());
    expect(controls.sent).toEqual([]);
    const strip = within(dialog()).getByRole('group', { name: 'Remove review' });
    await clickSettled(within(strip).getByRole('button', { name: 'Remove' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 7, edits: [{ field: 'review', value: null }],
    }]);
  });
});

test('both tabs offer every model and effort value', () => {
  renderDialog();
  const modelsOf = (name: string) => [...(within(dialog()).getByRole('combobox', { name }) as HTMLSelectElement).options].map((option) => option.value);
  const effortsOf = (name: string) => within(within(dialog()).getByRole('group', { name })).getAllByRole('button').map((button) => button.textContent);
  expect(modelsOf('Model')).toEqual(['haiku', 'sonnet', 'opus', 'fable']);
  expect(effortsOf('Effort')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  openTab('Re-review');
  expect(modelsOf('Re-review model')).toEqual(['haiku', 'sonnet', 'opus', 'fable']);
  expect(effortsOf('Re-review effort')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  expect(within(dialog()).getByRole('group', { name: 'Re-review effort' }).getAttribute('data-size')).toBe('compact');
});
