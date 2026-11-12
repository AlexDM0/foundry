/**
 * One file in a list of instruction files: its mono name, what it is, an optional open or edit action and a remove button. A change mark
 * colours the row; the caller words the change in `roleText`, so it never reads by colour alone.
 */
import { IconButton, TextButton } from './Button.tsx';

export type ListedFileChange = 'changed' | 'new' | 'removed';

export interface ListedFileOpenAction {
  readonly label:    string;
  readonly href?:    string;
  readonly onPress?: () => void;
}

export interface ListedFileProps {
  readonly name:        string;
  readonly roleText:    string;
  readonly openAction?: ListedFileOpenAction;
  readonly removeLabel: string;
  readonly onRemove:    () => void;
  readonly change?:     ListedFileChange;
}

export function ListedFile({
  name, roleText, openAction, removeLabel, onRemove, change
}: ListedFileProps) {
  return (
    <div className="bridge-listed-file" data-change={change}>
      <span className="bridge-listed-file-name">{name}</span>
      <span className="bridge-listed-file-role">{roleText}</span>
      {openAction === undefined ? null : <TextButton {...openAction} />}
      <IconButton glyph="close" accessibleName={removeLabel} onPress={onRemove} />
    </div>
  );
}
