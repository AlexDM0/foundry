/**
 * The research step against fake controls and a fake transcript. What matters: the findings render by topic with their source paths and
 * the scripts with their command and meaning, a script that needs a network with the amber dot and its note; the stack chips pop in and no
 * finding offers to run anything; Answer sends the chosen letter or the Other text and the card turns into the answered pill; Continue
 * is enabled while the agent still researches; while a turn runs the typing line says what the agent does, politely live; grey lines
 * stand in before the first finding; Stop stops the agent's job.
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

import type { BoardStateDocument }                      from '../../../@types/BoardStateDocument.ts';
import { clickSettled, fakeControls, fakeTranscripts }  from '../../../testing/FakeControls.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf } from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                 from '../PipelineView.tsx';

const RESEARCH_ROUTE = { tab: 'pipeline', item: 'setup/research' } as const;

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

/** The A1 board while the agent still researches: it has not marked the research ready. */
function researchingBoard(): BoardStateDocument {
  const board = pipelineBoardStateOf('A1');
  const setup = board.pipelineSetup;
  if (setup === null || setup === undefined) throw new Error('the fixture A1 has no setup');
  return { ...board, pipelineSetup: { ...setup, record: { ...setup.record, readyToContinue: [] } } };
}

function renderResearch(board: BoardStateDocument = researchingBoard()) {
  const controls = fakeControls();
  const transcripts = fakeTranscripts();
  controls.render(<PipelineView facts={board} route={RESEARCH_ROUTE} {...pipelineViewServicesOf(transcripts.follow)} />);
  return { controls, transcripts };
}

describe('the findings', () => {
  test('render by topic with their source paths, and the scripts with command and meaning', () => {
    renderResearch();
    expect(screen.getByRole('heading', { name: 'Getting to know Example Agency' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Stack' }).textContent).toContain('tsconfig.json');
    expect(screen.getByRole('region', { name: 'Conventions' }).textContent).toContain('CONTRIBUTING.md');
    const scripts = screen.getByRole('region', { name: 'Scripts' });
    expect(scripts.textContent).toContain('found in package.json; none is run here');
    const rows = within(scripts).getAllByRole('listitem');
    expect(rows[0]?.textContent).toBe('typecheckbun run typecheckChecks the example types.');
  });

  test('a script that needs a network shows the amber dot and its note', () => {
    renderResearch();
    const needs = document.querySelector('.bridge-pipeline-script-needs');
    expect(needs?.textContent).toBe('Needs network');
    expect(needs?.querySelector('.bridge-pipeline-script-needs-dot')).not.toBeNull();
  });

  test('the stack chips pop in, and no finding offers to run anything', () => {
    renderResearch();
    const chip = within(screen.getByRole('region', { name: 'Stack' })).getByText('Language · TypeScript');
    expect(chip.hasAttribute('data-pops')).toBe(true);
    expect(screen.queryByRole('button', { name: /run/iu })).toBeNull();
  });

  test('a finding to recheck carries the recheck tag', () => {
    const board = researchingBoard();
    const setup = board.pipelineSetup;
    if (setup === null || setup === undefined) throw new Error('no setup');
    const findings = setup.record.findings.map((finding) => (finding.findingId === 'F1' ? { ...finding, needsRecheck: true } : finding));
    renderResearch({ ...board, pipelineSetup: { ...setup, record: { ...setup.record, findings } } });
    expect(within(screen.getByRole('region', { name: 'Stack' })).getByText('recheck').getAttribute('data-change')).toBe('changed');
  });

  test('grey lines stand in before the first finding', () => {
    const board = researchingBoard();
    const setup = board.pipelineSetup;
    if (setup === null || setup === undefined) throw new Error('no setup');
    renderResearch({ ...board, pipelineSetup: { ...setup, record: { ...setup.record, findings: [] } } });
    expect(screen.getByRole('status', { name: 'Waiting for the first findings' })).toBeDefined();
    expect(screen.queryByRole('region', { name: 'Scripts' })).toBeNull();
  });
});

describe('the status', () => {
  test('the line over the page names the agent, the snapshot and the time since its launch', () => {
    renderResearch();
    expect(document.querySelector('.bridge-pipeline-research-status')?.textContent)
      .toBe('Pipeline agent J4 · researching · snapshot of main at 1111111 · 2m 40s');
    expect(screen.getByText('Researching · 2 scripts found · 1 open question').getAttribute('aria-live')).toBe('polite');
  });
});

describe('the question card', () => {
  test('Answer sends the chosen letter, and the card turns into the answered pill', async () => {
    const { controls } = renderResearch();
    const card = screen.getByRole('group', { name: /Question · browser-tests/u });
    fireEvent.click(within(card).getByRole('radio', { name: 'No, leave them out' }));
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['b'] }
    }]);
    expect(card.getAttribute('data-state')).toBe('answered');
    expect(within(card).getByRole('status').textContent).toBe('Answered: No, leave them out');
  });

  test('the Other answer sends its text', async () => {
    const { controls } = renderResearch();
    const card = screen.getByRole('group', { name: /Question · browser-tests/u });
    fireEvent.click(within(card).getByRole('radio', { name: 'Other' }));
    fireEvent.change(within(card).getByRole('textbox', { name: 'Other answer' }), { target: { value: 'Run them each night' } });
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(controls.sent).toEqual([{
      kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'text', text: 'Run them each night' }
    }]);
  });

  test('a refusal shows verbatim and the card stays open', async () => {
    const { controls } = renderResearch();
    controls.answerNextWith({ verdict: 'refused', refusal: 'Example refusal: no setup is open.' });
    const card = screen.getByRole('group', { name: /Question · browser-tests/u });
    await clickSettled(within(card).getByRole('button', { name: 'Answer' }));
    expect(screen.getByText('Example refusal: no setup is open.')).toBeDefined();
    expect(card.getAttribute('data-state')).toBe('asking');
  });
});

describe('the agent panel', () => {
  test('while a turn runs the typing line says what the agent does, politely live; between turns it is gone', () => {
    const { transcripts } = renderResearch();
    expect(transcripts.followedJobs()).toEqual(['J4']);
    expect(document.querySelector('.bridge-typing')).toBeNull();
    transcripts.feed('J4', [{
      cursor: '1.1', entryKey: '1.1.0', at: null, role: 'assistant', text: 'Sorting the scripts into build and merge…'
    }]);
    const typing = document.querySelector('.bridge-typing');
    expect(typing?.getAttribute('aria-live')).toBe('polite');
    expect(typing?.textContent).toBe('Sorting the scripts into build and merge…');
    transcripts.feed('J4', [{
      cursor: '1.2', entryKey: '1.2.0', at: null, role: 'turn-end', text: ''
    }]);
    expect(document.querySelector('.bridge-typing')).toBeNull();
    expect(screen.getByRole('list', { name: 'Conversation of J4' }).textContent).toContain('Sorting the scripts into build and merge…');
  });

  test('the composer messages the agent\'s job', async () => {
    const { controls } = renderResearch();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message the pipeline agent' }), { target: { value: 'The tests also need Redis.' } });
    await clickSettled(screen.getByRole('button', { name: 'Send' }));
    expect(controls.sent).toEqual([{ kind: 'job-message', jobId: 'J4', text: 'The tests also need Redis.' }]);
  });
});

describe('the actions', () => {
  test('Continue is enabled while the agent still researches, and opens the constitution once applied', async () => {
    const { controls } = renderResearch();
    const continueButton = screen.getByRole('button', { name: 'Continue to constitution' }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(false);
    expect(continueButton.hasAttribute('data-attention')).toBe(false);
    await clickSettled(continueButton);
    expect(controls.sent).toEqual([{
      kind: 'pipeline-setup-step', setupId: 'S1', step: 'research', move: 'continue'
    }]);
    expect(window.location.hash).toBe('#pipeline/setup/constitution');
  });

  test('Continue draws attention once the agent marked the research ready', () => {
    renderResearch(pipelineBoardStateOf('A1'));
    expect(screen.getByRole('button', { name: 'Continue to constitution' }).hasAttribute('data-attention')).toBe(true);
  });

  test('Stop stops the agent\'s job and returns to the resume summary', async () => {
    const { controls } = renderResearch();
    window.location.hash = '#pipeline/setup/research';
    await clickSettled(screen.getByRole('button', { name: 'Stop the pipeline agent' }));
    expect(controls.sent).toEqual([{ kind: 'job-stop', jobId: 'J4', mode: 'stop' }]);
    expect(window.location.hash).toBe('#pipeline');
  });
});
