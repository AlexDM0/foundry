/**
 * The visual pass's screens (W7.3): each artboard the page builds, painted from its fixture as the page paints it, as a whole document a
 * browser opens at 1440 x 1016 to compare by eye with the artboard. What matters: no artboard is left out; both themes are the same markup
 * and differ only in the theme the root names and the switch presses (B1 has no switch), so a theme is the tokens' work alone; a screen
 * holds no colour of its own; and each screen shows the state its artboard draws, since a pass that compares an artboard with another state
 * compares nothing. C2 waits for notifications (W5.6), and C3 is the launcher's own splash page, opened as it is. The restart an update left
 * pending, which no artboard draws, is painted over A1 and A4, the two artboards whose Update forge can leave it, under the same checks; so
 * are the two warnings of monitor contract 2, a failed Baton pass as A1's look and an Assistant that cannot come up as a notice on A4.
 *
 * The by-eye pass itself is not a spec: it writes `screenDocumentOf` for each screen and theme to a scratch folder, opens each at the
 * artboard's size in Chrome or Chromium, and compares the picture with the artboard.
 */
import { readFileSync }           from 'node:fs';
import { join }                   from 'node:path';
import { describe, expect, test } from 'bun:test';

import {
  ARTBOARD_SCREENS,
  ARTBOARD_SIZE_PIXELS,
  ASSISTANT_DOWN_SENTENCE,
  type ArtboardScreen,
  B2_STOP_REFUSAL,
  BATON_PASS_FAILED_SENTENCE,
  MONITOR_WARNING_SCREENS,
  type PageArtboard,
  RESTART_PENDING_SCREENS,
  screenDocumentOf,
  screenMarkupOf,
  themesOf,
} from './testing/ArtboardScreens.tsx';
import { DesignSystemStylesheet } from './testing/DesignSystemStylesheet.ts';

const STYLESHEETS = ['tokens.css', 'gaia.css'].map((fileName) => readFileSync(join(import.meta.dir, 'styles', fileName), 'utf8'));

/** A colour written as a value: what only tokens.css may hold. */
const COLOUR_VALUE = /oklch\(|rgba?\(|hsla?\(|#[0-9a-f]{3,8}\b|\bcolor:/i;

function screenOf(artboard: PageArtboard): ArtboardScreen {
  const screen = ARTBOARD_SCREENS.find((candidate) => candidate.artboard === artboard);
  if (screen === undefined) throw new Error(`No screen paints artboard ${artboard}.`);
  return screen;
}

function textsOfClass(markup: string, className: string): string[] {
  return [...markup.matchAll(new RegExp(`class="${className}"[^>]*>([^<]*)<`, 'g'))].map(([, text = '']) => text);
}

function inlineStylesOf(markup: string): string[] {
  return [...markup.matchAll(/ style="([^"]*)"/g)].map(([, style = '']) => style);
}

describe('the screens of the visual pass', () => {
  test('paints every artboard the page builds, each from its own artboard source', () => {
    expect(ARTBOARD_SCREENS.map((screen) => [screen.artboard, screen.designFile])).toEqual([
      ['A1', 'Main.dc.html'],
      ['A2', 'Agents.dc.html'],
      ['A3', 'Activity.dc.html'],
      ['A4', 'Forges.dc.html'],
      ['B1', 'Forge.dc.html'],
      ['B2', 'ForgeControls.dc.html'],
      ['B3', 'Degraded.dc.html'],
      ['B4', 'Empty.dc.html'],
      ['C1', 'MainLight.dc.html'],
    ]);
    expect(ARTBOARD_SIZE_PIXELS).toEqual({ width: 1440, height: 1016 });
  });

  test('builds every screen in both themes, but C1, which is drawn in light only', () => {
    const themesByArtboard = ARTBOARD_SCREENS.map((screen) => [screen.artboard, themesOf(screen)]);
    expect(themesByArtboard).toEqual(ARTBOARD_SCREENS.map((screen) => [screen.artboard, screen.artboard === 'C1' ? ['light'] : ['dark', 'light']]));
  });

  test('a screen document names its theme on the root, as the page does before its first paint, and holds every stylesheet whole, the package\'s first', () => {
    const packageStylesheets = [DesignSystemStylesheet.fontFaceRules(), DesignSystemStylesheet.text()];
    for (const screen of ARTBOARD_SCREENS) {
      for (const theme of themesOf(screen)) {
        const screenDocument = screenDocumentOf(screen, theme);
        expect(screenDocument).toStartWith(`<!doctype html>\n<html lang="en" data-theme="${theme}" data-motion="ready">`);
        const stylesheetPlaces = [...packageStylesheets, ...STYLESHEETS].map((stylesheet) => screenDocument.indexOf(stylesheet));
        expect(stylesheetPlaces.every((place) => place > 0)).toBe(true);
        expect(stylesheetPlaces).toEqual([...stylesheetPlaces].sort((a, b) => a - b));
        expect(screenDocument).toContain(`<div id="gaia-root">${screenMarkupOf(screen, theme)}</div>`);
      }
    }
  });

  test('paints the restart an update left pending over A1 and A4, each from its own artboard source, in both themes', () => {
    expect(RESTART_PENDING_SCREENS.map((screen) => [screen.artboard, screen.designFile, themesOf(screen)])).toEqual([
      ['A1', 'Main.dc.html', ['dark', 'light']],
      ['A4', 'Forges.dc.html', ['dark', 'light']],
    ]);
  });

  test('a screen holds no colour of its own: no style of its markup names one, so every colour comes from the inlined tokens', () => {
    for (const screen of [...ARTBOARD_SCREENS, ...RESTART_PENDING_SCREENS, ...MONITOR_WARNING_SCREENS]) {
      for (const theme of themesOf(screen)) {
        const markup = screenMarkupOf(screen, theme);
        expect(markup).not.toContain('<style');
        for (const inlineStyle of inlineStylesOf(markup)) expect(inlineStyle).not.toMatch(COLOUR_VALUE);
      }
    }
  });

  test('the two themes paint the same markup, but for the theme the switch presses', () => {
    const screensWithTheSwitch = [...ARTBOARD_SCREENS, ...RESTART_PENDING_SCREENS, ...MONITOR_WARNING_SCREENS].filter(
      (candidate) => themesOf(candidate).length === 2 && candidate.artboard !== 'B1',
    );
    for (const screen of screensWithTheSwitch) {
      const dark = screenMarkupOf(screen, 'dark');
      const light = screenMarkupOf(screen, 'light');
      expect(dark).toContain('aria-pressed="true">Dark<');
      expect(light).toContain('aria-pressed="true">Light<');
      const unpressed = (markup: string) => markup.replaceAll('aria-pressed="true"', 'aria-pressed="false"');
      expect(unpressed(dark)).toBe(unpressed(light));
    }
  });

  test('B1, whose bar leaves the theme switch out, paints the very same markup in both themes', () => {
    const forgeInPlace = screenOf('B1');
    expect(screenMarkupOf(forgeInPlace, 'dark')).toBe(screenMarkupOf(forgeInPlace, 'light'));
  });
});

describe('each screen shows the state its artboard draws', () => {
  test('A1 and C1: Attention lists the five entries of the artboard in its order, under the rail and the bar', () => {
    for (const artboard of ['A1', 'C1'] as const) {
      const markup = screenMarkupOf(screenOf(artboard), 'light');
      expect(textsOfClass(markup, 'gaia-top-bar-title')).toEqual(['Attention']);
      expect(textsOfClass(markup, 'gaia-attention-row-id')).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    }
  });

  test('A2: the Agents table holds its ten agents with J12 of Invoice Service selected', () => {
    const markup = screenMarkupOf(screenOf('A2'), 'dark');
    expect(markup.match(/class="gaia-table-row" role="row" data-height=/g)).toHaveLength(10);
    const selectedRow = markup.slice(markup.indexOf('aria-current="true"')).split('role="row"')[0] ?? '';
    expect(selectedRow).toContain('Invoice Service');
    expect(selectedRow).toContain('>J12<');
    expect(markup).toContain('Open J12 in its forge');
  });

  test('A3 and A4: Activity and Forges each open under their own title', () => {
    expect(textsOfClass(screenMarkupOf(screenOf('A3'), 'dark'), 'gaia-top-bar-title')).toEqual(['Activity']);
    expect(textsOfClass(screenMarkupOf(screenOf('A4'), 'dark'), 'gaia-top-bar-title')).toEqual(['Forges']);
  });

  test('B1: Example Storefront in place, Gaia\'s bar over the frame area that opens the Bridge', () => {
    const markup = screenMarkupOf(screenOf('B1'), 'dark');
    expect(textsOfClass(markup, 'gaia-top-bar-title')).toEqual(['Example Storefront']);
    expect(textsOfClass(markup, 'gaia-forge-frame-opening')).toEqual(['Opening Example Storefront.']);
    expect(textsOfClass(markup, 'gaia-top-bar-status-text')).toEqual(['4 / 5 agents · 2 wait on you · since 09:12']);
    expect(markup).toMatch(/<svg class="gaia-open-in-new-tab-glyph"[^>]*>.*?<\/svg>Open in new tab<\/button>/);
    expect(markup).not.toContain('gaia-top-bar-theme-label');
  });

  test('B2: the Stop dialog under Example Storefront, the refusal under Example Mobile App, and Design System starting', () => {
    const markup = screenMarkupOf(screenOf('B2'), 'dark');
    expect(textsOfClass(markup, 'gaia-confirm-question')).toEqual(['Stop the Overseer of Example Storefront? 4 agents are running.']);
    expect(textsOfClass(markup, 'gaia-refusal-code')).toEqual([B2_STOP_REFUSAL.refusal ?? '']);
    expect(markup).toContain(`${B2_STOP_REFUSAL.text ?? ''}</span><button type="button" class="design-system-button" data-compact="">Try again</button>`);
    expect(textsOfClass(markup, 'gaia-forges-condition-detail')).toContain('forge start · waiting for its API');
  });

  test('B3: the unreachable banner under the bar, the head that counts what is known, and the figures folded into one line atop the main column', () => {
    const markup = screenMarkupOf(screenOf('B3'), 'dark');
    expect(markup).toContain('<div class="design-system-banner" data-tone="error"><span>Overseer unreachable: Invoice Service.');
    expect(markup).toContain('data-type-role="micro">Waiting on you · 4 known, more possible</h2>');
    expect(markup).toContain('<div class="gaia-attention-main"><div class="gaia-attention-figures" data-form="line">');
    expect(markup).not.toContain('data-form="stacked"');
  });

  test('A4 and B2: the Forges table sets its columns close, each root carrying its full path', () => {
    for (const artboard of ['A4', 'B2'] as const) {
      const markup = screenMarkupOf(screenOf(artboard), 'dark');
      expect(markup).toContain('class="gaia-table" role="table" aria-label="Forges" data-column-gap="narrow"');
      expect(markup).toContain('<span class="gaia-forges-forge-root" title="/Users/alexexample/development/example-storefront">~/development/example-storefront</span>');
    }
  });

  test('B4: no forge registered, with Add a repository in the head\'s place and the rail\'s forges group saying so, and no meter', () => {
    const markup = screenMarkupOf(screenOf('B4'), 'dark');
    expect(markup).toContain('Nothing waits on you, because no forge is registered.');
    expect(markup).toContain('Add and start');
    expect(textsOfClass(markup, 'gaia-rail-no-forge')).toEqual(['No forge is registered.']);
    expect(textsOfClass(markup, 'gaia-rail-machine-line')).toEqual(['no limit known · 12 CPUs']);
    expect(markup).not.toContain('class="design-system-fill-meter"');
  });
});

describe('the restart an update left pending, over the artboard it changes', () => {
  test('A1: Updated; restart pending with Restart under Example Mobile App\'s callout, and the rest of A1 as drawn', () => {
    const attention = RESTART_PENDING_SCREENS[0];
    if (attention === undefined) throw new Error('A restart pending screen is missing.');
    const markup = screenMarkupOf(attention, 'dark');
    expect(textsOfClass(markup, 'gaia-attention-row-id')).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    expect(markup.match(/class="gaia-pending-step"/g)).toHaveLength(1);
    const lookBlocks = markup.split('class="gaia-attention-look"').slice(1);
    const heldLook = lookBlocks.find((block) => block.includes('aria-label="Example Mobile App: Launches held"')) ?? '';
    expect(heldLook).toContain('<span class="gaia-pending-step-word">Updated; restart pending.</span> Its Overseer runs the old code until it restarts.');
    expect(heldLook).toContain('>Restart</button>');
  });

  test('A4: Updated; restart pending with Restart under Example Mobile App\'s held banner, and nothing under its row', () => {
    const forges = RESTART_PENDING_SCREENS[1];
    if (forges === undefined) throw new Error('A restart pending screen is missing.');
    const markup = screenMarkupOf(forges, 'dark');
    expect(textsOfClass(markup, 'gaia-top-bar-title')).toEqual(['Forges']);
    expect(markup.match(/class="gaia-pending-step"/g)).toHaveLength(1);
    const heldGroup = markup.slice(markup.indexOf('class="gaia-forges-held-group"'));
    expect(heldGroup).toContain('<span class="gaia-pending-step-word">Updated; restart pending.</span>');
    expect(heldGroup).toContain('>Restart</button>');
  });
});

describe('the warnings of monitor contract 2, over the artboard that shows each', () => {
  test('A1: a failed Baton pass is Invoice Service\'s error look, in the forge\'s own sentence with Open, before the two looks A1 draws', () => {
    const [attention] = MONITOR_WARNING_SCREENS;
    if (attention === undefined) throw new Error('A monitor warning screen is missing.');
    const markup = screenMarkupOf(attention, 'dark');
    expect(textsOfClass(markup, 'gaia-attention-row-id')).toEqual(['E4', '#015', 'E1', '#031', 'E2']);
    const lookBlocks = markup.split('class="gaia-attention-look"').slice(1);
    expect(lookBlocks[0]).toContain('aria-label="Invoice Service: Baton pass failed"');
    expect(lookBlocks[0]).toContain(BATON_PASS_FAILED_SENTENCE);
    expect(lookBlocks[0]).toContain('>Open</a>');
    expect(lookBlocks).toHaveLength(3);
  });

  test('A4: an Assistant that cannot come up is a notice under Research Wiki\'s row, in Gaia\'s words', () => {
    const forges = MONITOR_WARNING_SCREENS[1];
    if (forges === undefined) throw new Error('A monitor warning screen is missing.');
    const markup = screenMarkupOf(forges, 'dark');
    expect(textsOfClass(markup, 'gaia-forges-row-notice')).toEqual([ASSISTANT_DOWN_SENTENCE.replace('\'', '&#x27;')]);
  });

  test('A3: the usage line names when the current window resets, under the limit', () => {
    const activity = ARTBOARD_SCREENS.find((screen) => screen.artboard === 'A3');
    if (activity === undefined) throw new Error('No screen paints artboard A3.');
    expect(textsOfClass(screenMarkupOf(activity, 'dark'), 'gaia-activity-usage-line')).toEqual(['under its limit · window resets 16:00']);
  });
});
