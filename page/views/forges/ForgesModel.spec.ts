/**
 * What the Forges view shows of a fleet document. What matters (SCREENS A4 and B2): each condition shows exactly its buttons, Open only
 * where the forge opens in place; a row reads its root from `~`, its condition word with when it started or stopped, its agents against
 * its limit, what waits and its short code; a forge's limit runs from one agent to the forge's ceiling and the machine's from one to the CPU
 * count, and without F6 the machine panel says no limit is enforced and its stepper is off; the machine at its limit says which forges'
 * tickets wait. B2: Stop asks with two choices and keeps the agents by default, with none when no agent runs; while a command to a forge is
 * on its way that row's controls are off and no other's; a refusal stays on its forge until dismissed or the next success, and offers to
 * send the same command again; a start Gaia sent shows as starting until the forge answers. Command states come from the real sender over
 * Gaia's server stood in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument, CommandBody, ForgeCommandBody }      from '../../@types/CommandDocument.ts';
import type { FleetDocument, FleetDocumentCondition, FleetDocumentForge } from '../../@types/FleetDocument.ts';
import { type CommandSender, type CommandStates }                         from '../../api/CommandSender.ts';
import { answerResponse, senderOver }                                     from '../../testing/CommandServer.ts';
import { FLEET_AT_LIMIT }                                                 from '../../testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                                                 from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                                                    from '../../testing/fixtures/fleet-empty.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import {
  type ClockReading,
  type ForgeButton,
  type ForgeRow,
  type ForgesContent,
  ForgesModel,
  type ForgesSurroundings,
  type StopDialogState,
} from './ForgesModel.ts';

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const READINGS = FLEET_FIVE_FORGES_READINGS;

const ARTBOARD_CLOCK: ClockReading = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const DONE: CommandAnswerDocument = {
  answerVersion: 1, outcome: 'done', refusal: null, text: null
};

/** SCREENS B2: the refusal under Example Mobile App's row. */
const STOP_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'overseer-still-live',
  text:          'The Overseer did not stop within its tries.',
};

const START_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'overseer-did-not-answer',
  text:          'The Overseer started but its API did not answer.',
};

const LIMIT_REFUSED: CommandAnswerDocument = {
  answerVersion: 1,
  outcome:       'refused',
  refusal:       'concurrency-above-ceiling',
  text:          'The agent limit is at most 10.',
};

const IDLE_STATES: CommandStates = senderOver([]).states();

function contentOf(fleetDocument: FleetDocument, surroundings: Partial<ForgesSurroundings> = {}): ForgesContent {
  return ForgesModel.forgesContentOf(fleetDocument, {
    clock:         ARTBOARD_CLOCK,
    commandStates: IDLE_STATES,
    stopDialog:    null,
    forgeInView:   null,
    lastSent:      new Map(),
    ...surroundings,
  });
}

function rowOf(content: ForgesContent, trackerId: string): ForgeRow {
  const row = content.rows.find((candidate) => candidate.trackerId === trackerId);
  if (row === undefined) throw new Error(`No row for ${trackerId}.`);
  return row;
}

function labelOf(button: ForgeButton): string {
  return button.label;
}

function buttonsDisabledIn(row: ForgeRow): boolean[] {
  return row.buttons.map((button) => button.kind === 'waiting' || button.disabled);
}

/** One forge alone in the fleet, in the given condition: a Storefront read in full unless the condition is one only another fidelity has. */
function fleetWithOneForgeIn(condition: FleetDocumentCondition, changes: Partial<FleetDocumentForge> = {}): FleetDocument {
  const fidelities = {
    unreachable: 'unreachable', unreadable: 'newer-contract', dormant: 'dormant', missing: 'repository-missing'
  } as const;
  const fidelity = Object.hasOwn(fidelities, condition) ? fidelities[condition as keyof typeof fidelities] : 'full';
  return {
    ...FLEET_FIVE_FORGES,
    forges: [{
      ...READINGS.exampleStorefront, condition, fidelity, ...changes
    }]
  };
}

function pendingSender(): CommandSender {
  return senderOver([() => new Promise<Response>(() => undefined)]);
}

describe('the status line', () => {
  test('counts every registered forge, hidden ones too, then the running ones and the starting ones', () => {
    expect(ForgesModel.statusOf(FLEET_FIVE_FORGES).text).toBe('6 registered on this machine · 4 running');
    expect(ForgesModel.statusOf(FLEET_AT_LIMIT).text).toBe('6 registered on this machine · 4 running, 1 starting');
    const hidden = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [TRACKER_IDS.legacyImporter] } };
    expect(ForgesModel.statusOf(hidden).text).toBe('6 registered on this machine · 4 running');
    expect(ForgesModel.statusOf(FLEET_EMPTY).text).toBe('no forge registered on this machine yet');
  });
});

describe('a row of the table (A4)', () => {
  test('with fleet-five-forges the table holds the five forges whose repository is there, in registry order', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    expect(content.rows.map((row) => row.project)).toEqual(['Example Storefront', 'Invoice Service', 'Research Wiki', 'Example Mobile App', 'Design System']);
    expect(content.emptySentence).toBeNull();
  });

  test('reads the root from ~, the condition word with when it started or stopped, the agents against the limit, what waits and the code', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    const cellsOf = (row: ForgeRow) => [row.rootText, row.conditionWord, row.conditionTone, row.detailText, row.waitingText, row.codeText];
    expect(content.rows.map(cellsOf)).toEqual([
      ['~/development/example-storefront', 'Live', null, 'since 09:12', '2', '3f9a2c1'],
      ['~/development/invoice-service', 'Live', null, 'since 08:40', '2', '3f9a2c1'],
      ['~/development/research-wiki', 'Live', null, 'since 11:02', '1', '3f9a2c1'],
      ['~/development/example-mobile-app', 'Launches held', 'warn', 'since 12:40', null, 'b81e07d'],
      ['~/development/design-system', 'Dormant', 'muted', 'stopped 12:20', null, '3f9a2c1'],
    ]);
    expect(content.rows.map((row) => (row.agents === null ? null : [row.agents.kind, row.agents.kind === 'text' ? row.agents.text : row.agents.valueText]))).toEqual([
      ['stepper', '4 / 5'],
      ['stepper', '3 / 5'],
      ['stepper', '1 / 3'],
      ['stepper', '2 / 2'],
      ['text', '0 / 2'],
    ]);
  });

  test('a paused forge says what still finishes and that it starts no new job', () => {
    expect(rowOf(contentOf(FLEET_AT_LIMIT), TRACKER_IDS.researchWiki).detailText).toBe('1 agent finishing · starts no new job');
    const idle = fleetWithOneForgeIn('paused', { concurrency: { ...READINGS.exampleStorefront.concurrency, agentsInFlight: 0 } as FleetDocumentForge['concurrency'] });
    expect(rowOf(contentOf(idle), TRACKER_IDS.exampleStorefront).detailText).toBe('starts no new job');
  });

  test('a forge read through its summary shows no limit and its waiting count; one that stopped answering, what it last reported', () => {
    const content = contentOf(FLEET_DEGRADED);
    const wiki = rowOf(content, TRACKER_IDS.researchWiki);
    expect([wiki.agents, wiki.waitingText]).toEqual([null, '1']);
    const invoice = rowOf(content, TRACKER_IDS.invoiceService);
    expect([invoice.conditionWord, invoice.detailText, invoice.agents]).toEqual(['Unreachable', 'as last reported 13:14', { kind: 'text', text: '3 / 5' }]);
  });

  test('the row the route names is in view', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { forgeInView: TRACKER_IDS.invoiceService });
    expect(content.rows.filter((row) => row.isInView).map((row) => row.trackerId)).toEqual([TRACKER_IDS.invoiceService]);
  });
});

describe('which buttons a row shows (A4 acceptance 1)', () => {
  const OPEN_IN_NEW_TAB = 'Open Example Storefront in a new tab';

  test('each condition shows exactly its buttons', () => {
    const labelsIn = (condition: FleetDocumentCondition) => contentOf(fleetWithOneForgeIn(condition)).rows.flatMap((row) => row.buttons.map(labelOf));
    expect(labelsIn('live')).toEqual(['Pause', 'Stop', 'Open', OPEN_IN_NEW_TAB]);
    expect(labelsIn('paused')).toEqual(['Resume', 'Stop', 'Open', OPEN_IN_NEW_TAB]);
    expect(labelsIn('held')).toEqual(['Stop', 'Open', OPEN_IN_NEW_TAB]);
    expect(labelsIn('passing-baton')).toEqual([]);
    expect(labelsIn('starting')).toEqual([]);
    expect(labelsIn('dormant')).toEqual(['Start']);
    expect(labelsIn('unreachable')).toEqual(['Look again', 'Stop']);
    expect(labelsIn('unreadable')).toEqual([OPEN_IN_NEW_TAB]);
    const missing = contentOf(fleetWithOneForgeIn('missing'));
    expect(missing.rows).toEqual([]);
    expect(missing.notFound.map((entry) => labelOf(entry.button))).toEqual(['Hide in Gaia']);
  });

  test('Resume and Start are the primary buttons of their rows; the others are plain, and Open in new tab shows only its arrow', () => {
    const emphasisIn = (condition: FleetDocumentCondition) => contentOf(fleetWithOneForgeIn(condition)).rows
      .flatMap((row) => row.buttons.map((button) => (button.kind === 'command' ? [button.label, button.emphasis, button.iconOnly] : [button.label, button.kind])));
    expect(emphasisIn('paused')).toEqual([['Resume', 'primary', false], ['Stop', 'stop'], ['Open', 'link'], [OPEN_IN_NEW_TAB, 'plain', true]]);
    expect(emphasisIn('dormant')).toEqual([['Start', 'primary', false]]);
  });

  test('Open goes to the forge in place, and is absent where the forge cannot open in place (F5)', () => {
    const [live] = contentOf(fleetWithOneForgeIn('live')).rows;
    expect(live?.buttons.find((button) => button.kind === 'link')).toEqual({
      kind: 'link', button: 'open', label: 'Open', href: `#forge/${TRACKER_IDS.exampleStorefront}`, disabled: false
    });
    const withoutEmbed = fleetWithOneForgeIn('live', { contracts: { ...READINGS.exampleStorefront.contracts, embed: null } });
    expect(contentOf(withoutEmbed).rows.flatMap((row) => row.buttons.map(labelOf))).toEqual(['Pause', 'Stop', OPEN_IN_NEW_TAB]);
  });

  test('a forge whose control contract Gaia does not know has Pause, Resume, Stop and its limit off', () => {
    const unknown = { ...READINGS.exampleStorefront.contracts, control: 2 };
    const [live] = contentOf(fleetWithOneForgeIn('live', { contracts: unknown })).rows;
    expect(live?.buttons.map((button) => [labelOf(button), button.kind === 'waiting' || button.disabled])).toEqual([
      ['Pause', true], ['Stop', true], ['Open', false], [OPEN_IN_NEW_TAB, false],
    ]);
    expect(live?.agents).toMatchObject({ kind: 'stepper', disabled: true });
  });

  test('an unreachable forge can still be stopped, by the forge program, and a dormant one cannot be started without a forge program', () => {
    const [unreachable] = contentOf(fleetWithOneForgeIn('unreachable')).rows;
    expect(unreachable?.buttons.map((button) => button.kind === 'waiting' || button.disabled)).toEqual([false, false]);
    const noProgram = fleetWithOneForgeIn('dormant');
    const withoutProgram = { ...noProgram, settings: { ...noProgram.settings, forgeProgramPath: null }, gaia: { ...noProgram.gaia, forgeProgramInUse: null } };
    const [dormant] = contentOf(withoutProgram).rows;
    expect(dormant?.buttons).toMatchObject([{ label: 'Start', disabled: true }]);
    expect(dormant?.detailText).toBe('the forge program was not found');
  });
});

describe('a forge\'s own limit', () => {
  test('steps by one, from one agent to the forge\'s ceiling, and each side is off at its end', () => {
    const stepperOf = (limit: number) => {
      const concurrency = { ...READINGS.exampleStorefront.concurrency, limit } as FleetDocumentForge['concurrency'];
      return rowOf(contentOf(fleetWithOneForgeIn('live', { concurrency })), TRACKER_IDS.exampleStorefront).agents;
    };
    expect(stepperOf(5)).toMatchObject({
      lowerCommand: { kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.exampleStorefront, limit: 4 },
      raiseCommand: { kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.exampleStorefront, limit: 6 },
      lowerLabel:   'Lower Example Storefront\'s agent limit',
      raiseLabel:   'Raise Example Storefront\'s agent limit',
    });
    expect(stepperOf(1)).toMatchObject({ lowerCommand: null });
    expect(stepperOf(10)).toMatchObject({ raiseCommand: null });
  });
});

describe('the held forge, the forges not found and the hidden ones', () => {
  test('a held forge carries a banner with its notice, its running agents and Update forge', () => {
    const [banner] = contentOf(FLEET_FIVE_FORGES).heldBanners;
    expect(banner?.project).toBe('Example Mobile App');
    expect(banner?.sentence).toBe('The install version changed. Nothing launches until this forge is updated. Its 2 agents keep running.');
    expect(banner?.updateButton).toMatchObject({ label: 'Update forge', emphasis: 'primary', command: { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp } });
  });

  test('a forge whose repository is gone is listed apart, with Hide in Gaia', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    expect(content.notFoundHead).toBe('Not found · 1');
    expect(content.notFound.map((entry) => [entry.project, entry.detailText, entry.button])).toEqual([[
      'Legacy Importer',
      '~/development/legacy-importer · the repository folder is gone',
      {
        kind:     'command',
        button:   'hide',
        label:    'Hide in Gaia',
        emphasis: 'plain',
        iconOnly: false,
        command:  { kind: 'forge-hide', trackerId: TRACKER_IDS.legacyImporter },
        disabled: false,
      },
    ]]);
  });

  test('a hidden forge leaves the table and the forges not found, and shows in the folded group with Show again', () => {
    const fleet = {
      ...FLEET_FIVE_FORGES,
      settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [TRACKER_IDS.legacyImporter, TRACKER_IDS.designSystem] },
    };
    const content = contentOf(fleet);
    expect(content.rows.map((row) => row.trackerId)).not.toContain(TRACKER_IDS.designSystem);
    expect(content.notFound).toEqual([]);
    expect(content.hiddenHead).toBe('Hidden in Gaia · 2');
    expect(content.hidden.map((entry) => [entry.project, entry.detailText, labelOf(entry.button), entry.button.kind === 'command' ? entry.button.command : null])).toEqual([
      ['Design System', '~/development/design-system · dormant', 'Show again', { kind: 'forge-unhide', trackerId: TRACKER_IDS.designSystem }],
      ['Legacy Importer', '~/development/legacy-importer · repository missing', 'Show again', { kind: 'forge-unhide', trackerId: TRACKER_IDS.legacyImporter }],
    ]);
  });

  test('with no forge registered the table says so', () => {
    const content = contentOf(FLEET_EMPTY);
    expect([content.rows, content.emptySentence]).toEqual([[], 'No forge is registered on this machine yet.']);
  });
});

describe('this machine (A4 acceptance 2 and 3, B2)', () => {
  test('the limit steps from one to the CPU count, and plus is off at the CPU count', () => {
    const { machine } = contentOf(FLEET_FIVE_FORGES);
    expect([machine.limitText, machine.lowerCommand, machine.raiseCommand, machine.stepperIsOff]).toEqual([
      '12', { kind: 'machine-agent-limit-set', limit: 11 }, null, false,
    ]);
    expect(machine.sentence).toBe('At most the number of CPUs, which is 12 here. No forge starts an agent past it, whatever its own limit.');
    expect(machine.facts).toEqual([
      { label: 'Agents running', value: '10' },
      { label: 'Asked for by the forges\' own limits', value: '17' },
      { label: 'Tickets waiting for a machine slot', value: '0' },
    ]);
    expect(contentOf(FLEET_AT_LIMIT).machine.raiseCommand).toEqual({ kind: 'machine-agent-limit-set', limit: 11 });
  });

  test('at its limit the panel says so, and which forges\' ready tickets wait for a slot', () => {
    const { machine } = contentOf(FLEET_AT_LIMIT);
    expect([machine.isAtTheLimit, machine.meter]).toEqual([true, { used: 10, whole: 10, label: '10 of 10 agents' }]);
    expect(machine.sentence).toBe('At most the number of CPUs, which is 12 here.');
    expect(machine.atTheLimitText).toBe('The machine is at its limit. 3 ready tickets wait for a slot: 2 in Invoice Service, 1 in Research Wiki.');
    expect(contentOf(FLEET_FIVE_FORGES).machine.atTheLimitText).toBeNull();
  });

  test('without F6 the panel says the forge does not enforce a machine limit, and its stepper is off', () => {
    const withoutF6 = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    const { machine } = contentOf(withoutF6);
    expect([machine.sentence, machine.stepperIsOff, machine.lowerCommand, machine.raiseCommand, machine.meter]).toEqual([
      'This forge version does not enforce a machine limit.', true, null, null, null,
    ]);
  });

  test('the limit is off while a new one is on its way', () => {
    const sender = pendingSender();
    void sender.send({ kind: 'machine-agent-limit-set', limit: 11 });
    expect(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).machine.stepperIsOff).toBe(true);
  });
});

describe('the Stop dialog (B2 acceptance 1)', () => {
  const STOREFRONT_STOP: StopDialogState = { trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' };

  test('asks under its row with two choices, the Overseer only chosen first, and says what keeps waiting', () => {
    const row = rowOf(contentOf(FLEET_FIVE_FORGES, { stopDialog: STOREFRONT_STOP }), TRACKER_IDS.exampleStorefront);
    expect(row.stopDialog).toEqual({
      label:    'Stop Example Storefront',
      question: 'Stop the Overseer of Example Storefront? 4 agents are running.',
      choices:  [
        {
          agents:      'keep',
          title:       'Stop the Overseer only',
          consequence: 'The 4 agents finish what they are on under their Watchers. Nothing new starts until this forge is started again.',
          chosen:      true,
        },
        {
          agents:      'stop-first',
          title:       'Stop the agents, then the Overseer',
          consequence: 'The 4 agents wind down first and their tickets return to the board. Then the Overseer stops.',
          chosen:      false,
        },
      ],
      consequence: '2 entries keep waiting on you while it is stopped.',
      command:     { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' },
      isOnItsWay:  false,
    });
    expect(contentOf(FLEET_FIVE_FORGES).rows.every((candidate) => candidate.stopDialog === null)).toBe(true);
  });

  test('"Overseer only" sends agents keep, and the other choice stop-first', () => {
    const commandFor = (agents: StopDialogState['agents']) => rowOf(
      contentOf(FLEET_FIVE_FORGES, { stopDialog: { trackerId: TRACKER_IDS.exampleStorefront, agents } }),
      TRACKER_IDS.exampleStorefront,
    ).stopDialog?.command;
    expect(commandFor('keep')).toEqual({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' });
    expect(commandFor('stop-first')).toEqual({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'stop-first' });
  });

  test('with no agent running there is nothing to choose, and the agents are kept', () => {
    const idle = fleetWithOneForgeIn('live', { agents: [], concurrency: { ...READINGS.exampleStorefront.concurrency, agentsInFlight: 0 } as FleetDocumentForge['concurrency'] });
    const dialog = rowOf(contentOf(idle, { stopDialog: { trackerId: TRACKER_IDS.exampleStorefront, agents: 'stop-first' } }), TRACKER_IDS.exampleStorefront).stopDialog;
    expect([dialog?.question, dialog?.choices, dialog?.command]).toEqual([
      'Stop the Overseer of Example Storefront?',
      [],
      { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' },
    ]);
  });

  test('an Overseer that does not answer Gaia is stopped by the forge program, so its agents are not offered a choice', () => {
    const dialog = rowOf(contentOf(FLEET_DEGRADED, { stopDialog: { trackerId: TRACKER_IDS.invoiceService, agents: 'keep' } }), TRACKER_IDS.invoiceService).stopDialog;
    expect([dialog?.question, dialog?.choices, dialog?.command]).toEqual([
      'Stop the Overseer of Invoice Service? 3 agents are running.',
      [],
      { kind: 'forge-stop', trackerId: TRACKER_IDS.invoiceService, agents: 'keep' },
    ]);
  });

  test('while it is open its row\'s controls are off, and the other rows\' are not', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { stopDialog: STOREFRONT_STOP });
    expect(buttonsDisabledIn(rowOf(content, TRACKER_IDS.exampleStorefront))).toEqual([true, true, true, true]);
    expect(buttonsDisabledIn(rowOf(content, TRACKER_IDS.invoiceService))).toEqual([false, false, false, false]);
  });
});

describe('a command on its way and its refusal (B2 acceptance 2, 3 and 4)', () => {
  test('while a command to a forge is on its way, that row\'s controls and limit are off, and the others are not', () => {
    const sender = pendingSender();
    void sender.send({ kind: 'forge-pause', trackerId: TRACKER_IDS.invoiceService });
    const content = contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    expect(buttonsDisabledIn(rowOf(content, TRACKER_IDS.invoiceService))).toEqual([true, true, true, true]);
    expect(rowOf(content, TRACKER_IDS.invoiceService).agents).toMatchObject({ disabled: true });
    expect(buttonsDisabledIn(rowOf(content, TRACKER_IDS.exampleStorefront))).toEqual([false, false, false, false]);
    expect(rowOf(content, TRACKER_IDS.exampleStorefront).agents).toMatchObject({ disabled: false });
  });

  test('the stop on its way holds its dialog', () => {
    const sender = pendingSender();
    void sender.send({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' });
    const stopDialog: StopDialogState = { trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' };
    const dialog = rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states(), stopDialog }), TRACKER_IDS.exampleStorefront).stopDialog;
    expect(dialog?.isOnItsWay).toBe(true);
  });

  test('a refusal shows under its row with the forge\'s code and sentence, until dismissed', async () => {
    const stop: ForgeCommandBody = { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'stop-first' };
    const sender = senderOver([() => Promise.resolve(answerResponse(STOP_REFUSED))]);
    await sender.send(stop);
    const lastSent = new Map([[TRACKER_IDS.exampleMobileApp, stop]]);
    const refused = rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states(), lastSent }), TRACKER_IDS.exampleMobileApp);
    expect(refused.refusal).toEqual({
      commandLabel: 'Stop', code: 'overseer-still-live', sentence: 'The Overseer did not stop within its tries.', retryCommand: stop
    });
    expect(rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }), TRACKER_IDS.invoiceService).refusal).toBeNull();
    sender.dismissFailure({ trackerId: TRACKER_IDS.exampleMobileApp });
    expect(rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }), TRACKER_IDS.exampleMobileApp).refusal).toBeNull();
  });

  test('a refusal leaves once the next command to that forge succeeds', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(STOP_REFUSED)), () => Promise.resolve(answerResponse(DONE))]);
    await sender.send({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' });
    expect(rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }), TRACKER_IDS.exampleMobileApp).refusal).not.toBeNull();
    await sender.send({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' });
    expect(rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }), TRACKER_IDS.exampleMobileApp).refusal).toBeNull();
  });

  test('Try again sends the command again: a forge-only command from its kind, a limit only as this view sent it', async () => {
    const sender = senderOver([
      () => Promise.resolve(answerResponse(START_REFUSED)),
      () => Promise.resolve(answerResponse(LIMIT_REFUSED)),
    ]);
    await sender.send({ kind: 'forge-start', trackerId: TRACKER_IDS.designSystem });
    await sender.send({ kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.exampleStorefront, limit: 11 });
    const content = contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    expect(rowOf(content, TRACKER_IDS.designSystem).refusal?.retryCommand).toEqual({ kind: 'forge-start', trackerId: TRACKER_IDS.designSystem });
    expect(rowOf(content, TRACKER_IDS.exampleStorefront).refusal).toMatchObject({ commandLabel: 'the agent limit', retryCommand: null });
    const raised: CommandBody = { kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.exampleStorefront, limit: 11 };
    const withLastSent = contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states(), lastSent: new Map([[TRACKER_IDS.exampleStorefront, raised as ForgeCommandBody]]) });
    expect(rowOf(withLastSent, TRACKER_IDS.exampleStorefront).refusal?.retryCommand).toEqual(raised);
  });

  test('a held forge\'s refused update shows on its banner, not under its row', async () => {
    const refusedUpdate: CommandAnswerDocument = {
      answerVersion: 1, outcome: 'refused', refusal: 'update-in-progress', text: 'An update already runs in this repository.'
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(refusedUpdate))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const content = contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    expect(rowOf(content, TRACKER_IDS.exampleMobileApp).refusal).toBeNull();
    expect(content.heldBanners[0]?.refusal).toMatchObject({ commandLabel: 'Update forge', code: 'update-in-progress' });
  });

  test('a start Gaia sent shows as starting with one disabled button, then as live once the forge reports it, or as a refusal on the row', async () => {
    let answerStart: (response: Response) => void = () => undefined;
    const sender = senderOver([
      () => new Promise<Response>((resolve) => {
        answerStart = resolve;
      }),
      () => Promise.resolve(answerResponse(START_REFUSED)),
    ]);
    const start = sender.send({ kind: 'forge-start', trackerId: TRACKER_IDS.designSystem });
    const starting = rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }), TRACKER_IDS.designSystem);
    expect([starting.condition, starting.conditionWord, starting.detailText, starting.buttons]).toEqual([
      'starting', 'Starting', 'forge start · waiting for its API', [{ kind: 'waiting', label: 'Starting' }],
    ]);
    answerStart(answerResponse(DONE));
    await start;
    const live = {
      ...FLEET_FIVE_FORGES,
      forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.designSystem ? { ...forge, fidelity: 'full', condition: 'live' } as const : forge)),
    };
    const liveButtons = rowOf(contentOf(live, { commandStates: sender.states() }), TRACKER_IDS.designSystem).buttons.map(labelOf);
    expect(liveButtons).toEqual(['Pause', 'Stop', 'Open', 'Open Design System in a new tab']);
    await sender.send({ kind: 'forge-start', trackerId: TRACKER_IDS.designSystem });
    const refused = rowOf(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }), TRACKER_IDS.designSystem);
    expect([refused.conditionWord, refused.buttons.map(labelOf), refused.refusal?.code]).toEqual(['Dormant', ['Start'], 'overseer-did-not-answer']);
  });
});
