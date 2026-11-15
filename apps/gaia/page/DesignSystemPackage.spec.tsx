/**
 * The design-system package as Gaia's page uses it: imported by its export names, compiled under the page's own options, and rendered
 * without a document. What matters: a package component that holds hooks renders through `react-dom/server`, which runs its hooks but no
 * effect, as Gaia's hooked components do in their specs, so the linked package and the page share one React; and the package's words and
 * variants reach the markup as its props name them.
 */
import { describe, expect, test } from 'bun:test';
import { Button }                 from 'design-system/Button';
import { Tooltip }                from 'design-system/Tooltip';
import { renderToStaticMarkup }   from 'react-dom/server';

describe('a package component in a page spec', () => {
  test('a tooltip, which holds hooks, describes the element it wraps by the id its hook made', () => {
    const markup = renderToStaticMarkup(
      <Tooltip text="Starts the forge's Overseer" placement="below">
        <span tabIndex={0}>Start</span>
      </Tooltip>,
    );
    const describedBy = /aria-describedby="([^"]+)"/.exec(markup)?.[1] ?? 'no description';
    expect(markup).toContain(`<span class="design-system-tooltip" id="${describedBy}" role="tooltip" data-placement="below">`);
    expect(markup).toContain('Starts the forge&#x27;s Overseer');
  });

  test('a primary button renders as the package draws it, its variant an attribute and its label its text', () => {
    expect(renderToStaticMarkup(<Button label="Start" emphasis="primary" compact />)).toBe(
      '<button type="button" class="design-system-button" data-primary="" data-compact="">Start</button>',
    );
  });
});
