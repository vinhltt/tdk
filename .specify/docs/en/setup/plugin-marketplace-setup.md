# Plugin Marketplaces

Local Claude Code plugin marketplace for the CommonDragon project.

## Available Plugins

| Plugin | Skills | Description |
|--------|--------|-------------|
| `tdk-core` | tdk-* commands (~31) | Core TDK commands for feature specs, planning, review, and workflow |
| `tdk-utils` | brainstorming, research, tdk-scout, docs-seeker, context-engineering, problem-solving, repomix, obsidian-brain, shard-doc, common, setup guides | Utility skills: use independently or alongside tdk-core |
| `tdk-memory` | tdk-memory-* (4 skills, query deferred) | Persistent project knowledge base: init/update/checksum/changelog .specify/memory/ (query: future Obsidian MCP skill) |

---

## Setup (first time after cloning)

> Only needs to be done **once** after clone/pull.

### Step 1 — Local marketplace (auto-detected)

The local marketplace is auto-detected via `.claude-plugin/marketplace.json` at the git root. **No registration needed.**

Reload VSCode (`Ctrl+Shift+P` → _Developer: Reload Window_) then verify the plugins are working.

Expected result: `tdk-plugin-marketplace` appears when running `/plugin marketplace list`.

### Step 2 — Verify the plugins are enabled

`.claude/settings.json` already contains:

```json
"enabledPlugins": {
  "tdk-core@tdk-plugin-marketplace": true,
  "tdk-utils@tdk-plugin-marketplace": true,
  "tdk-memory@tdk-plugin-marketplace": true
}
```

Once the marketplace is registered in Step 1, the plugins activate automatically. No further action needed.

### Step 3 — Confirm it works

Type `/tdk-` in Claude Code — the `/tdk-*` commands should appear.

**VSCode Extension:**

![Skills loaded in extension](./plugin-marketplace-assets/skill-load-success-in-extension.png)

**Terminal (CLI):**

![Skills loaded in terminal](./plugin-marketplace-assets/skill-load-success-in-terminal.png)

---

## Adding a new plugin

1. Create a skill directory at `./<plugin-name>/skills/<skill-name>/`
2. Add `SKILL.md` and any required scripts inside it
3. Register the skill in `.claude-plugin/marketplace.json` under `plugins[].skills`
4. Commit and ask teammates to re-run Step 1 to reload the marketplace

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Plugin not recognized | Verify `.claude-plugin/marketplace.json` exists at git root, then reload VSCode |
| Skill not appearing | Check `enabledPlugins` in `.claude/settings.json` |
| Structural errors | Run `/plugin validate .` to inspect the marketplace |
