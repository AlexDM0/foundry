/**
 * One file in a list of instruction files: a document glyph, its mono name, what it is, an optional action the caller composes (an open
 * or edit text button) and a remove button. A change mark colours the row; the caller words the change in `roleText`, so it never reads
 * by colour alone. A ruled file is a row of a ruled box rather than a card of its own.
 */
import type { ReactNode } from 'react';

import { Icon }       from '../atoms/Icon.tsx';
import { IconButton } from '../atoms/IconButton.tsx';

export type ListedFileChange = 'changed' | 'new' | 'removed';

export interface ListedFileProps {
  readonly name:        string;
  readonly roleText:    string;
  /** The open or edit action before the remove button, such as a `TextButton`. */
  readonly action?:     ReactNode;
  readonly removeLabel: string;
  readonly onRemove:    () => void;
  readonly change?:     ListedFileChange;
  /** A 40px row of a ruled box: no card of its own, a hairline under it, and what it is in a quiet pill. */
  readonly ruled?:      boolean;
}

export function ListedFile({
  name, roleText, action, removeLabel, onRemove, change, ruled = false
}: ListedFileProps) {
  return (
    <div className="design-system-listed-file" data-change={change} data-ruled={ruled ? '' : undefined}>
      <span className="design-system-listed-file-glyph"><Icon name="document" label={null} /></span>
      <span className="design-system-listed-file-name">{name}</span>
      <span className="design-system-listed-file-role">{roleText}</span>
      {action}
      <IconButton glyph="close" accessibleName={removeLabel} onPress={onRemove} />
    </div>
  );
}
