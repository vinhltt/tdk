# Setup Obsidian & Plugins — Windows

Guide to install Obsidian and required plugins on **Windows** to integrate with Claude Code (smart-obsidian MCP).

## Prerequisites

- Windows 10/11
- Obsidian → [download here](https://obsidian.md/download)
- Claude Code running with `.mcp.json` configured

---

## 1. Install Obsidian

1. Download the `.exe` installer from https://obsidian.md/download
2. Run the installer → Next → Install → Finish
3. Open Obsidian → select **Open folder as vault** → point to the `.specify/` folder in the project:
   ```
   path\to\project\.specify
   ```

---

## 2. Enable Community Plugins & Install Plugins

Go to **Settings** (⚙️) → **Community Plugins** → click **Turn on community plugins** to disable Restricted Mode.

Trust the plugin author when prompted, then browse and install the required plugins. Use **Show installed only** to verify installation. If a plugin is installed but throws a permission denied error, uninstall and reinstall it, then re-enable it.

> Repeat the same steps for the remaining plugins: **MCP Tools**, **Smart Connections**, **Local REST API**.

After installing MCP Tools, install the MCP server from the plugin settings and confirm the success message appears.

---

## 3. Configure .mcp.json for smart-obsidian

### Step 1 — Copy template to create local .mcp.json

`.mcp.json` is gitignored (contains secrets). Copy the template first:

```bash
cp .mcp.json.template .mcp.json
```

### Step 2 — Copy API Key (from Section 2)

Already copied in the step above. If not yet:

1. **Settings** → **Community Plugins** → **Local REST API** → **Settings**
2. Copy the full string under **API Key**

### Step 3 — Update .mcp.json

Open `.mcp.json` at the project root, paste your API key into the `smart-obsidian` block:

```json
{
    "mcpServers": {
        "smart-obsidian": {
            "command": "./.specify/.obsidian/plugins/mcp-tools/bin/mcp-server",
            "args": [],
            "env": {
                "OBSIDIAN_API_KEY": "<PASTE_YOUR_API_KEY_HERE>"
            }
        }
    }
}
```

> The `command` path uses forward slashes (`/`) — compatible with Git Bash and Node.js on Windows.

### Step 4 — Restart Claude Code

Save `.mcp.json` → close and reopen the Claude Code terminal.

Verify the connection with `/mcp` in Claude Code and confirm the `smart-obsidian` server is connected.

---

## 4. API Key Security

> **IMPORTANT:** `.mcp.json` is gitignored and contains real secrets — do NOT commit to Git!
> Use `.mcp.json.template` (no secrets) as the committed reference.

If you accidentally committed the old key:

1. Obsidian → **Local REST API** settings → **Regenerate API Key**
2. Update the new key in your local `.mcp.json`

---

## 5. Setup Checklist

- [ ] Obsidian installed and vault `.specify/` opened
- [ ] **Local REST API** plugin enabled
- [ ] **Smart Connections** plugin enabled
- [ ] **MCP Tools** plugin enabled
- [ ] `.mcp.json.template` copied to `.mcp.json` (local only)
- [ ] API Key copied and added to `.mcp.json`
- [ ] Claude Code restarted → smart-obsidian connected successfully
- [ ] Discarded changes to `community-plugins.json` files in `.specify/.obsidian/plugins/` if any

---

## Related

- [Setup Claude Code Environment](./claude-code-environment.md)
- [TDK Setup Guide](./installation.md)
- [Local REST API Plugin](https://github.com/coddingtonbear/obsidian-local-rest-api)
- [MCP Tools Plugin](https://github.com/jacksteamdev/obsidian-mcp-tools)
