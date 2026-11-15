/**
 * The resume summary against fake controls. What matters: the bare `#pipeline` of an open setup shows it in place of the landing; each
 * step row shows its status and summary, a done row Open; Start over asks first and sends only on the confirm; the main-moved note shows
 * only while main moved; the footer counts the done steps; Resume sends the record's id and then opens the current step.
 */
import {
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

import { clickSettled, fakeControls }                                             from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf, type PipelineFixtureName } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                                           from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

function renderResume(name: PipelineFixtureName) {
  const controls = fakeControls();
  controls.render(<PipelineView facts={pipelineBoardStateOf(name)} route={{ tab: 'pipeline', item: null }} {...pipelineViewServicesOf()} />);
  return controls;
}

function stepRows(): HTMLElement[] {
  return within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem');
}

describe('the resume summary', () => {
  test('shows in place of the landing on the bare route of an open setup', () => {
    renderResume('A0b-running');
    expect(screen.getByRole('region', { name: 'Resume setup' }).getAttribute('data-screen')).toBe('setup-resume');
    expect(screen.queryByRole('button', { name: 'Set up the pipeline' })).toBeNull();
  });

  test('each step row shows its status and summary, and a done row Open', () => {
    renderResume('A0b-running');
    const rows = stepRows();
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(rows[1]?.textContent).toContain('1 stack item, 2 scripts, 1 question answered');
    expect(rows[3]?.textContent).toContain('Pipeline agent J4 running');
    expect(rows[4]?.textContent).toContain('not yet');
    expect(within(rows[2] as HTMLElement).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#pipeline/setup/constitution');
    expect(within(rows[3] as HTMLElement).queryByRole('link', { name: 'Open' })).toBeNull();
  });

  test('a step that needs a recheck says so', () => {
    renderResume('A0b-recheck');
    expect(stepRows()[2]?.querySelector('.bridge-pipeline-resume-recheck')?.textContent).toBe('recheck');
  });

  test('Start over asks first and sends the command only on the confirm', async () => {
    const controls = renderResume('A0b-running');
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    const strip = screen.getByRole('group', { name: 'Confirm starting over' });
    expect(strip.textContent).toContain('Discard the saved setup?');
    expect(strip.textContent).toContain('This cannot be undone.');
    expect(controls.sent).toEqual([]);
    fireEvent.click(within(strip).getByRole('button', { name: 'Keep the setup' }));
    expect(screen.queryByRole('group', { name: 'Confirm starting over' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    await clickSettled(within(screen.getByRole('group', { name: 'Confirm starting over' })).getByRole('button', { name: 'Start over' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-setup-start-over', setupId: 'S1' }]);
  });

  test('the footer counts the steps done', () => {
    renderResume('A0b-running');
    expect(within(screen.getByRole('region', { name: 'Resume setup actions' })).getByText('3 of 5 steps done')).toBeDefined();
  });

  test('the main-moved note shows only while main moved', () => {
    renderResume('A0b-running');
    expect(screen.queryByText(/Main moved/u)).toBeNull();
    cleanup();
    renderResume('A0b-main-moved');
    expect(screen.getByText('Main moved 3 commits since the research. The pipeline agent rechecks the scripts when it resumes.')).toBeDefined();
  });

  test('Resume sends the record\'s id, then opens the current step', async () => {
    const controls = renderResume('A0b-stopped');
    await clickSettled(screen.getByRole('button', { name: 'Resume pipeline design' }));
    expect(controls.sent).toEqual([{ kind: 'pipeline-setup-resume', setupId: 'S1' }]);
    expect(window.location.hash).toBe('#pipeline/setup/design');
  });

  test('a pending Apply names the constitution commit on its row', () => {
    renderResume('A0b-apply-pending');
    expect(stepRows()[4]?.textContent).toContain('Committing CONSTITUTION.md to main');
  });
});
