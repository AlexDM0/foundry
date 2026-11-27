/**
 * The element tree the design-system specs read in place of a document: components unfold to the host elements React renders, a handler
 * is called through `dispatch`, a hooked component of Gaia's or an unknown element type fails, and every design-system component stays
 * folded with the props it was handed, so no spec reads the markup a package draws.
 */
import {
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';
import {
  createElement,
  forwardRef,
  type FunctionComponent,
  useRef,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Button,
  Card,
  Checkbox,
  CountBadge,
  Dialog,
  NumberStepper,
  Tooltip
} from '../lib/design-system/DesignSystemInterface.ts';

import { ReactElementTree } from './ReactElementTree.ts';

function ExampleInner({ text }: { readonly text: string }) {
  return <b className="example-inner">{text}</b>;
}

function ExampleOuter({ onPress }: { readonly onPress: () => void }) {
  return (
    <p className="example-outer extra">
      <>
        <ExampleInner text="Alex Example" />
        {' '}
        {false}
        {null}
        {2}
      </>
      <button type="button" onClick={onPress}>Press</button>
    </p>
  );
}

describe('unfolding', () => {
  test('nested components and fragments unfold to the same host elements and text React renders', () => {
    const unfolded = ReactElementTree.unfolded(<ExampleOuter onPress={() => undefined} />);
    expect(ReactElementTree.hostElementsIn(unfolded).map((element) => element.tag)).toEqual(['p', 'b', 'button']);
    expect(ReactElementTree.textOf(unfolded)).toBe('Alex Example 2Press');
    expect(renderToStaticMarkup(<ExampleOuter onPress={() => undefined} />).replace(/<[^>]+>/g, '')).toBe('Alex Example 2Press');
  });

  test('an element type it cannot unfold fails instead of leaving nothing', () => {
    const ExampleForwarded = forwardRef<HTMLSpanElement>(function ExampleForwarded(_props, reference) {
      return <span ref={reference} />;
    });
    expect(() => ReactElementTree.unfolded(<ExampleForwarded />)).toThrow('cannot unfold');
  });

  test('a component of Gaia\'s that holds hooks fails', () => {
    function ExampleHooked({ text }: { readonly text: string }) {
      const reference = useRef<HTMLElement>(null);
      return <i ref={reference}>{text}</i>;
    }
    // React reports the misplaced hook on the console before it throws; the report is the expected failure, so it is held, not printed.
    const hookReport = spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => ReactElementTree.unfolded(<p><ExampleHooked text="Alex Example" /></p>)).toThrow();
    expect(hookReport).toHaveBeenCalled();
    hookReport.mockRestore();
  });
});

describe('a package component', () => {
  test('stays folded under its name with the props it was handed, its siblings unfolded, even one that holds hooks', () => {
    const unfolded = ReactElementTree.unfolded(<p><CountBadge count={4} tone="warn" /><Button label="Start" emphasis="primary" /><ExampleInner text="Example Agency" /></p>);
    expect(ReactElementTree.hostElementsIn(unfolded).map((element) => [element.tag, element.props['count'] ?? element.props['label']])).toEqual([
      ['p', undefined], ['CountBadge', 4], ['Button', 'Start'], ['b', undefined],
    ]);
    expect(ReactElementTree.onlyOfComponent(unfolded, Button).props['emphasis']).toBe('primary');
    expect(ReactElementTree.textOf(unfolded)).toBe('Example Agency');
  });

  test('stays folded whatever it holds inside, so a part that gains hooks, as the count badge and the stepper did, breaks no spec', () => {
    const hookedParts = [CountBadge, NumberStepper, Tooltip, Dialog];
    expect(hookedParts.map((part) => ReactElementTree.unfolded(createElement(part as unknown as FunctionComponent))))
      .toEqual(hookedParts.map((part) => [{ tag: part.name, props: {}, children: [] }]));
  });

  test('a contributed package\'s component stays folded too', () => {
    const presses: boolean[] = [];
    const unfolded = ReactElementTree.unfolded(<Checkbox label="Notify" checked={false} onChange={(checked) => presses.push(checked)} />);
    const checkbox = ReactElementTree.onlyOfComponent(unfolded, Checkbox);
    expect([checkbox.children, checkbox.props['label']]).toEqual([[], 'Notify']);
    ReactElementTree.dispatch(checkbox, 'onChange', true);
    expect(presses).toEqual([true]);
  });

  test('holds the children and slots Gaia handed it, unfolded as Gaia\'s own, and none of the package\'s markup', () => {
    const unfolded = ReactElementTree.unfolded(<Card title="Example Agency"><ExampleInner text="Alex Example" /></Card>);
    const card = ReactElementTree.onlyOfComponent(unfolded, Card);
    const handedChild = { tag: 'b', props: { className: 'example-inner', children: 'Alex Example' }, children: ['Alex Example'] };
    expect([card.props['title'], card.children]).toEqual(['Example Agency', [handedChild]]);
    const button = ReactElementTree.onlyOfComponent(ReactElementTree.unfolded(<Button label="Start" leading={<ExampleInner text="Example Agency" />} />), Button);
    expect(ReactElementTree.textOf(ReactElementTree.unfoldedProp(button, 'leading'))).toBe('Example Agency');
    expect([button.children.map((child) => (typeof child === 'string' ? child : child.tag)), ReactElementTree.textOf([button])]).toEqual([['b'], 'Example Agency']);
  });
});

describe('reading and dispatching', () => {
  test('a class is found among several, and onlyHostElementIn fails on none', () => {
    const unfolded = ReactElementTree.unfolded(<ExampleOuter onPress={() => undefined} />);
    const outer = ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'p');
    expect(ReactElementTree.hasClass(outer, 'extra')).toBe(true);
    expect(ReactElementTree.hasClass(outer, 'example')).toBe(false);
    expect(() => ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'table')).toThrow('found 0');
  });

  test('dispatch calls the handler with the event, and fails where there is none', () => {
    const presses: string[] = [];
    const unfolded = ReactElementTree.unfolded(<ExampleOuter onPress={() => presses.push('pressed')} />);
    ReactElementTree.dispatch(ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'button'), 'onClick');
    expect(presses).toEqual(['pressed']);
    expect(() => ReactElementTree.dispatch(ReactElementTree.onlyHostElementIn(unfolded, (element) => element.tag === 'b'), 'onClick')).toThrow('no onClick');
  });
});
