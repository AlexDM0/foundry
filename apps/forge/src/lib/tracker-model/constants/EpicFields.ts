/** What an epic's key may be and how many colours its slot chooses from. */

/** Lower-case letters and digits in words joined by single hyphens, since the key is also the epic's file name. */
export const EPIC_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Device names Windows reserves with any extension, so `<key>.md` could not be stored there; refused on every OS alike. */
export const RESERVED_DEVICE_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;

export const FIRST_EPIC_COLOUR_SLOT = 1;

export const EPIC_COLOUR_SLOT_COUNT = 6;
