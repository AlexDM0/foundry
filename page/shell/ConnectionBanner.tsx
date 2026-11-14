/** The banner under the top bar while Gaia's own event stream is lost, or while the page cannot read the server's fleet documents at all. */
import { Banner } from 'design-system/Banner';

import type { FleetStreamState } from '../api/FleetStreamClient.ts';

export interface ConnectionBannerProps {
  readonly streamState: FleetStreamState;
}

const STREAM_LOST_SENTENCE = 'Gaia\'s server could not be reached. Trying again.';

const PAGE_OUT_OF_DATE_SENTENCE = 'This page does not match Gaia\'s server, and reloading it did not help.';

export function ConnectionBanner({ streamState }: ConnectionBannerProps) {
  if (streamState === 'lost') return <Banner tone="error" role="alert" text={STREAM_LOST_SENTENCE} />;
  if (streamState === 'page-out-of-date') return <Banner tone="error" role="alert" text={PAGE_OUT_OF_DATE_SENTENCE} />;
  return null;
}
