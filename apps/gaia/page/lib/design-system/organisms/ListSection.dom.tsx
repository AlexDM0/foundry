/**
 * The list section, in a happy-dom document. What matters: an empty section shows its empty text and no list; a section of items lists one
 * entry per item, in order; the count shows only when given; what the head adds sits in the head; the title heads the section, an `h2`
 * unless the screen picks another element; the section is named by its label; and the words are text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { ListSection } from './ListSection.tsx';

interface ExampleItem {
  readonly id:    string;
  readonly title: string;
}

function renderedSection(items: readonly ExampleItem[], count?: number): HTMLElement {
  render(
    <ListSection
      label="Example decisions"
      title="Open questions"
      {...(count === undefined ? {} : { count })}
      headEnd={<button type="button">Example head action</button>}
      emptyText="No question waits on User."
      items={items}
      keyOf={(item) => item.id}
      renderItem={(item) => <li>{item.title}</li>}
      listLabel="Example list"
    />,
  );
  return screen.getByRole('region', { name: 'Example decisions' });
}

afterEach(() => {
  cleanup();
});

describe('the list section', () => {
  test('an empty section shows its empty text and no list', () => {
    const section = renderedSection([]);
    expect([section.querySelector('.design-system-empty')?.textContent, section.querySelector('.design-system-list')]).toEqual(['No question waits on User.', null]);
  });

  test('a section of items lists one entry per item, in order, and shows no empty text', () => {
    const section = renderedSection([{ id: 'E1', title: 'First example' }, { id: 'E2', title: 'Second example' }]);
    expect([...section.querySelectorAll('.design-system-list > li')].map((entry) => entry.textContent)).toEqual(['First example', 'Second example']);
    expect([section.querySelector('.design-system-empty'), screen.getByRole('list', { name: 'Example list' }).className]).toEqual([null, 'design-system-list']);
  });

  test('the count shows only when given, and what the head adds sits in the head', () => {
    const counted = renderedSection([], 2);
    expect(counted.querySelector('.design-system-section-head .design-system-section-count')?.textContent).toBe('2');
    expect(counted.querySelector('.design-system-section-head button')?.textContent).toBe('Example head action');
    cleanup();
    expect(renderedSection([]).querySelector('.design-system-section-count')).toBeNull();
  });

  test('the title heads the section as an h2, unless the screen picks another element', () => {
    renderedSection([]);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Open questions');
    cleanup();
    render(<ListSection label="Example" title="Example head" titleElement="h3" emptyText="None." items={[]} keyOf={() => 'never'} renderItem={() => null} />);
    expect(screen.getByRole('heading', { name: 'Example head' }).tagName).toBe('H3');
  });

  test('the words are text, never markup', () => {
    render(
      <ListSection
        label="<b>planted</b>"
        title="<b>planted</b>"
        emptyText="<b>planted</b>"
        items={[]}
        keyOf={() => 'never'}
        renderItem={() => null}
      />,
    );
    const section = screen.getByRole('region', { name: '<b>planted</b>' });
    expect([section.querySelector('b'), screen.getByRole('heading').textContent]).toEqual([null, '<b>planted</b>']);
  });
});
