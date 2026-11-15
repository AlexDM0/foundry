import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Button }          from './Button.tsx';
import { TypingIndicator } from './TypingIndicator.tsx';
import { View }            from './View.tsx';

/** An agent the reader sets to work: the indicator rises in as the work starts. */
function StartingAgent() {
  const [isTyping, setIsTyping] = useState(false);
  return (
    <View gap="twelve">
      <View row>
        <Button label={isTyping ? 'Stop the example' : 'Start the example'} compact onPress={() => setIsTyping(!isTyping)} />
      </View>
      {isTyping ? <TypingIndicator text="Example writes" accessibleName="Example is writing" /> : null}
    </View>
  );
}

const meta = {
  title:     'Atoms/TypingIndicator',
  component: TypingIndicator,
  args:      { text: 'Example writes', accessibleName: 'Example is writing' },
} satisfies Meta<typeof TypingIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Typing: Story = {};
export const Starting: Story = { render: () => <StartingAgent /> };
