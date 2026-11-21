/**
 * The design-system package as Gaia's page uses it: imported by its export names, compiled under the page's own options, and rendered
 * without a document. What matters: a package component that holds hooks renders through `react-dom/server`, which runs its hooks but no
 * effect, as Gaia's hooked components do in their specs, so the linked package and the page share one React; and the words and variants
 * Gaia hands a part reach what it draws. How the package draws them is the package's own to hold, so nothing here reads its markup.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';
import { Button, Tooltip }        from './lib/design-system/DesignSystemInterface.ts';

describe('a package component in a page spec', () => {
  test('a tooltip, which holds hooks, renders around the element Gaia wraps in it, with the words Gaia hands it', () => {
    const markup = renderToStaticMarkup(
      <Tooltip text="Starts the forge's Overseer" placement="below">
        <span tabIndex={0}>Start</span>
      </Tooltip>,
    );
    expect(markup).toContain('<span tabindex="0"');
    expect(markup).toContain('Starts the forge&#x27;s Overseer');
  });

  test('a button draws the label Gaia hands it, and its emphasis changes what it draws', () => {
    const primary = renderToStaticMarkup(<Button label="Start" emphasis="primary" compact />);
    const quiet = renderToStaticMarkup(<Button label="Start" compact />);
    expect([primary, quiet].every((markup) => markup.includes('Start'))).toBe(true);
    expect(primary).not.toBe(quiet);
  });
});
