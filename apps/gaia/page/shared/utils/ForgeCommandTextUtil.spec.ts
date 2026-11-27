/**
 * How the page words a command to one forge: a refusal names the refused command by its own button, and the Stop question names the forge
 * and its running agents, offers its two choices with their consequences, and says what keeps waiting on User only when something does.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocumentForge }    from '../../@types/FleetDocument.ts';
import { FLEET_DEGRADED }             from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_FIVE_FORGES_READINGS } from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgeCommandTextUtil }       from './ForgeCommandTextUtil.ts';

const STOREFRONT = FLEET_FIVE_FORGES_READINGS.exampleStorefront;

function withAgentsInFlight(forge: FleetDocumentForge, agentsInFlight: number): FleetDocumentForge {
  if (forge.concurrency === null) throw new Error(`${forge.project} reports no concurrency.`);
  return { ...forge, concurrency: { ...forge.concurrency, agentsInFlight } };
}

describe('the name of a refused command', () => {
  test('is its own button\'s, and absent for a command that names no forge', () => {
    const kinds = ['forge-stop', 'forge-update', 'forge-unhide', 'forge-concurrency-set'] as const;
    expect(kinds.map((kind) => ForgeCommandTextUtil.commandLabelOf(kind))).toEqual(['Stop', 'Update forge', 'Show again', 'the agent limit']);
    expect(ForgeCommandTextUtil.commandLabelOf('machine-agent-limit-set')).toBeNull();
    expect(ForgeCommandTextUtil.commandLabelOf('fleet-look-again')).toBeNull();
  });
});

describe('the Stop question', () => {
  test('names the forge and its running agents, offers Hephaestus only first, and says what keeps waiting', () => {
    expect(ForgeCommandTextUtil.stopQuestionOf(STOREFRONT)).toEqual({
      label:    'Stop Example Storefront',
      question: 'Stop Hephaestus of Example Storefront? 4 agents are running.',
      choices:  [
        {
          agents:      'keep',
          title:       'Stop Hephaestus only',
          consequence: 'The 4 agents finish what they are on under Talos. Nothing new starts until this forge is started again.',
        },
        {
          agents:      'stop-first',
          title:       'Stop the agents, then Hephaestus',
          consequence: 'The 4 agents wind down first and their tickets return to the board. Then Hephaestus stops.',
        },
      ],
      consequence: '2 entries keep waiting on you while it is stopped.',
    });
  });

  test('words one agent in the singular', () => {
    const { question, choices } = ForgeCommandTextUtil.stopQuestionOf(withAgentsInFlight(STOREFRONT, 1));
    expect(question).toBe('Stop Hephaestus of Example Storefront? 1 agent is running.');
    expect(choices.map((choice) => choice.consequence)).toEqual([
      'The agent finishes what it is on under Talos. Nothing new starts until this forge is started again.',
      'The agent winds down first and its tickets return to the board. Then Hephaestus stops.',
    ]);
  });

  test('has nothing to choose with no agent running, and no line of what waits when nothing does', () => {
    const idle = { ...withAgentsInFlight(STOREFRONT, 0), attention: [] };
    expect(ForgeCommandTextUtil.stopQuestionOf(idle)).toEqual({
      label: 'Stop Example Storefront', question: 'Stop Hephaestus of Example Storefront?', choices: [], consequence: null
    });
  });

  test('counts what waits on a forge read through its summary by its reported count', () => {
    const countsOnly = FLEET_DEGRADED.forges.find((forge) => forge.fidelity === 'counts-only');
    if (countsOnly === undefined) throw new Error('The degraded fixture holds no forge read through its summary.');
    expect(ForgeCommandTextUtil.stopQuestionOf(countsOnly).consequence).toBe('1 entry keeps waiting on you while it is stopped.');
  });
});
