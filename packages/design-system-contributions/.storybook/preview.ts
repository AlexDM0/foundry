/**
 * Every story renders on the design-system package's entry stylesheet and fonts, linked first as a host links them, then this package's.
 * The theme toolbar sets `data-theme` on the `html` element as a host does: light, dark, or auto, which follows the system. Motion is ready
 * from the start, so the stories show their transitions.
 */
import type { Decorator, Preview } from '@storybook/react-vite';
import { loadDesignSystemFonts }   from 'design-system/FontLoader';

import 'design-system/design-system.css';
import '../styles/design-system-contributions.css';

loadDesignSystemFonts();

type ThemeChoice = 'light' | 'dark' | 'auto';

function themeOf(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'auto') return choice;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const themeDecorator: Decorator = (Story, context) => {
  const choice: ThemeChoice = context.globals['theme'] === 'dark' || context.globals['theme'] === 'auto' ? context.globals['theme'] : 'light';
  document.documentElement.dataset['theme'] = themeOf(choice);
  document.documentElement.dataset['motion'] = 'ready';
  return Story();
};

const preview: Preview = {
  decorators:     [themeDecorator],
  initialGlobals: { theme: 'light' },
  globalTypes:    {
    theme: {
      description: 'The theme the html element carries',
      toolbar:     {
        title:        'Theme',
        icon:         'mirror',
        dynamicTitle: true,
        items:        [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
          { value: 'auto', title: 'Auto' },
        ],
      },
    },
  },
  parameters: { layout: 'padded' },
};

export default preview;
