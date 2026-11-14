/**
 * `useCueOnChange` in a happy-dom document. What matters: the occasion a component mounts with sends nothing, since it is no happening; a
 * new occasion sends its cue once, also when it names the same cue as before; a render with the same occasion sends nothing again; and no
 * occasion sends nothing.
 */
import { cleanup, render }         from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import { useCueOnChange, type CueOccasion } from './UseCueOnChange.ts';

afterEach(cleanup);

function Habitat(properties: { readonly sendCue: (cueName: string) => void; readonly occasion: CueOccasion | null }) {
  useCueOnChange(properties.sendCue, properties.occasion);
  return null;
}

test('the mounted occasion sends nothing, each new one sends its cue once, and no occasion sends nothing', () => {
  const cues: string[] = [];
  const sendCue = (cueName: string): void => {
    cues.push(cueName);
  };
  const page = render(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-is-done', occasionKey: 'turn-1:agent-is-done' }} />);
  expect(cues).toEqual([]);
  page.rerender(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-is-writing', occasionKey: 'turn-2:agent-is-writing' }} />);
  page.rerender(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-is-writing', occasionKey: 'turn-2:agent-is-writing' }} />);
  page.rerender(<Habitat sendCue={sendCue} occasion={null} />);
  page.rerender(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-is-writing', occasionKey: 'turn-3:agent-is-writing' }} />);
  expect(cues).toEqual(['agent-is-writing', 'agent-is-writing']);
});
