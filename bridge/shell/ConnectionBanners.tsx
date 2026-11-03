/**
 * The banners the shell shows above every view: the page's session lost, the Overseer unreachable while the event stream is down, and
 * launches held for an install change.
 */
import { PRODUCT_NAMES }                        from '../../src/shared/constants/ProductNames.ts';
import { type SessionLoss, SessionWordingUtil } from '../utils/SessionWordingUtil.ts';

export interface ConnectionBannersProps {
  readonly streamIsDown:       boolean;
  /** When the last whole board arrived, as the browser's local time; `null` before the first. */
  readonly boardShownAsOf:     string | null;
  /** The Overseer's own 423 sentence when a command brought it, otherwise `null` while held by the board's word, `undefined` when not held. */
  readonly installHeldRefusal: string | null | undefined;
  readonly sessionLoss:        SessionLoss | null;
}

export function ConnectionBanners({
  streamIsDown, boardShownAsOf, installHeldRefusal, sessionLoss
}: ConnectionBannersProps) {
  return (
    <>
      {sessionLoss === null ? null : (
        <div className="bridge-banner bridge-banner-unreachable" role="alert">
          {SessionWordingUtil.bannerOf(sessionLoss)}
        </div>
      )}
      {streamIsDown ? (
        <div className="bridge-banner bridge-banner-unreachable" role="alert">
          {`Overseer unreachable, reconnecting; ${boardShownAsOf === null ? 'no board received yet' : `showing the board as of ${boardShownAsOf}`}.`}
        </div>
      ) : null}
      {installHeldRefusal === undefined ? null : (
        <div className="bridge-banner bridge-banner-install" role="alert">
          {installHeldRefusal ?? `The install version changed: run \`${PRODUCT_NAMES.PROGRAM} update\`.`}
        </div>
      )}
    </>
  );
}
