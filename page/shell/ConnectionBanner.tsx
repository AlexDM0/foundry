/**
 * The banner under the page title while Gaia's own event stream is lost, or while the page cannot read the server's fleet documents at all;
 * with no page title, as for a forge in place, it heads the main area.
 */
import { Banner } from 'design-system/Banner';

import type { FleetStreamState } from '../api/FleetStreamClient.ts';

export interface ConnectionBannerProps {
  readonly streamState: FleetStreamState;
}

const STREAM_LOST_SENTENCE = 'Gaia\'s server could not be reached. Trying again.';

const PAGE_OUT_OF_DATE_SENTENCE = 'This page does not match Gaia\'s server, and reloading it did not help.';

function sentenceOf(streamState: FleetStreamState): string | null {
  if (streamState === 'lost') return STREAM_LOST_SENTENCE;
  if (streamState === 'page-out-of-date') return PAGE_OUT_OF_DATE_SENTENCE;
  return null;
}

export function ConnectionBanner({ streamState }: ConnectionBannerProps) {
  const sentence = sentenceOf(streamState);
  if (sentence === null) return null;
  return (
    <div className="gaia-connection-banner">
      <Banner tone="error" role="alert" text={sentence} />
    </div>
  );
}
