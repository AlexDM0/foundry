/**
 * Flint's brain in what the Agents view shows (SCREENS A2, R4.5). What matters: the brain's row stands last in its forge's group and
 * outside the group's "4 / 5", the machine's "10 / 12" and every count but All and its own segment; selecting it gives the brain's panel,
 * which survives a new document and says when the forge has dropped the brain; Stop names that forge only; Wake shows on a live forge whose
 * brain is off or ended, and nowhere the brain's commands are not served (a control contract below 2, a brain not reported, a held forge);
 * the head shows the starting note and the forge's refusal in Wake's place; and a brain command's refusal from Gaia's answer stays under its
 * forge until dismissed, unless the forge's own refused state already says it.
 */
import { describe, expect, test } from 'bun:test';

import { FLINT_BRAIN_CONTRACT_VERSIONS }                                            from '../../../src/shared/constants/ContractVersions.ts';
import type { CommandAnswerDocument }                                               from '../../@types/CommandDocument.ts';
import type { FleetDocument, FleetDocumentBrain, FleetDocumentForge }               from '../../@types/FleetDocument.ts';
import type { CommandState, CommandStates }                                         from '../../api/CommandSender.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { AgentsModel, type AgentsModelInput }                                       from './AgentsModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const NO_COMMAND_STATES: CommandStates = { forges: new Map(), fleet: new Map() };

const STOREFRONT_BRAIN = { trackerId: TRACKER_IDS.exampleStorefront, jobId: 'flint-brain' };

const USAGE_LIMIT_REFUSAL: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'usage-limit-holds',
  text:          'launches are held until 16:00 (usage limit)',
};

function contentOf(fleetDocument: FleetDocument, overrides: Partial<Omit<AgentsModelInput, 'fleetDocument'>> = {}) {
  return AgentsModel.agentsContentOf({
    fleetDocument,
    selectedAgent:      null,
    query:              '',
    readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
    timeZone:           'UTC',
    commandStates:      NO_COMMAND_STATES,
    ...overrides,
  });
}

/** Every forge at the control contract that carries the brain's commands; the fixture's forges serve control 1. */
function servingTheBrain(fleetDocument: FleetDocument): FleetDocument {
  return {
    ...fleetDocument,
    forges: fleetDocument.forges.map((forge) => ({ ...forge, contracts: { ...forge.contracts, control: FLINT_BRAIN_CONTRACT_VERSIONS.forgeControl } })),
  };
}

function withForge(fleetDocument: FleetDocument, trackerId: string, change: (forge: FleetDocumentForge) => FleetDocumentForge): FleetDocument {
  return { ...fleetDocument, forges: fleetDocument.forges.map((forge) => (forge.trackerId === trackerId ? change(forge) : forge)) };
}

function withBrain(fleetDocument: FleetDocument, trackerId: string, brain: Partial<FleetDocumentBrain> | 'not-reported'): FleetDocument {
  return withForge(fleetDocument, trackerId, (forge) => {
    if (brain === 'not-reported') return { ...forge, brain };
    const reported = forge.brain === 'not-reported' ? null : forge.brain;
    if (reported === null) throw new Error(`${forge.project} reports no brain to change.`);
    return { ...forge, brain: { ...reported, ...brain } };
  });
}

function withoutTheBrainRow(fleetDocument: FleetDocument): FleetDocument {
  return { ...fleetDocument, agents: fleetDocument.agents.filter((row) => row.countsAgainstLimit) };
}

function groupOf(fleetDocument: FleetDocument, trackerId: string, overrides: Partial<Omit<AgentsModelInput, 'fleetDocument'>> = {}) {
  const group = contentOf(fleetDocument, overrides).groups.find((candidate) => candidate.trackerId === trackerId);
  if (group === undefined) throw new Error(`No group for ${trackerId}.`);
  return group;
}

function forgeStatesOf(trackerId: string, state: CommandState): CommandStates {
  return { forges: new Map([[trackerId, state]]), fleet: new Map() };
}

describe('the brain\'s row', () => {
  test('stands last in Example Storefront\'s group, outside its 4 / 5, with what the forge reports of it', () => {
    const storefront = groupOf(FLEET_FIVE_FORGES, TRACKER_IDS.exampleStorefront);
    expect([storefront.agentsFigure, storefront.slots?.filled, storefront.rows.map((row) => row.jobId)]).toEqual(['4 / 5', 4, ['J2', 'J3', 'J4', 'J6']]);
    expect(storefront.brainRow).toEqual({
      key:            `${TRACKER_IDS.exampleStorefront}/flint-brain`,
      project:        'Example Storefront',
      selectHref:     `#agents/${TRACKER_IDS.exampleStorefront}/flint-brain`,
      isSelected:     false,
      runTimeText:    '0:36',
      newestMoveText: 'visit Agents · wave',
      timeLeftText:   '1:24',
      model:          'haiku',
      effort:         'low',
      calls:          9,
      tokensText:     '3.1k',
      stop:           null,
    });
  });

  test('is in no figure: the machine\'s 10 / 12 and the tokens in flight count only the jobs', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    expect([content.agentCount, content.brainCount, content.machineAgentsFigure]).toEqual([10, 1, '10 / 12']);
    expect(content.rows.map((row) => row.jobId)).not.toContain('flint-brain');
  });

  test('its Stop sends forge-brain-stop to its own forge only, once the forge serves the brain\'s commands', () => {
    const { brainRow } = groupOf(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.exampleStorefront);
    expect(brainRow?.stop).toEqual({ command: { kind: 'forge-brain-stop', trackerId: TRACKER_IDS.exampleStorefront }, disabled: false });
  });

  test('an unreachable forge\'s last-reported brain shows on its row and in its panel with no Stop, since no Overseer answers it', () => {
    const unreachable = withForge(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.exampleStorefront, (forge) => ({ ...forge, fidelity: 'unreachable' }));
    const content = contentOf(unreachable, { selectedAgent: STOREFRONT_BRAIN });
    const storefront = content.groups.find((group) => group.trackerId === TRACKER_IDS.exampleStorefront);
    expect([storefront?.brainRow?.project, storefront?.brainRow?.stop]).toEqual(['Example Storefront', null]);
    expect(content.selected.kind === 'brain-running' ? content.selected.stop : 'not the brain').toBeNull();
  });

  test('its Stop is disabled while a command to its forge is on its way', () => {
    const commandStates = forgeStatesOf(TRACKER_IDS.exampleStorefront, { onItsWay: 'forge-brain-stop', failure: null, restartPending: false });
    expect(groupOf(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.exampleStorefront, { commandStates }).brainRow?.stop?.disabled).toBe(true);
  });

  test('its time left stops at 0:00 and decides nothing: the row stays until the forge drops it', () => {
    const late = Date.parse('2026-11-12T13:25:00.000Z');
    expect(groupOf(FLEET_FIVE_FORGES, TRACKER_IDS.exampleStorefront, { readAtMilliseconds: late }).brainRow?.timeLeftText).toBe('0:00');
  });

  test('the brain filter leaves the brain\'s row alone, and Builders and Needs a look leave it out', () => {
    expect(contentOf(FLEET_FIVE_FORGES, { query: 'role=brain' }).groups.map((group) => [group.project, group.agentsFigure, group.rows.length, group.brainRow?.project])).toEqual([
      ['Example Storefront', '4 / 5', 0, 'Example Storefront'],
    ]);
    expect(contentOf(FLEET_FIVE_FORGES, { query: 'role=builders' }).groups.map((group) => group.brainRow)).toEqual([null, null, null, null]);
    expect(contentOf(FLEET_FIVE_FORGES, { query: 'condition=needs-a-look' }).groups.map((group) => group.brainRow)).toEqual([null, null]);
  });

  test('a brain running in a forge with no job still gets its group, with 0 / 5', () => {
    const brainAlone = { ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.filter((row) => row.trackerId !== TRACKER_IDS.exampleStorefront || !row.countsAgainstLimit) };
    const storefront = groupOf(brainAlone, TRACKER_IDS.exampleStorefront);
    expect([storefront.agentsFigure, storefront.rows, storefront.brainRow?.project]).toEqual(['0 / 5', [], 'Example Storefront']);
  });

  test('without a brain running, the brain segment and the brain figure are absent', () => {
    const content = contentOf(withoutTheBrainRow(FLEET_FIVE_FORGES));
    expect(content.roleOptions.map((option) => option.label)).toEqual(['All', 'Builders', 'Reviewers']);
    expect(content.brainCount).toBe(0);
  });
});

describe('the brain\'s part of its forge\'s head', () => {
  test('under control 2 a running brain is the "+ brain" pill, a live forge whose brain is off offers Wake, and a held forge offers none', () => {
    const { groups } = contentOf(servingTheBrain(FLEET_FIVE_FORGES));
    expect(groups.map((group) => [group.project, group.brain])).toEqual([
      ['Example Storefront', { kind: 'running' }],
      ['Invoice Service', { kind: 'off', wake: { command: { kind: 'forge-brain-start', trackerId: TRACKER_IDS.invoiceService }, disabled: false } }],
      ['Research Wiki', { kind: 'off', wake: { command: { kind: 'forge-brain-start', trackerId: TRACKER_IDS.researchWiki }, disabled: false } }],
      ['Example Mobile App', { kind: 'none' }],
    ]);
  });

  test('under control 1 the running brain still shows, and no forge offers Wake', () => {
    expect(contentOf(FLEET_FIVE_FORGES).groups.map((group) => group.brain.kind)).toEqual(['running', 'none', 'none', 'none']);
  });

  test('a forge whose brain is not reported offers no Wake, even under control 2', () => {
    const notReported = withBrain(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, 'not-reported');
    expect(groupOf(notReported, TRACKER_IDS.invoiceService).brain).toEqual({ kind: 'none' });
  });

  test('an ended brain offers Wake again, and a paused forge offers none', () => {
    const ended = withBrain(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, { state: 'ended', sentence: 'Flint\'s brain stopped after 2:00' });
    expect(groupOf(ended, TRACKER_IDS.invoiceService).brain.kind).toBe('off');
    const paused = withForge(ended, TRACKER_IDS.invoiceService, (forge) => ({ ...forge, condition: 'paused' }));
    expect(groupOf(paused, TRACKER_IDS.invoiceService).brain).toEqual({ kind: 'none' });
  });

  test('while the forge reports starting, Wake\'s place shows the starting note', () => {
    const starting = withBrain(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, { state: 'starting' });
    expect(groupOf(starting, TRACKER_IDS.invoiceService).brain).toEqual({ kind: 'starting' });
  });

  test('a refused start shows the forge\'s sentence and code beside Wake, and its code alone where the forge\'s sentence names a command', () => {
    const refused = withBrain(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, {
      state:   'refused',
      refusal: { code: 'usage-limit-holds', sentence: 'launches are held until 16:00 (usage limit)' },
    });
    expect(groupOf(refused, TRACKER_IDS.invoiceService).brain).toEqual({
      refusedBy: 'forge',
      kind:      'refused',
      sentence:  'launches are held until 16:00 (usage limit)',
      code:      'usage-limit-holds',
      wake:      { command: { kind: 'forge-brain-start', trackerId: TRACKER_IDS.invoiceService }, disabled: false },
    });
    const withoutSentence = withBrain(refused, TRACKER_IDS.invoiceService, { refusal: { code: 'no-flint', sentence: null } });
    expect(groupOf(withoutSentence, TRACKER_IDS.invoiceService).brain).toMatchObject({ sentence: 'it did not wake Flint\'s brain', code: 'no-flint' });
  });

  test('Wake is disabled while a command to its forge is on its way', () => {
    const commandStates = forgeStatesOf(TRACKER_IDS.invoiceService, { onItsWay: 'forge-brain-start', failure: null, restartPending: false });
    expect(groupOf(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, { commandStates }).brain).toMatchObject({ wake: { disabled: true } });
  });
});

describe('a refused brain command', () => {
  const refusedWake: CommandState = {
    onItsWay:       null,
    failure:        { kind: 'forge-brain-start', result: { verdict: 'answered', answer: USAGE_LIMIT_REFUSAL } },
    restartPending: false,
  };

  test('shows under its forge\'s head with the command\'s name, the forge\'s code and its sentence', () => {
    const commandStates = forgeStatesOf(TRACKER_IDS.invoiceService, refusedWake);
    expect(groupOf(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, { commandStates }).brainRefusal).toEqual({
      refusedBy:    'forge',
      commandLabel: 'Wake Flint\'s brain',
      code:         'usage-limit-holds',
      sentence:     'launches are held until 16:00 (usage limit)',
    });
  });

  test('gives way to the forge\'s own refused state, and another command\'s refusal is not the brain\'s', () => {
    const commandStates = forgeStatesOf(TRACKER_IDS.invoiceService, refusedWake);
    const refused = withBrain(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, { state: 'refused', refusal: { code: 'usage-limit-holds', sentence: 'held' } });
    expect(groupOf(refused, TRACKER_IDS.invoiceService, { commandStates }).brainRefusal).toBeNull();
    const pauseRefused = forgeStatesOf(TRACKER_IDS.invoiceService, { ...refusedWake, failure: { kind: 'forge-pause', result: { verdict: 'server-unreachable' } } });
    expect(groupOf(servingTheBrain(FLEET_FIVE_FORGES), TRACKER_IDS.invoiceService, { commandStates: pauseRefused }).brainRefusal).toBeNull();
  });
});

describe('the selected brain', () => {
  test('marks its row and gives the brain\'s panel: time left, model and effort, what the forge reports, its moves and the way to its forge', () => {
    const content = contentOf(servingTheBrain(FLEET_FIVE_FORGES), { selectedAgent: STOREFRONT_BRAIN });
    expect(content.groups[0]?.brainRow?.isSelected).toBe(true);
    expect(content.rows.filter((row) => row.isSelected)).toEqual([]);
    expect(content.selected).toEqual({
      kind:         'brain-running',
      project:      'Example Storefront',
      timeLeftText: '1:24',
      model:        'haiku',
      effort:       'low',
      effortLevel:  1,
      spanText:     '2:00',
      facts:        [
        { label: 'Started', machineValue: '13:18', words: 'from Gaia' },
        { label: 'Ends', machineValue: '13:20', words: 'at the latest' },
        { label: 'Model, effort', machineValue: 'haiku', words: '· low' },
        { label: 'Tokens so far', machineValue: '3.1k', words: null },
        { label: 'Calls so far', machineValue: '9', words: null },
      ],
      machineLimitFigure: '10 / 12',
      moves:              [
        { key: '0', atText: '13:19:28', text: 'visit Agents · wave' },
        { key: '1', atText: '13:19:19', text: 'walk to Kanban · look at #013' },
        { key: '2', atText: '13:19:06', text: 'read the board · 4 jobs, 1 question' },
        { key: '3', atText: '13:18:58', text: 'wake · stretch' },
      ],
      stop:     { command: { kind: 'forge-brain-stop', trackerId: TRACKER_IDS.exampleStorefront }, disabled: false },
      openHref: `#forge/${TRACKER_IDS.exampleStorefront}/#agents`,
    });
  });

  test('a brain woken from the Bridge says so by place, and under control 1 the panel has no Stop', () => {
    const fromTheBridge = withBrain(FLEET_FIVE_FORGES, TRACKER_IDS.exampleStorefront, { startedBy: 'bridge' });
    const { selected } = contentOf(fromTheBridge, { selectedAgent: STOREFRONT_BRAIN });
    expect(selected.kind === 'brain-running' ? [selected.facts[0], selected.stop] : null).toEqual([{ label: 'Started', machineValue: '13:18', words: 'from the Bridge' }, null]);
  });

  test('survives a new document, which brings the brain\'s new figures', () => {
    const nextDocument = {
      ...FLEET_FIVE_FORGES,
      agents: FLEET_FIVE_FORGES.agents.map((row) => (row.countsAgainstLimit ? row : { ...row, tokens: 4_200, calls: 12 })),
    };
    const content = contentOf(nextDocument, { selectedAgent: STOREFRONT_BRAIN });
    expect(content.groups[0]?.brainRow?.isSelected).toBe(true);
    expect(content.selected.kind === 'brain-running' ? content.selected.facts.slice(3) : null).toEqual([
      { label: 'Tokens so far', machineValue: '4.2k', words: null },
      { label: 'Calls so far', machineValue: '12', words: null },
    ]);
  });

  test('once the forge drops the brain, the panel says it is no longer running and keeps the way to its forge', () => {
    const ended = withBrain(withoutTheBrainRow(FLEET_FIVE_FORGES), TRACKER_IDS.exampleStorefront, { state: 'ended' });
    expect(contentOf(ended, { selectedAgent: STOREFRONT_BRAIN }).selected).toEqual({
      kind:     'brain-no-longer-running',
      project:  'Example Storefront',
      openHref: `#forge/${TRACKER_IDS.exampleStorefront}/#agents`,
    });
  });

  test('with no machine limit known, the panel names no limit figure', () => {
    const noLimit = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    const { selected } = contentOf(noLimit, { selectedAgent: STOREFRONT_BRAIN });
    expect(selected.kind === 'brain-running' ? selected.machineLimitFigure : 'not the brain').toBeNull();
  });
});
