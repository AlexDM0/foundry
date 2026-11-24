/**
 * The agent's tools at the design step and a launch forge refused, against fake controls. What matters: the design step's footer counts
 * the tools and the missing ones and opens their list, whose kept list is a draft edit of the record's draft at its revision; the research
 * step of a pipeline agent forge did not launch says "Not launched" with forge's own reason instead of Researching, and offers choosing the
 * program at the agent step and Look again; and the board's notice names each job not launched, or a forge with no agent, with where to
 * choose it.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { AgentNotice }                                      from '../../../shell/AgentNotice.tsx';
import { AgentNoticeModel, type AgentNoticeView }           from '../../../shell/AgentNoticeModel.ts';
import { EXAMPLE_NOT_LAUNCHED }                             from '../../../testing/AgentFixture.ts';
import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../../testing/FakeControls.ts';
import { onBoard }                                          from '../../../testing/OnBoard.ts';
import { pipelineBoardStateOf, pipelineViewServicesOf }     from '../../../testing/PipelineFixture.ts';
import { PipelineView }                                     from '../PipelineView.tsx';

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('the design step\'s tools', () => {
  test('the footer counts them and opens their list, kept as a draft edit at the draft\'s revision', async () => {
    const controls = fakeControls();
    const facts = pipelineBoardStateOf('A2');
    const draftRevision = facts.pipeline.setup?.record.draftRevision ?? -1;
    controls.render(onBoard(<PipelineView facts={facts} route={{ tab: 'pipeline', item: 'setup/design' }} {...pipelineViewServicesOf()} />));
    fireEvent.click(screen.getByRole('button', { name: 'Agent tools: 4 tools · 1 missing' }));
    const dialog = screen.getByRole('dialog', { name: 'The tools Example Agency\'s agents use' });
    expect(within(dialog).getByText('gate integration needs docker, which this machine lacks: install it, or drop what needs it from the design.')).toBeDefined();
    expect((within(dialog).getByRole('button', { name: 'Keep these tools' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByLabelText('Keep bun on the list'));
    await clickSettled(within(dialog).getByRole('button', { name: 'Keep these tools' }));
    expect(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION,
      kind:    'pipeline-draft-edit',
      setupId: 'S1',
      draftRevision,
      edits:   [{ target: 'tools', value: [{ name: 'git', path: '/usr/bin/git' }, { name: 'gh', path: '/opt/homebrew/bin/gh' }] }],
      isACopy: false,
    }]);
  });
});

describe('a pipeline agent forge did not launch', () => {
  test('the research step says Not launched with forge\'s reason, and offers the agent step and Look again', async () => {
    const controls = fakeControls();
    controls.render(onBoard(<PipelineView facts={pipelineBoardStateOf('A1-not-launched')} route={{ tab: 'pipeline', item: 'setup/research' }} {...pipelineViewServicesOf()} />));
    expect(screen.queryByText('Researching')).toBeNull();
    expect(screen.queryByText('Running')).toBeNull();
    expect(screen.getAllByText('Not launched').length).toBeGreaterThan(0);
    const job = screen.getByRole('region', { name: 'J4 not launched' });
    expect(within(job).getByText(EXAMPLE_NOT_LAUNCHED.text)).toBeDefined();
    expect(within(job).getByRole('link', { name: 'Choose the Example Agent program…' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/agent');
    await clickSettled(within(job).getByRole('button', { name: 'Look again' }));
    expect(controls.sent).toEqual([{ ...SENT_COMMAND_VERSION, kind: 'agent-look-again' }]);
  });
});

describe('the board\'s agent notice', () => {
  function noticeOf(view: AgentNoticeView | null): HTMLElement {
    if (view === null) throw new Error('the fixture shows no agent notice');
    render(onBoard(<AgentNotice notice={view} />));
    return screen.getByRole('status');
  }

  test('names each job not launched with forge\'s reason, and leads to the setup\'s agent step', () => {
    const notice = noticeOf(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('A1-not-launched')));
    expect(notice.textContent).toContain(`Job J4 is not launched: ${EXAMPLE_NOT_LAUNCHED.text}.`);
    expect(within(notice).getByRole('link', { name: 'Choose the Example Agent program…' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/setup/agent');
    expect(within(notice).getByRole('button', { name: 'Look again' })).toBeDefined();
  });

  test('says a forge with a pipeline and no agent launches nothing, and leads to its settings', () => {
    const notice = noticeOf(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('A5-no-agent')));
    expect(notice.textContent).toContain('No agent is chosen for this forge, so no job launches.');
    expect(within(notice).getByRole('link', { name: 'Choose this forge\'s agent' }).getAttribute('href')).toBe('#forge/example-tracker/pipeline/settings');
  });

  test('shows nothing while every job launched and the forge has an agent', () => {
    expect(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('A5'))).toBeNull();
    expect(AgentNoticeModel.agentNoticeOf(pipelineBoardStateOf('agent-step-found'))).toBeNull();
  });
});
