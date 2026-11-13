/**
 * The Forges view in the shell, fed by the fleet source as Gaia's event stream feeds it. What matters (SCREENS A4, B4): the top bar
 * carries the registered and running counts, Look again and "Add a repository", which goes to `#forges/add`; that route opens the dialog
 * over the view; with no forge registered the table says so and the dialog's "Add and start" is off while no forge program is known; a
 * forge that registers appears without a reload; `#forges?forge=` selects that forge's row.
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

describe('the top bar', () => {
  test('carries the counts, Look again and "Add a repository", the view\'s one primary button, which goes to #forges/add', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges'));
    expect(markup).toContain('<h1 class="gaia-top-bar-title">Forges</h1>');
    expect(markup).toContain('6 registered on this machine · 4 running');
    const actions = /<span class="gaia-top-bar-actions">(.*?)<\/span>/.exec(markup)?.[1] ?? '';
    expect(actions).toMatch(/^<button[^>]*>Look again<\/button><a class="gaia-button" href="#forges\/add" data-emphasis="primary">Add a repository<\/a>$/);
    expect(markup).not.toContain('role="dialog"');
  });
});

describe('the view follows the route and the fleet source', () => {
  test('#forges/add opens the dialog over the table', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_FIVE_FORGES), '#forges/add'));
    expect(markup).toContain('role="dialog" aria-modal="true" aria-label="Add a repository"');
    expect(forgeNamesIn(markup)).toContain('Example Storefront');
  });

  test('with no forge registered the table says so, and with no forge program the dialog\'s "Add and start" is off', () => {
    const markup = renderToStaticMarkup(appAt(sourceHolding(FLEET_EMPTY), '#forges/add'));
    expect(markup).toContain('No forge is registered on this machine yet.');
    expect(markup).toMatch(/<button type="button" class="gaia-button" disabled="" data-emphasis="primary">Add and start<\/button>/);
    expect(markup).toContain('The forge program was not found.');
  });

  test('a forge that registers appears in the table without a reload', () => {
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
