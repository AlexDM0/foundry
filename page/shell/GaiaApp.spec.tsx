/**
 * The shell's root. What matters (SCREENS "The shell"): a forge that joins or leaves the registry joins or leaves the rail from the fleet
 * source's next document, with no reload; with no forge registered the rail says "No forge is registered" and its slot meter is all free;
 * the route's row is the active one; Tab meets every control in visual order, the brand bar from its home link to the theme button, the
 * rail top to bottom, then the view's buttons in its page title, and every control, an icon-only one included, has a name. Also: the route
 * is read from the fragment and its view draws its page title under the brand bar, the settings' theme choice shows on the theme button
 * from the first document, named after the next choice, and a forge in place (B1) has no theme button. And (W4.3): a lost event stream
 * shows the connection banner under the page title and disables every control until the stream opens again. And (W5.2): the Agents route
 * shows the Agents view under its page title and figures, its selected agent survives the source's next document, and a filter press goes
 * to the fragment that keeps it.
 *
 * `GaiaApp` is rendered with React's own server renderer, which runs its hooks without a document, so the specs read the markup it
 * would paint for the source's current document; `GaiaShell` takes no hooks and unfolds to its host elements.
 */
import { describe, expect, test } from 'bun:test';
import { Button }                 from 'design-system/Button';
import { IconButton }             from 'design-system/IconButton';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument, FleetDocumentForge }                                   from '../@types/FleetDocument.ts';
import { CommandSender }                                                            from '../api/CommandSender.ts';
import type { FleetStreamState }                                                    from '../api/FleetStreamClient.ts';
import { OpenInNewTabGlyph }                                                        from '../design-system/OpenInNewTabGlyph.tsx';
import { TextField }                                                                from '../design-system/TextField.tsx';
import { GaiaStylesheet }                                                           from '../testing/GaiaStylesheet.ts';
import { type HostElement, ReactElementTree }                                       from '../testing/ReactElementTree.ts';
import { forgeFrameSurroundingsAt, shellSurroundingsAt }                            from '../testing/ShellSurroundingsAt.ts';
import { FLEET_EMPTY }                                                              from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../testing/fixtures/fleet-five-forges.ts';
import { createFleetSource, type FleetSource }                                      from './FleetSource.ts';
import {
  GaiaApp,
  type GaiaAppProps,
  GaiaShell,
  viewPartsOf,
} from './GaiaApp.tsx';
import { DEFAULT_ROUTE, HashRouter } from './HashRouter.ts';

const tree = ReactElementTree;

const TRACKER_IDS = FLEET_FIVE_FORGES_TRACKER_IDS;

const LIVE_STREAM = { state: (): FleetStreamState => 'live', subscribe: () => () => undefined };

const SENDER_OF_NOTHING = CommandSender.create({
  sendRequest:    () => Promise.reject(new Error('The shell sends no command by itself.')),
  controlsMayAct: () => true,
});

const NEWLY_REGISTERED: FleetDocumentForge = {
  ...FLEET_FIVE_FORGES.forges[0] as FleetDocumentForge,
  trackerId: 'example-newsletter-5a17',
  project:   'Example Newsletter',
  root:      '/Users/alexexample/development/example-newsletter',
  attention: [],
};

function appAt(fleetSource: FleetSource, fragment: string, fleetStream: GaiaAppProps['fleetStream'] = LIVE_STREAM, storedThemeChoice: string | null = null) {
  return <GaiaApp fleetSource={fleetSource} fleetStream={fleetStream} commandSender={SENDER_OF_NOTHING} surroundings={shellSurroundingsAt(fragment, storedThemeChoice)} />;
}

/** The labels of the rail's forge rows in the markup, in order: every rail row after the four views. */
function railForgeProjectsIn(markup: string): string[] {
  return [...markup.matchAll(/class="gaia-rail-row-label">([^<]*)</g)].map(([, label = '']) => label).slice(4);
}

function railForgesCountIn(markup: string): string | undefined {
  return /href="#forges"[^>]*><span class="gaia-rail-row-label">Forges<\/span><span class="gaia-rail-count"><span class="design-system-count-badge"[^>]*>(\d+)</.exec(markup)?.[1];
}

function pageTitleIn(markup: string): string | undefined {
  return /<h1 class="design-system-text" data-type-role="display">([^<]*)<\/h1>/.exec(markup)?.[1];
}

function themeButtonNameIn(markup: string): string | undefined {
  return /<button type="button" class="design-system-icon-button" aria-label="(Theme: [^"]*)"/.exec(markup)?.[1];
}

function isFocusable(element: HostElement): boolean {
  const { tabIndex } = element.props;
  if (typeof tabIndex === 'number') return tabIndex >= 0;
  if (element.tag === 'a') return typeof element.props['href'] === 'string';
  return ['button', 'input', 'select', 'textarea'].includes(element.tag) && element.props['disabled'] !== true;
}

function accessibleNameOf(element: HostElement): string {
  const label = element.props['aria-label'];
  return typeof label === 'string' ? label : tree.textOf([element]);
}

describe('a forge joins or leaves the rail without a reload', () => {
  test('the next document from the fleet source adds a newly registered forge to the rail and the Forges count', () => {
    const source = createFleetSource();
    const app = appAt(source, '#attention');
    source.publish(FLEET_FIVE_FORGES);
    const before = renderToStaticMarkup(app);
    source.publish({ ...FLEET_FIVE_FORGES, forges: [...FLEET_FIVE_FORGES.forges, NEWLY_REGISTERED] });
    const after = renderToStaticMarkup(app);
    const registeredBefore = ['Example Storefront', 'Invoice Service', 'Research Wiki', 'Example Mobile App', 'Design System', 'Legacy Importer'];
    expect(railForgeProjectsIn(before)).toEqual(registeredBefore);
    expect(railForgeProjectsIn(after)).toEqual([...registeredBefore, 'Example Newsletter']);
    expect([railForgesCountIn(before), railForgesCountIn(after)]).toEqual(['6', '7']);
  });

  test('a forge that leaves the registry leaves the rail, and the last one leaving empties the forge rows', () => {
    const source = createFleetSource();
    const app = appAt(source, '#forges');
    source.publish({ ...FLEET_FIVE_FORGES, forges: FLEET_FIVE_FORGES.forges.filter((forge) => forge.trackerId !== TRACKER_IDS.legacyImporter) });
    expect(railForgeProjectsIn(renderToStaticMarkup(app))).not.toContain('Legacy Importer');
    source.publish(FLEET_EMPTY);
    const emptied = renderToStaticMarkup(app);
    expect(railForgeProjectsIn(emptied)).toEqual([]);
    expect(railForgesCountIn(emptied)).toBe('0');
  });

  test('before any document the shell already shows its brand bar, its rail and the view\'s page title, with no count and no pill', () => {
    const markup = renderToStaticMarkup(appAt(createFleetSource(), ''));
    expect(markup).toContain('<header class="gaia-brand-bar">');
    expect(pageTitleIn(markup)).toBe('Attention');
    expect(markup).not.toContain('gaia-rail-count');
    expect(markup).not.toContain('design-system-state-badge');
  });
});

describe('the route and the theme', () => {
  test('the fragment chooses the view: it draws its page title and its rail row is the one active row', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    const onAgents = renderToStaticMarkup(appAt(source, '#agents'));
    expect(pageTitleIn(onAgents)).toBe('Agents');
    expect(onAgents).toMatch(/href="#agents" aria-current="page"/);
    expect(onAgents.match(/aria-current="page"/g)).toHaveLength(1);
    const inPlace = renderToStaticMarkup(appAt(source, `#forge/${TRACKER_IDS.invoiceService}/#questions/E4`));
    expect(pageTitleIn(inPlace)).toBeUndefined();
    expect(inPlace).toContain('<h1 class="gaia-forge-frame-bar-name">Invoice Service</h1>');
    expect(inPlace).toMatch(new RegExp(`href="#forge/${TRACKER_IDS.invoiceService}" aria-current="page"`));
  });

  test('the theme button shows on every view, named after the next choice, but a forge in place (B1), whose route has none', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    for (const fragment of ['#attention', '#agents', '#activity', '#forges']) {
      expect(themeButtonNameIn(renderToStaticMarkup(appAt(source, fragment)))).toBe('Theme: dark. Switch to auto');
    }
    const inPlace = renderToStaticMarkup(appAt(source, `#forge/${TRACKER_IDS.exampleStorefront}/#questions/E2`));
    expect(inPlace).toContain('<header class="gaia-brand-bar">');
    expect(themeButtonNameIn(inPlace)).toBeUndefined();
    expect(inPlace).not.toContain('class="gaia-theme-glyph"');
  });

  test('the brand bar shows the fleet\'s pill and sentence on every route', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    for (const fragment of ['#attention', '#forges', `#forge/${TRACKER_IDS.exampleStorefront}`]) {
      const markup = renderToStaticMarkup(appAt(source, fragment));
      expect(markup).toMatch(/data-state-tone="accent"[^>]*data-pulsing=""[^>]*>.*?4 forges running</);
      expect(markup).toContain('<span class="gaia-brand-bar-sentence">1 holds its launches · 1 dormant · 1 repository missing</span>');
    }
  });

  test('#activity shows its page title and lead before a document holds, and the Activity view under them once one does, inside the controls\' fieldset', () => {
    const source = createFleetSource();
    const app = appAt(source, '#activity');
    const lead = 'The newest 50 entries of each forge, as each forge words them.';
    const beforeTheDocument = renderToStaticMarkup(app);
    expect(pageTitleIn(beforeTheDocument)).toBe('Activity');
    expect(beforeTheDocument).toContain(`data-type-role="lead" data-ink="muted">${lead}</p>`);
    expect(beforeTheDocument).not.toContain('class="gaia-activity"');
    source.publish(FLEET_FIVE_FORGES);
    const markup = renderToStaticMarkup(app);
    expect(pageTitleIn(markup)).toBe('Activity');
    expect(markup).toContain(`data-type-role="lead" data-ink="muted">${lead}</p>`);
    const fieldsetAt = markup.indexOf('<fieldset class="gaia-shell-controls">');
    expect(fieldsetAt).toBeGreaterThan(-1);
    expect(markup.indexOf('aria-labelledby="gaia-activity-kind-label"')).toBeGreaterThan(fieldsetAt);
    expect(markup.indexOf('aria-labelledby="gaia-activity-kind-label"')).toBeLessThan(markup.indexOf('</fieldset>'));
  });

  test('the theme button shows the stored choice before the first document, and the settings\' choice from it on', () => {
    const source = createFleetSource();
    const app = appAt(source, '#attention', LIVE_STREAM, 'light');
    expect(themeButtonNameIn(renderToStaticMarkup(app))).toBe('Theme: light. Switch to dark');
    source.publish(FLEET_FIVE_FORGES);
    expect(themeButtonNameIn(renderToStaticMarkup(app))).toBe('Theme: dark. Switch to auto');
  });
});

describe('the rail with no forge registered (B4)', () => {
  test('says "No forge is registered", lists no forge, and its slot meter shows a free slot for each of the 12 CPUs', () => {
    const source = createFleetSource();
    source.publish(FLEET_EMPTY);
    const markup = renderToStaticMarkup(appAt(source, '#attention'));
    expect(markup).toContain('<p class="gaia-rail-no-forge">No forge is registered</p>');
    expect(railForgeProjectsIn(markup)).toEqual([]);
    expect(markup.match(/class="design-system-slot-meter-cell" data-cell="empty"/g)).toHaveLength(12);
    expect(markup).not.toContain('data-cell="filled"');
    expect(markup).toMatch(/data-dot-shape="ring"[^>]*>.*?No forge registered</);
  });
});

describe('Tab and names', () => {
  const OPEN_IN_NEW_TAB_LABEL = 'Open Example Storefront in a new tab';
  const OPEN_IN_NEW_TAB = <IconButton drawing={<OpenInNewTabGlyph />} accessibleName={OPEN_IN_NEW_TAB_LABEL} title={OPEN_IN_NEW_TAB_LABEL} onPress={() => undefined} />;

  function unfoldedShell(fleetDocument: FleetDocument) {
    return tree.unfolded(
      <GaiaShell
        fleetDocument={fleetDocument}
        streamState="live"
        route={DEFAULT_ROUTE}
        view={{
          title: 'Attention', lead: 'What waits on you.', figures: [], actions: OPEN_IN_NEW_TAB, content: null
        }}
        themeChoice="dark"
        onThemeChoice={() => undefined}
      />,
    );
  }

  test('Tab meets the brand bar from its home link to the theme button, the rail top to bottom, then the view\'s buttons', () => {
    const focusable = tree.hostElementsIn(unfoldedShell(FLEET_FIVE_FORGES), isFocusable);
    expect(focusable.map(accessibleNameOf)).toEqual([
      'Gaia, Attention',
      'Theme: dark. Switch to auto',
      'Attention5',
      'Agents10',
      'Activity',
      'Forges6',
      'Example Storefront2',
      'Invoice Service2',
      'Research Wiki1',
      'Example Mobile App',
      'Design System',
      'Legacy Importer',
      'This machine10 / 12agentslimit 12 of 12 CPUs · Flint\'s brain runs outside it',
      'Open Example Storefront in a new tab',
    ]);
  });

  test('the markup order is the visual order: no element jumps the tab order and the stylesheet reorders nothing', () => {
    const elements = tree.hostElementsIn(unfoldedShell(FLEET_FIVE_FORGES));
    expect(elements.filter((element) => typeof element.props['tabIndex'] === 'number' && element.props['tabIndex'] > 0)).toEqual([]);
    const stylesheet = GaiaStylesheet.text();
    expect(stylesheet).not.toMatch(/(?:^|[\s;{])order\s*:/);
    expect(stylesheet).not.toMatch(/(?:row|column|wrap)-reverse/);
    expect(stylesheet).not.toMatch(/(?:^|[\s;{])direction\s*:/);
  });

  test('every control has a name, an icon-only one by its label', () => {
    const focusable = tree.hostElementsIn(unfoldedShell(FLEET_FIVE_FORGES), isFocusable);
    expect(focusable.filter((element) => accessibleNameOf(element).trim() === '')).toEqual([]);
    const iconOnly = focusable.filter((element) => tree.hasClass(element, 'design-system-icon-button'));
    expect(iconOnly.map((element) => [element.props['aria-label'], element.props['title']])).toEqual([
      ['Theme: dark. Switch to auto', 'Theme: dark. Switch to auto'],
      ['Open Example Storefront in a new tab', 'Open Example Storefront in a new tab'],
    ]);
  });
});

describe('a lost stream shows the banner and disables every control', () => {
  const CONTROLS = ['button', 'input', 'select', 'textarea'];

  function streamAt(initialState: FleetStreamState) {
    let state = initialState;
    return {
      state:     () => state,
      subscribe: () => () => undefined,
      change:    (nextState: FleetStreamState) => {
        state = nextState;
      },
    };
  }

  function unfoldedShellAt(streamState: FleetStreamState) {
    return tree.unfolded(
      <GaiaShell
        fleetDocument={FLEET_FIVE_FORGES}
        streamState={streamState}
        route={DEFAULT_ROUTE}
        view={{
          title:   'Forges',
          lead:    'Every forge on this machine.',
          figures: [],
          actions: <Button label="Look again" />,
          content: <><Button label="Stop" /><TextField label="Folder" value="" onChange={() => undefined} /></>,
        }}
        themeChoice="dark"
        onThemeChoice={() => undefined}
      />,
    );
  }

  test('from the error the banner shows right under the page title and the controls\' fieldset is disabled; open again, both are gone', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    const stream = streamAt('live');
    const app = appAt(source, '#forges', stream);
    const live = renderToStaticMarkup(app);
    expect(live).not.toContain('design-system-banner');
    expect(live).toContain('<fieldset class="gaia-shell-controls">');
    stream.change('lost');
    const lost = renderToStaticMarkup(app);
    const bannerUnderThePageTitle = '</header></div><div class="gaia-connection-banner"><div class="design-system-banner" data-tone="error" role="alert"><span>';
    expect(lost).toContain(`${bannerUnderThePageTitle}Gaia&#x27;s server could not be reached. Trying again.</span></div>`);
    expect(lost).toContain('<fieldset class="gaia-shell-controls" disabled="">');
    stream.change('live');
    expect(renderToStaticMarkup(app)).toBe(live);
  });

  test('a page out of date with the server disables the controls too', () => {
    const fieldset = tree.onlyWithTag(unfoldedShellAt('page-out-of-date'), 'fieldset');
    expect(fieldset.props['disabled']).toBe(true);
    expect(tree.hostElementsIn(fieldset.children, tree.withClass('design-system-banner'))).toHaveLength(1);
  });

  test('every control of the shell, the theme button and the view\'s buttons and fields among them, sits in the disabled fieldset; nothing focusable lies outside it', () => {
    const shell = unfoldedShellAt('lost');
    const fieldset = tree.onlyWithTag(shell, 'fieldset');
    expect(fieldset.props['disabled']).toBe(true);
    const everyControl = tree.hostElementsIn(shell, (element) => CONTROLS.includes(element.tag));
    const controlsInTheFieldset = tree.hostElementsIn(fieldset.children, (element) => CONTROLS.includes(element.tag));
    expect(controlsInTheFieldset.map((element) => [element.tag, accessibleNameOf(element)])).toEqual([
      ['button', 'Theme: dark. Switch to auto'],
      ['button', 'Look again'],
      ['button', 'Stop'],
      ['input', ''],
    ]);
    expect(controlsInTheFieldset).toEqual(everyControl);
    const focusableOutside = tree.hostElementsIn(shell, isFocusable).filter((element) => !tree.hostElementsIn([fieldset]).includes(element));
    expect(focusableOutside).toEqual([]);
  });

  test('a live or connecting stream leaves the fieldset enabled and shows no banner', () => {
    for (const streamState of ['live', 'connecting'] as const) {
      const shell = unfoldedShellAt(streamState);
      expect(tree.onlyWithTag(shell, 'fieldset').props['disabled']).toBe(false);
      expect(tree.hostElementsIn(shell, tree.withClass('design-system-banner'))).toEqual([]);
    }
  });
});

describe('the Agents view in the shell', () => {
  const J12_ROUTE = `#agents/${TRACKER_IDS.invoiceService}/J12`;

  test('the Agents route shows A2\'s page title and figures over the view\'s table', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    const markup = renderToStaticMarkup(appAt(source, '#agents'));
    expect(pageTitleIn(markup)).toBe('Agents');
    const figures = [...markup.matchAll(/<span class="gaia-figure-value">([^<]*)<\/span><span class="gaia-figure-label">([^<]*)</g)].map(([, value, label]) => `${value} ${label}`);
    expect(figures).toEqual(['10 / 12 agents', '4 forges', '821,300 tokens in flight']);
    expect(markup).toContain('<div class="gaia-table" role="table" aria-label="Agents">');
  });

  test('before the first document the Agents route shows its page title with no figure and no view', () => {
    const markup = renderToStaticMarkup(appAt(createFleetSource(), '#agents'));
    expect(pageTitleIn(markup)).toBe('Agents');
    expect(markup).not.toContain('gaia-figure');
    expect(markup).not.toContain('gaia-agents');
  });

  test('the selected agent survives the source\'s next document, and the panel says so once its job has ended', () => {
    const source = createFleetSource();
    const app = appAt(source, J12_ROUTE);
    source.publish(FLEET_FIVE_FORGES);
    expect(renderToStaticMarkup(app)).toContain('aria-current="true"');
    source.publish({ ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.map((row) => ({ ...row, tokens: row.tokens + 1 })) });
    const next = renderToStaticMarkup(app);
    expect(next).toMatch(/aria-current="true"><div class="gaia-table-cells"[^>]*><span class="gaia-table-cell"[^>]*><a class="gaia-agents-select"[^>]*>Invoice Service</);
    expect(next).toContain('Open J12 in its forge');
    source.publish({ ...FLEET_FIVE_FORGES, agents: FLEET_FIVE_FORGES.agents.filter((row) => !(row.trackerId === TRACKER_IDS.invoiceService && row.jobId === 'J12')) });
    const ended = renderToStaticMarkup(app);
    expect(ended).not.toContain('aria-current="true"');
    expect(ended).toContain('This agent is no longer running.');
  });

  test('a filter press goes to the Agents fragment holding the new filter and the selected agent', () => {
    const visited: string[] = [];
    const route = HashRouter.routeOf(`${J12_ROUTE}?role=builders`);
    const parts = viewPartsOf(route, FLEET_FIVE_FORGES, {
      readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT),
      timeZone:           'UTC',
      goTo:               (fragment) => visited.push(fragment),
      forgeFrame:         forgeFrameSurroundingsAt(),
    });
    const needsALook = tree.onlyHostElementIn(tree.unfolded(parts.content), (element) => element.tag === 'button' && tree.textOf([element]).startsWith('Needs a look'));
    tree.dispatch(needsALook, 'onClick');
    expect(visited).toEqual([`${J12_ROUTE}?role=builders&condition=needs-a-look`]);
  });
});
