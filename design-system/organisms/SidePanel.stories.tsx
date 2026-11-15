import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Text }   from '../atoms/Text.tsx';
import {
  SidePanel,
  SidePanelBody,
  SidePanelFoot,
  SidePanelHead
} from './SidePanel.tsx';

const meta = {
  title:     'Organisms/SidePanel',
  component: SidePanel,
  args:      {
    label:     'Example panel',
    isClosing: false,
    onClosed:  fn(),
    children:  (
      <>
        <SidePanelHead closeLabel="Close the example panel" onClose={fn()} title="Example detail" titleElement="h2" />
        <SidePanelBody><Text>Example content of the panel.</Text></SidePanelBody>
        <SidePanelFoot><Text typeRole="small" muted>Example foot</Text></SidePanelFoot>
      </>
    ),
  },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SidePanel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Detail: Story = {};
export const Question: Story = { args: { width: 'question' } };
export const FirstLine: Story = {
  args: {
    children: (
      <>
        <SidePanelHead closeLabel="Close the example panel" onClose={fn()} firstLine={<Text typeRole="small" muted>Example item 012</Text>}>
          <Text typeRole="page" element="h2">Example detail with a title as wide as the panel</Text>
        </SidePanelHead>
        <SidePanelBody><Text>Example content under a head whose first line holds the close.</Text></SidePanelBody>
      </>
    ),
  },
};
export const CloseOnly: Story = {
  args: {
    children: (
      <>
        <SidePanelHead closeLabel="Close the example panel" onClose={fn()} />
        <SidePanelBody><Text>Example content under a floating close.</Text></SidePanelBody>
      </>
    ),
  },
};
