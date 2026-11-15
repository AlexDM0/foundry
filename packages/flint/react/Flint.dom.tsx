/**
 * The React layer in a happy-dom document. What matters: `<Flint>` makes the one Flint once its home is mounted and hands its handle to
 * the host, a habitat below it is registered, and unmounting destroys Flint and removes the overlay; a storage that arrives later makes
 * Flint again, which reads it, keeps one overlay and keeps the habitats below registered; the other options are read once.
 */
import { cleanup, render }         from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode }          from 'react';
import { useRef }                  from 'react';

import type { FlintHandle, FlintStorage } from '../CreateFlint.ts';
import type { SpriteHabitat }             from '../SpriteHabitat.ts';
import { createManualFrameSource }        from '../testing/ManualFrameSource.ts';
import { Flint }                          from './Flint.tsx';
import { useFlintHabitat }                from './UseFlintHabitat.ts';

const CHAT_HABITAT: SpriteHabitat = { kind: 'chat', description: 'The conversation with the agent.', suggestions: [] };

afterEach(cleanup);

function Chat(): ReactNode {
  const element = useRef<HTMLElement>(null);
  useFlintHabitat(element, CHAT_HABITAT);
  return <section ref={element} data-testid="chat">chat</section>;
}

interface PageProperties {
  readonly onHandle:          (handle: FlintHandle | null) => void;
  readonly storage?:          FlintStorage;
  readonly pixelsForOneUnit?: number;
}

function Page(properties: PageProperties): ReactNode {
  const home = useRef<HTMLDivElement>(null);
  const { storage, pixelsForOneUnit } = properties;
  return (
    <>
      <div ref={home} />
      <Flint
        home={home}
        frameSource={createManualFrameSource().frameSource}
        reducedMotion={() => false}
        onHandle={properties.onHandle}
        {...(storage === undefined ? {} : { storage })}
        {...(pixelsForOneUnit === undefined ? {} : { pixelsForOneUnit })}
      >
        <Chat />
      </Flint>
    </>
  );
}

function recordingStorage(storedValue: string | null): FlintStorage & { readonly reads: () => number } {
  let readCount = 0;
  return {
    readHabitatKind: () => {
      readCount += 1;
      return storedValue;
    },
    writeHabitatKind: () => undefined,
    reads:            () => readCount,
  };
}

test('Flint is made once its home is mounted, hands its handle over, and is destroyed on unmount', () => {
  const handles: (FlintHandle | null)[] = [];
  const page = render(<Page onHandle={(handle) => handles.push(handle)} />);
  expect(document.querySelectorAll('svg[data-flint]').length).toBe(1);
  expect(handles.length).toBe(1);
  expect(handles[0]?.perform('wave')).toBe('performed');
  page.unmount();
  expect(handles.at(-1)).toBeNull();
  expect(document.querySelector('svg[data-flint]')).toBeNull();
});

test('a habitat below Flint is registered and marked with its kind', () => {
  const page = render(<Page onHandle={() => undefined} />);
  expect(page.getByTestId('chat').getAttribute('data-sprite-habitat')).toBe('chat');
});

test('a storage that arrives later makes Flint again, which reads it, keeps one overlay and keeps the habitat registered', () => {
  const handles: (FlintHandle | null)[] = [];
  const onHandle = (handle: FlintHandle | null): void => {
    handles.push(handle);
  };
  const page = render(<Page onHandle={onHandle} />);
  const storage = recordingStorage('1:chat');
  page.rerender(<Page onHandle={onHandle} storage={storage} />);
  expect(storage.reads()).toBe(1);
  expect(handles.map((handle) => (handle === null ? 'gone' : 'made'))).toEqual(['made', 'gone', 'made']);
  expect(document.querySelectorAll('svg[data-flint]').length).toBe(1);
  expect(page.getByTestId('chat').getAttribute('data-sprite-habitat')).toBe('chat');
});

test('the same storage on a later render leaves Flint as it is, and the other options are read once', () => {
  const handles: (FlintHandle | null)[] = [];
  const onHandle = (handle: FlintHandle | null): void => {
    handles.push(handle);
  };
  const storage = recordingStorage(null);
  const page = render(<Page onHandle={onHandle} storage={storage} pixelsForOneUnit={1} />);
  page.rerender(<Page onHandle={onHandle} storage={storage} pixelsForOneUnit={0.5} />);
  expect(handles.length).toBe(1);
  expect(storage.reads()).toBe(1);
});
