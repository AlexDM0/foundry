/**
 * `useCueOnChange` in a happy-dom document. What matters: the occasion a component mounts with sends nothing, since it is no happening; a
 * new occasion sends its cue once, also when it names the same cue as before; a render with the same occasion sends nothing again; and no
 * occasion sends nothing. Data that arrives after mount, such as a chat's history, names its baseline key: nothing is sent before it, and
 * the occasion that comes with a new key is the data's state, no happening.
 */
import { cleanup, render }         from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import { useCueOnChange, type CueOccasion } from './UseCueOnChange.ts';

afterEach(cleanup);

function Habitat(properties: { readonly sendCue: (cueName: string) => void; readonly occasion: CueOccasion | null; readonly baselineKey?: string | null }) {
  useCueOnChange(properties.sendCue, properties.occasion, properties.baselineKey);
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

test('while the baseline key is null nothing is sent, and the occasion that comes with a new key is its baseline, not a happening', () => {
  const cues: string[] = [];
  const sendCue = (cueName: string): void => {
    cues.push(cueName);
  };
  const page = render(<Habitat sendCue={sendCue} occasion={null} baselineKey={null} />);
  page.rerender(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-asks-a-question', occasionKey: 'E1:agent-asks-a-question' }} baselineKey={null} />);
  page.rerender(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-failed', occasionKey: 'turn-1:agent-failed' }} baselineKey="J1" />);
  page.rerender(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-is-writing', occasionKey: 'turn-2:agent-is-writing' }} baselineKey="J1" />);
  page.rerender(<Habitat sendCue={sendCue} occasion={{ cueName: 'agent-is-done', occasionKey: 'turn-7:agent-is-done' }} baselineKey="J2" />);
  expect(cues).toEqual(['agent-is-writing']);
});
