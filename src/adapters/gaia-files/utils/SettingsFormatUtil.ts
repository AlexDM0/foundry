/** The steps of reading and writing `settings.json`: find its version, validate version 1, map it in to `GaiaSettings` and back out. */
import { isAbsolute } from 'node:path';

import { JsonValueUtil }                       from '../../../lib/json-value/JsonValueUtil.ts';
import type { GaiaSettings, NotificationKind } from '../../../shared/@types/GaiaSettings.ts';
import { CONTRACT_VERSIONS }                   from '../../../shared/constants/ContractVersions.ts';
import { SETTINGS_CHOICES }                    from '../../../shared/constants/SettingsChoices.ts';
import type { StoredSettingsVersion1 }         from '../@types/StoredSettings.ts';

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/** Gaia runs the program in each forge's root, so a path it stores never depends on the folder it runs in; the settings command holds the same. */
function isForgeProgramPath(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value !== '' && isAbsolute(value));
}

function kindsOf(value: unknown): Record<NotificationKind, boolean> | null {
  if (!JsonValueUtil.isJsonObject(value)) return null;
  const kinds: Partial<Record<NotificationKind, boolean>> = {};
  for (const kind of SETTINGS_CHOICES.notificationKinds) {
    const choice = JsonValueUtil.ownValueOf(value, kind);
    if (typeof choice !== 'boolean') return null;
    kinds[kind] = choice;
  }
  return kinds as Record<NotificationKind, boolean>;
}

/** The file's `version` key when it is a whole number; null when the key is absent or holds anything else. */
function versionOf(parsed: unknown): number | null {
  if (!JsonValueUtil.isJsonObject(parsed)) return null;
  const version = JsonValueUtil.ownValueOf(parsed, 'version');
  return Number.isInteger(version) ? version as number : null;
}

/** Version 1 with every key present and of its type; null otherwise. Keys the format does not name are left out. */
function storedSettingsOf(parsed: unknown): StoredSettingsVersion1 | null {
  if (!JsonValueUtil.isJsonObject(parsed) || versionOf(parsed) !== CONTRACT_VERSIONS.gaiaSettings) return null;
  const theme              = SETTINGS_CHOICES.themes.find((choice) => choice === JsonValueUtil.ownValueOf(parsed, 'theme'));
  const hiddenTrackerIds   = JsonValueUtil.ownValueOf(parsed, 'hiddenTrackerIds');
  const forgeProgramPath   = JsonValueUtil.ownValueOf(parsed, 'forgeProgramPath');
  const notifications      = JsonValueUtil.ownValueOf(parsed, 'notifications');
  const startForgesAtLogin = JsonValueUtil.ownValueOf(parsed, 'startForgesAtLogin');
  if (theme === undefined || !isStringList(hiddenTrackerIds) || typeof startForgesAtLogin !== 'boolean') return null;
  if (!isForgeProgramPath(forgeProgramPath)) return null;
  if (!JsonValueUtil.isJsonObject(notifications)) return null;
  const enabled = JsonValueUtil.ownValueOf(notifications, 'enabled');
  const kinds   = kindsOf(JsonValueUtil.ownValueOf(notifications, 'kinds'));
  if (typeof enabled !== 'boolean' || kinds === null) return null;
  return {
    version:       CONTRACT_VERSIONS.gaiaSettings,
    theme,
    hiddenTrackerIds,
    forgeProgramPath,
    notifications: { enabled, kinds },
    startForgesAtLogin,
  };
}

function settingsOf(stored: StoredSettingsVersion1): GaiaSettings {
  return {
    theme:              stored.theme,
    hiddenTrackerIds:   [...stored.hiddenTrackerIds],
    forgeProgramPath:   stored.forgeProgramPath,
    notifications:      { enabled: stored.notifications.enabled, kinds: { ...stored.notifications.kinds } },
    startForgesAtLogin: stored.startForgesAtLogin,
  };
}

function storedFormOf(settings: GaiaSettings): StoredSettingsVersion1 {
  return {
    version:            CONTRACT_VERSIONS.gaiaSettings,
    theme:              settings.theme,
    hiddenTrackerIds:   [...settings.hiddenTrackerIds],
    forgeProgramPath:   settings.forgeProgramPath,
    notifications:      { enabled: settings.notifications.enabled, kinds: { ...settings.notifications.kinds } },
    startForgesAtLogin: settings.startForgesAtLogin,
  };
}

export const SettingsFormatUtil = {
  versionOf,
  storedSettingsOf,
  settingsOf,
  storedFormOf,
} as const;
