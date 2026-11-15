/**
 * Every story renders on the package's entry stylesheet and fonts. The theme toolbar sets `data-theme` on the `html` element as a host
 * does: light, dark, or auto, which follows the system. Motion is ready from the start, so the stories show their animations.
 */
import type { Decorator, Preview } from '@storybook/react-vite';

import { loadDesignSystemFonts } from '../fonts/FontLoader.ts';
import '../styles/design-system.css';

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
