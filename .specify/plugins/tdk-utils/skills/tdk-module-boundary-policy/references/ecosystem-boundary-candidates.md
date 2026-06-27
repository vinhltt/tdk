# Ecosystem Boundary Candidates

These tools are candidates for human review. They stay manual/deferred unless
matching repo evidence exists.

| Ecosystem | Candidate | Evidence that can unlock a snippet | Default posture |
|---|---|---|---|
| Ownership review | CODEOWNERS | `.github/CODEOWNERS` or docs requiring owner review | Manual/deferred owner-review guidance, not dependency enforcement |
| Java | ArchUnit | Java source plus existing ArchUnit tests or dependency | Manual/deferred architecture-test candidate |
| Python | Import Linter | Python package plus existing Import Linter config/dependency | Manual/deferred contract candidate |
| Ruby/Rails | Packwerk | Rails app plus existing Packwerk package files/dependency | Manual/deferred package-boundary candidate |
| Bazel | Visibility rules | Bazel workspace and existing visibility conventions | Manual/deferred build-graph candidate |

## Rules

- Do not translate JS/TS snippets into other ecosystems without matching tool
  evidence.
- Do not add new dependencies.
- Do not create package/module files for these tools.
- Document the tool as a candidate, the evidence needed, and the limitation.

Source references:

- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- https://www.archunit.org/userguide/html/000_Index.html
- https://import-linter.readthedocs.io/en/latest/contract_types.html
- https://github.com/Shopify/packwerk
- https://shopify.engineering/enforcing-modularity-rails-apps-packwerk
- https://bazel.build/concepts/visibility
