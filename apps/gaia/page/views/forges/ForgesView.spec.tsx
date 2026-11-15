/**
 * The Forges view in the shell, fed by the fleet source as Gaia's event stream feeds it. What matters (SCREENS A4, B4): the page title
 * carries the registered and running counts, Look again and "Add a repository", which goes to `#forges/add`; that route opens the dialog
 * over the view; with no forge registered the table says so and the dialog's "Add and start" is off while no forge program is known; a
 * render reads the source's newest document, so a newly registered forge and a changed setting show; `#forges?forge=` selects that forge's
 * row; the Gaia panel sits under this machine's.
 *
 * `GaiaApp` is rendered with React's own server renderer, which runs the hooks without a document, so each spec reads the markup the page
 * would paint for the source's current document: Gaia's own markup, and a package part or the view's layout only whole, as drawn for the
 * props Gaia hands it.
 */
import { describe, expect, test } from 'bun:test';
import { Button }                 from 'design-system/Button';
import { Switch }                 from 'design-system/Switch';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument }                                                       from '../../@types/FleetDocument.ts';
import { CommandSenderContext }                                                     from '../../api/CommandSender.ts';
import type { FleetStreamState }                                                    from '../../api/FleetStreamClient.ts';
import { createFleetSource, type FleetSource }                                      from '../../shell/FleetSource.ts';
import { GaiaApp }                                                                  from '../../shell/GaiaApp.tsx';
import { senderOver }                                                               from '../../testing/CommandServer.ts';
import { ShellMarkup }                                                              from '../../testing/ShellMarkup.tsx';
import { shellSurroundingsAt }                                                      from '../../testing/ShellSurroundingsAt.ts';
import { FLEET_EMPTY }                                                              from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../../testing/fixtures/fleet-five-forges.ts';
import { ForgesLayout }                                                             from './ForgesLayout.tsx';
import { ForgesModel }                                                              from './ForgesModel.ts';
import { GaiaPanelModel }                                                           from './GaiaPanelModel.ts';

const LIVE_STREAM = { state: (): FleetStreamState => 'live', subscribe: () => () => undefined };

function appAt(fleetSource: FleetSource, fragment: string) {
  return <GaiaApp fleetSource={fleetSource} fleetStream={LIVE_STREAM} commandSender={senderOver([])} surroundings={shellSurroundingsAt(fragment)} />;
}

function sourceHolding(fleetDocument: FleetDocument): FleetSource {
  const source = createFleetSource();
  source.publish(fleetDocument);
  return source;
}

const IDLE_SENDER = senderOver([]);

const doNothing = () => undefined;

/** The view's layout drawn whole for this document with this forge in view, as the view draws it before any command is sent. */
function layoutMarkupWith(fleetDocument: FleetDocument, forgeInView: string | null): string {
  const commandStates = IDLE_SENDER.states();
  const content = ForgesModel.forgesContentOf(fleetDocument, {
    clock: { nowEpochMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), timeZone: 'UTC' }, commandStates, stopDialog: null, forgeInView, lastSent: new Map(),
  });
  const handlers = {
    onCommand:               doNothing,
    onOpenStopDialog:        doNothing,
    onStopChoice:            doNothing,
    onCancelStop:            doNothing,
    onConfirmStop:           doNothing,
    onDismissFailure:        doNothing,
    onDismissRestartPending: doNothing,
    onSettingsCheckbox:      doNothing,
    onOpenWhatNotifies:      doNothing,
  };
  return renderToStaticMarkup(
    <CommandSenderContext value={IDLE_SENDER}>
      <ForgesLayout
        content={content}
        gaiaPanel={GaiaPanelModel.gaiaPanelOf(fleetDocument, { commandStates, sentSettingsChange: null })}
        commandStates={commandStates}
        handlers={handlers}
      />
    </CommandSenderContext>,
  );
}

/** The package's switch as the Gaia panel hands it the start-at-login setting. */
function startAtLoginSwitchMarkup(checked: boolean): string {
  return renderToStaticMarkup(
    <Switch accessibleName="Start the running forges at login" labelledBy="gaia-forges-gaia-start-at-login" checked={checked} disabled={false} onToggle={doNothing} />,
  );
}

const ADD_DIALOG_BODY = '<div class="gaia-forges-add-dialog-body">';

function forgeNamesIn(markup: string): string[] {
  return [...markup.matchAll(/class="gaia-forges-forge-name">([^<]*)</g)].map(([, name = '']) => name);
}

describe('the page title', () => {
  test('carries the counts, Look again and "Add a repository", the view\'s one primary button, which goes to #forges/add, both at full height', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges'));
    const { parts, figures, markup: pageHead } = ShellMarkup.viewPageHeadAt('#forges', FLEET_FIVE_FORGES);
    expect(parts.title).toBe('Forges');
    expect(figures.map(({ value, label }) => `${value} ${label}`)).toEqual(['6 registered', '4 running']);
    expect(ShellMarkup.pageTitleAreaIn(markup)).toBe(pageHead);
    const actions = renderToStaticMarkup(<CommandSenderContext value={IDLE_SENDER}>{parts.actions}</CommandSenderContext>);
    expect(actions).toBe(renderToStaticMarkup(
      <>
        <Button label="Look again" disabled={false} onPress={doNothing} />
        <Button label="Add a repository" emphasis="primary" href="#forges/add" />
      </>,
    ));
    expect(markup).not.toContain(ADD_DIALOG_BODY);
  });
});

describe('the Gaia panel in the view', () => {
  test('shows Gaia\'s settings and facts under this machine, from the document, with "What notifies" closed until asked', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges'));
    expect(markup).toMatch(/<section class="gaia-forges-machine".*<\/section><section class="gaia-forges-gaia" aria-labelledby="gaia-forges-gaia-head">/);
    expect(markup).toContain('Start the running forges at login');
    expect(markup).toContain('0.1.0 on 127.0.0.1:4790');
    expect(markup).not.toContain('gaia-forges-what-notifies-count');
  });

  test('renders the source\'s newest document, with a setting changed elsewhere', () => {
    const source = sourceHolding(FLEET_FIVE_FORGES);
    const app = appAt(source, '#forges');
    expect(renderToStaticMarkup(app)).toContain(startAtLoginSwitchMarkup(false));
    source.publish({ ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, startForgesAtLogin: true } });
    expect(renderToStaticMarkup(app)).toContain(startAtLoginSwitchMarkup(true));
  });
});

describe('the view follows the route and the fleet source', () => {
  test('#forges/add opens the dialog over the table', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges/add'));
    expect(markup.indexOf(ADD_DIALOG_BODY)).toBeGreaterThan(markup.lastIndexOf('class="gaia-forges-forge-name"'));
    expect(forgeNamesIn(markup)).toContain('Example Storefront');
  });

  test('with no forge registered the table says so, and with no forge program the dialog\'s "Add and start" is off', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_EMPTY), '#forges/add'));
    expect(markup).toContain('No forge is registered on this machine yet.');
    expect(markup).toContain(renderToStaticMarkup(<Button label="Add and start" emphasis="primary" disabled onPress={doNothing} />));
    expect(markup).toContain('The forge program was not found.');
  });

  test('renders a newly registered forge from the source\'s newest document', () => {
    const source = sourceHolding(FLEET_EMPTY);
    const app = appAt(source, '#forges');
    expect(forgeNamesIn(renderToStaticMarkup(app))).toEqual([]);
    source.publish(FLEET_FIVE_FORGES);
    expect(forgeNamesIn(renderToStaticMarkup(app))).toEqual(['Example Storefront', 'Invoice Service', 'Research Wiki', 'Example Mobile App', 'Design System', 'Legacy Importer']);
  });

  test('#forges?forge= selects that forge\'s row', () => {
    const { researchWiki } = FLEET_FIVE_FORGES_TRACKER_IDS;
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), `#forges?forge=${researchWiki}`));
    expect(markup).toContain(`<div class="gaia-shell-view">${layoutMarkupWith(FLEET_FIVE_FORGES, researchWiki)}</div>`);
    expect(layoutMarkupWith(FLEET_FIVE_FORGES, researchWiki)).not.toBe(layoutMarkupWith(FLEET_FIVE_FORGES, null));
  });
});
