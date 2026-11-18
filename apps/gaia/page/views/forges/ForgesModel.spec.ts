/**
 * What the Forges view shows of a fleet document. What matters (SCREENS A4 and B2): each condition shows exactly its buttons, Open only where the forge
 * opens in place; a row reads its root from `~`, its condition word with when it started or stopped, its agents against its limit, what waits and its
 * short code; a forge's limit runs from one agent to the forge's ceiling and the machine's from one to the CPU count, and without F6 the machine panel
 * says why no limit is known, its stepper off; the machine at its limit says which forges' tickets wait. B2: Stop asks with two choices and keeps the
 * agents by default, with none when no agent runs; while a command to a forge is on its way that row's controls are off and no other's; a refusal stays on
 * its forge until dismissed or the next success, and offers to send the same command again; a start Gaia sent shows as starting until the forge answers;
 * an update that left a restart pending offers Restart where the update was sent, on a held forge's banner, with its refusal, or under its row; a forge
 * whose Assistant cannot come up says so under its row. Versions (U2): a forge Gaia cannot talk to runs, is not read, shows nothing of its work and offers
 * only what Gaia can send, Update forge for an older one; an ahead forge keeps every control and says quietly what differs; each verdict but current opens
 * its pair, one row at a time; a count that leaves a forge out says so. Flint's brain (R4.6): only a forge whose brain runs marks it on its row, with the
 * time left and a name that says it is outside the agent limit, while the machine's figure and slots stay 10 / 12; the machine panel says the brain runs
 * outside the limit once a forge reports a brain, and where one runs now. Command states come from the real sender over Gaia's server stood in for by
 * authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandAnswerDocument, CommandBody, ForgeCommandBody } from '../../@types/CommandDocument.ts';
import type {
  FleetDocument,
  FleetDocumentBrain,
  FleetDocumentCondition,
  FleetDocumentForge,
} from '../../@types/FleetDocument.ts';
import { type CommandSender, type CommandStates } from '../../api/CommandSender.ts';
import type { ClockReading }                      from '../../shared/@types/ClockReading.ts';
import { answerResponse, senderOver }             from '../../testing/CommandServer.ts';
import { FLEET_AT_LIMIT }                         from '../../testing/fixtures/fleet-at-limit.ts';
import { FLEET_DEGRADED }                         from '../../testing/fixtures/fleet-degraded.ts';
import { FLEET_EMPTY }                            from '../../testing/fixtures/fleet-empty.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_BRAINS,
  FLEET_FIVE_FORGES_READINGS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_STATING_NO_VERSION, FLEET_VERSIONS_TRACKER_IDS } from '../../testing/fixtures/fleet-versions.ts';
import {
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
  answerVersion: 3, outcome: 'done', refusal: null, text: null
};

/** SCREENS B2: the refusal under Example Mobile App's row. */
const STOP_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'overseer-still-live',
  text:          'The Overseer did not stop within its tries.',
};

const START_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'overseer-did-not-answer',
  text:          'The Overseer started but its API did not answer.',
};

const LIMIT_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'concurrency-above-ceiling',
  text:          'The agent limit is at most 10.',
};

const RESTART_PENDING: CommandAnswerDocument = {
  answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null
};

const IDLE_STATES: CommandStates = senderOver([]).states();

function contentOf(fleetDocument: FleetDocument, surroundings: Partial<ForgesSurroundings> = {}): ForgesContent {
  return ForgesModel.forgesContentOf(fleetDocument, {
    clock:            ARTBOARD_CLOCK,
    commandStates:    IDLE_STATES,
    stopDialog:       null,
    forgeInView:      null,
    lastSent:         new Map(),
    versionsShownFor: null,
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

function withoutGaiasForgeProgram(fleetDocument: FleetDocument): FleetDocument {
  return { ...fleetDocument, settings: { ...fleetDocument.settings, forgeProgramPath: null }, gaia: { ...fleetDocument.gaia, forgeProgramInUse: null } };
}

function pendingSender(): CommandSender {
  return senderOver([() => new Promise<Response>(() => undefined)]);
}

describe('the page title\'s figures', () => {
  test('count every registered forge, hidden ones too, then the running ones, and the starting and hidden ones when there are any', () => {
    const figuresOf = (fleetDocument: FleetDocument) => ForgesModel.titleFiguresOf(fleetDocument).map((figure) => `${figure.value} ${figure.label}`);
    expect(figuresOf(FLEET_FIVE_FORGES)).toEqual(['6 registered', '4 running']);
    expect(figuresOf(FLEET_AT_LIMIT)).toEqual(['6 registered', '4 running', '1 starting']);
    const hidden = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [TRACKER_IDS.legacyImporter] } };
    expect(figuresOf(hidden)).toEqual(['6 registered', '4 running', '1 hidden']);
    expect(figuresOf(FLEET_EMPTY)).toEqual(['0 registered', '0 running']);
  });
});

describe('a row of the table (A4)', () => {
  test('with fleet-five-forges the table holds the five forges whose repository is there, in registry order', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    expect(content.rows.map((row) => row.project)).toEqual(['Example Storefront', 'Invoice Service', 'Research Wiki', 'Example Mobile App', 'Design System']);
    expect(content.emptySentence).toBeNull();
  });

  test('reads the root from ~, the condition word with the current version or when it stopped, the agents against the limit, what waits and the code', () => {
    const content = contentOf(FLEET_FIVE_FORGES);
    const cellsOf = (row: ForgeRow) => [row.rootText, row.conditionWord, row.conditionTone, row.detailText ?? row.versions?.subline?.text, row.waitingCount, row.codeText];
    expect(content.rows.map(cellsOf)).toEqual([
      ['~/development/example-storefront', 'Live', null, 'forge 1.1', 2, '3f9a2c1'],
      ['~/development/invoice-service', 'Live', null, 'forge 1.1', 2, '3f9a2c1'],
      ['~/development/research-wiki', 'Live', null, 'forge 1.1', 1, '3f9a2c1'],
      ['~/development/example-mobile-app', 'Launches held', 'warn', 'forge 1.1', null, 'b81e07d'],
      ['~/development/design-system', 'Dormant', 'muted', 'stopped 12:20', null, '3f9a2c1'],
    ]);
    const agentsCellOf = ({ agents }: ForgeRow) => {
      if (agents === null || agents.kind === 'not-read') return agents;
      return [agents.kind, agents.kind === 'text' ? agents.text : [agents.inFlight, agents.limit]];
    };
    expect(content.rows.map(agentsCellOf)).toEqual([
      ['stepper', [4, 5]],
      ['stepper', [3, 5]],
      ['stepper', [1, 3]],
      ['stepper', [2, 2]],
      ['text', '0 / 2'],
    ]);
  });

  test('keeps the root in full beside the one read from ~', () => {
    expect(contentOf(FLEET_FIVE_FORGES).rows.map((row) => [row.rootText, row.rootPath])[0]).toEqual([
      '~/development/example-storefront', '/Users/alexexample/development/example-storefront',
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
    expect([wiki.agents, wiki.waitingCount]).toEqual([null, 1]);
    const invoice = rowOf(content, TRACKER_IDS.invoiceService);
    expect([invoice.conditionWord, invoice.detailText, invoice.agents]).toEqual(['Unreachable', 'as last reported 13:14', { kind: 'text', text: '3 / 5' }]);
  });

  test('a forge whose Assistant cannot come up says so under its row, in the words the server gave it, and no other notice does', () => {
    const assistantDown = { kind: 'assistant-down', text: 'This forge\'s Assistant cannot come up, so its open incidents take their defaults.' };
    const otherNotice = { kind: 'incident-defaulted', text: 'Incident I2 took its default.' };
    const fleetDocument = fleetWithOneForgeIn('live', { notices: [otherNotice, assistantDown] });
    expect(rowOf(contentOf(fleetDocument), TRACKER_IDS.exampleStorefront).noticeText).toBe(assistantDown.text);
    expect(rowOf(contentOf(fleetWithOneForgeIn('live', { notices: [otherNotice] })), TRACKER_IDS.exampleStorefront).noticeText).toBeNull();
    expect(contentOf(FLEET_FIVE_FORGES).rows.map((row) => row.noticeText)).toEqual([null, null, null, null, null]);
  });

  test('the row the route names is in view', () => {
    const content = contentOf(FLEET_FIVE_FORGES, { forgeInView: TRACKER_IDS.invoiceService });
    expect(content.rows.filter((row) => row.isInView).map((row) => row.trackerId)).toEqual([TRACKER_IDS.invoiceService]);
  });
});

describe('which buttons a row shows (A4 acceptance 1)', () => {
  const OPEN_IN_NEW_TAB = 'Open Example Storefront in a new tab';

  test('a forge that reports itself starting shows its limit on a disabled stepper and one disabled "Starting" button (B2)', () => {
    const starting = rowOf(contentOf(fleetWithOneForgeIn('starting')), TRACKER_IDS.exampleStorefront);
    expect([starting.buttons, starting.agents?.kind, starting.agents?.kind === 'stepper' && starting.agents.disabled]).toEqual([
      [{ kind: 'waiting', label: 'Starting' }], 'stepper', true,
    ]);
  });

  test('each condition shows exactly its buttons', () => {
    const labelsIn = (condition: FleetDocumentCondition) => contentOf(fleetWithOneForgeIn(condition)).rows.flatMap((row) => row.buttons.map(labelOf));
    expect(labelsIn('live')).toEqual(['Pause', 'Stop', 'Open', OPEN_IN_NEW_TAB]);
    expect(labelsIn('paused')).toEqual(['Resume', 'Stop', 'Open', OPEN_IN_NEW_TAB]);
    expect(labelsIn('held')).toEqual(['Stop', 'Open', OPEN_IN_NEW_TAB]);
    expect(labelsIn('passing-baton')).toEqual([]);
    expect(labelsIn('starting')).toEqual(['Starting']);
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
    expect(emphasisIn('paused')).toEqual([['Resume', 'primary', false], ['Stop', 'stop'], ['Open', 'link'], [OPEN_IN_NEW_TAB, 'quiet', true]]);
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
    const unknown = { ...READINGS.exampleStorefront.contracts, control: 3 };
    const [live] = contentOf(fleetWithOneForgeIn('live', { contracts: unknown })).rows;
    expect(live?.buttons.map((button) => [labelOf(button), button.kind === 'waiting' || button.disabled])).toEqual([
      ['Pause', true], ['Stop', true], ['Open', false], [OPEN_IN_NEW_TAB, false],
    ]);
    expect(live?.agents).toMatchObject({ kind: 'stepper', disabled: true });
  });

  test('an unreachable forge can still be stopped, by the forge program, and a dormant one cannot be started without a forge program', () => {
    const [unreachable] = contentOf(fleetWithOneForgeIn('unreachable')).rows;
    expect(unreachable?.buttons.map((button) => button.kind === 'waiting' || button.disabled)).toEqual([false, false]);
    const [dormant] = contentOf(withoutGaiasForgeProgram(fleetWithOneForgeIn('dormant', { program: null }))).rows;
    expect(dormant?.buttons).toMatchObject([{ label: 'Start', disabled: true }]);
    expect(dormant?.detailText).toBe('the forge program was not found');
  });

  test('a dormant forge whose registry entry names its program can be started while Gaia\'s settings name none', () => {
    const [dormant] = contentOf(withoutGaiasForgeProgram(fleetWithOneForgeIn('dormant', { program: '/Users/alexexample/.bun/bin/forge' }))).rows;
    expect(dormant?.buttons).toMatchObject([{ label: 'Start', disabled: false }]);
    expect(dormant?.detailText).not.toBe('the forge program was not found');
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
    expect(banner?.updateButton).toMatchObject({ label: 'Update forge', emphasis: 'quiet', command: { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp } });
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
        emphasis: 'quiet',
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
    expect([machine.isAtTheLimit, machine.meter]).toEqual([true, {
      used: 10, usedText: '10', whole: 10, label: '10 of 10 agents'
    }]);
    expect(machine.sentence).toBe('At most the number of CPUs, which is 12 here.');
    expect(machine.atTheLimitText).toBe('The machine is at its limit. 3 ready tickets wait for a slot: 2 in Invoice Service, 1 in Research Wiki.');
    expect(contentOf(FLEET_FIVE_FORGES).machine.atTheLimitText).toBeNull();
  });

  test('at its limit the panel names no forge whose waiting tickets were read before it went out of reach, as the machine\'s count leaves them out', () => {
    const researchWikiOutOfReach = FLEET_AT_LIMIT.forges.map((forge) => (
      forge.trackerId === TRACKER_IDS.researchWiki ? { ...forge, fidelity: 'unreachable' as const, condition: 'unreachable' as const } : forge
    ));
    const fleetDocument = { ...FLEET_AT_LIMIT, forges: researchWikiOutOfReach, machine: { ...FLEET_AT_LIMIT.machine, ticketsWaitingForMachineSlot: 2 } };
    expect(contentOf(fleetDocument).machine.atTheLimitText).toBe('The machine is at its limit. 2 ready tickets wait for a slot: 2 in Invoice Service.');
  });

  test('without F6 the panel says the forge does not enforce a machine limit, and its stepper is off', () => {
    const withoutF6 = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    const { machine } = contentOf(withoutF6);
    expect([machine.sentence, machine.stepperIsOff, machine.lowerCommand, machine.raiseCommand, machine.meter]).toEqual([
      'This forge version does not enforce a machine limit.', true, null, null, null,
    ]);
  });

  test('with no forge answering, the panel says no running forge has reported a machine limit, not that the version enforces none', () => {
    const noneAnswering = {
      ...FLEET_FIVE_FORGES,
      figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null },
      forges:  FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, fidelity: 'dormant' as const })),
    };
    expect(contentOf(noneAnswering).machine.sentence).toBe('No running forge has reported a machine limit yet.');
  });

  test('the limit is off while a new one is on its way', () => {
    const sender = pendingSender();
    void sender.send({ kind: 'machine-agent-limit-set', limit: 11 });
    expect(contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).machine.stepperIsOff).toBe(true);
  });
});

function withBrainOn(trackerId: string, brain: FleetDocumentBrain | 'not-reported', fleetDocument: FleetDocument = FLEET_FIVE_FORGES): FleetDocument {
  return { ...fleetDocument, forges: fleetDocument.forges.map((forge) => (forge.trackerId === trackerId ? { ...forge, brain } : forge)) };
}

describe('Flint\'s brain on A4', () => {
  test('only the forge whose brain runs marks it on its row, with the time left and a name that it runs outside the agent limit', () => {
    const { rows } = contentOf(FLEET_FIVE_FORGES);
    expect(rows.map((row) => [row.project, row.brain])).toEqual([
      ['Example Storefront', { countdown: '1:24', accessibleName: 'Flint\'s brain is running, 1:24 left, outside the agent limit' }],
      ['Invoice Service', null],
      ['Research Wiki', null],
      ['Example Mobile App', null],
      ['Design System', null],
    ]);
  });

  test('the time left follows the page\'s clock and stops at 0:00, and a brain whose end the forge does not report shows none', () => {
    const later = { ...ARTBOARD_CLOCK, nowEpochMilliseconds: ARTBOARD_CLOCK.nowEpochMilliseconds + 90_000 };
    expect(rowOf(contentOf(FLEET_FIVE_FORGES, { clock: later }), TRACKER_IDS.exampleStorefront).brain?.countdown).toBe('0:00');
    const noEnd = withBrainOn(TRACKER_IDS.exampleStorefront, { ...FLEET_FIVE_FORGES_BRAINS.running, endsAt: null });
    expect(rowOf(contentOf(noEnd), TRACKER_IDS.exampleStorefront).brain).toEqual({ countdown: null, accessibleName: 'Flint\'s brain is running, outside the agent limit' });
  });

  test('an ended, refused, off or unreported brain marks no row', () => {
    const brains = [FLEET_FIVE_FORGES_BRAINS.ended, FLEET_FIVE_FORGES_BRAINS.refused, FLEET_FIVE_FORGES_BRAINS.off, 'not-reported' as const];
    expect(brains.map((brain) => rowOf(contentOf(withBrainOn(TRACKER_IDS.exampleStorefront, brain)), TRACKER_IDS.exampleStorefront).brain)).toEqual([null, null, null, null]);
  });

  test('a running brain leaves the machine\'s figure, slots and facts at 10 / 12, as without it', () => {
    const withBrain = contentOf(FLEET_FIVE_FORGES).machine;
    const withoutBrain = contentOf(withBrainOn(TRACKER_IDS.exampleStorefront, FLEET_FIVE_FORGES_BRAINS.off)).machine;
    expect(withBrain.meter).toEqual({
      used: 10, usedText: '10', whole: 12, label: '10 of 12 agents'
    });
    expect([withBrain.meter, withBrain.facts, withBrain.isAtTheLimit]).toEqual([withoutBrain.meter, withoutBrain.facts, withoutBrain.isAtTheLimit]);
  });

  test('the machine panel says the brain runs outside the limit, and where one runs now', () => {
    expect(contentOf(FLEET_FIVE_FORGES).machine.brainLine).toEqual({
      sentence:        'Flint\'s brain runs outside this limit.',
      runningSentence: '1 is running now, in Example Storefront, and takes no agent slot.',
    });
    const two = withBrainOn(TRACKER_IDS.invoiceService, FLEET_FIVE_FORGES_BRAINS.running);
    expect(contentOf(two).machine.brainLine?.runningSentence).toBe('2 are running now, in Example Storefront and Invoice Service, and take no agent slot.');
  });

  test('with no brain running the panel keeps only that the brain runs outside the limit', () => {
    for (const brain of [FLEET_FIVE_FORGES_BRAINS.ended, FLEET_FIVE_FORGES_BRAINS.refused, FLEET_FIVE_FORGES_BRAINS.off]) {
      const { brainLine } = contentOf(withBrainOn(TRACKER_IDS.exampleStorefront, brain)).machine;
      expect(brainLine).toEqual({ sentence: 'Flint\'s brain runs outside this limit.', runningSentence: null });
    }
  });

  test('the brain line is absent while no forge reports a brain, and while no machine limit is known', () => {
    const noBrain = { ...FLEET_FIVE_FORGES, forges: FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, brain: 'not-reported' as const })) };
    expect(contentOf(noBrain).machine.brainLine).toBeNull();
    const withoutF6 = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    expect(contentOf(withoutF6).machine.brainLine).toBeNull();
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

  test('a forge stopped from elsewhere while it is open drops it, and its row\'s Start is on', () => {
    const stoppedMeanwhile = fleetWithOneForgeIn('dormant');
    const row = rowOf(contentOf(stoppedMeanwhile, { stopDialog: STOREFRONT_STOP }), TRACKER_IDS.exampleStorefront);
    expect([row.stopDialog, row.buttons]).toMatchObject([null, [{ label: 'Start', disabled: false }]]);
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

  test('the line under the table says why a control is off while one is in use: a command on its way, an open Stop dialog or a refusal', async () => {
    const CONTROLS_NOTE = 'A control stays disabled while its command is on its way. A refusal is the forge\'s own sentence, shown beside the control that caused it.';
    expect(contentOf(FLEET_FIVE_FORGES).controlsNote).toBeNull();
    const pending = pendingSender();
    void pending.send({ kind: 'forge-pause', trackerId: TRACKER_IDS.invoiceService });
    expect(contentOf(FLEET_FIVE_FORGES, { commandStates: pending.states() }).controlsNote).toBe(CONTROLS_NOTE);
    const stopDialog: StopDialogState = { trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' };
    expect(contentOf(FLEET_FIVE_FORGES, { stopDialog }).controlsNote).toBe(CONTROLS_NOTE);
    const refusing = senderOver([() => Promise.resolve(answerResponse(STOP_REFUSED))]);
    await refusing.send({ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' });
    expect(contentOf(FLEET_FIVE_FORGES, { commandStates: refusing.states() }).controlsNote).toBe(CONTROLS_NOTE);
    refusing.dismissFailure({ trackerId: TRACKER_IDS.exampleMobileApp });
    expect(contentOf(FLEET_FIVE_FORGES, { commandStates: refusing.states() }).controlsNote).toBeNull();
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
      refusedBy:    'forge',
      commandLabel: 'Stop',
      code:         'overseer-still-live',
      sentence:     'The Overseer did not stop within its tries.',
      retryCommand: stop
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
      answerVersion: 3, outcome: 'refused', refusal: 'update-in-progress', text: 'An update already runs in this repository.'
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(refusedUpdate))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const content = contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    expect(rowOf(content, TRACKER_IDS.exampleMobileApp).refusal).toBeNull();
    expect(content.heldBanners[0]?.refusal).toMatchObject({ commandLabel: 'Update forge', code: 'update-in-progress' });
  });

  test('a held forge\'s update that left a restart pending offers Restart on its banner, and nothing under its row', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(RESTART_PENDING))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const content = contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    expect(rowOf(content, TRACKER_IDS.exampleMobileApp).pendingRestart).toBeNull();
    expect(content.heldBanners[0]?.pendingRestart).toEqual({
      word:          'Updated; restart pending.',
      sentence:      'Its Overseer runs the old code until it restarts.',
      restartButton: {
        kind:     'command',
        button:   'restart',
        label:    'Restart',
        emphasis: 'primary',
        iconOnly: false,
        command:  { kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp },
        disabled: false,
      },
      dismissLabel: 'Dismiss the pending restart',
    });
    expect(content.heldBanners[0]?.refusal).toBeNull();
    expect(rowOf(content, TRACKER_IDS.exampleStorefront).pendingRestart).toBeNull();
  });

  test('a held forge\'s refused restart, pressed on its banner, shows on the banner beside Restart, not under its row', async () => {
    const refusedRestart: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'refused', refusal: 'update-in-progress', text: 'An update already runs in this repository.'
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(RESTART_PENDING)), () => Promise.resolve(answerResponse(refusedRestart))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    await sender.send({ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp });
    const content = contentOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    expect(rowOf(content, TRACKER_IDS.exampleMobileApp).refusal).toBeNull();
    expect(content.heldBanners[0]?.refusal).toMatchObject({ commandLabel: 'Restart', code: 'update-in-progress' });
  });

  test('a forge no longer held shows its pending restart under its row; Restart is off without its API and while a command is on its way', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(RESTART_PENDING)), () => new Promise<Response>(() => undefined)]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleStorefront });
    const live = contentOf(fleetWithOneForgeIn('live'), { commandStates: sender.states() });
    expect(rowOf(live, TRACKER_IDS.exampleStorefront).pendingRestart?.restartButton).toMatchObject({ label: 'Restart', disabled: false });
    const withoutItsApi = contentOf(fleetWithOneForgeIn('live', { contracts: { ...READINGS.exampleStorefront.contracts, control: null } }), { commandStates: sender.states() });
    expect(rowOf(withoutItsApi, TRACKER_IDS.exampleStorefront).pendingRestart?.restartButton).toMatchObject({ disabled: true });
    void sender.send({ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleStorefront });
    const restarting = contentOf(fleetWithOneForgeIn('live'), { commandStates: sender.states() });
    expect(rowOf(restarting, TRACKER_IDS.exampleStorefront).pendingRestart?.restartButton).toMatchObject({ disabled: true });
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
    expect(starting.agents).toMatchObject({
      kind:     'stepper',
      inFlight: 0,
      limit:    2,
      disabled: true,
    });
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

const VERSIONS_IDS = FLEET_VERSIONS_TRACKER_IDS;

const UPDATE_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'repository-busy',
  text:          'Another forge command holds the repository.',
};

/** Example Billing's Update forge at one step, as the command sender holds it. */
function billingUpdateStates(state: { readonly onItsWay: 'forge-update' | null; readonly restartPending: boolean; readonly refused: boolean }): CommandStates {
  const failure = state.refused ? { kind: 'forge-update' as const, result: { verdict: 'answered' as const, answer: UPDATE_REFUSED } } : null;
  return {
    forges: new Map([[VERSIONS_IDS.exampleBilling, { onItsWay: state.onItsWay, failure, restartPending: state.restartPending }]]),
    fleet:  new Map(),
  };
}

function buttonFactsOf(row: ForgeRow): (string | boolean | null)[][] {
  return row.buttons.map((button) => [
    button.label,
    button.kind === 'command' ? button.emphasis : null,
    button.kind === 'waiting' || button.disabled,
    button.kind === 'command' || button.kind === 'stop' ? button.title ?? null : null,
  ]);
}

describe('a forge at another version than this Gaia is built for (U2)', () => {
  test('one Gaia cannot talk to runs, and the title counts it as not read', () => {
    expect(ForgesModel.titleFiguresOf(FLEET_VERSIONS)).toEqual([
      { value: '5', label: 'registered' },
      { value: '5', label: 'running' },
      { value: '2', label: 'not read' },
    ]);
    expect(ForgesModel.titleFiguresOf(FLEET_FIVE_FORGES).map((figure) => figure.label)).not.toContain('not read');
  });

  test('an older forge reads "Needs update" in orange, its version and verdict a disclosure, and nothing of its work', () => {
    const row = rowOf(contentOf(FLEET_VERSIONS), VERSIONS_IDS.exampleBilling);
    expect([row.condition, row.conditionWord, row.conditionTone, row.detailText, row.versions?.subline]).toEqual([
      'outdated', 'Needs update', 'warn', null, { opensVersions: true, text: '1.8 · older' },
    ]);
    expect([row.agents, row.waitingCount, row.workIsRead, row.brain]).toEqual([{ kind: 'not-read' }, null, false, null]);
  });

  test('a newer forge reads "Not readable" in the secondary ink, its version and verdict a disclosure, and nothing of its work', () => {
    const row = rowOf(contentOf(FLEET_VERSIONS), VERSIONS_IDS.analyticsSandbox);
    expect([row.condition, row.conditionWord, row.conditionTone, row.detailText, row.versions?.subline]).toEqual([
      'unreadable', 'Not readable', 'muted', null, { opensVersions: true, text: '4.1 · newer' },
    ]);
    expect([row.agents, row.waitingCount, row.workIsRead]).toEqual([{ kind: 'not-read' }, null, false]);
  });

  test('a forge that states no version reads as older and its disclosure says only "older"', () => {
    const row = rowOf(contentOf(FLEET_VERSIONS_STATING_NO_VERSION), VERSIONS_IDS.exampleDocs);
    expect([row.conditionWord, row.versions?.subline]).toEqual(['Needs update', { opensVersions: true, text: 'older' }]);
    expect(buttonFactsOf(row)[0]).toEqual(['Update forge', 'primary', false, null]);
  });

  test('an older forge offers Update forge as its one primary, Stop off naming both versions, and Open in new tab, never Open in place', () => {
    expect(buttonFactsOf(rowOf(contentOf(FLEET_VERSIONS), VERSIONS_IDS.exampleBilling))).toEqual([
      ['Update forge', 'primary', false, null],
      ['Stop', null, true, 'Example Billing is forge 1.8; this Gaia is built for forge 3.1.'],
      ['Open Example Billing in a new tab', 'quiet', false, null],
    ]);
  });

  test('a newer forge offers Pause and Stop off, each naming both versions, and Open in new tab; no Update forge and no Open in place', () => {
    const title = 'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.';
    expect(buttonFactsOf(rowOf(contentOf(FLEET_VERSIONS), VERSIONS_IDS.analyticsSandbox))).toEqual([
      ['Pause', 'quiet', true, title],
      ['Stop', null, true, title],
      ['Open Analytics Sandbox in a new tab', 'quiet', false, null],
    ]);
  });

  test('an ahead forge keeps its condition, its counts and every control, and says quietly what differs, with no action', () => {
    const row = rowOf(contentOf(FLEET_VERSIONS), VERSIONS_IDS.exampleStorefront);
    expect([row.conditionWord, row.conditionTone, row.waitingCount, row.workIsRead, row.agents?.kind]).toEqual(['Live', null, 2, true, 'stepper']);
    expect(row.buttons.map(labelOf)).toEqual(['Pause', 'Stop', 'Open', 'Open Example Storefront in a new tab']);
    expect(row.versions?.subline).toEqual({ opensVersions: true, text: '3.4 · ahead' });
    expect(row.versions?.quietLine).toBe('Forge 3.4 is ahead of this Gaia, built for 3.1. All Gaia shows works; what 3.4 added shows in its Bridge.');
  });

  test('a current forge names its version in place of when it started, opening nothing; a paused one keeps its own detail', () => {
    const current = rowOf(contentOf(FLEET_VERSIONS), VERSIONS_IDS.invoiceService);
    expect([current.detailText, current.versions?.subline, current.versions?.quietLine]).toEqual([null, { opensVersions: false, text: 'forge 3.1' }, null]);
    const paused = rowOf(contentOf(fleetWithOneForgeIn('paused')), TRACKER_IDS.exampleStorefront);
    expect([paused.detailText, paused.versions?.subline]).toEqual(['4 agents finishing · starts no new job', null]);
  });

  test('the versions shown are one row\'s pair and its sentence, the ahead line hiding behind them, and a current forge opens none', () => {
    const storefront = rowOf(contentOf(FLEET_VERSIONS, { versionsShownFor: VERSIONS_IDS.exampleStorefront }), VERSIONS_IDS.exampleStorefront).versions;
    expect([storefront?.isShown, storefront?.pair?.verdict, storefront?.quietLine]).toEqual([true, 'ahead', null]);
    expect(storefront?.pairSentence).toBe('Gaia reads all it knows of Example Storefront and frames its Bridge. What forge 3.4 added since 3.1 shows only in its '
      + 'Bridge; a newer Gaia shows it here too. Nothing waits on you.');
    const billingShown = contentOf(FLEET_VERSIONS, { versionsShownFor: VERSIONS_IDS.exampleBilling });
    expect(billingShown.rows.map((row) => row.versions?.isShown ?? null)).toEqual([false, false, false, true, false]);
    expect(rowOf(billingShown, VERSIONS_IDS.exampleBilling).versions?.disclosureLabel).toBe('Example Billing, its version beside this Gaia’s');
    const invoice = rowOf(contentOf(FLEET_VERSIONS, { versionsShownFor: VERSIONS_IDS.invoiceService }), VERSIONS_IDS.invoiceService).versions;
    expect([invoice?.isShown, invoice?.pair]).toEqual([false, null]);
  });

  test('the note on what the verdicts mean stands under the table while a row can open its versions, and not over current forges alone', () => {
    expect(contentOf(FLEET_VERSIONS).versionsNote).toStartWith('Each forge states its version and the oldest forge version a client may be built for');
    expect(contentOf(FLEET_FIVE_FORGES).versionsNote).toBeNull();
  });

  test('Update forge on its way says so under the row, its button off as "Updating"', () => {
    const commandStates = billingUpdateStates({ onItsWay: 'forge-update', restartPending: false, refused: false });
    const row = rowOf(contentOf(FLEET_VERSIONS, { commandStates }), VERSIONS_IDS.exampleBilling);
    expect([buttonFactsOf(row)[0], row.updateStatus]).toEqual([['Updating', 'primary', true, null], 'Updating the forge…']);
  });

  test('an update that left a restart pending says Gaia reads the forge after it, and Update forge steps back so Restart is the one primary', () => {
    const row = rowOf(contentOf(FLEET_VERSIONS, { commandStates: billingUpdateStates({ onItsWay: null, restartPending: true, refused: false }) }), VERSIONS_IDS.exampleBilling);
    expect([row.pendingRestart?.word, row.pendingRestart?.sentence]).toEqual(['Updated; restart pending.', 'Gaia reads it after the restart.']);
    expect(buttonFactsOf(row)[0]).toEqual(['Update forge', 'quiet', false, null]);
    expect([row.updateStatus]).toEqual([null]);
  });

  test('a refused update shows the forge\'s code and sentence under the row and offers the same update again', () => {
    const row = rowOf(contentOf(FLEET_VERSIONS, { commandStates: billingUpdateStates({ onItsWay: null, restartPending: false, refused: true }) }), VERSIONS_IDS.exampleBilling);
    expect([row.refusal?.commandLabel, row.refusal?.code, row.refusal?.sentence, row.refusal?.retryCommand]).toEqual([
      'Update forge', 'repository-busy', 'Another forge command holds the repository.', { kind: 'forge-update', trackerId: VERSIONS_IDS.exampleBilling },
    ]);
  });

  test('this machine\'s figure is a floor while a forge is not counted, and the panel names the forges it leaves out', () => {
    const { machine } = contentOf(FLEET_VERSIONS);
    expect([machine.meter?.usedText, machine.meter?.label, machine.facts[0]?.value]).toEqual(['8+', '8+ of 12 agents', '8+']);
    expect(machine.notCountedText).toBe('Example Billing and Analytics Sandbox are not counted: this Gaia cannot read their agents.');
    expect([contentOf(FLEET_FIVE_FORGES).machine.notCountedText, contentOf(FLEET_FIVE_FORGES).machine.meter?.usedText]).toEqual([null, '10']);
  });
});
