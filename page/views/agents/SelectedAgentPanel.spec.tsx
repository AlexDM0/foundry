/**
 * The selected agent's panel, on its own contract. What matters: a running agent shows its head, its subject, only the facts it is given,
 * its last line kept line for line, and one link to its forge; a last line the forge does not report is said in words; an agent that has
 * ended and no selection each say so in a sentence; and in every state the panel says messages and stops are sent from the agent's forge,
 * with no control of its own to send either.
 */
import { describe, expect, test } from 'bun:test';

import { ReactElementTree }          from '../../testing/ReactElementTree.ts';
import type { SelectedAgentContent } from './AgentsModel.ts';
import { SelectedAgentPanel }        from './SelectedAgentPanel.tsx';

const tree = ReactElementTree;

const FORGE_SENDS_NOTE = 'Gaia shows what the forge reports. Messages and stops are sent from the agent\'s own forge.';

const RUNNING: Extract<SelectedAgentContent, { kind: 'running' }> = {
  kind:          'running',
  jobId:         'J12',
  role:          'builder',
  flags:         [{ text: 'quiet · 4 sweeps', tone: 'warn' }],
  project:       'Example Agency Site',
  ticketIdsText: '#034',
  ticketTitle:   'Credit note numbering',
  facts:         [{ label: 'Turn', value: '7' }, { label: 'Calls', value: '58 of 120' }],
  lastLine:      'Running the specs again.\n$ bun test',
  openHref:      '#forge/example-agency-site-1a2b/#agents/J12',
  openLabel:     'Open J12 in its forge',
};

function unfoldedPanel(content: SelectedAgentContent) {
  return tree.unfolded(<SelectedAgentPanel content={content} />);
}

function textWithClass(content: SelectedAgentContent, className: string): string {
  return tree.textOf([tree.onlyWithClass(unfoldedPanel(content), className)]);
}

describe('a running agent', () => {
  test('the head holds the job, its role and its flags, and the subject its forge and ticket', () => {
    expect(textWithClass(RUNNING, 'gaia-agents-panel-head')).toBe('J12builderquiet · 4 sweeps');
    expect(textWithClass(RUNNING, 'gaia-agents-panel-subject')).toBe('Example Agency Site · #034 Credit note numbering');
  });

  test('the facts are exactly the ones given, and the last line keeps its line breaks', () => {
    const panel = unfoldedPanel(RUNNING);
    expect(tree.textOf([tree.onlyWithTag(panel, 'dl')])).toBe('Turn7Calls58 of 120');
    const lastLine = tree.onlyWithClass(panel, 'gaia-agents-panel-last-line');
    expect([lastLine.props['data-reported'], tree.textOf([lastLine])]).toEqual(['yes', 'Running the specs again.\n$ bun test']);
  });

  test('its one control is a link to the agent in its forge', () => {
    const panel = unfoldedPanel(RUNNING);
    expect(tree.hostElementsIn(panel, tree.withTag('button'))).toEqual([]);
    const link = tree.onlyWithTag(panel, 'a');
    expect([tree.textOf([link]), link.props['href']]).toEqual(['Open J12 in its forge', '#forge/example-agency-site-1a2b/#agents/J12']);
  });

  test('an agent with no role, flag, ticket or last line shows its job and forge alone, and says its last line is not reported', () => {
    const bare = {
      ...RUNNING, role: null, flags: [], ticketIdsText: null, ticketTitle: null, facts: [], lastLine: null,
    };
    expect(textWithClass(bare, 'gaia-agents-panel-head')).toBe('J12');
    expect(textWithClass(bare, 'gaia-agents-panel-subject')).toBe('Example Agency Site');
    const lastLine = tree.onlyWithClass(unfoldedPanel(bare), 'gaia-agents-panel-last-line');
    expect([lastLine.props['data-reported'], tree.textOf([lastLine])]).toEqual(['no', 'The forge reports no last line for this agent.']);
  });
});

describe('no running agent', () => {
  test('an agent whose job has ended says it is no longer running, under its job and forge', () => {
    const ended: SelectedAgentContent = { kind: 'no-longer-running', jobId: 'J12', project: 'Example Agency Site' };
    expect(textWithClass(ended, 'gaia-agents-panel-head')).toBe('J12');
    expect(textWithClass(ended, 'gaia-agents-panel-sentence')).toBe('This agent is no longer running.');
    expect(tree.hostElementsIn(unfoldedPanel(ended), tree.withTag('a'))).toEqual([]);
  });

  test('with nothing selected the panel asks for an agent', () => {
    expect(textWithClass({ kind: 'none-selected' }, 'gaia-agents-panel-sentence')).toBe('Select an agent to see what its forge reports of it.');
  });
});

test('in every state the panel is named and says messages and stops are sent from the agent\'s own forge', () => {
  const states: SelectedAgentContent[] = [RUNNING, { kind: 'no-longer-running', jobId: 'J12', project: 'Example Agency Site' }, { kind: 'none-selected' }];
  expect(states.map((content) => tree.onlyWithTag(unfoldedPanel(content), 'section').props['aria-label'])).toEqual(['Selected agent', 'Selected agent', 'Selected agent']);
  expect(states.map((content) => textWithClass(content, 'gaia-agents-panel-note'))).toEqual([FORGE_SENDS_NOTE, FORGE_SENDS_NOTE, FORGE_SENDS_NOTE]);
});
