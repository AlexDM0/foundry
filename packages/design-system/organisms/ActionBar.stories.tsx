import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Button }    from '../atoms/Button.tsx';
import { Text }      from '../atoms/Text.tsx';
import { ActionBar } from './ActionBar.tsx';

const meta = {
  title:     'Organisms/ActionBar',
  component: ActionBar,
  args:      {
    label: 'Example actions',
    start: <Text muted>Two example changes wait.</Text>,
    end:   <Button label="Apply the example" emphasis="primary" onPress={fn()} />,
  },
} satisfies Meta<typeof ActionBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const StartAndEnd: Story = {};
