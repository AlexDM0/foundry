## The rules of this stage

- The change of the ticket in {{sealedPackages}} is sealed. Do not change the files of these packages. Customs sends
  your session back for a change to a sealed change.
- Change only the files in the homes of `{{homeEntity}}` and in its `reach`. Make them agree with the packages as
  they are now. Read each package review: it can tell you about a problem in the files of `{{homeEntity}}`.
- If a package does not give `{{homeEntity}}` what it needs, do not write the files of the package. Do the same if you
  need one more change in a package. End with the outcome `package-return`. In `packageReturnReason`, write what the
  package must give. If more than one package is sealed, write the key of the package in `packageReturnEntity`.
- After a `package-return`, the Overseer lifts the seal, and the ticket goes back to the package build. The builder of
  the package gets your `packageReturnReason`. A ticket goes back one time only. A second return stops the ticket until
  User decides.
- This stage owns the evidence for the Acceptance of the ticket. In your report, give the evidence for each numbered
  item again, on the branch as it is at the end of this stage.
