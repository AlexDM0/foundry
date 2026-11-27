/**
 * A forge's verdict against the forge version this Gaia is built for, as a mark: a check for current, a half-filled dot for ahead, a dashed faded
 * dot for newer (waiting on a newer Gaia) and a dashed orange dot for older (waiting on User's Update forge). Only the dots take the package's state
 * tone; the check and the half dot are Gaia's own. The mark is decoration, so the label pairs it with its word.
 */
import { StateDot } from '../lib/design-system/DesignSystemInterface.ts';

export type MarkedVerdict = 'current' | 'ahead' | 'newer' | 'older';

export function VersionsVerdictMark({ verdict }: { readonly verdict: MarkedVerdict }) {
  return (
    <span className="gaia-versions-verdict-mark" aria-hidden="true">
      {verdict === 'current' ? (
        <svg className="gaia-versions-check" width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 5.2 L4.2 7.4 L8 2.8" />
        </svg>
      ) : null}
      {verdict === 'ahead' ? <span className="gaia-versions-half-dot" /> : null}
      {verdict === 'newer' ? <StateDot tone="muted" shape="dashed-ring" /> : null}
      {verdict === 'older' ? <StateDot tone="accent" shape="dashed-ring" /> : null}
    </span>
  );
}

export interface VersionsVerdictLabelProps {
  readonly verdict: MarkedVerdict;
  readonly word:    string;
}

export function VersionsVerdictLabel({ verdict, word }: VersionsVerdictLabelProps) {
  return (
    <span className="gaia-versions-verdict" data-verdict={verdict}>
      <VersionsVerdictMark verdict={verdict} />
      {word}
    </span>
  );
}
