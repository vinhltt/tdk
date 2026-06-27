# Audit Workflow

Use audit mode to compare observed repo evidence against existing topology and
policy intent. It is observe-only.

1. Read topology, runtime config, existing policy artifacts, and bounded repo
   evidence.
2. Detect existing stack configuration without changing it.
3. Compare imports/packages/path evidence to the allowed and forbidden edge
   tables.
4. Record matches, violations, missing evidence, and confidence.
5. Write `module-boundary-policy.md` with findings and next questions.
6. Write `enforcement-snippets.md` only when the audit also identifies reviewed
   snippet candidates; otherwise summarize why snippets are deferred.

Audit mode must not write, modify, or normalize any existing config file.
