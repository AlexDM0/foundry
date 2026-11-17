/**
 * The options of the entity decisions whose answer the Overseer acts on: `work-in-other-entity` (E15), `package-refused` (E22) and
 * `whitelist-removed-mid-crossing` (E19). An answer is stored as the label User chose, so the Overseer reads it back by the label; an answer
 * that names none of them acts on nothing.
 */
export const ENTITY_DECISION_ANSWERS = {
  /** Followed by the key of the entity the ticket moves to. */
  moveToEntityPrefix:            'Move to ',
  abandon:                       'Abandon',
  dropThePackageChange:          'Drop the package change',
  turnItIntoANeed:               'Turn it into a need',
  finishUnderTheOldWhitelist:    'Finish under the old whitelist',
  turnThePackageChangeIntoANeed: 'Turn the package change into a need',
} as const;

/** The decisions whose answer moves the ticket, which the Overseer acts on at its next pass. */
export const DECISION_KINDS_ACTED_ON = ['work-in-other-entity', 'package-refused', 'whitelist-removed-mid-crossing'] as const;

export type DecisionKindActedOn = typeof DECISION_KINDS_ACTED_ON[number];
