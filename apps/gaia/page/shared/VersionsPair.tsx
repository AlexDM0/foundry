/**
 * The forge's versions beside this Gaia's, and the verdict above a rule with its reason: under a Forges row whose disclosure is open, and
 * in the notice the forge view holds instead of a board Gaia cannot show.
 */
import { VersionsVerdictLabel }                         from '../components/VersionsVerdictMark.tsx';
import { VersionsText }                                 from './VersionsText.tsx';
import { ForgeVersionsTextUtil, type VersionsPairText } from './utils/ForgeVersionsTextUtil.ts';

const THIS_GAIA = 'This Gaia';

const VERDICT = 'Verdict';

export function VersionsPair({ pair }: { readonly pair: VersionsPairText }) {
  return (
    <dl className="gaia-versions-pair">
      <dt className="gaia-versions-pair-name">{pair.forgeName}</dt>
      <dd className="gaia-versions-pair-value"><VersionsText text={pair.forgeText} /></dd>
      <dt className="gaia-versions-pair-name">{THIS_GAIA}</dt>
      <dd className="gaia-versions-pair-value"><VersionsText text={pair.gaiaText} /></dd>
      <dt className="gaia-versions-pair-name" data-verdict-row="">{VERDICT}</dt>
      <dd className="gaia-versions-pair-value" data-verdict-row="">
        <VersionsVerdictLabel verdict={pair.verdict} word={ForgeVersionsTextUtil.verdictWordOf(pair.verdict)} />
        {' · '}
        <VersionsText text={pair.reason} />
      </dd>
    </dl>
  );
}
