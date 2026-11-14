/**
 * The Forges view laid out. What matters (SCREENS A4 and B2): the table's head and rows, set close, each root carrying its full path; Stop opens its
 * dialog under the row, and the dialog's choices and buttons hand the view the choice, the cancel and the command to send; "Open in new tab" is a button
 * that sends `forge-open-in-browser` and goes nowhere in Gaia's window; a stepper sends the limit one step on and is off past its ends, the machine's
 * plus at the CPU count; without F6 the machine panel says so with its stepper off; the forge's refusal of a limit above the CPU count shows in the
 * panel; a row's refusal offers Try again and its dismissal; a held forge's banner sends Update forge, and once that left a restart pending, Restart and
 * its dismissal; a forge whose Assistant cannot come up says so under its row; a paused row offers Resume first; a hidden forge folds away with Show
 * again. Flint's brain (R4.6): a running brain's mark sits after its forge's name, the diamond, "BRAIN" and the time left, read aloud as one sentence;
 * no other row has one; the machine panel's last line, under a hairline, says the brain runs outside the limit and where one runs. The command states
 * come from the real sender over Gaia's server stood in for by authored answers.
 */
import { describe, expect, test }               from 'bun:test';
import { ChoiceOption, type ChoiceOptionProps } from 'design-system/ChoiceOption';

import type {
  CommandAnswerDocument,
  CommandBody,
  ForgeCommandBody,
  ForgeStopAgents
} from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                    from '../../@types/FleetDocument.ts';
import type { CommandStates, CommandSubject }                    from '../../api/CommandSender.ts';
import { answerResponse, senderOver }                            from '../../testing/CommandServer.ts';
import { DrawnDots }                                             from '../../testing/DrawnDots.ts';
import { PackageButtons }                                        from '../../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree, type RenderedNode } from '../../testing/ReactElementTree.ts';
import { FLEET_AT_LIMIT }                                        from '../../testing/fixtures/fleet-at-limit.ts';
import {
  FLEET_FIVE_FORGES,
  FLEET_FIVE_FORGES_BRAINS,
  FLEET_FIVE_FORGES_TRACKER_IDS,
  FLEET_FIXTURES_READ_AT,
} from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgesLayout, forgeAnchorIdOf }        from './ForgesLayout.tsx';
import { ForgesModel, type ForgesSurroundings } from './ForgesModel.ts';
import { GaiaPanelModel }                       from './GaiaPanelModel.ts';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const IDLE_STATES: CommandStates = senderOver([]).states();

const STOP_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'overseer-still-live',
  text:          'The Overseer did not stop within its tries.',
};

const ABOVE_THE_CPUS: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'machine-agent-limit-above-cpus',
  text:          'The machine limit is at most the 12 CPUs of this machine.',
};

interface Handled {
  readonly commands:          CommandBody[];
  readonly stopsOpened:       string[];
  readonly stopChoices:       ForgeStopAgents[];
  readonly stopsCancelled:    number[];
  readonly stopsConfirmed:    ForgeCommandBody[];
  readonly dismissed:         CommandSubject[];
  readonly restartsDismissed: CommandSubject[];
}

function layoutOf(fleetDocument: FleetDocument, surroundings: Partial<ForgesSurroundings> = {}) {
  const handled: Handled = {
    commands: [], stopsOpened: [], stopChoices: [], stopsCancelled: [], stopsConfirmed: [], dismissed: [], restartsDismissed: []
  };
  const commandStates = surroundings.commandStates ?? IDLE_STATES;
  const content = ForgesModel.forgesContentOf(fleetDocument, {
    clock:       { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' },
    commandStates,
    stopDialog:  null,
    forgeInView: null,
    lastSent:    new Map(),
    ...surroundings,
  });
  // The package's choice option holds hooks, so the Stop dialog's choices stay folded, their props read and called as the view hands them.
  const unfolded = tree.unfoldedKeeping(
    <ForgesLayout
      content={content}
      gaiaPanel={GaiaPanelModel.gaiaPanelOf(fleetDocument, { commandStates, sentSettingsChange: null })}
      commandStates={commandStates}
      handlers={{
        onCommand:               (command) => handled.commands.push(command),
        onOpenStopDialog:        (trackerId) => handled.stopsOpened.push(trackerId),
        onStopChoice:            (agents) => handled.stopChoices.push(agents),
        onCancelStop:            () => handled.stopsCancelled.push(1),
        onConfirmStop:           (command) => handled.stopsConfirmed.push(command),
        onDismissFailure:        (subject) => handled.dismissed.push(subject),
        onDismissRestartPending: (subject) => handled.restartsDismissed.push(subject),
        onSettingsCheckbox:      () => undefined,
        onOpenWhatNotifies:      () => undefined,
      }}
    />,
    [ChoiceOption],
  );
  return { unfolded, handled };
}

function rowsIn(nodes: readonly RenderedNode[]): HostElement[] {
  return tree.hostElementsIn(nodes, (element) => element.props['role'] === 'row' && element.props['data-head'] === undefined);
}

function rowOf(nodes: readonly RenderedNode[], trackerId: string): HostElement {
  const rows = rowsIn(nodes).filter((row) => tree.hostElementsIn([row], (element) => element.props['id'] === forgeAnchorIdOf(trackerId)).length === 1);
  const [only] = rows;
  if (rows.length !== 1 || only === undefined) throw new Error(`Expected one row for ${trackerId}, found ${rows.length}.`);
  return only;
}

function controlNamed(nodes: readonly RenderedNode[], name: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => (element.tag === 'button' || element.tag === 'a')
    && (element.props['aria-label'] === name || (element.props['aria-label'] === undefined && tree.textOf([element]) === name)));
}

describe('the table (A4)', () => {
  test('heads its columns and holds one row per forge whose repository is there, each with its name and root', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const head = tree.onlyHostElementIn(unfolded, (element) => element.props['data-head'] === '');
    expect(tree.hostElementsIn([head], (element) => element.props['role'] === 'columnheader').map((cell) => tree.textOf([cell]))).toEqual([
      'Forge', 'Overseer', 'Agents', 'Waiting', 'Code', 'Controls',
    ]);
    const forgeCells = rowsIn(unfolded).map((row) => tree.onlyWithClass([row], 'gaia-forges-forge'));
    const textOfClass = (cell: HostElement, className: string) => tree.textOf([tree.onlyWithClass([cell], className)]);
    expect(forgeCells.map((cell) => [textOfClass(cell, 'gaia-forges-forge-name'), textOfClass(cell, 'gaia-forges-forge-root')])).toEqual([
      ['Example Storefront', '~/development/example-storefront'],
      ['Invoice Service', '~/development/invoice-service'],
      ['Research Wiki', '~/development/research-wiki'],
      ['Example Mobile App', '~/development/example-mobile-app'],
      ['Design System', '~/development/design-system'],
    ]);
  });

  test('sets its many columns close, and each root carries its full path for a window too narrow to print it whole', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    expect(tree.onlyWithClass(unfolded, 'gaia-table').props['data-column-gap']).toBe('narrow');
    expect(rowsIn(unfolded).map((row) => tree.onlyWithClass([row], 'gaia-forges-forge-root').props['title'])).toEqual([
      '/Users/alexexample/development/example-storefront',
      '/Users/alexexample/development/invoice-service',
      '/Users/alexexample/development/research-wiki',
      '/Users/alexexample/development/example-mobile-app',
      '/Users/alexexample/development/design-system',
    ]);
  });

  test('the row the route names is the selected one', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES, { forgeInView: TRACKER_IDS.researchWiki });
    expect(rowOf(unfolded, TRACKER_IDS.researchWiki).props['aria-current']).toBe('true');
    expect(rowOf(unfolded, TRACKER_IDS.invoiceService).props['aria-current']).toBeUndefined();
  });
});

describe('a row\'s controls', () => {
  test('Stop opens the dialog under its row', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    tree.dispatch(controlNamed([rowOf(unfolded, TRACKER_IDS.invoiceService)], 'Stop'), 'onClick');
    expect(handled.stopsOpened).toEqual([TRACKER_IDS.invoiceService]);
  });

  test('"Open in new tab" is a button, not a link, that sends forge-open-in-browser and nothing else', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const openInNewTab = controlNamed([rowOf(unfolded, TRACKER_IDS.exampleStorefront)], 'Open Example Storefront in a new tab');
    expect([openInNewTab.tag, openInNewTab.props['href'], tree.textOf([openInNewTab])]).toEqual(['button', undefined, '']);
    expect(tree.hostElementsIn([openInNewTab], tree.withClass('gaia-open-in-new-tab-glyph'))).toHaveLength(1);
    const tooltipHolder = tree.onlyHostElementIn([rowOf(unfolded, TRACKER_IDS.exampleStorefront)], tree.withClass('gaia-forges-icon-button'));
    expect(tooltipHolder.props['title']).toBe('Open Example Storefront in a new tab');
    tree.dispatch(openInNewTab, 'onClick');
    expect(handled).toEqual({
      commands:          [{ kind: 'forge-open-in-browser', trackerId: TRACKER_IDS.exampleStorefront }],
      stopsOpened:       [],
      stopChoices:       [],
      stopsCancelled:    [],
      stopsConfirmed:    [],
      dismissed:         [],
      restartsDismissed: [],
    });
  });

  test('Open is a link to the forge in place', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    expect(controlNamed([rowOf(unfolded, TRACKER_IDS.exampleStorefront)], 'Open').props['href']).toBe(`#forge/${TRACKER_IDS.exampleStorefront}`);
  });

  test('the stepper sends the forge\'s limit one step down or up', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const row = rowOf(unfolded, TRACKER_IDS.invoiceService);
    tree.dispatch(controlNamed([row], 'Lower Invoice Service\'s agent limit'), 'onClick');
    tree.dispatch(controlNamed([row], 'Raise Invoice Service\'s agent limit'), 'onClick');
    expect(handled.commands).toEqual([
      { kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.invoiceService, limit: 4 },
      { kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.invoiceService, limit: 6 },
    ]);
  });

  test('a start on its way leaves one disabled "Starting" button on its row', () => {
    const sender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'forge-start', trackerId: TRACKER_IDS.designSystem });
    const row = rowOf(layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).unfolded, TRACKER_IDS.designSystem);
    const buttons = tree.hostElementsIn([row], tree.withClass('design-system-button'));
    expect(buttons.map((button) => [tree.textOf([button]), button.props['disabled']])).toEqual([['Starting', true]]);
  });
});

describe('the Stop dialog (B2 acceptance 1)', () => {
  test('hands the view the chosen agents, the cancel and the command its Stop sends', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { stopDialog: { trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' } });
    const dialog = tree.onlyHostElementIn(unfolded, (element) => element.props['aria-label'] === 'Stop Example Storefront');
    expect(tree.textOf([tree.onlyWithClass([dialog], 'gaia-confirm-question')])).toBe('Stop the Overseer of Example Storefront? 4 agents are running.');
    const choices = tree.hostElementsIn([dialog], tree.withTag('ChoiceOption')).map((choice) => choice.props as unknown as ChoiceOptionProps);
    expect(choices.map((choice) => [choice.label, choice.chosen, choice.input?.props.type, choice.input?.props.checked, choice.input?.props.name])).toEqual([
      ['Stop the Overseer only', true, 'radio', true, `gaia-forges-stop-${TRACKER_IDS.exampleStorefront}`],
      ['Stop the agents, then the Overseer', false, 'radio', false, `gaia-forges-stop-${TRACKER_IDS.exampleStorefront}`],
    ]);
    choices.find((choice) => !choice.chosen)?.input?.props.onChange();
    tree.dispatch(controlNamed([dialog], 'Cancel'), 'onClick');
    tree.dispatch(tree.onlyHostElementIn([dialog], (element) => element.tag === 'button' && PackageButtons.emphasisOf(element) === 'primary'), 'onClick');
    expect(handled.stopChoices).toEqual(['stop-first']);
    expect(handled.stopsCancelled).toEqual([1]);
    expect(handled.stopsConfirmed).toEqual([{ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' }]);
  });

  test('with "Stop the agents, then the Overseer" chosen, its Stop sends stop-first', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { stopDialog: { trackerId: TRACKER_IDS.exampleStorefront, agents: 'stop-first' } });
    const dialog = tree.onlyHostElementIn(unfolded, (element) => element.props['aria-label'] === 'Stop Example Storefront');
    tree.dispatch(tree.onlyHostElementIn([dialog], (element) => element.tag === 'button' && PackageButtons.emphasisOf(element) === 'primary'), 'onClick');
    expect(handled.stopsConfirmed).toEqual([{ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'stop-first' }]);
  });
});

describe('a refusal on a row (B2 acceptance 3)', () => {
  test('shows the forge\'s code and sentence under its row, with Try again and its dismissal', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(STOP_REFUSED))]);
    const stop: ForgeCommandBody = { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' };
    await sender.send(stop);
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states(), lastSent: new Map([[TRACKER_IDS.exampleMobileApp, stop]]) });
    const refusal = tree.onlyWithClass([rowOf(unfolded, TRACKER_IDS.exampleMobileApp)], 'gaia-refusal');
    expect(tree.textOf([tree.onlyWithClass([refusal], 'gaia-refusal-text')])).toBe('The forge refused Stop: overseer-still-live. The Overseer did not stop within its tries.');
    tree.dispatch(controlNamed([refusal], 'Try again'), 'onClick');
    tree.dispatch(controlNamed([refusal], 'Dismiss this refusal'), 'onClick');
    expect(handled.commands).toEqual([stop]);
    expect(handled.dismissed).toEqual([{ trackerId: TRACKER_IDS.exampleMobileApp }]);
  });
});

describe('a notice under a row', () => {
  test('a forge whose Assistant cannot come up says so under its row, as a status, and no other row carries a notice', () => {
    const sentence = 'This forge\'s Assistant cannot come up, so its open incidents take their defaults.';
    const forges = FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.invoiceService
      ? { ...forge, notices: [{ kind: 'assistant-down', text: sentence }] }
      : forge));
    const { unfolded } = layoutOf({ ...FLEET_FIVE_FORGES, forges });
    const notice = tree.onlyWithClass([rowOf(unfolded, TRACKER_IDS.invoiceService)], 'gaia-forges-row-notice');
    expect([tree.textOf([notice]), notice.props['role']]).toEqual([sentence, 'status']);
    expect(tree.hostElementsIn(unfolded, tree.withClass('gaia-forges-row-notice'))).toHaveLength(1);
  });
});

describe('the held forge and the forges outside the table', () => {
  test('the held forge\'s banner sends Update forge, and the forge not found Hide in Gaia', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const banner = tree.onlyWithClass(unfolded, 'gaia-forges-held');
    expect(tree.textOf([tree.onlyWithClass([banner], 'gaia-forges-held-text')])).toBe(
      'Example Mobile App holds its launches. The install version changed. Nothing launches until this forge is updated. Its 2 agents keep running.',
    );
    tree.dispatch(controlNamed([banner], 'Update forge'), 'onClick');
    tree.dispatch(controlNamed(unfolded, 'Hide in Gaia'), 'onClick');
    expect(handled.commands).toEqual([
      { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp },
      { kind: 'forge-hide', trackerId: TRACKER_IDS.legacyImporter },
    ]);
  });
});

describe('an update that left a restart pending', () => {
  test('the held forge\'s banner says it is updated with a restart pending, and its Restart and dismissal reach the view', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    const group = tree.onlyWithClass(unfolded, 'gaia-forges-held-group');
    const pendingStep = tree.onlyWithClass([group], 'gaia-pending-step');
    expect(tree.textOf([tree.onlyWithClass([pendingStep], 'gaia-pending-step-text')])).toBe('Updated; restart pending. Its Overseer runs the old code until it restarts.');
    expect(tree.hostElementsIn([rowOf(unfolded, TRACKER_IDS.exampleMobileApp)], tree.withClass('gaia-pending-step'))).toEqual([]);
    tree.dispatch(controlNamed([pendingStep], 'Restart'), 'onClick');
    tree.dispatch(controlNamed([pendingStep], 'Dismiss the pending restart'), 'onClick');
    expect(handled.commands).toEqual([{ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp }]);
    expect(handled.restartsDismissed).toEqual([{ trackerId: TRACKER_IDS.exampleMobileApp }]);
  });

  test('with a restart pending on the held forge, Restart is the only primary button of its held area (A4 acceptance 3)', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const group = tree.onlyWithClass(layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).unfolded, 'gaia-forges-held-group');
    const primaries = tree.hostElementsIn([group], (element) => element.tag === 'button' && PackageButtons.emphasisOf(element) === 'primary');
    expect(primaries.map((button) => tree.textOf([button]))).toEqual(['Restart']);
    expect(PackageButtons.emphasisOf(controlNamed([group], 'Update forge'))).toBe('quiet');
  });

  test('without a pending restart no pending step shows anywhere', () => {
    expect(tree.hostElementsIn(layoutOf(FLEET_FIVE_FORGES).unfolded, tree.withClass('gaia-pending-step'))).toEqual([]);
  });
});

describe('a paused row and the hidden forges', () => {
  test('a paused forge says what still finishes and offers Resume as its primary button', () => {
    const row = rowOf(layoutOf(FLEET_AT_LIMIT).unfolded, TRACKER_IDS.researchWiki);
    expect(tree.textOf([tree.onlyWithClass([row], 'gaia-forges-condition')])).toBe('Paused1 agent finishing · starts no new job');
    expect(PackageButtons.emphasisOf(controlNamed([row], 'Resume'))).toBe('primary');
  });

  test('a hidden forge sits in the folded group under its count, and Show again sends forge-unhide', () => {
    const fleet = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [TRACKER_IDS.designSystem] } };
    const { unfolded, handled } = layoutOf(fleet);
    const group = tree.onlyHostElementIn(unfolded, (element) => element.tag === 'details');
    expect(group.props['open']).toBeUndefined();
    expect(tree.textOf([tree.onlyWithClass([group], 'gaia-forges-hidden-summary')])).toBe('Hidden in Gaia · 1');
    expect(rowsIn(unfolded).some((row) => tree.hostElementsIn([row], (element) => element.props['id'] === forgeAnchorIdOf(TRACKER_IDS.designSystem)).length > 0)).toBe(false);
    tree.dispatch(controlNamed([group], 'Show again'), 'onClick');
    expect(handled.commands).toEqual([{ kind: 'forge-unhide', trackerId: TRACKER_IDS.designSystem }]);
  });
});

describe('Flint\'s brain on A4 (acceptance 2)', () => {
  test('a running brain\'s mark follows its forge\'s name: the diamond, BRAIN and the time left, read as one sentence', () => {
    const storefront = rowOf(layoutOf(FLEET_FIVE_FORGES).unfolded, TRACKER_IDS.exampleStorefront);
    const nameLine = tree.onlyWithClass([storefront], 'gaia-forges-forge-name-line');
    const brain = tree.onlyWithClass([nameLine], 'gaia-forges-brain');
    expect(tree.textOf([tree.onlyWithClass([brain], 'gaia-visually-hidden')])).toBe('Flint\'s brain is running, 1:24 left, outside the agent limit');
    const mark = tree.onlyWithClass([brain], 'gaia-forges-brain-mark');
    expect([mark.props['aria-hidden'], tree.textOf([mark])]).toEqual(['true', 'Brain1:24']);
    expect(tree.hostElementsIn([mark], DrawnDots.isDot).map(DrawnDots.roleOf)).toEqual(['brain']);
  });

  test('no other row carries the mark, and with the brain ended, refused, off or not reported none does', () => {
    expect(tree.hostElementsIn(layoutOf(FLEET_FIVE_FORGES).unfolded, tree.withClass('gaia-forges-brain'))).toHaveLength(1);
    for (const brain of [FLEET_FIVE_FORGES_BRAINS.ended, FLEET_FIVE_FORGES_BRAINS.refused, FLEET_FIVE_FORGES_BRAINS.off, 'not-reported' as const]) {
      const fleet = { ...FLEET_FIVE_FORGES, forges: FLEET_FIVE_FORGES.forges.map((forge) => (forge.trackerId === TRACKER_IDS.exampleStorefront ? { ...forge, brain } : forge)) };
      expect(tree.hostElementsIn(layoutOf(fleet).unfolded, tree.withClass('gaia-forges-brain'))).toEqual([]);
    }
  });

  test('the machine panel ends with the brain\'s line beside the diamond, while its figure stays 10 / 12', () => {
    const panel = tree.onlyWithClass(layoutOf(FLEET_FIVE_FORGES).unfolded, 'gaia-forges-machine');
    const line = tree.onlyWithClass([panel], 'gaia-forges-machine-brain');
    expect(tree.textOf([line])).toBe('Flint\'s brain runs outside this limit. 1 is running now, in Example Storefront, and takes no agent slot.');
    expect(tree.hostElementsIn([line], DrawnDots.isDot).map(DrawnDots.roleOf)).toEqual(['brain']);
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-forges-machine-agents')])).toBe('10 / 12agents');
  });

  test('with no forge reporting a brain the panel has no brain line', () => {
    const noBrain = { ...FLEET_FIVE_FORGES, forges: FLEET_FIVE_FORGES.forges.map((forge) => ({ ...forge, brain: 'not-reported' as const })) };
    expect(tree.hostElementsIn(layoutOf(noBrain).unfolded, tree.withClass('gaia-forges-machine-brain'))).toEqual([]);
  });
});

describe('this machine (A4 acceptance 2 and 3)', () => {
  test('a limit above the CPU count cannot be chosen: plus is off at the CPU count, minus sends one less', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const panel = tree.onlyWithClass(unfolded, 'gaia-forges-machine');
    expect(controlNamed([panel], 'Raise the machine\'s agent limit').props['disabled']).toBe(true);
    tree.dispatch(controlNamed([panel], 'Lower the machine\'s agent limit'), 'onClick');
    expect(handled.commands).toEqual([{ kind: 'machine-agent-limit-set', limit: 11 }]);
  });

  test('the forge\'s refusal of a limit shows in the panel when it comes anyway', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(ABOVE_THE_CPUS))]);
    await sender.send({ kind: 'machine-agent-limit-set', limit: 13 });
    const panel = tree.onlyWithClass(layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).unfolded, 'gaia-forges-machine');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-refusal-text')])).toBe(
      'The forge refused Set the machine\'s agent limit: machine-agent-limit-above-cpus. The machine limit is at most the 12 CPUs of this machine.',
    );
  });

  test('without F6 the panel says no limit is enforced, shows no limit and offers no control that sets one', () => {
    const withoutF6 = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    const panel = tree.onlyWithClass(layoutOf(withoutF6).unfolded, 'gaia-forges-machine');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-forges-machine-sentence')])).toBe('This forge version does not enforce a machine limit.');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-forges-machine-limit')])).toBe('Agent limit—');
    expect(tree.hostElementsIn([panel], (element) => element.tag === 'button' && /agent limit/.test(String(element.props['aria-label'])))).toEqual([]);
    expect(tree.hostElementsIn([panel], tree.withClass('design-system-fill-meter'))).toEqual([]);
  });

  test('at its limit the panel is marked and names the ready tickets that wait for a slot', () => {
    const panel = tree.onlyWithClass(layoutOf(FLEET_AT_LIMIT).unfolded, 'gaia-forges-machine');
    expect(panel.props['data-at-the-limit']).toBe('');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-forges-machine-at-the-limit')])).toBe(
      'The machine is at its limit. 3 ready tickets wait for a slot: 2 in Invoice Service, 1 in Research Wiki.',
    );
  });
});
