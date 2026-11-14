/**
 * The titled block, in a happy-dom document. What matters: it is a region named by its title, which heads it as an `h3` unless the screen
 * picks another element; its rule sets `data-rule`, none by default; and the title is text, never markup.
 */
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { TitledBlock } from './TitledBlock.tsx';

afterEach(() => {
  cleanup();
});

describe('the titled block', () => {
  test('is named by its title, which heads its contents', () => {
    render(<TitledBlock title="Timeline"><p>Example contents</p></TitledBlock>);
    const block = screen.getByRole('region', { name: 'Timeline' });
    expect([block.firstElementChild?.tagName, block.firstElementChild?.getAttribute('data-type-role'), block.firstElementChild?.textContent, block.lastElementChild?.textContent])
      .toEqual(['H3', 'micro', 'Timeline', 'Example contents']);
  });

  test('the screen picks the title\'s element', () => {
    render(<TitledBlock title="Timeline" titleElement="h4">x</TitledBlock>);
    expect(screen.getByRole('heading', { name: 'Timeline' }).tagName).toBe('H4');
  });

  test('its rule sets data-rule, none by default', () => {
    render(
      <>
        <TitledBlock title="Above" rule="above">a</TitledBlock>
        <TitledBlock title="Between" rule="between">b</TitledBlock>
        <TitledBlock title="Bare">c</TitledBlock>
      </>,
    );
    expect(['Above', 'Between', 'Bare'].map((name) => screen.getByRole('region', { name }).getAttribute('data-rule'))).toEqual(['above', 'between', 'none']);
  });

  test('the title is text, never markup', () => {
    render(<TitledBlock title="<b>planted</b>">x</TitledBlock>);
    const block = screen.getByRole('region', { name: '<b>planted</b>' });
    expect([block.querySelector('b'), screen.getByRole('heading').textContent]).toEqual([null, '<b>planted</b>']);
  });
});
