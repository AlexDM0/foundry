/** Why the Overseer refused a relayed command under the job's role, as `Bouncer.verdictOf` decides and a Hatch reply carries. */
export type RoleCommandRefusalReason =
  | 'hatch-identity-mismatch'
  | 'command-not-allowed-for-role'
  | 'worker-filing-flag'
  | 'worker-filing-limit'
  | 'not-own-draft'
  | 'not-own-draft-or-unclaimed-ticket'
  | 'incident-move-not-allowed'
  | 'incident-target-mismatch'
  | 'job-serves-no-setup'
  | 'need-outside-an-entity'
  | 'need-incomplete';
