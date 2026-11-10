/**
 * The banners the shell shows above the header: the page's session lost, the Overseer unreachable while the event stream is down,
 * launches held for an install change, and the Overseer's warnings (in the error colours) and notices.
 */
import { PRODUCT_NAMES }                        from '../../src/shared/constants/ProductNames.ts';
import { Banner }                               from '../design-system/Banner.tsx';
import { type SessionLoss, SessionWordingUtil } from './SessionWordingUtil.ts';

export interface ConnectionBannersProps {
  readonly streamIsDown:       boolean;
  /** When the last whole board arrived, as the browser's local time; `null` before the first. */
  readonly boardShownAsOf:     string | null;
  /** The Overseer's own 423 sentence when a command brought it, otherwise `null` while held by the board's word, `undefined` when not held. */
  readonly installHeldRefusal: string | null | undefined;
  readonly sessionLoss:        SessionLoss | null;
  readonly warnings:           readonly string[];
  readonly notices:            readonly string[];
}

export function ConnectionBanners({
  streamIsDown, boardShownAsOf, installHeldRefusal, sessionLoss, warnings, notices
}: ConnectionBannersProps) {
  return (
    <>
      {sessionLoss === null ? null : <Banner tone="warn" role="alert" text={SessionWordingUtil.bannerOf(sessionLoss)} />}
      {streamIsDown
        ? (
          <Banner
            tone="warn"
            role="alert"
            lead="Overseer unreachable."
            text={`Reconnecting; ${boardShownAsOf === null ? 'no board received yet' : `showing the board as of ${boardShownAsOf}`}.`}
          />
        )
        : null}
      {installHeldRefusal === undefined
        ? null
        : (
          <Banner
            tone="warn"
            role="alert"
            lead="Launches held."
            text={installHeldRefusal ?? `The install version changed: run \`${PRODUCT_NAMES.PROGRAM} update\`.`}
          />
        )}
      {warnings.length === 0 ? null : (
        <ul className="bridge-banners" aria-label={`${warnings.length} warnings`}>
          {warnings.map((warning) => <Banner key={warning} tone="error" element="li" text={warning} />)}
        </ul>
      )}
      {notices.length === 0 ? null : (
        <ul className="bridge-banners" aria-label={`${notices.length} notices`}>
          {notices.map((notice) => <Banner key={notice} tone="warn" element="li" text={notice} />)}
        </ul>
      )}
    </>
  );
}
