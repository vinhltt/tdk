# Setup Guide

Dùng guide này khi command TDK chưa hiển thị, dependency bị thiếu, hoặc consumer project vừa clone cần setup local.

## Fast Path

Chạy từ consumer project root:

```bash
bash .specify/setup.sh
```

Script sẽ kiểm tra prerequisite, cài Bun nếu thiếu, cài dependency TypeScript setup, tạo hoặc verify Python venv, kiểm tra config detection, và đăng ký command metadata có sẵn.

## Options

```bash
bash .specify/setup.sh --help
bash .specify/setup.sh --force
bash .specify/setup.sh --skip-venv
bash .specify/setup.sh --skip-config
```

## Cài Plugin Cho Harness

Sau khi payload `.specify/` đã tồn tại, chạy trình cài harness từ mã nguồn TDK
tại `packages/tdk-setup`:

```bash
cd /path/to/tdk/packages/tdk-setup
CONSUMER_ROOT=/path/to/consumer-project
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-core --dry-run
bun src/index.ts install "$CONSUMER_ROOT" --harness claude --plugins tdk-core --yes
```

Dùng `--harness codex` để cài Codex riêng sau khi materialize các gói trong
consumer. Tại consumer root, chạy `convert --all-plugins`, rồi manifest compute
với `--write` và `--check`; các gói cùng manifest tại
`.specify/codex-plugins/` cục bộ của consumer phải tồn tại trước khi cài.
`convert --check` cũng yêu cầu output đã được materialize. Không hỗ trợ cài
Claude và Codex trong cùng một lần chạy.

Mọi lựa chọn đều được phân giải thành bộ base gắn kết gồm `tdk-core`,
`tdk-inception`, `tdk-memory`, và `tdk-utils`. `--plugins` dùng để yêu cầu các
workflow tùy chọn; `--plugins tdk-core` vẫn là cú pháp tương thích để chỉ cài
base. Dùng `--all-plugins` để yêu cầu toàn bộ plugin tùy chọn.

Trong môi trường TTY, bỏ cả hai bộ chọn để chọn plugin tùy chọn theo chế độ
tương tác; lựa chọn trống nghĩa là chỉ cài base. Khi chạy không có TTY, phải
truyền `--plugins <name[,name]>` hoặc `--all-plugins`. Bản xem trước hiển thị
riêng `Requested optional plugins` và tập đầy đủ `Resolved plugins`.

`.specify/install-settings.json` lưu tập plugin tùy chọn được yêu cầu gần nhất ở
phạm vi toàn cục. Ownership manifest của Claude và Codex lưu độc lập các plugin
đã phân giải và thực sự được cài cho từng harness.

Với consumer đã được cài trước khi tách ownership sang `tdk-inception`, hãy sao
lưu consumer, cập nhật lại payload đã phân phối, rồi chạy riêng
`--all-plugins --dry-run` và `--all-plugins --yes` cho từng harness đã cài.
Không có cơ chế migration cho lựa chọn đã lưu; cần xem xét xung đột thay vì xóa
hoặc ghi đè target do người dùng sửa.

## Sau Khi Setup

Làm theo các manual step mà script in ra. Tối thiểu:

- Cài Claude Code nếu script báo đang thiếu.
- Enable Context7 integration khi cần docs-seeker support.
- Mở Claude Code tại consumer project root.
- Verify command `/tdk-` hiển thị trong Claude Code chat.

Khi cài harness theo cách chọn lọc, hãy chọn plugin tùy chọn phù hợp với
workflow cần dùng: child feature, parent epic, hoặc cả hai. Bộ base gắn kết luôn
được cài. Sau đó, xác nhận các command `/tdk-` của workflow đó hiển thị trong
Claude Code chat.

## Khắc Phục Sự Cố

| Vấn đề | Cách xử lý |
|---|---|
| Cài Bun fail | Chạy lại `bash .specify/setup.sh`; nếu vẫn fail, cài Bun thủ công từ `https://bun.sh`. |
| Python venv fail | Chạy lại không dùng `--skip-venv`; đảm bảo có Python 3.8+. |
| Command registration fail | Cài Claude Code, rồi chạy lại setup. |
| Command `/tdk-` không hiển thị | Restart Claude Code từ project root sau khi setup xong. |
