# Technical Context

> Project-wide tech baseline. SOT cho `## Technical Context` section của plan.md.
> **Scope:** describe tech baseline of THIS project (not monorepo, not host repo).
> Update khi: upgrade stack/version, thêm core dep, đổi performance target.

## Stack [REQUIRED]

| Aspect | Value |
|--------|-------|
| **Language/Version** | [e.g., TypeScript 5.4, Python 3.11, C# 12] |
| **Runtime** | [e.g., Bun 1.1, Node 20, .NET 8] |
| **Primary Dependencies** | [Top 3-5 frameworks/libs định hình architecture] |
| **Testing** | [vitest, pytest, xUnit — incl. version nếu pinned] |
| **Target Platform** | [e.g., Linux server, Cloudflare Workers, iOS 15+, CLI cross-platform] |

---

## Optional Sections

> Include only sections relevant to your project type.
> **Delete entire section heading + content if N/A** (don't leave "N/A" placeholders).

### Performance Goals

- [Goal 1 — e.g., p95 < 200ms cho API endpoints]
- [Goal 2 — e.g., 10k concurrent users, 60 fps UI]

### Scale / Scope

- **Users**: [expected scale]
- **Data**: [size/growth rate]
- **Codebase**: [LOC, modules — for context]

### Storage

| Type | Tech |
|------|------|
| [primary DB] | [PostgreSQL 15] |
| [cache] | [Redis 7] |
| [file storage] | [S3 / local FS] |

### Constraints

- [Constraint 1 — e.g., < 100MB memory, offline-capable]
- [Constraint 2]

### External Services / Integrations

| Service | Purpose | Integration Type |
|---------|---------|-----------------|
| [name] | [purpose] | [REST API / SDK / webhook] |

---

## Notes [REQUIRED]

[Project-specific decisions: version pinning rationale, deprecated paths,
migration in progress, project type context (e.g., "CLI tooling — no perf/scale targets").]
