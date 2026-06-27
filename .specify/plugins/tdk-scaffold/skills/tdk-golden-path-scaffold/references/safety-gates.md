# Safety Gates

These gates apply to every evidence file, recipe action, and write target.

## Path Gates

- Reject absolute paths.
- Reject `..` path traversal.
- Reject null bytes.
- Reject symlink escapes.
- Reject paths outside the workspace root.
- Reject secret-like file names.

Secret-like names include dotenv, env, credential, credentials, password, token,
tokens, secret, secrets, private, pem, p12, pfx, kubeconfig, ssh, auth, cookie,
cookies, session, and raw log dumps.

## Action Gates

- Unknown actions fail closed.
- Actions must be create-only unless the recipe marks an existing-safe path.
- Existing-safe content must be identical before it is classified as existing.
- Existing non-empty directories are skipped by default.

## Scope Gates

The scaffold does not generate fake business code, does not mutate
`.specify/.specify.json`, does not run shell commands, and does not install
package dependencies.

Guardrail summary: does not generate fake business code; does not mutate `.specify/.specify.json`; does not run shell commands; does not install package dependencies.

It does not produce implementation modules, API route files, UI files, database
migration files, package manager files, CI secret files, runtime routing files,
lint config, Nx config, Turborepo config, or dependency-cruiser config.

## Evidence Gates

Dry-run requires topology or runtime config evidence. Apply requires an approved
recipe and no unresolved ownership questions. Missing module-boundary policy is
a warning for dry-run, not an apply blocker unless the recipe depends on policy
claims.
