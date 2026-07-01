# Hướng Dẫn Setup TDK

Hướng dẫn đầy đủ để setup TDK tooling sau khi clone một consumer repository.

> **Phạm vi:** Chỉ gồm TDK CLI tools, scripts, và Claude Code skills. Setup Docker, backend, hoặc frontend nằm trong tài liệu riêng của từng phần.

## Setup Nhanh (Khuyến Nghị)

Chạy installer tự động từ project root:

```bash
# Chạy từ consumer project root, không chạy bên trong .specify/
bash .specify/setup.sh
```

Script bootstrap prerequisites (`git`, `bun`) bằng bash, sau đó giao phần setup còn lại cho TypeScript (`setup.ts`). Sau khi script chạy xong, làm theo các manual steps được in ra.

> Nếu bạn muốn setup thủ công hoặc script bị lỗi, làm theo các mục bên dưới.

---

## 1. System Prerequisites

Cài đặt đầy đủ tool bắt buộc trước khi tiếp tục.

| Tool | Version tối thiểu | Kiểm tra | Mục đích |
|------|-------------------|----------|----------|
| Git | bất kỳ | `git --version` | Version control |
| Python | 3.8+ | `python --version` hoặc `python3 --version` | Scripts, skills, automation |
| Bun | 1.3+ | `bun --version` | TypeScript CLI runtime |

### Lệnh Cài Đặt

**Windows (Chocolatey, chạy với quyền Admin):**
```powershell
choco install python git -y
# Bun: powershell -c "irm bun.sh/install.ps1 | iex"
```

**macOS (Homebrew):**
```bash
brew install python git
curl -fsSL https://bun.sh/install | bash
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get update && sudo apt-get install -y python3 python3-venv git
# Bun
curl -fsSL https://bun.sh/install | bash
```

## 2. Python Virtual Environment

Một `.venv/` dùng chung ở project root được sử dụng bởi Claude skills, scripts trong `.specify/`, và quá trình phát triển project.

Xem hướng dẫn đầy đủ: [**Setup Claude Code Environment**](../../../en/guides/setup/claude-code-environment.md)

## 3. Cài Đặt Claude Code

Làm theo hướng dẫn chính thức để cài Claude Code CLI và VSCode extension:

**[https://docs.anthropic.com/en/docs/claude-code/getting-started](https://docs.anthropic.com/en/docs/claude-code/getting-started)**

Sau khi cài đặt, Claude Code sẽ có trong VSCode sidebar và có thể dùng qua lệnh terminal `claude`.

## 4. Đăng Ký Plugin Marketplace

Đăng ký local plugin marketplace một lần sau khi clone/pull để kích hoạt các skill được bundle sẵn.

Xem hướng dẫn đầy đủ: [Plugin Marketplace Setup](../../../en/guides/setup/plugin-marketplace-setup.md)

Sau khi đăng ký, setup các MCP integration cần thiết:

- **[Context7 Plugin Setup](../../../en/guides/setup/ctx7-mcp-setup.md)** *(bắt buộc, dùng cho docs-seeker)*
- **[GitHub MCP Setup](../../../en/guides/setup/github-mcp-setup.md)** *(tùy chọn, dùng để đọc repo GitHub)*

## 5. .specify.json (Chỉ Để Tham Khảo)

Workspace config tại [`.specify/.specify.json`](../../../../.specify.json) đã được commit sẵn. Không cần thao tác thêm.

Bản rút gọn của config hiện tại:

```yaml
version: "1.0"
name: "example-workspace"
architecture:
  type: "modular-monolith"
docs:
  path: ".specify/configurations"
sub-workspaces:
  - name: "frontend"
    path: "frontend"
  - name: "backend"
    path: "backend"
```

### Giải Thích Field

| Field | Bắt buộc | Mục đích |
|-------|----------|----------|
| `version` | Có | Version schema config, hiện tại là `1.0` |
| `name` | Có | Định danh workspace, xuất hiện dưới dạng `WORKSPACE_NAME` trong output của `detect-config.ts` |
| `architecture.type` | Có | Kiểu codebase: `monolith`, `modular-monolith`, `microservices`, hoặc `layered-application`. Dùng cho auto-detection khi project-init |
| `docs.path` | Có | Nơi TDK lưu project documentation, tính từ repo root |
| `sub-workspaces` | Không | Danh sách child workspaces (`name` + `path`). `detect-config.ts` tự nhận diện bạn đang ở sub-workspace nào dựa trên CWD |

> **Mẹo:** Xem `.specify/.specify.yaml.example` để có template đầy đủ gồm các field tùy chọn.

File này được `detect-config.ts` dùng để đọc workspace settings. Chỉ sửa khi cấu trúc workspace thay đổi.

## 6. Skill Dependencies (Tùy Chọn)

Base setup đủ cho hầu hết nhu cầu. Chỉ cài các package này khi dùng skill tương ứng:

| Skill | Package | Cài đặt |
|-------|---------|---------|
| Xử lý xlsx | `openpyxl` | `pip install openpyxl` |
| Xử lý PDF | `pypdf` | `pip install pypdf` |
| Xử lý PPTX | `markitdown[pptx]` | `pip install "markitdown[pptx]"` |
| MCP builder | `anthropic`, `mcp` | `pip install anthropic mcp` |
| GitHub issues | `requests` | Đã có trong base install |

**docs-seeker** hiện dùng context7 MCP tools (`resolve-library-id` + `query-docs`), không cần Node.js. Cần enable context7 plugin, xem [Plugin Marketplace setup](../../../en/guides/setup/plugin-marketplace-setup.md).

> Chạy các lệnh pip trong venv đã activate, hoặc dùng prefix `.venv/bin/pip` (Linux) / `.venv\Scripts\pip.exe` (Windows).

## 7. Verification Checklist

Chạy các check sau từ project root để xác nhận setup hoạt động:

### a) Config Detection
```bash
cd .specify/scripts/ts && bun src/commands/detect-config.ts
```

Kết quả mong đợi: JSON output có `"configFound": true` và `"workspaceName"` đúng với config.

### b) Python Imports
```bash
# Linux/Mac/Git Bash
.venv/bin/python -c "import requests, dotenv, yaml, git; print('All imports OK')"

# Windows
.\.venv\Scripts\python.exe -c "import requests, dotenv, yaml, git; print('All imports OK')"
```

### c) docs-seeker (context7 MCP)

Trong Claude Code, hỏi:
> "Use context7 to fetch docs for Laravel 11 — what are the available auth methods?"

Nếu response có tool calls `resolve-library-id` và `query-docs`, docs-seeker MCP đã hoạt động.

### d) Claude Code Commands

Trong Claude Code, prefix command `/tdk-` nên hiện ra. Các lệnh quan trọng:

- `/tdk-specify` — Tạo feature spec
- `/tdk-plan` — Lập implementation plan

## 8. File Map & Quick Reference

```text
consumer-project/
├── .specify/
│   ├── .specify.yaml              # Workspace config
│   ├── .specify.env.example       # Env template (copy thành .specify.env)
│   ├── scripts/bash/              # Automation scripts
│   │   └── ...
│   ├── docs/                      # Tất cả tài liệu TDK
│   │   ├── README.md              # Language index
│   │   ├── en/                    # English docs
│   │   │   ├── guides/setup/      # Installation & configuration guides
│   │   │   └── guides/scenarios/  # Workflow scenarios
│   │   └── vi/                    # Vietnamese docs
│   ├── configurations/            # Project documentation
│   ├── plugins/                   # Bundled Claude Code plugins & skills
│   └── templates/                 # Spec templates
├── .claude/
│   ├── rules/                     # Development rules & workflows
│   └── settings.json              # Claude Code config & permissions
├── .venv/                         # Shared Python venv (gitignored)
└── .mcp.json                      # MCP server config (gitignored)
```

## 9. Troubleshooting

| Vấn đề | Nguyên nhân | Cách xử lý |
|--------|-------------|------------|
| `detect-config.ts` fail | Thiếu bun | Cài Bun (mục 1) và chạy `cd .specify/scripts/ts && bun install` |
| Python `ModuleNotFoundError` | Chưa setup venv | Chạy lại setup script (mục 2) |
| Bash gặp lỗi parse CRLF | Windows line endings | Chuyển sang LF: `dos2unix .specify/.specify.env` hoặc cấu hình `git config core.autocrlf input` |
| `.specify.env` thay đổi nhưng không ăn | File không lưu LF | Đảm bảo line ending là LF và không có trailing whitespace |
| Không thấy command `/tdk-` | Claude Code không mở ở project root | Mở Claude Code từ consumer project root |
| docs-seeker không hoạt động | Chưa enable context7 plugin | Enable plugin trong `.claude/settings.json` -> `enabledPlugins` (mục 4) |

---

## Liên Quan

- [Context7 Plugin Setup](../../../en/guides/setup/ctx7-mcp-setup.md) — docs-seeker MCP integration
- [GitHub MCP Setup](../../../en/guides/setup/github-mcp-setup.md) — tùy chọn để đọc GitHub repo
- [Setup Claude Code Environment](../../../en/guides/setup/claude-code-environment.md)
- [Setup Obsidian Plugins — Windows](../../../en/guides/setup/obsidian-plugins-windows.md)
