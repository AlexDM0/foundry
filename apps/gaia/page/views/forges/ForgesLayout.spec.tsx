/**
 * The Forges view laid out: the table and its rows, Stop's dialog and the steppers handing the view their commands, refusals with Try again,
 * held banners, hidden forges, and versions pairs opening under their row. The command states come from the real sender over Gaia's server stood
 * in for by authored answers.
 */
import { describe, expect, test } from 'bun:test';

import type {
  CommandAnswerDocument,
  CommandBody,
  ForgeCommandBody,
  ForgeStopAgents
} from '../../@types/CommandDocument.ts';
import type { FleetDocument }                 from '../../@types/FleetDocument.ts';
import type { CommandStates, CommandSubject } from '../../api/CommandSender.ts';
import {
  type ChoiceOptionProps,
  ConfirmStrip,
  DataTable,
  FillMeter,
  IconButton,
  MonoId,
  type NumberStepperProps,
  PendingStep,
  SlotMeter
} from '../../lib/design-system/DesignSystemInterface.ts';
import { answerResponse, senderOver }                                               from '../../testing/CommandServer.ts';
import { DataTableRows }                                                            from '../../testing/DataTableRows.ts';
import { DrawnDots }                                                                from '../../testing/DrawnDots.ts';
import { FailedActions }                                                            from '../../testing/FailedActions.ts';
import { PackageButtons }                                                           from '../../testing/PackageButtons.ts';
import { PackageControls }                                                          from '../../testing/PackageControls.ts';
import { type HostElement, ReactElementTree, type RenderedNode }                    from '../../testing/ReactElementTree.ts';
import { FLEET_AT_LIMIT }                                                           from '../../testing/fixtures/fleet-at-limit.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { FLEET_VERSIONS, FLEET_VERSIONS_TRACKER_IDS }                               from '../../testing/fixtures/fleet-versions.ts';
import { ForgesLayout, forgeAnchorIdOf }                                            from './ForgesLayout.tsx';
import { ForgesModel, type ForgesSurroundings }                                     from './ForgesModel.ts';
import { GaiaPanelModel }                                                           from './GaiaPanelModel.ts';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const IDLE_STATES: CommandStates = senderOver([]).states();

const STOP_REFUSED: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'hephaestus-still-live',
  text:          'Hephaestus did not stop within its tries.',
  forges:        [],
};

const ABOVE_THE_CPUS: CommandAnswerDocument = {
  answerVersion: 3,
  outcome:       'refused',
  refusal:       'machine-agent-limit-above-cpus',
  text:          'The machine limit is at most the 12 CPUs of this machine.',
  forges:        [],
};

interface Handled {
  readonly commands:          CommandBody[];
  readonly stopsOpened:       string[];
  readonly stopChoices:       ForgeStopAgents[];
  readonly stopsCancelled:    number[];
  readonly stopsConfirmed:    ForgeCommandBody[];
  readonly dismissed:         CommandSubject[];
  readonly restartsDismissed: CommandSubject[];
  readonly versionsToggled:   string[];
}

function layoutOf(fleetDocument: FleetDocument, surroundings: Partial<ForgesSurroundings> = {}) {
  const handled: Handled = {
    commands: [], stopsOpened: [], stopChoices: [], stopsCancelled: [], stopsConfirmed: [], dismissed: [], restartsDismissed: [], versionsToggled: []
  };
  const commandStates = surroundings.commandStates ?? IDLE_STATES;
  const content = ForgesModel.forgesContentOf(fleetDocument, {
    clock:            { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' },
    commandStates,
    stopDialog:       null,
    forgeInView:      null,
    lastSent:         new Map(),
    versionsShownFor: null,
    ...surroundings,
  });
  const unfolded = tree.unfolded(
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
        onToggleVersions:        (trackerId) => handled.versionsToggled.push(trackerId),
      }}
    />,
  );
  return { unfolded, handled };
}

function rowsIn(nodes: readonly RenderedNode[]): HostElement[] {
  return DataTableRows.rowsIn(nodes);
}

function rowOf(nodes: readonly RenderedNode[], trackerId: string): HostElement {
  const rows = rowsIn(nodes).filter((row) => tree.hostElementsIn([row], (element) => element.props['id'] === forgeAnchorIdOf(trackerId)).length === 1);
  const [only] = rows;
  if (rows.length !== 1 || only === undefined) throw new Error(`Expected one row for ${trackerId}, found ${rows.length}.`);
  return only;
}

/** The folded number stepper of this name; a press of its lower or raise button is its onChange with the value one step on. */
function stepperNamed(nodes: readonly RenderedNode[], accessibleName: string): NumberStepperProps {
  const stepper = tree.onlyHostElementIn(nodes, (element) => element.tag === 'NumberStepper' && element.props['accessibleName'] === accessibleName);
  return stepper.props as unknown as NumberStepperProps;
}

/** A host control or link, or a package button even one handed no press, by the name a reader hears. */
function controlNamed(nodes: readonly RenderedNode[], name: string): HostElement {
  return tree.onlyHostElementIn(nodes, (element) => (['button', 'a'].includes(element.tag) || PackageControls.isControl(element) || PackageButtons.isButton(element))
    && PackageControls.nameOf(element) === name);
}

/** Presses a control as a reader would: a package button or icon button through the press Gaia handed it, a host one through its click. */
function press(control: HostElement): void {
  tree.dispatch(control, PackageButtons.isButton(control) || tree.withComponent(IconButton)(control) ? 'onPress' : 'onClick');
}

describe('the table (A4)', () => {
  test('sets each row\'s code as a mono id in the pill size', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const codes = rowsIn(unfolded).map((row) => DataTableRows.cellsOf(row)[4]).map((cell) => (cell === undefined ? null : tree.onlyOfComponent([cell], MonoId).props));
    expect(codes.map((code) => [code?.['text'], code?.['size']])).toEqual([
      ['3f9a2c1', 'pill'], ['3f9a2c1', 'pill'], ['3f9a2c1', 'pill'], ['b81e07d', 'pill'], ['3f9a2c1', 'pill'],
    ]);
  });

  test('heads its columns and holds one row per forge whose repository is there, each with its name and root', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const columns = tree.onlyOfComponent(unfolded, DataTable).props['columns'] as readonly { readonly label: string }[];
    expect(columns.map((column) => column.label)).toEqual([
      'Forge', 'Hephaestus', 'Agents', 'Waiting', 'Code', 'Controls',
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
    expect(tree.onlyOfComponent(unfolded, DataTable).props['columnGap']).toBe('narrow');
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
    expect(rowOf(unfolded, TRACKER_IDS.researchWiki).props['selected']).toBe(true);
    expect(rowOf(unfolded, TRACKER_IDS.invoiceService).props['selected']).toBe(false);
  });
});

describe('a row\'s controls', () => {
  test('Stop opens the dialog under its row', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    press(controlNamed([rowOf(unfolded, TRACKER_IDS.invoiceService)], 'Stop'));
    expect(handled.stopsOpened).toEqual([TRACKER_IDS.invoiceService]);
  });

  test('Open is a link to the forge in place', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    expect(controlNamed([rowOf(unfolded, TRACKER_IDS.exampleStorefront)], 'Open').props['href']).toBe(`#forge/${TRACKER_IDS.exampleStorefront}`);
  });

  test('a row\'s limit is the compact stepper led by the agents in flight, "3 /", and the machine\'s the standard one', () => {
    const { unfolded } = layoutOf(FLEET_FIVE_FORGES);
    const row = stepperNamed([rowOf(unfolded, TRACKER_IDS.invoiceService)], 'Invoice Service\'s agent limit');
    const machine = stepperNamed([tree.onlyWithClass(unfolded, 'gaia-forges-machine')], 'The machine\'s agent limit');
    expect([row.compact, row.leadingText, row.disabled, row.value]).toEqual([true, '3 /', false, 5]);
    expect([machine.compact, machine.leadingText]).toEqual([undefined, undefined]);
  });

  test('the stepper sends the forge\'s limit one step down or up', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const stepper = stepperNamed([rowOf(unfolded, TRACKER_IDS.invoiceService)], 'Invoice Service\'s agent limit');
    expect([stepper.lowerLabel, stepper.raiseLabel]).toEqual(['Lower Invoice Service\'s agent limit', 'Raise Invoice Service\'s agent limit']);
    stepper.onChange(stepper.value - stepper.step);
    stepper.onChange(stepper.value + stepper.step);
    expect(handled.commands).toEqual([
      { kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.invoiceService, limit: 4 },
      { kind: 'forge-concurrency-set', trackerId: TRACKER_IDS.invoiceService, limit: 6 },
    ]);
  });

  test('a start on its way leaves one disabled "Starting" button on its row', () => {
    const sender = senderOver([() => new Promise<Response>(() => undefined)]);
    void sender.send({ kind: 'forge-start', trackerId: TRACKER_IDS.designSystem });
    const row = rowOf(layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).unfolded, TRACKER_IDS.designSystem);
    const buttons = PackageButtons.buttonsIn([row]);
    expect(buttons.map((button) => [PackageButtons.labelOf(button), button.props['disabled']])).toEqual([['Starting', true]]);
  });
});

describe('the Stop dialog (B2 acceptance 1)', () => {
  test('hands the view the chosen agents, the cancel and the command its Stop sends', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { stopDialog: { trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' } });
    const dialog = tree.onlyHostElementIn(rowsIn(unfolded), (element) => tree.withComponent(ConfirmStrip)(element) && element.props['label'] === 'Stop Example Storefront');
    expect(['question', 'tone', 'cancelLabel'].map((propName) => dialog.props[propName])).toEqual([
      'Stop Hephaestus of Example Storefront? 4 agents are running.',
      'neutral',
      'Cancel',
    ]);
    const choices = tree.hostElementsIn([dialog], tree.withTag('ChoiceOption')).map((choice) => choice.props as unknown as ChoiceOptionProps);
    expect(choices.map((choice) => [choice.label, choice.chosen, choice.input?.props.type, choice.input?.props.checked, choice.input?.props.name])).toEqual([
      ['Stop Hephaestus only', true, 'radio', true, `gaia-forges-stop-${TRACKER_IDS.exampleStorefront}`],
      ['Stop the agents, then Hephaestus', false, 'radio', false, `gaia-forges-stop-${TRACKER_IDS.exampleStorefront}`],
    ]);
    choices.find((choice) => !choice.chosen)?.input?.props.onChange();
    tree.dispatch(dialog, 'onCancel');
    press(tree.onlyHostElementIn([dialog], (element) => PackageButtons.isButton(element) && PackageButtons.emphasisOf(element) === 'primary'));
    expect(handled.stopChoices).toEqual(['stop-first']);
    expect(handled.stopsCancelled).toEqual([1]);
    expect(handled.stopsConfirmed).toEqual([{ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'keep' }]);
  });

  test('with "Stop the agents, then Hephaestus" chosen, its Stop sends stop-first', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { stopDialog: { trackerId: TRACKER_IDS.exampleStorefront, agents: 'stop-first' } });
    const dialog = tree.onlyHostElementIn(rowsIn(unfolded), (element) => tree.withComponent(ConfirmStrip)(element) && element.props['label'] === 'Stop Example Storefront');
    press(tree.onlyHostElementIn([dialog], (element) => PackageButtons.isButton(element) && PackageButtons.emphasisOf(element) === 'primary'));
    expect(handled.stopsConfirmed).toEqual([{ kind: 'forge-stop', trackerId: TRACKER_IDS.exampleStorefront, agents: 'stop-first' }]);
  });
});

describe('a refusal on a row (B2 acceptance 3)', () => {
  test('shows the forge\'s code and sentence under its row, with Try again and its dismissal', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(STOP_REFUSED))]);
    const stop: ForgeCommandBody = { kind: 'forge-stop', trackerId: TRACKER_IDS.exampleMobileApp, agents: 'keep' };
    await sender.send(stop);
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states(), lastSent: new Map([[TRACKER_IDS.exampleMobileApp, stop]]) });
    const refusal = FailedActions.onlyFailedActionIn([rowOf(unfolded, TRACKER_IDS.exampleMobileApp)]);
    expect(FailedActions.wordsOf(refusal)).toEqual(['The forge refused Stop: ', 'hephaestus-still-live', 'Hephaestus did not stop within its tries.']);
    expect([refusal.props['retryLabel'], refusal.props['dismissLabel']]).toEqual(['Try again', 'Dismiss this refusal']);
    tree.dispatch(refusal, 'onRetry');
    tree.dispatch(refusal, 'onDismiss');
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
    expect(tree.hostElementsIn(rowsIn(unfolded), tree.withClass('gaia-forges-row-notice'))).toHaveLength(1);
  });
});

describe('the held forge and the forges outside the table', () => {
  test('the held forge\'s banner sends Update forge, and the forge not found Hide in Gaia', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const banner = tree.onlyWithClass(unfolded, 'gaia-forges-held');
    expect(tree.textOf([tree.onlyWithClass([banner], 'gaia-forges-held-text')])).toBe(
      'Example Mobile App Launches held. The install version changed. Nothing launches until this forge is updated. Its 2 agents keep running.',
    );
    press(controlNamed([banner], 'Update forge'));
    press(controlNamed(unfolded, 'Hide in Gaia'));
    expect(handled.commands).toEqual([
      { kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp },
      { kind: 'forge-hide', trackerId: TRACKER_IDS.legacyImporter },
    ]);
  });
});

describe('an update that left a restart pending', () => {
  test('the held forge\'s banner says it is updated with a restart pending, and its Restart and dismissal reach the view', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null, forges: []
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() });
    const group = tree.onlyWithClass(unfolded, 'gaia-forges-held-group');
    const pendingStep = tree.onlyOfComponent([group], PendingStep);
    expect([pendingStep.props['word'], pendingStep.props['sentence']]).toEqual(['Updated; restart pending.', 'Its Hephaestus runs the old code until it restarts.']);
    expect(tree.hostElementsIn([rowOf(unfolded, TRACKER_IDS.exampleMobileApp)], tree.withComponent(PendingStep))).toEqual([]);
    press(controlNamed([pendingStep], 'Restart'));
    expect(pendingStep.props['dismissLabel']).toBe('Dismiss the pending restart');
    tree.dispatch(pendingStep, 'onDismiss');
    expect(handled.commands).toEqual([{ kind: 'forge-restart', trackerId: TRACKER_IDS.exampleMobileApp }]);
    expect(handled.restartsDismissed).toEqual([{ trackerId: TRACKER_IDS.exampleMobileApp }]);
  });

  test('with a restart pending on the held forge, Restart is the only primary button of its held area (A4 acceptance 5)', async () => {
    const restartPending: CommandAnswerDocument = {
      answerVersion: 3, outcome: 'restart-pending', refusal: null, text: null, forges: []
    };
    const sender = senderOver([() => Promise.resolve(answerResponse(restartPending))]);
    await sender.send({ kind: 'forge-update', trackerId: TRACKER_IDS.exampleMobileApp });
    const group = tree.onlyWithClass(layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).unfolded, 'gaia-forges-held-group');
    const primaries = tree.hostElementsIn([group], (element) => PackageButtons.isButton(element) && PackageButtons.emphasisOf(element) === 'primary');
    expect(primaries.map(PackageButtons.labelOf)).toEqual(['Restart']);
    expect(PackageButtons.emphasisOf(controlNamed([group], 'Update forge'))).toBe('quiet');
  });

  test('without a pending restart no pending step shows anywhere', () => {
    expect(tree.hostElementsIn(layoutOf(FLEET_FIVE_FORGES).unfolded, tree.withComponent(PendingStep))).toEqual([]);
  });
});

describe('a paused row and the hidden forges', () => {
  test('a paused forge says what still finishes and offers Unpause as its primary button', () => {
    const row = rowOf(layoutOf(FLEET_AT_LIMIT).unfolded, TRACKER_IDS.researchWiki);
    expect(tree.textOf([tree.onlyWithClass([row], 'gaia-forges-condition')])).toBe('Paused1 agent finishing · starts no new job');
    expect(PackageButtons.emphasisOf(controlNamed([row], 'Unpause'))).toBe('primary');
  });

  test('a hidden forge sits in the folded group under its count, and Show again sends forge-unhide', () => {
    const fleet = { ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, hiddenTrackerIds: [TRACKER_IDS.designSystem] } };
    const { unfolded, handled } = layoutOf(fleet);
    const group = tree.onlyHostElementIn(unfolded, (element) => element.tag === 'details');
    expect(group.props['open']).toBeUndefined();
    expect(tree.textOf([tree.onlyWithClass([group], 'gaia-forges-hidden-summary')])).toBe('Hidden in Gaia · 1');
    expect(rowsIn(unfolded).some((row) => tree.hostElementsIn([row], (element) => element.props['id'] === forgeAnchorIdOf(TRACKER_IDS.designSystem)).length > 0)).toBe(false);
    press(controlNamed([group], 'Show again'));
    expect(handled.commands).toEqual([{ kind: 'forge-unhide', trackerId: TRACKER_IDS.designSystem }]);
  });
});

describe('this machine (A4 acceptance 2 and 3)', () => {
  test('a limit above the CPU count cannot be chosen: plus is off at the CPU count, minus sends one less', () => {
    const { unfolded, handled } = layoutOf(FLEET_FIVE_FORGES);
    const stepper = stepperNamed([tree.onlyWithClass(unfolded, 'gaia-forges-machine')], 'The machine\'s agent limit');
    expect([stepper.value, stepper.maximum, stepper.minimum]).toEqual([12, 12, 11]);
    stepper.onChange(stepper.value - stepper.step);
    expect(handled.commands).toEqual([{ kind: 'machine-agent-limit-set', limit: 11 }]);
  });

  test('the forge\'s refusal of a limit shows in the panel when it comes anyway', async () => {
    const sender = senderOver([() => Promise.resolve(answerResponse(ABOVE_THE_CPUS))]);
    await sender.send({ kind: 'machine-agent-limit-set', limit: 13 });
    const panel = tree.onlyWithClass(layoutOf(FLEET_FIVE_FORGES, { commandStates: sender.states() }).unfolded, 'gaia-forges-machine');
    expect(FailedActions.wordsOf(FailedActions.onlyFailedActionIn([panel]))).toEqual([
      'The forge refused Set the machine\'s agent limit: ', 'machine-agent-limit-above-cpus', 'The machine limit is at most the 12 CPUs of this machine.',
    ]);
  });

  test('without F6 the panel says no limit is enforced, shows no limit and offers no control that sets one', () => {
    const withoutF6 = { ...FLEET_FIVE_FORGES, figures: { ...FLEET_FIVE_FORGES.figures, machineLimit: null } };
    const panel = tree.onlyWithClass(layoutOf(withoutF6).unfolded, 'gaia-forges-machine');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-forges-machine-sentence')])).toBe('This forge version does not enforce a machine limit.');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-forges-machine-limit')])).toBe('Agent limit—');
    expect(tree.hostElementsIn([panel], tree.withTag('NumberStepper'))).toEqual([]);
    expect(tree.hostElementsIn([panel], (element) => tree.withComponent(SlotMeter)(element) || tree.withComponent(FillMeter)(element))).toEqual([]);
  });

  test('at its limit the panel is marked and names the ready tickets that wait for a slot', () => {
    const panel = tree.onlyWithClass(layoutOf(FLEET_AT_LIMIT).unfolded, 'gaia-forges-machine');
    expect(panel.props['data-at-the-limit']).toBe('');
    expect(tree.textOf([tree.onlyWithClass([panel], 'gaia-forges-machine-at-the-limit')])).toBe(
      'The machine is at its limit. 3 ready tickets wait for a slot: 2 in Invoice Service, 1 in Research Wiki.',
    );
  });
});

const VERSIONS_IDS = FLEET_VERSIONS_TRACKER_IDS;

function disclosureIn(row: HostElement): HostElement | null {
  const disclosures = tree.hostElementsIn([row], tree.withClass('gaia-forges-versions-disclosure'));
  return disclosures[0] ?? null;
}

function belowOf(row: HostElement): HostElement[] {
  return row.children.filter((child): child is HostElement => typeof child !== 'string' && child.tag === 'DataTableBelow');
}

describe('a forge at another version than this Gaia is built for (U2)', () => {
  test('its disclosure under the condition is named by what it shows and the forge, says whether it is open, and asks the view to show its versions', () => {
    const { unfolded, handled } = layoutOf(FLEET_VERSIONS);
    const disclosure = disclosureIn(rowOf(unfolded, VERSIONS_IDS.exampleBilling));
    expect([disclosure?.tag, disclosure?.props['aria-expanded'], disclosure?.props['aria-label']]).toEqual([
      'button', false, '1.8 · older, Example Billing, its version beside this Gaia’s',
    ]);
    expect(tree.textOf(disclosure === null ? [] : [disclosure])).toBe('1.8 · older');
    if (disclosure !== null) tree.dispatch(disclosure, 'onClick');
    expect(handled.versionsToggled).toEqual([VERSIONS_IDS.exampleBilling]);
    expect(disclosureIn(rowOf(unfolded, VERSIONS_IDS.invoiceService))).toBeNull();
    expect(DataTableRows.cellTextsOf(rowOf(unfolded, VERSIONS_IDS.invoiceService))[1]).toBe('Liveforge 3.1');
  });

  test('the versions shown lie under their row, expanded and not selected, as the pair and its sentence', () => {
    const { unfolded } = layoutOf(FLEET_VERSIONS, { versionsShownFor: VERSIONS_IDS.analyticsSandbox });
    const row = rowOf(unfolded, VERSIONS_IDS.analyticsSandbox);
    expect([row.props['expanded'], row.props['selected'], disclosureIn(row)?.props['aria-expanded']]).toEqual([true, false, true]);
    expect(rowsIn(unfolded).map((candidate) => candidate.props['expanded'])).toEqual([false, false, false, false, true]);
    const shown = tree.onlyWithClass(belowOf(row), 'gaia-forges-versions');
    expect([shown.props['role'], shown.props['aria-label']]).toEqual(['region', 'Analytics Sandbox, its version beside this Gaia’s']);
    expect(tree.hostElementsIn([shown], tree.withClass('gaia-versions-pair'))).toHaveLength(1);
    expect(tree.textOf([tree.onlyWithClass([shown], 'gaia-forges-versions-sentence')])).toBe(
      'Gaia shows that Analytics Sandbox runs. It shows nothing of its work and sends it no command. A newer Gaia shows it here.',
    );
  });

  test('an ahead forge\'s quiet line stands under its row until its pair is shown', () => {
    const quietLineIn = (nodes: readonly RenderedNode[]) => tree.hostElementsIn(belowOf(rowOf(nodes, VERSIONS_IDS.exampleStorefront)), tree.withClass('gaia-forges-quiet-line'));
    expect(quietLineIn(layoutOf(FLEET_VERSIONS).unfolded).map((line) => tree.textOf([line]))).toEqual([
      'Forge 3.4 is ahead of this Gaia, built for 3.1. All Gaia shows works; what 3.4 added shows in its Bridge.',
    ]);
    expect(quietLineIn(layoutOf(FLEET_VERSIONS, { versionsShownFor: VERSIONS_IDS.exampleStorefront }).unfolded)).toEqual([]);
  });

  test('a forge Gaia cannot talk to reads "not read" for its agents and what waits, and a control it cannot send says why in its title', () => {
    const { unfolded } = layoutOf(FLEET_VERSIONS);
    const row = rowOf(unfolded, VERSIONS_IDS.analyticsSandbox);
    expect(DataTableRows.cellTextsOf(row).slice(2, 4)).toEqual(['not read', 'not read']);
    expect(tree.hostElementsIn([row], tree.withClass('gaia-forges-button-title')).map((holder) => holder.props['title'])).toEqual([
      'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.',
      'Analytics Sandbox serves clients built for forge 4.0 and later; this Gaia is built for forge 3.1.',
    ]);
  });

  test('Update forge on its way says so under its row beside a starting ring, and a restart it left pending stands there without an edge', () => {
    const forgeState = (onItsWay: 'forge-update' | null, restartPending: boolean): CommandStates => ({
      forges:       new Map([[VERSIONS_IDS.exampleBilling, { onItsWay, failure: null, restartPending }]]),
      fleet:        new Map(),
      fleetAnswers: new Map(),
    });
    const pending = belowOf(rowOf(layoutOf(FLEET_VERSIONS, { commandStates: forgeState('forge-update', false) }).unfolded, VERSIONS_IDS.exampleBilling));
    const status = tree.onlyWithClass(pending, 'gaia-forges-update-status');
    expect([status.props['role'], tree.textOf([status]), tree.hostElementsIn([status], DrawnDots.isDot).map(DrawnDots.conditionOf)]).toEqual([
      'status', 'Updating the forge…', ['starting'],
    ]);
    const done = belowOf(rowOf(layoutOf(FLEET_VERSIONS, { commandStates: forgeState(null, true) }).unfolded, VERSIONS_IDS.exampleBilling));
    const step = tree.onlyOfComponent(done, PendingStep);
    expect([step.props['sentence'], step.props['edgeless']]).toEqual(['Gaia reads it after the restart.', true]);
  });

  test('this machine prints its figure as a floor and names the forges it leaves out, and the note under the table says what the verdicts mean', () => {
    const { unfolded } = layoutOf(FLEET_VERSIONS);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forges-machine-figure')])).toBe('8+ / 12');
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forges-machine-not-counted')])).toBe(
      'Example Billing and Analytics Sandbox are not counted: this Gaia cannot read their agents.',
    );
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forges-versions-note')])).toStartWith('Each forge states its version');
    expect(tree.hostElementsIn(layoutOf(FLEET_FIVE_FORGES).unfolded, tree.withClass('gaia-forges-versions-note'))).toEqual([]);
  });
});
