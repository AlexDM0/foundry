/**
 * The page title. What matters: the title is the page's one h1 in the package's display role and the lead a paragraph in the lead role
 * under it; the figures follow in their order, a value that waits on User marked, and fold into one line when asked; the actions come last;
 * a view with no figures or actions draws no place for them.
 */
import { describe, expect, test } from 'bun:test';
import { Button }                 from 'design-system/Button';

import { ReactElementTree } from '../testing/ReactElementTree.ts';
import { PageTitle }        from './PageTitle.tsx';

const FIGURES = [
  { value: '5', label: 'waiting on you', attention: true },
  { value: '10 / 12', label: 'agents' },
];

describe('the page title', () => {
  test('the title is the one h1 in the display role, the lead a paragraph in the lead role', () => {
    const unfolded = ReactElementTree.unfolded(<PageTitle title="Attention" lead="What waits on you across every forge, and the forges that need a look." />);
    const heading = ReactElementTree.onlyWithTag(unfolded, 'h1');
    expect([heading.props['data-type-role'], ReactElementTree.textOf([heading])]).toEqual(['display', 'Attention']);
    const lead = ReactElementTree.onlyWithTag(unfolded, 'p');
    expect([lead.props['data-type-role'], lead.props['data-ink']]).toEqual(['lead', 'muted']);
    const absentParts = ['gaia-page-title-figures', 'gaia-page-title-actions'];
    expect(ReactElementTree.hostElementsIn(unfolded, (element) => absentParts.some((className) => ReactElementTree.hasClass(element, className)))).toEqual([]);
  });

  test('the figures follow in order, a value that waits on User marked, then the actions', () => {
    const unfolded = ReactElementTree.unfolded(
      <PageTitle title="Forges" lead="Every forge on this machine." figures={FIGURES} actions={<Button label="Look again" compact />} />,
    );
    const figures = ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-figure'));
    expect(figures.map((figure) => [ReactElementTree.textOf([figure]), figure.props['data-form'], figure.props['data-attention']])).toEqual([
      ['5waiting on you', 'stacked', ''],
      ['10 / 12agents', 'stacked', undefined],
    ]);
    const header = ReactElementTree.onlyWithClass(unfolded, 'gaia-page-title');
    const lastChild = header.children.at(-1);
    expect(typeof lastChild === 'object' ? [lastChild.props['className'], ReactElementTree.textOf([lastChild])] : null).toEqual(['gaia-page-title-actions', 'Look again']);
  });

  test('folded figures sit on one line, each inline', () => {
    const unfolded = ReactElementTree.unfolded(<PageTitle title="Attention" lead="What waits on you." figures={FIGURES} figuresForm="inline" />);
    expect(ReactElementTree.onlyWithClass(unfolded, 'gaia-page-title-figures').props['data-form']).toBe('inline');
    expect(ReactElementTree.hostElementsIn(unfolded, ReactElementTree.withClass('gaia-figure')).map((figure) => figure.props['data-form'])).toEqual(['inline', 'inline']);
  });
});
