/**
 * The design-system package as Gaia's page uses it: a package component that holds hooks renders through `react-dom/server`, so the
 * library and the page share one React, and the words and variants Gaia hands a part reach what it draws. How the package draws them is
 * the package's own to hold, so nothing here reads its markup.
 */
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup }   from 'react-dom/server';
import { Button, Tooltip }        from './lib/design-system/DesignSystemInterface.ts';

describe('a package component in a page spec', () => {
  test('a tooltip, which holds hooks, renders around the element Gaia wraps in it, with the words Gaia hands it', () => {
    const markup = renderToStaticMarkup(
      <Tooltip text="Starts the forge's Hephaestus" placement="below">
        <span tabIndex={0}>Start</span>
      </Tooltip>,
    );
    expect(markup).toContain('<span tabindex="0"');
    expect(markup).toContain('Starts the forge&#x27;s Hephaestus');
  });

  test('a button draws the label Gaia hands it, and its emphasis changes what it draws', () => {
    const primary = renderToStaticMarkup(<Button label="Start" emphasis="primary" compact />);
    const quiet = renderToStaticMarkup(<Button label="Start" compact />);
    expect([primary, quiet].every((markup) => markup.includes('Start'))).toBe(true);
    expect(primary).not.toBe(quiet);
  });
});
