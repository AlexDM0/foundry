/**
 * A job's role as a drawn tile in its role's lane colours: a hammer for a builder, a magnifier for a reviewer, an inbox for intake, a
 * lifebuoy for the Assistant and a flow for the pipeline agent; a roleless merge, refresh or constitution commit draws its kind, and any
 * other a dot. The label names the role to assistive technology, so the word printed beside the tile is hidden from it.
 */
import { Icon }          from '../../design-system/Icon.tsx';
import type { RoleMark } from './AgentsModel.ts';

export function RoleGlyph({ mark, label }: { readonly mark: RoleMark; readonly label: string }) {
  return <span className="agents-role-glyph" data-state={mark.state}><Icon name={mark.icon} label={label} /></span>;
}
