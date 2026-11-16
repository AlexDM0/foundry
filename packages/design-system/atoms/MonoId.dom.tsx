/**
 * The mono id, in a happy-dom document. What matters: the id shows as given, and is text, never markup; the tertiary ink sets no tone,
 * another tone sets `data-tone`; the pill and micro sizes set `data-size`, compact as micro, and the small size none; a size and compact
 * do not compile together; and a weight sets `data-weight`, absent none.
 */
import { cleanup, render } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';
import type { ReactElement } from 'react';

import { MonoId } from './MonoId.tsx';

afterEach(() => {
  cleanup();
});

function renderedIds(ids: ReactElement): HTMLElement[] {
  const { container } = render(ids);
  return [...container.querySelectorAll<HTMLElement>('.design-system-mono-id')];
}

describe('the mono id', () => {
  test('the id shows as given, and is text, never markup', () => {
    const { container } = render(<><MonoId text="#004" /><MonoId text="<b>planted</b>" /></>);
    const ids = [...container.querySelectorAll('.design-system-mono-id')];
    expect([ids.map((id) => id.textContent), container.querySelector('b')]).toEqual([['#004', '<b>planted</b>'], null]);
  });

  test('the tertiary ink sets no tone, and the secondary, primary, link and inherited inks set data-tone', () => {
    const ids = renderedIds(
      <>
        <MonoId text="#1" />
        <MonoId text="#2" tone="subtle" />
        <MonoId text="#3" tone="muted" />
        <MonoId text="#4" tone="strong" />
        <MonoId text="#5" tone="link" />
        <MonoId text="#6" tone="inherited" />
      </>
    );
    expect(ids.map((id) => id.getAttribute('data-tone'))).toEqual([null, null, 'muted', 'strong', 'link', 'inherited']);
  });

  test('a weight sets data-weight, and no weight sets nothing', () => {
    const ids = renderedIds(<><MonoId text="#1" /><MonoId text="#2" weight="regular" /><MonoId text="#3" weight="medium" /><MonoId text="#4" weight="bold" /></>);
    expect(ids.map((id) => id.getAttribute('data-weight'))).toEqual([null, 'regular', 'medium', 'bold']);
  });

  test('the pill and micro sizes set data-size, compact sets the micro size, and the small size sets nothing', () => {
    const ids = renderedIds(
      <>
        <MonoId text="#1" />
        <MonoId text="#2" size="small" />
        <MonoId text="#3" size="pill" />
        <MonoId text="#4" size="micro" />
        <MonoId text="#5" compact />
      </>
    );
    expect(ids.map((id) => id.getAttribute('data-size'))).toEqual([null, null, 'pill', 'micro', 'micro']);
  });

  test('a size and compact do not compile together', () => {
    // @ts-expect-error compact is the micro size: a size or compact, never both
    const sizeAndCompact = <MonoId text="#1" size="pill" compact />;
    expect(sizeAndCompact.props.text).toBe('#1');
  });
});
