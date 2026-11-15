/**
 * The Forges view in the shell, fed by the fleet source as Gaia's event stream feeds it. What matters (SCREENS A4, B4): the page title
 * carries the registered and running counts, Look again and "Add a repository", which goes to `#forges/add`; that route opens the dialog
 * over the view; with no forge registered the table says so and the dialog's "Add and start" is off while no forge program is known; a
 * render reads the source's newest document, so a newly registered forge and a changed setting show; `#forges?forge=` selects that forge's
 * row; the Gaia panel sits under this machine's.
 *
 * `GaiaApp` is rendered with React's own server renderer, which runs the hooks without a document, so each spec reads the markup the page
 * would paint for the source's current document.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument }                               from '../../@types/FleetDocument.ts';
import type { FleetStreamState }                            from '../../api/FleetStreamClient.ts';
import { createFleetSource, type FleetSource }              from '../../shell/FleetSource.ts';
import { GaiaApp }                                          from '../../shell/GaiaApp.tsx';
import { senderOver }                                       from '../../testing/CommandServer.ts';
import { shellSurroundingsAt }                              from '../../testing/ShellSurroundingsAt.ts';
import { FLEET_EMPTY }                                      from '../../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS } from '../../testing/fixtures/fleet-five-forges.ts';

const LIVE_STREAM = { state: (): FleetStreamState => 'live', subscribe: () => () => undefined };

function appAt(fleetSource: FleetSource, fragment: string) {
  return <GaiaApp fleetSource={fleetSource} fleetStream={LIVE_STREAM} commandSender={senderOver([])} surroundings={shellSurroundingsAt(fragment)} />;
}

function sourceHolding(fleetDocument: FleetDocument): FleetSource {
  const source = createFleetSource();
  source.publish(fleetDocument);
  return source;
}

function forgeNamesIn(markup: string): string[] {
  return [...markup.matchAll(/class="gaia-forges-forge-name">([^<]*)</g)].map(([, name = '']) => name);
}

describe('the page title', () => {
  test('carries the counts, Look again and "Add a repository", the view\'s one primary button, which goes to #forges/add, both at full height', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges'));
    expect(markup).toContain('<h1 class="design-system-text" data-type-role="display">Forges</h1>');
    const figures = [...markup.matchAll(/<span class="gaia-figure-value">([^<]*)<\/span><span class="gaia-figure-label">([^<]*)</g)].map(([, value, label]) => `${value} ${label}`);
    expect(figures).toEqual(['6 registered', '4 running']);
    const actions = /<div class="gaia-page-title-actions">(.*?)<\/div><\/header>/.exec(markup)?.[1] ?? '';
    expect(actions).toBe(
      '<button type="button" class="design-system-button">Look again</button><a class="design-system-button" href="#forges/add" data-primary="">Add a repository</a>',
    );
    expect(markup).not.toContain('<dialog');
  });
});

describe('the Gaia panel in the view', () => {
  test('shows Gaia\'s settings and facts under this machine, from the document, with "What notifies" closed until asked', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges'));
    expect(markup).toMatch(/<section class="gaia-forges-machine".*<\/section><section class="gaia-forges-gaia" aria-labelledby="gaia-forges-gaia-head">/);
    expect(markup).toContain('Start the running forges at login');
    expect(markup).toContain('0.1.0 on 127.0.0.1:4790');
    expect(markup).not.toContain('<dialog');
  });

  test('renders the source\'s newest document, with a setting changed elsewhere', () => {
    const source = sourceHolding(FLEET_FIVE_FORGES);
    const app = appAt(source, '#forges');
    const tickedStartAtLogin = /<button class="design-system-switch" type="button" role="switch" aria-checked="true" aria-labelledby="gaia-forges-gaia-start-at-login">/;
    const startAtLoginIsTicked = () => tickedStartAtLogin.test(renderToStaticMarkup(app));
    expect(startAtLoginIsTicked()).toBe(false);
    source.publish({ ...FLEET_FIVE_FORGES, settings: { ...FLEET_FIVE_FORGES.settings, startForgesAtLogin: true } });
    expect(startAtLoginIsTicked()).toBe(true);
  });
});

describe('the view follows the route and the fleet source', () => {
  test('#forges/add opens the dialog over the table', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges/add'));
    const dialogTitledByItsHeading = /<dialog class="design-system-dialog" aria-modal="true" aria-labelledby="([^"]+)".*<h2 id="\1" class="design-system-dialog-title">/;
    expect(markup).toMatch(dialogTitledByItsHeading);
    expect(markup).toContain('class="design-system-dialog-title">Add a repository</h2>');
    expect(forgeNamesIn(markup)).toContain('Example Storefront');
  });

  test('with no forge registered the table says so, and with no forge program the dialog\'s "Add and start" is off', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_EMPTY), '#forges/add'));
    expect(markup).toContain('No forge is registered on this machine yet.');
    expect(markup).toMatch(/<button type="button" class="design-system-button" disabled="" data-primary="">Add and start<\/button>/);
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
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), `#forges?forge=${FLEET_FIVE_FORGES_TRACKER_IDS.researchWiki}`));
    const selectedRows = [...markup.matchAll(/aria-current="true">.*?id="gaia-forges-forge-([^"]*)"/g)].map(([, trackerId = '']) => trackerId);
    expect(selectedRows).toEqual([FLEET_FIVE_FORGES_TRACKER_IDS.researchWiki]);
  });
});
