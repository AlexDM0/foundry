import type { ReactNode } from 'react';

import type { PageFigure } from '../../design-system/PageTitle.tsx';

/**
 * What a view hands the shell: the parts of its page title, which the shell draws as the main area's first row, and the area under it. A
 * view that heads itself, as a forge in place and no forge yet do, gives no title, and its lead, figures and actions are not drawn.
 */
export interface ViewParts {
  readonly title:   string | null;
  readonly lead:    string;
  readonly figures: readonly PageFigure[];
  readonly actions: ReactNode;
  readonly content: ReactNode;
}
