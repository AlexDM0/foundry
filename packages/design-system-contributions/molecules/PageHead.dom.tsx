/**
 * The page head, in a happy-dom document. What matters: the title is the page's one heading, at level one unless the screen nests it; the
 * lead reads under it; each figure reads with its words and its tone; and figures and actions show only when given.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { PageHead } from './PageHead.tsx';

afterEach(() => {
  cleanup();
});

describe('the page head', () => {
  test('the title is a level one heading and the lead reads under it, with no figures or actions unless given', () => {
    const { container } = render(<PageHead title="Overview" lead="Everything that waits, in one place." />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Overview');
    expect(screen.getByText('Everything that waits, in one place.').tagName).toBe('P');
    expect(container.querySelectorAll('[data-form]').length).toBe(0);
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  test('a nested head takes the level the screen gives it', () => {
    render(<PageHead title="Settings" lead="How this window behaves." titleElement="h2" />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Settings');
  });

  test('each figure reads with its words, in order, its tone on it, and the actions follow', () => {
    render(
      <PageHead
        title="Overview"
        lead="Everything that waits, in one place."
        figures={[{ value: '12', label: 'running' }, { value: '3', label: 'waiting', tone: 'accent' }]}
        actions={<button type="button">Look again</button>}
      />,
    );
    const figures = [screen.getByText('running').parentElement, screen.getByText('waiting').parentElement];
    expect(figures.map((figure) => [figure?.textContent, figure?.getAttribute('data-state-tone') ?? null])).toEqual([['12running', null], ['3waiting', 'accent']]);
    expect(screen.getByRole('button', { name: 'Look again' })).toBeDefined();
  });
});
