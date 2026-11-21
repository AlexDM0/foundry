/** Every story renders on the package's stylesheet. The theme toolbar sets `data-theme` on the `html` element as a host does. */
import type { Decorator, Preview } from '@storybook/react-vite';

import '../styles/brand.css';

type Theme = 'light' | 'dark';

const themeDecorator: Decorator = (Story, context) => {
  const theme: Theme = context.globals['theme'] === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset['theme'] = theme;
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
        ],
      },
    },
  },
  parameters: { layout: 'padded' },
};

export default preview;
