/**
 * The flow node, in a happy-dom document. What matters: a node that opens takes the focus, announces a dialog and opens on a double-click
 * and on Enter at the node itself, while a click, double-click or key in its end slot (a switch) never opens it and Enter on a focusable
 * meter inside it does not either; a node without `onOpen` takes no focus and announces no popup, while a derived meter inside it still
 * takes the focus for its tooltip; every look is a `data-*` attribute, with the variant visual only; the conditional tag sits inline in the
 * head right after the title; the words are text, never markup.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { FlowNode }         from './FlowNode.tsx';
import { ModelEffortMeter } from './ModelEffortMeter.tsx';
import { Switch }           from './Switch.tsx';

afterEach(() => {
  cleanup();
});

const DERIVED_NOTE = { title: 'Derived from the builder', text: 'Change it on the Builder step.' } as const;

function derivedMeter() {
  return <ModelEffortMeter model="opus" effort="high" level={4} accessibleName="Builder's opus, high" size="node" derivedNote={DERIVED_NOTE} />;
}

describe('the flow node', () => {
  test('a node that opens takes the focus, announces a dialog and opens on a double-click and on Enter, and on no other key', () => {
    const openings: string[] = [];
    render(<FlowNode title="Builder" variant="step" onOpen={() => openings.push('open')} openLabel="Open the Builder step" />);
    const node = screen.getByRole('group', { name: 'Open the Builder step' });
    fireEvent.doubleClick(node);
    expect(fireEvent.keyDown(node, { key: 'Enter' })).toBe(false);
    fireEvent.keyDown(node, { key: ' ' });
    fireEvent.click(node);
    expect([node.getAttribute('tabindex'), node.getAttribute('aria-haspopup'), openings]).toEqual(['0', 'dialog', ['open', 'open']]);
  });

  test('without an open label, the title names a node that opens', () => {
    render(<FlowNode title="Review" variant="step" onOpen={() => undefined} />);
    expect(screen.getByRole('group', { name: 'Review' }).getAttribute('aria-haspopup')).toBe('dialog');
  });

  test('a click, a double-click or a key in the end slot never opens the node, and the switch still toggles', () => {
    const openings: string[] = [];
    const toggles: string[] = [];
    render(
      <FlowNode
        title="Human ticket review"
        variant="switch"
        detail="User readies each draft before it builds"
        end={<Switch accessibleName="Human ticket review" checked onToggle={() => toggles.push('toggle')} />}
        onOpen={() => openings.push('open')}
      />,
    );
    const switchElement = screen.getByRole('switch', { name: 'Human ticket review' });
    fireEvent.click(switchElement);
    fireEvent.doubleClick(switchElement);
    fireEvent.keyDown(switchElement, { key: 'Enter' });
    expect([openings, toggles, switchElement.parentElement?.className]).toEqual([[], ['toggle', 'toggle'], 'bridge-flow-node-end']);
  });

  test('Enter on a focusable meter inside a node does not open it', () => {
    const openings: string[] = [];
    render(<FlowNode title="Builder" variant="step" meter={derivedMeter()} onOpen={() => openings.push('open')} />);
    fireEvent.keyDown(screen.getByRole('img', { name: 'Builder\'s opus, high' }), { key: 'Enter' });
    expect(openings).toEqual([]);
  });

  test('a node without onOpen takes no focus and announces no popup, while its derived meter still takes the focus', () => {
    render(<FlowNode title="Merge main into the tree" variant="step" meter={derivedMeter()} detail="conflicts and red gates: the builder fixes them" />);
    const node = screen.getByRole('group', { name: 'Merge main into the tree' });
    fireEvent.doubleClick(node);
    fireEvent.keyDown(node, { key: 'Enter' });
    const meter = screen.getByRole('img', { name: 'Builder\'s opus, high' });
    expect([node.hasAttribute('tabindex'), node.hasAttribute('aria-haspopup'), meter.getAttribute('tabindex'), meter.closest('.bridge-flow-node-meter') !== null])
      .toEqual([false, false, '0', true]);
  });

  test('every look is a data attribute: variant, mark, conditional, selected and tone', () => {
    render(<FlowNode title="Human code review" variant="switch" conditional mark="changed" selected tone="highlight" />);
    const node = screen.getByRole('group', { name: 'Human code review' });
    expect([
      node.className,
      node.getAttribute('data-variant'),
      node.getAttribute('data-mark'),
      node.hasAttribute('data-conditional'),
      node.hasAttribute('data-selected'),
      node.getAttribute('data-tone'),
    ]).toEqual(['bridge-flow-node', 'switch', 'changed', true, true, 'highlight']);
    cleanup();
    render(<FlowNode title="main" variant="target" />);
    const plainNode = screen.getByRole('group', { name: 'main' });
    expect(['data-mark', 'data-conditional', 'data-selected', 'data-tone'].map((attribute) => plainNode.hasAttribute(attribute)))
      .toEqual([false, false, false, false]);
  });

  test('the conditional tag sits inline in the head, right after the title, with its variant', () => {
    render(<FlowNode title="Re-review" variant="step" conditional tag={{ text: 'conditional', variant: 'conditional' }} meter={derivedMeter()} />);
    const head = screen.getByRole('group', { name: 'Re-review' }).querySelector('.bridge-flow-node-head');
    const headParts = [...(head?.children ?? [])].map((part) => part.className);
    const tag = head?.querySelector('.bridge-flow-node-tag');
    expect([headParts, tag?.textContent, tag?.getAttribute('data-variant')])
      .toEqual([['bridge-flow-node-title', 'bridge-flow-node-tag', 'bridge-flow-node-meter'], 'conditional', 'conditional']);
  });

  test('the detail and chips rows show only when given, and the words are text', () => {
    render(<FlowNode title="<b>Gates</b>" variant="group" detail="<i>build</i>" chips={<span>tests</span>} />);
    const node = document.querySelector('.bridge-flow-node');
    expect([
      node?.querySelector('.bridge-flow-node-title')?.textContent,
      node?.querySelector('.bridge-flow-node-detail')?.textContent,
      node?.querySelector('.bridge-flow-node-chips')?.textContent,
      node?.querySelector('b, i'),
      node?.querySelector('.bridge-flow-node-end, .bridge-flow-node-tag, .bridge-flow-node-meter'),
    ]).toEqual(['<b>Gates</b>', '<i>build</i>', 'tests', null, null]);
  });
});
