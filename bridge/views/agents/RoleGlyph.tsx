/** A job's role as a lettered tile in its role's lane colours: B builder, R reviewer, P intake, A Assistant, O onboarder. Its word follows it. */
import type { RoleMark } from './AgentsModel.ts';

export function RoleGlyph({ mark }: { readonly mark: RoleMark }) {
  return <span className="agents-role-glyph" data-state={mark.state} aria-hidden="true">{mark.letter}</span>;
}
