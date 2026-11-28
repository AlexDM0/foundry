/**
 * The setup bar of a forge whose board is in setup: the step bar or the repository's path, the condition's word only while not live, and one
 * quiet menu of the rare controls, a control that cannot act left out and a newer installed version marked; every command goes to the handler.
 */
import { describe, expect, test } from 'bun:test';

import type { CommandBody }                                                      from '../../@types/CommandDocument.ts';
import type { FleetDocumentForge, FleetDocumentRunningVersions }                 from '../../@types/FleetDocument.ts';
import { ConfirmStrip, Menu, type MenuItemProps }                                from '../../lib/design-system/DesignSystemInterface.ts';
import { PackageButtons }                                                        from '../../testing/PackageButtons.ts';
import { type HostElement, ReactElementTree }                                    from '../../testing/ReactElementTree.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_READINGS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import {
  ForgeActionsMenu,
  type ForgeActionsMenuProps,
  ForgeSetupBarContent,
  ForgeSetupStepRow
} from './ForgeLayout.tsx';
import { type ForgeBar, ForgeModel } from './ForgeModel.ts';

const tree = ReactElementTree;

const CLOCK = { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' };

const RUNNING_CODE = '3f9a2c1';

const INSTALLED_CODE = '7d4e1b0';

const RUNS_THE_INSTALLED_CODE: FleetDocumentRunningVersions = {
  hephaestusRunning: RUNNING_CODE,
  hephaestusNewest:  RUNNING_CODE,
  talosRunning:      { protocolVersion: 2, codeVersion: RUNNING_CODE },
  talosNewest:       2,
};

const STOREFRONT: FleetDocumentForge = { ...FLEET_FIVE_FORGES_READINGS.exampleStorefront, runningVersions: RUNS_THE_INSTALLED_CODE };

function barOf(forge: FleetDocumentForge = STOREFRONT): ForgeBar {
  const { bar } = ForgeModel.forgeContentOf(forge.trackerId, { ...FLEET_FIVE_FORGES, forges: [forge] }, CLOCK);
  if (bar === null) throw new Error('The forge has no bar.');
  return bar;
}

function menuOf(overrides: Partial<ForgeActionsMenuProps> = {}) {
  const sent: CommandBody[] = [];
  const events: string[] = [];
  const props: ForgeActionsMenuProps = {
    bar:               barOf(),
    commandIsOnItsWay: false,
    stopIsOpen:        false,
    stopAnchorRef:     { current: null },
    stopAgents:        'keep',
    onCommand:         (command) => sent.push(command),
    onOpenStop:        () => events.push('open stop'),
    onChooseStop:      (agents) => events.push(`choose ${agents}`),
    onCancelStop:      () => events.push('cancel stop'),
    updateStep:        { step: 'idle' },
    onDismissUpdate:   () => events.push('dismiss update'),
    onOpenInNewTab:    () => events.push('open in new tab'),
    menuIsOpen:        true,
    onMenuOpenChange:  (isOpen) => events.push(isOpen ? 'open menu' : 'close menu'),
    ...overrides,
  };
  const unfolded = tree.unfolded(<ForgeActionsMenu {...props} />);
  return {
    unfolded, menu: tree.onlyOfComponent(unfolded, Menu), sent, events
  };
}

function itemsIn(nodes: ReturnType<typeof tree.unfolded>): HostElement[] {
  return tree.hostElementsIn(nodes, tree.withTag('MenuItem'));
}

function itemNamed(nodes: ReturnType<typeof tree.unfolded>, label: string): MenuItemProps {
  const item = itemsIn(nodes).find((element) => element.props['label'] === label);
  if (item === undefined) throw new Error(`No menu item ${label}.`);
  return item.props as unknown as MenuItemProps;
}

function labelsIn(nodes: ReturnType<typeof tree.unfolded>): unknown[] {
  return itemsIn(nodes).map((item) => item.props['label']);
}

describe('what the setup bar knows of the forge', () => {
  test('a live forge says no condition, with its repository from the home folder', () => {
    expect([barOf().conditionIsLive, barOf().root]).toEqual([true, '~/development/example-storefront']);
  });

  test('a paused, held, restarting or unreachable forge says its condition', () => {
    expect([
      barOf({ ...STOREFRONT, condition: 'paused' }).conditionIsLive,
      barOf({ ...STOREFRONT, condition: 'held' }).conditionIsLive,
      barOf({ ...STOREFRONT, condition: 'restarting' }).conditionIsLive,
      barOf({ ...STOREFRONT, condition: 'unreachable', fidelity: 'unreachable' }).conditionIsLive,
    ]).toEqual([false, false, false, false]);
  });
});

describe('what the setup bar shows after the name', () => {
  test('the setup\'s step bar once a setup record walks its steps', () => {
    const stepBar = <ol aria-label="Example steps" />;
    const unfolded = tree.unfolded(<ForgeSetupBarContent stepBar={stepBar} root="~/development/example-storefront" condition={null} />);
    expect(tree.onlyWithClass(unfolded, 'gaia-forge-frame-bar-setup').children).toEqual(tree.unfolded(stepBar));
    expect(tree.textOf(unfolded)).not.toContain('example-storefront');
  });

  test('the repository\'s path before a setup record opens', () => {
    const unfolded = tree.unfolded(<ForgeSetupBarContent stepBar={null} root="~/development/example-storefront" condition={null} />);
    expect(tree.textOf([tree.onlyWithClass(unfolded, 'gaia-forge-frame-bar-root')])).toBe('~/development/example-storefront');
  });

  test('the condition\'s word after the steps while the forge is not live, and none while it is', () => {
    const paused = barOf({ ...STOREFRONT, condition: 'paused' });
    const unfolded = tree.unfolded(<ForgeSetupBarContent stepBar={null} root={paused.root} condition={paused.status} />);
    const condition = tree.onlyWithClass(unfolded, 'gaia-forge-frame-bar-condition');
    expect([condition.props['title'], tree.textOf([tree.onlyWithClass([condition], 'gaia-forge-frame-bar-word')])]).toEqual([paused.status.text, paused.status.word]);
    expect(tree.hostElementsIn(tree.unfolded(<ForgeSetupBarContent stepBar={null} root={paused.root} condition={null} />), tree.withClass('gaia-forge-frame-bar-condition')))
      .toEqual([]);
  });

  test('under a whole bar the step bar takes a line of its own, and nothing before a setup record opens', () => {
    const stepBar = <ol aria-label="Example steps" />;
    expect(tree.onlyWithClass(tree.unfolded(<ForgeSetupStepRow stepBar={stepBar} />), 'gaia-forge-frame-setup-row').children).toEqual(tree.unfolded(stepBar));
    expect(tree.unfolded(<ForgeSetupStepRow stepBar={null} />)).toEqual([]);
  });
});

describe('the setup bar\'s one menu', () => {
  test('is one quiet trigger named for the forge, its popover wide enough for Stop\'s question', () => {
    const { menu } = menuOf();
    expect(['label', 'trigger', 'align', 'wide', 'triggerName', 'marked'].map((propName) => menu.props[propName]))
      .toEqual(['Forge actions', 'icon', 'end', true, 'Forge actions of Example Storefront', false]);
  });

  test('offers Open in new tab, Pause, Stop, and the restarts described by whether each runs the installed version', () => {
    const { unfolded } = menuOf();
    expect(labelsIn(unfolded)).toEqual(['Open in new tab', 'Pause', 'Stop', 'Restart Hephaestus', 'Restart Talos']);
    expect([itemNamed(unfolded, 'Restart Hephaestus').description, itemNamed(unfolded, 'Restart Talos').description])
      .toEqual(['Runs the installed code', 'Runs the installed program']);
  });

  test('Open in new tab opens the route and sends nothing; a restart sends its command', () => {
    const { unfolded, sent, events } = menuOf();
    itemNamed(unfolded, 'Open in new tab').onChoose();
    itemNamed(unfolded, 'Restart Hephaestus').onChoose();
    itemNamed(unfolded, 'Restart Talos').onChoose();
    expect(events).toEqual(['open in new tab']);
    expect(sent).toEqual([{ kind: 'forge-restart', trackerId: STOREFRONT.trackerId }, { kind: 'forge-talos-restart', trackerId: STOREFRONT.trackerId }]);
  });

  test('Stop keeps the menu open and opens its question in its place, whose Stop sends the forge\'s stop', () => {
    const closed = menuOf();
    const stopItem = itemNamed(closed.unfolded, 'Stop');
    stopItem.onChoose();
    expect([stopItem.closing, closed.events, closed.sent]).toEqual(['stays-open', ['open stop'], []]);
    const asking = menuOf({ stopIsOpen: true });
    expect(labelsIn(asking.unfolded)).toEqual(['Open in new tab', 'Pause', 'Restart Hephaestus', 'Restart Talos']);
    expect(tree.onlyOfComponent(asking.unfolded, ConfirmStrip).props['label']).toBe('Stop Example Storefront');
    PackageButtons.press(PackageButtons.onlyLabelled(asking.unfolded, 'Stop'));
    expect(asking.sent).toEqual([{ kind: 'forge-stop', trackerId: STOREFRONT.trackerId, agents: 'keep' }]);
  });

  test('while a command to the forge is on its way only Open in new tab stays', () => {
    expect(labelsIn(menuOf({ commandIsOnItsWay: true }).unfolded)).toEqual(['Open in new tab']);
  });

  test('a forge not answering offers no restart', () => {
    expect(labelsIn(menuOf({ bar: barOf({ ...STOREFRONT, runningVersions: null }) }).unfolded)).toEqual(['Open in new tab', 'Pause', 'Stop']);
  });

  test('a paused forge offers Unpause, which sends the forge\'s unpause', () => {
    const { unfolded, sent } = menuOf({ bar: barOf({ ...STOREFRONT, condition: 'paused' }) });
    expect(labelsIn(unfolded)).toEqual(['Open in new tab', 'Unpause', 'Stop', 'Restart Hephaestus', 'Restart Talos']);
    itemNamed(unfolded, 'Unpause').onChoose();
    expect(sent).toEqual([{ kind: 'forge-unpause', trackerId: STOREFRONT.trackerId }]);
  });

  test('a newer installed version marks the trigger and its restart', () => {
    const { menu, unfolded } = menuOf({ bar: barOf({ ...STOREFRONT, runningVersions: { ...RUNS_THE_INSTALLED_CODE, hephaestusNewest: INSTALLED_CODE } }) });
    expect([menu.props['marked'], itemNamed(unfolded, 'Restart Hephaestus').marked]).toEqual([true, true]);
  });
});
