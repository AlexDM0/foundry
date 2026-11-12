/**
 * The shell's root. What matters (SCREENS "The shell", acceptance 2 and 4): a forge that joins or leaves the registry joins or leaves the
 * rail from the fleet source's next document, with no reload; Tab meets every control in visual order, the rail top to bottom and then
 * the top bar from its view's buttons to the theme switch, and every control, an icon-only one included, has a name. Also: the route is
 * read from the fragment, and the settings' theme choice shows on the switch from the first document. And (W4.3): a lost event stream
 * shows the connection banner under the top bar and disables every control until the stream opens again. And (W5.2): the Agents route
 * shows the Agents view under its status line, its selected agent survives the source's next document, and a filter press goes to the
 * fragment that keeps it.
 *
 * `GaiaApp` is rendered with React's own server renderer, which runs its hooks without a document, so the specs read the markup it
 * would paint for the source's current document; `GaiaShell` takes no hooks and unfolds to its host elements.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';

import type { FleetDocument, FleetDocumentForge }                                   from '../@types/FleetDocument.ts';
import { CommandSender }                                                            from '../api/CommandSender.ts';
import type { FleetStreamState }                                                    from '../api/FleetStreamClient.ts';
import { Button }                                                                   from '../design-system/Button.tsx';
import { TextField }                                                                from '../design-system/TextField.tsx';
import { GaiaStylesheet }                                                           from '../testing/GaiaStylesheet.ts';
import { type HostElement, ReactElementTree }                                       from '../testing/ReactElementTree.ts';
import { FLEET_EMPTY }                                                              from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES, FLEET_FIVE_FORGES_TRACKER_IDS, FLEET_FIXTURES_READ_AT } from '../testing/fixtures/fleet-five-forges.ts';
import { createFleetSource, type FleetSource }                                      from './FleetSource.ts';
import {
  GaiaApp,
  type GaiaAppProps,
  GaiaShell,
  type ShellSurroundings,
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

function surroundingsAt(fragment: string, storedThemeChoice: string | null = null): ShellSurroundings {
  return {
    hash:  { currentFragment: () => fragment, followFragment: () => () => undefined, goTo: () => undefined },
    theme: {
      setRootAttribute:   () => undefined,
      readStoredChoice:   () => storedThemeChoice,
      storeChoice:        () => undefined,
      systemPrefersDark:  () => false,
      followSystemScheme: () => () => undefined,
    },
    setWindowTitle:  () => undefined,
    markMotionReady: () => undefined,
    now:             () => Date.parse(FLEET_FIXTURES_READ_AT),
  };
}

function appAt(fleetSource: FleetSource, fragment: string, fleetStream: GaiaAppProps['fleetStream'] = LIVE_STREAM, storedThemeChoice: string | null = null) {
  return <GaiaApp fleetSource={fleetSource} fleetStream={fleetStream} commandSender={SENDER_OF_NOTHING} surroundings={surroundingsAt(fragment, storedThemeChoice)} />;
}

/** The labels of the rail's forge rows in the markup, in order: every rail row after the four views. */
function railForgeProjectsIn(markup: string): string[] {
  return [...markup.matchAll(/class="gaia-rail-row-label">([^<]*)</g)].map(([, label = '']) => label).slice(4);
}

function railForgesCountIn(markup: string): string | undefined {
  return /href="#forges"[^>]*><span class="gaia-rail-row-label">Forges<\/span><span class="gaia-rail-count"[^>]*>(\d+)</.exec(markup)?.[1];
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

  test('before any document the shell already shows its rail and bar, with no count', () => {
    const markup = renderToStaticMarkup(appAt(createFleetSource(), ''));
    expect(markup).toContain('<h1 class="gaia-top-bar-title">Attention</h1>');
    expect(markup).not.toContain('gaia-rail-count');
  });
});

describe('the route and the theme', () => {
  test('the fragment chooses the view: its title heads the bar and its rail row is current', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    const onAgents = renderToStaticMarkup(appAt(source, '#agents'));
    expect(onAgents).toContain('<h1 class="gaia-top-bar-title">Agents</h1>');
    expect(onAgents).toMatch(/href="#agents" aria-current="page"/);
    const inPlace = renderToStaticMarkup(appAt(source, `#forge/${TRACKER_IDS.invoiceService}/#questions/E4`));
    expect(inPlace).toContain('<h1 class="gaia-top-bar-title">Invoice Service</h1>');
  });

  test('#activity shows the Activity view under its status line once a document holds, its filters inside the controls\' fieldset', () => {
    const source = createFleetSource();
    const app = appAt(source, '#activity');
    const statusLine = '<span class="gaia-top-bar-status">the newest 50 entries of each forge, as each forge words them</span>';
    const beforeTheDocument = renderToStaticMarkup(app);
    expect(beforeTheDocument).toContain(statusLine);
    expect(beforeTheDocument).not.toContain('class="gaia-activity"');
    source.publish(FLEET_FIVE_FORGES);
    const markup = renderToStaticMarkup(app);
    expect(markup).toContain('<h1 class="gaia-top-bar-title">Activity</h1>');
    expect(markup).toContain(statusLine);
    const fieldsetAt = markup.indexOf('<fieldset class="gaia-shell-controls">');
    expect(fieldsetAt).toBeGreaterThan(-1);
    expect(markup.indexOf('aria-label="Kind"')).toBeGreaterThan(fieldsetAt);
    expect(markup.indexOf('aria-label="Kind"')).toBeLessThan(markup.indexOf('</fieldset>'));
  });

  test('the switch shows the stored choice before the first document, and the settings\' choice from it on', () => {
    const source = createFleetSource();
    const app = appAt(source, '#attention', LIVE_STREAM, 'light');
    expect(renderToStaticMarkup(app)).toContain('aria-pressed="true">Light<');
    source.publish(FLEET_FIVE_FORGES);
    expect(renderToStaticMarkup(app)).toContain('aria-pressed="true">Dark<');
  });
});

describe('Tab and names', () => {
  const OPEN_IN_NEW_TAB = <Button label="Open Example Storefront in a new tab" icon="open-in-new-tab" iconOnly />;

  function unfoldedShell(fleetDocument: FleetDocument) {
    return tree.unfolded(
      <GaiaShell
        fleetDocument={fleetDocument}
        streamState="live"
        route={DEFAULT_ROUTE}
        viewTitle="Attention"
        view={{ status: { condition: 'live', text: '4 forges running' }, actions: OPEN_IN_NEW_TAB, content: null }}
        themeChoice="dark"
        onThemeChoice={() => undefined}
      />,
    );
  }

  test('Tab meets the rail top to bottom, then the view\'s buttons, then the theme switch', () => {
    const focusable = tree.hostElementsIn(unfoldedShell(FLEET_FIVE_FORGES), isFocusable);
    expect(focusable.map(accessibleNameOf)).toEqual([
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
      'This machine10 / 12agentslimit 12 of 12 CPUs',
      'Open Example Storefront in a new tab',
      'Auto',
      'Light',
      'Dark',
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
    const iconOnly = focusable.filter((element) => element.props['data-icon-only'] !== undefined);
    expect(iconOnly.map((element) => [element.props['aria-label'], element.props['title']])).toEqual([
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
        viewTitle="Forges"
        view={{
          status:  null,
          actions: <Button label="Look again" />,
          content: <><Button label="Stop" /><TextField label="Folder" value="" onChange={() => undefined} /></>,
        }}
        themeChoice="dark"
        onThemeChoice={() => undefined}
      />,
    );
  }

  test('from the error the banner shows right under the top bar and the controls\' fieldset is disabled; open again, both are gone', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    const stream = streamAt('live');
    const app = appAt(source, '#forges', stream);
    const live = renderToStaticMarkup(app);
    expect(live).not.toContain('gaia-banner');
    expect(live).toContain('<fieldset class="gaia-shell-controls">');
    stream.change('lost');
    const lost = renderToStaticMarkup(app);
    const bannerUnderTheTopBar = '</header><div class="gaia-banner" data-tone="error" role="alert"><span class="gaia-banner-text">';
    expect(lost).toContain(`${bannerUnderTheTopBar}Gaia&#x27;s server could not be reached. Trying again.</span></div>`);
    expect(lost).toContain('<fieldset class="gaia-shell-controls" disabled="">');
    stream.change('live');
    expect(renderToStaticMarkup(app)).toBe(live);
  });

  test('a page out of date with the server disables the controls too', () => {
    const fieldset = tree.onlyWithTag(unfoldedShellAt('page-out-of-date'), 'fieldset');
    expect(fieldset.props['disabled']).toBe(true);
    expect(tree.hostElementsIn(fieldset.children, tree.withClass('gaia-banner'))).toHaveLength(1);
  });

  test('every control of the shell, the view\'s buttons and fields and the theme switch among them, sits in the disabled fieldset; outside it are only links', () => {
    const shell = unfoldedShellAt('lost');
    const fieldset = tree.onlyWithTag(shell, 'fieldset');
    expect(fieldset.props['disabled']).toBe(true);
    const everyControl = tree.hostElementsIn(shell, (element) => CONTROLS.includes(element.tag));
    const controlsInTheFieldset = tree.hostElementsIn(fieldset.children, (element) => CONTROLS.includes(element.tag));
    expect(controlsInTheFieldset.map((element) => [element.tag, accessibleNameOf(element)])).toEqual([
      ['button', 'Look again'],
      ['button', 'Auto'],
      ['button', 'Light'],
      ['button', 'Dark'],
      ['button', 'Stop'],
      ['input', ''],
    ]);
    expect(controlsInTheFieldset).toEqual(everyControl);
    const focusableOutside = tree.hostElementsIn(shell, isFocusable).filter((element) => !tree.hostElementsIn([fieldset]).includes(element));
    expect(new Set(focusableOutside.map((element) => element.tag))).toEqual(new Set(['a']));
  });

  test('a live or connecting stream leaves the fieldset enabled and shows no banner', () => {
    for (const streamState of ['live', 'connecting'] as const) {
      const shell = unfoldedShellAt(streamState);
      expect(tree.onlyWithTag(shell, 'fieldset').props['disabled']).toBe(false);
      expect(tree.hostElementsIn(shell, tree.withClass('gaia-banner'))).toEqual([]);
    }
  });
});

describe('the Agents view in the shell', () => {
  const J12_ROUTE = `#agents/${TRACKER_IDS.invoiceService}/J12`;

  test('the Agents route shows A2\'s status line over the view\'s table', () => {
    const source = createFleetSource();
    source.publish(FLEET_FIVE_FORGES);
    const markup = renderToStaticMarkup(appAt(source, '#agents'));
    expect(markup).toContain('<span class="gaia-top-bar-status">10 working across 4 forges · 821,300 tokens in flight</span>');
    expect(markup).toContain('<div class="gaia-table" role="table" aria-label="Agents">');
  });

  test('before the first document the Agents route shows no status line and no view', () => {
    const markup = renderToStaticMarkup(appAt(createFleetSource(), '#agents'));
    expect(markup).not.toContain('gaia-top-bar-status');
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
    const parts = viewPartsOf(route, FLEET_FIVE_FORGES, { readAtMilliseconds: Date.parse(FLEET_FIXTURES_READ_AT), goTo: (fragment) => visited.push(fragment) });
    const needsALook = tree.onlyHostElementIn(tree.unfolded(parts.content), (element) => element.tag === 'button' && tree.textOf([element]).startsWith('Needs a look'));
    tree.dispatch(needsALook, 'onClick');
    expect(visited).toEqual([`${J12_ROUTE}?role=builders&condition=needs-a-look`]);
  });
});
