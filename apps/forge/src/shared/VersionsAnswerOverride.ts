import { SystemVersionUtil }     from 'system-versions/SystemVersionUtil';
import type { VersionsDocument } from 'system-versions/VersionsDocument';

import { VERSIONS_ANSWER_VARIABLE, versionsAnswerText } from './Environment.ts';
import { OperationRefusal }                             from './OperationRefusal.ts';

const VERSIONS_ANSWER_SEPARATOR = '/';

/**
 * A test setting for a client's recordings: what `GET /api/versions` answers, `<current>/<minimum supported>` such as `1.3/1.0`, in place
 * of `FORGE_SYSTEM_VERSIONS`, so a client records a forge ahead of it or of another major, which no real forge is. Empty or whitespace
 * reads as unset; any other value but two `major.minor` versions, the minimum not newer than the current, is refused.
 */
export function versionsAnswerOverride(): VersionsDocument | undefined {
  const value = versionsAnswerText();
  if (value === undefined) return undefined;
  const [currentText, minimumText, ...rest] = value.split(VERSIONS_ANSWER_SEPARATOR);
  const current = SystemVersionUtil.versionOfText(currentText ?? '');
  const minimumSupported = SystemVersionUtil.versionOfText(minimumText ?? '');
  if (rest.length > 0 || current === null || minimumSupported === null || SystemVersionUtil.isOlder(current, minimumSupported)) {
    throw new OperationRefusal('refused', { kind: 'malformed-versions-answer', variable: VERSIONS_ANSWER_VARIABLE, value });
  }
  return { current, minimumSupported };
}
