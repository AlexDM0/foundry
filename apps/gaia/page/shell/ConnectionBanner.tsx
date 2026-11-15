/**
 * The banner under the page title while Gaia's own event stream is lost, while the page cannot read the server's fleet documents at all, once
 * the server no longer knows this window's session, or while no server answers at all; with no page title, as for a forge in place, it heads
 * the main area.
 */
import { Banner } from 'design-system/Banner';

import type { FleetStreamState } from '../api/FleetStreamClient.ts';

export interface ConnectionBannerProps {
  readonly streamState: FleetStreamState;
}

const STREAM_LOST_SENTENCE = 'Gaia\'s server could not be reached. Trying again.';

const PAGE_OUT_OF_DATE_SENTENCE = 'This page does not match Gaia\'s server, and reloading it did not help.';

const SESSION_LOST_SENTENCE = 'Gaia\'s server no longer knows this window, as after it restarted. Close this window and open Gaia again.';

const SERVER_ENDED_SENTENCE = 'Gaia\'s server no longer answers, and this window\'s session ended with it. Close this window and open Gaia again.';

function sentenceOf(streamState: FleetStreamState): string | null {
  if (streamState === 'lost') return STREAM_LOST_SENTENCE;
  if (streamState === 'page-out-of-date') return PAGE_OUT_OF_DATE_SENTENCE;
  if (streamState === 'session-lost') return SESSION_LOST_SENTENCE;
  if (streamState === 'server-ended') return SERVER_ENDED_SENTENCE;
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
