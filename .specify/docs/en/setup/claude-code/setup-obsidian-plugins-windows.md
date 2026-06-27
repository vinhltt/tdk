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

![Obsidian open vault](./assets/obsidian/windows/obsidian-windows-open-vault.png)

---

## 2. Enable Community Plugins & Install Plugins

Go to **Settings** (⚙️) → **Community Plugins** → click **Turn on community plugins** to disable Restricted Mode.

Trust the plugin author to allow installation:

![Trust author and enable community plugins](./assets/obsidian/windows/trust-author-and-enable-plugins.png)

Browse and install required plugins:

![Browse community plugins](./assets/obsidian/windows/browse-plugins.png)

View installed plugins (Show installed only):

![Show installed only](./assets/obsidian/windows/show-installed-only.png)

If a plugin is installed but throws a permission denied error, uninstall and reinstall it:

![Uninstall plugin](./assets/obsidian/windows/uninstall-plugin.png)

![Re-install plugin](./assets/obsidian/windows/re-install-plugin.png)

![Re-enable plugin after installation](./assets/obsidian/windows/re-enable-plugin.png)

> Repeat the same steps for the remaining plugins: **MCP Tools**, **Smart Connections**, **Local REST API**.

After installing MCP Tools, install the MCP server from the plugin settings:

![Install MCP Server](./assets/obsidian/windows/install-mcp-server.png)

![Install MCP Server Success](./assets/obsidian/windows/install-mcp-success.png)

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

![Local REST API - copy API Key](./assets/obsidian/windows/copy-apikey-obsidian-local-rest-api.png)

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

![Paste API Key to smart-obsidian MCP](./assets/obsidian/windows/paste-apikey-to-smart-obsidian-mcp.png)

> The `command` path uses forward slashes (`/`) — compatible with Git Bash and Node.js on Windows.

### Step 4 — Restart Claude Code

Save `.mcp.json` → close and reopen the Claude Code terminal.

Verify the connection with `/mcp` in Claude Code:

![Smart Obsidian MCP Connect Success](./assets/obsidian/windows/smart-obsidian-mcp-connect-success.png)

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

![Discard change community plugins](./assets/obsidian/windows/discard-change-community-plugins.png)

---

## Related

- [Setup Claude Code README](./README.md)
- [TDK Setup Guide](../speckit-setup-guide.md)
- [Local REST API Plugin](https://github.com/coddingtonbear/obsidian-local-rest-api)
- [MCP Tools Plugin](https://github.com/jacksteamdev/obsidian-mcp-tools)
