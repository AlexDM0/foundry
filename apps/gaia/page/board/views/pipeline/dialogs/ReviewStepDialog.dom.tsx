/**
 * The review step dialog (A3cReviewModal) in a happy-dom document, opened through the dialog host. What matters: Review and Re-review are
 * two tabs of one form, so a change on one tab survives a visit to the other and Save sends both; switching the re-review off hides its
 * settings and shows the off note, and Save then drops `review.reReview`; the threshold steps by 50 and stops at 50; Reset puts back the
 * defaults (re-review on at 750, the constitution in both briefs); Remove review asks first and then sends one `null` edit; both tabs
 * offer every model and effort; every brief the re-review reads offers Open; and opened from the re-review node it opens on the Re-review
 * tab, its switch focused. In the spec-then-plan route the Review tab holds the Pipeline documents after the brief, its title with the New
 * pill, the spec fixed at Always with its other choices disabled, a read-only line on what the builder reads, and Reset to default puts the
 * plan back at If you approved it.
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
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, type PipelineFixtureName }   from '../../../testing/PipelineFixture.ts';
import type { FlowOpenRequest }                             from '../flow/PipelineFlowModel.ts';
import { PipelineDialogs }                                  from './PipelineDialogs.tsx';

afterEach(cleanup);

function reviewRequest(focusesReReview: boolean): FlowOpenRequest {
  return { kind: 'node', nodeId: focusesReReview ? 're-review' : 'review', action: { kind: 'dialog', dialog: 'review-step', focusesReReview }, };
}

function DialogHarness({ facts, initialRequest }: { readonly facts: BoardDocument; readonly initialRequest: FlowOpenRequest }) {
  const [request, setRequest] = useState<FlowOpenRequest | null>(initialRequest);
  return <PipelineDialogs facts={facts} request={request} onClose={() => setRequest(null)} />;
}

function renderDialog(name: PipelineFixtureName = 'A2', focusesReReview = false) {
  const controls = fakeControls();
  controls.render(onBoard(<DialogHarness facts={pipelineBoardStateOf(name)} initialRequest={reviewRequest(focusesReReview)} />));
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
  test('switched off, its settings hide and the off note shows; Save then sends the review with no re-review', async () => {
    const controls = renderDialog();
    openTab('Re-review');
    expect(within(dialog()).getByRole('combobox', { name: 'Re-review model' })).toBeDefined();
    act(() => reReviewSwitch().click());
    expect(within(dialog()).queryByRole('combobox', { name: 'Re-review model' })).toBeNull();
    expect(screen.getByText('Off: the Re-review steps leave the flow, and a large fix goes straight to the gates.')).toBeDefined();
    await clickSettled(within(dialog()).getByRole('button', { name: 'Save' }));
    expect(controls.sent).toHaveLength(1);
    expect(controls.sent[0]).toMatchObject({
      ...SENT_COMMAND_VERSION,
      kind:    'pipeline-draft-edit',
      edits:   [{ target: 'role', role: 'reviewer' }, { target: 'review', value: { name: 'review', reReview: null } }],
      isACopy: false,
    });
  });

  test('every brief the re-review reads offers Open, its own reReviewer.md too', () => {
    renderDialog();
    openTab('Re-review');
    const instructions = within(dialog()).getByRole('group', { name: 'Re-review brief' });
    const rows = [...instructions.querySelectorAll<HTMLElement>('.design-system-listed-file')];
    expect(rows.map((row) => [row.querySelector('.design-system-listed-file-name')?.textContent, within(row).queryByRole('button', { name: 'Open' }) !== null]))
      .toEqual([['constitution.md', false], ['reviewer.md', true], ['reReviewer.md', true]]);
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
      { target: 'role', role: 'reviewer', value: { model: 'haiku' } },
      { target: 'role', role: 'reReviewer' },
      { target: 'review', value: { reReview: { thresholdLines: 800 } } },
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
      ...SENT_COMMAND_VERSION, kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 7, edits: [{ target: 'review', value: null }], isACopy: false
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

describe('the pipeline documents', () => {
  function documentsRegion(): HTMLElement {
    return within(dialog()).getByRole('region', { name: 'Pipeline documents' });
  }

  function pressedIn(groupName: string): string | null {
    const group = within(documentsRegion()).getByRole('group', { name: groupName });
    return [...group.querySelectorAll('button')].find((button) => button.getAttribute('aria-pressed') === 'true')?.textContent ?? null;
  }

  test('the spec stays at Always, its other choices disabled, and the plan offers every choice', () => {
    renderDialog('A2-spec-then-plan');
    const specChoices = [...within(documentsRegion()).getByRole('group', { name: 'When the reviewer reads the spec' }).querySelectorAll('button')];
    expect(specChoices.map((button) => [button.textContent, button.disabled])).toEqual([['Always', false], ['If you approved it', true], ['Never', true]]);
    expect(pressedIn('When the reviewer reads the plan')).toBe('If you approved it');
    expect(dialog().textContent).toContain('Reads the spec and the plan, always. Change it in the Builder\'s editor.');
  });

  test('a changed plan rule is stored on Save, and Reset to default puts it back at If you approved it', async () => {
    const controls = renderDialog('A2-spec-then-plan');
    const planGroup = (): HTMLElement => within(documentsRegion()).getByRole('group', { name: 'When the reviewer reads the plan' });
    act(() => within(planGroup()).getByRole('button', { name: 'Never' }).click());
    expect(pressedIn('When the reviewer reads the plan')).toBe('Never');
    act(() => within(dialog()).getByRole('button', { name: 'Reset to default' }).click());
    expect(pressedIn('When the reviewer reads the plan')).toBe('If you approved it');
    act(() => within(planGroup()).getByRole('button', { name: 'Always' }).click());
    await clickSettled(within(dialog()).getByRole('button', { name: 'Save' }));
    const reviewerEdit = expect.objectContaining({ target: 'role', role: 'reviewer', value: expect.objectContaining({ documents: { plan: 'always' } }) });
    expect(controls.sent[0]).toMatchObject({ edits: expect.arrayContaining([reviewerEdit]) });
  });

  test('the section\'s title carries artboard 10\'s New pill', () => {
    renderDialog('A2-spec-then-plan');
    const title = within(documentsRegion()).getByText('Pipeline documents');
    expect(title.parentElement?.textContent).toContain('New');
  });

  test('one ticket gives the reviewer no pipeline documents to read', () => {
    renderDialog('A2');
    expect(within(dialog()).queryByRole('region', { name: 'Pipeline documents' })).toBeNull();
  });
});
