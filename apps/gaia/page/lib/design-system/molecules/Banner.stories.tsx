import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';
import { fn }                  from 'storybook/test';

import { Button } from '../atoms/Button.tsx';
import { View }   from '../atoms/View.tsx';
import { Banner } from './Banner.tsx';

/** No banner, then each tone in turn. */
const TONES_IN_TURN = [null, 'warn', 'error', 'quiet'] as const;

/** A banner that comes and goes: it drops in as it arrives, and a change of tone turns its colours. */
function ArrivingBanner() {
  const [turn, setTurn] = useState(0);
  const tone = TONES_IN_TURN[turn % TONES_IN_TURN.length] ?? null;
  const nextTone = TONES_IN_TURN[(turn + 1) % TONES_IN_TURN.length] ?? null;
  return (
    <View gap="twelve">
      <View row>
        <Button label={nextTone === null ? 'Clear the banner' : `Show the ${nextTone} banner`} compact onPress={() => setTurn(turn + 1)} />
      </View>
      {tone === null ? null : <Banner tone={tone} text="The example stream is down; the page shows the last example state." />}
    </View>
  );
}

const meta = {
  title:     'Molecules/Banner',
  component: Banner,
  args:      { tone: 'warn', text: 'The example stream is down; the page shows the last example state.' },
} satisfies Meta<typeof Banner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Warn: Story = {};
export const ErrorTone: Story = { args: { tone: 'error', role: 'alert' } };
export const Quiet: Story = { args: { tone: 'quiet', role: 'status' } };
export const WithLead: Story = { args: { lead: 'Example lead.' } };
export const WithAction: Story = { args: { action: <Button label="Example retry" compact onPress={fn()} /> } };
export const Arriving: Story = { render: () => <ArrivingBanner /> };
