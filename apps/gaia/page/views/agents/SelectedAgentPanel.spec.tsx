/**
 * The selected agent's panel, on its own contract. What matters: a running agent shows its head, its subject, its ticket, calls and last
 * tool, only the facts it is given, its last line kept line for line, and links only to the agent in its forge; a last line the forge does
 * not report is said in words; an agent that has ended and no selection each say so in a sentence; and in every state the panel says
 * messages and stops are sent from the agent's forge, with no control of its own to send either.
 */
import { describe, expect, test } from 'bun:test';
import { FactList }               from 'design-system/FactList';
import type { ReactNode }         from 'react';

import { PackageButtons }            from '../../testing/PackageButtons.ts';
import { ReactElementTree }          from '../../testing/ReactElementTree.ts';
import type { SelectedAgentContent } from './AgentsModel.ts';
import { SelectedAgentPanel }        from './SelectedAgentPanel.tsx';

const tree = ReactElementTree;

const FORGE_SENDS_NOTE = 'Gaia shows what the forge reports. Messages and stops are sent from the agent\'s own forge.';

const RUNNING: Extract<SelectedAgentContent, { kind: 'running' }> = {
  kind:          'running',
  jobId:         'J12',
  role:          'builder',
  dotRole:       'builder',
  stateText:     'Building',
  runningText:   '34m 02s',
  flags:         [{ text: 'quiet · 4 sweeps', tone: 'warn' }],
  project:       'Example Agency Site',
  ticketIdsText: '#034',
  ticketTitle:   'Credit note numbering',
  calls:         {
    text:  '58 / 120',
    meter: {
      used: 58, whole: 120, label: '58 of 120 calls', tone: 'builder'
    }
  },
  tokensText:   '122,300',
  lastToolCall: 'Bash bun test',
  facts:        [{ label: 'Turn', value: '7' }, { label: 'Calls', value: '58 of 120' }],
  lastLine:     'Running the specs again.\n$ bun test',
  openHref:     '#forge/example-agency-site-1a2b/agents/J12',
  openLabel:    'Open J12 in its forge',
};

function unfoldedPanel(content: SelectedAgentContent) {
  return tree.unfolded(<SelectedAgentPanel content={content} />);
}

/** The words of the part with this class, each package part in it written as `[Name words]`. */
function textWithClass(content: SelectedAgentContent, className: string): string {
  return tree.readingOf([tree.onlyWithClass(unfoldedPanel(content), className)]);
}

describe('a running agent', () => {
  test('the head holds the job, its state and running time, the subject its role, forge and flags, then its ticket, calls and last tool', () => {
    expect(textWithClass(RUNNING, 'gaia-agents-panel-head')).toBe('Job[MonoId J12]Building · 34m 02s');
    expect(textWithClass(RUNNING, 'gaia-agents-panel-subject')).toBe('builderExample Agency Site[Tag quiet · 4 sweeps]');
    expect(textWithClass(RUNNING, 'gaia-agents-panel-ticket')).toBe('[MonoId #034]Credit note numbering');
    expect(textWithClass(RUNNING, 'gaia-agents-panel-calls')).toBe('[FillMeter 58 of 120 calls]58 / 120calls · 122,300 tokens');
    expect(textWithClass(RUNNING, 'gaia-agents-panel-last-tool')).toBe('Last tool Bash bun test');
  });

  test('the facts are exactly the ones given, and the last line keeps its line breaks', () => {
    const panel = unfoldedPanel(RUNNING);
    const facts = tree.onlyOfComponent(panel, FactList).props['facts'] as readonly { readonly label: string; readonly value: ReactNode }[];
    expect(facts.map((fact) => [fact.label, tree.readingOf(tree.unfolded(fact.value))])).toEqual([['Turn', '7'], ['Calls', '58 of 120']]);
    const lastLine = tree.onlyWithClass(panel, 'gaia-agents-panel-last-line');
    expect([lastLine.props['data-reported'], tree.textOf([lastLine])]).toEqual(['yes', 'Running the specs again.\n$ bun test']);
  });

  test('its controls are links to the agent in its forge: its ticket and the open button', () => {
    const panel = unfoldedPanel(RUNNING);
    expect(tree.hostElementsIn(panel, (element) => element.tag === 'button' || (PackageButtons.isButton(element) && element.props['href'] === undefined))).toEqual([]);
    const links = tree.hostElementsIn(panel, (element) => element.tag === 'a' || PackageButtons.isButton(element));
    expect(links.map((link) => [tree.readingOf([link]), link.props['href']])).toEqual([
      ['[MonoId #034]Credit note numbering', '#forge/example-agency-site-1a2b/agents/J12'],
      ['[Button Open J12 in its forge]', '#forge/example-agency-site-1a2b/agents/J12'],
    ]);
  });

  test('an agent with no role, running time, flag, ticket, calls, tool or last line shows its job and forge alone, and says its last line is not reported', () => {
    const bare = {
      ...RUNNING, role: null, dotRole: null, runningText: null, flags: [], ticketIdsText: null, ticketTitle: null, calls: null, lastToolCall: null, facts: [], lastLine: null,
    };
    expect(textWithClass(bare, 'gaia-agents-panel-head')).toBe('Job[MonoId J12]Building');
    expect(textWithClass(bare, 'gaia-agents-panel-subject')).toBe('Example Agency Site');
    const panel = unfoldedPanel(bare);
    expect(tree.hostElementsIn(panel, (element) => tree.hasClass(element, 'gaia-agents-panel-ticket') || tree.hasClass(element, 'gaia-agents-panel-last-tool'))).toEqual([]);
    expect(textWithClass(bare, 'gaia-agents-panel-calls')).toBe('122,300 tokens');
    const lastLine = tree.onlyWithClass(unfoldedPanel(bare), 'gaia-agents-panel-last-line');
    expect([lastLine.props['data-reported'], tree.textOf([lastLine])]).toEqual(['no', 'The forge reports no last line for this agent.']);
  });
});

describe('no running agent', () => {
  test('an agent whose job has ended says it is no longer running, under its job and forge', () => {
    const ended: SelectedAgentContent = { kind: 'no-longer-running', jobId: 'J12', project: 'Example Agency Site' };
    expect(textWithClass(ended, 'gaia-agents-panel-head')).toBe('Job[MonoId J12]');
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
