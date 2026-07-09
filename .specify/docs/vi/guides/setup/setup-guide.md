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

## Sau Khi Setup

Làm theo các manual step mà script in ra. Tối thiểu:

- Cài Claude Code nếu script báo đang thiếu.
- Enable Context7 integration khi cần docs-seeker support.
- Mở Claude Code tại consumer project root.
- Verify command `/tdk-` hiển thị trong Claude Code chat.

Với selective harness install, chọn command set khớp workflow cần dùng: child
feature, parent epic, hoặc cả hai. Sau khi install, verify các command `/tdk-`
của workflow đó hiển thị trong Claude Code chat.

## Khắc Phục Sự Cố

| Vấn đề | Cách xử lý |
|---|---|
| Cài Bun fail | Chạy lại `bash .specify/setup.sh`; nếu vẫn fail, cài Bun thủ công từ `https://bun.sh`. |
| Python venv fail | Chạy lại không dùng `--skip-venv`; đảm bảo có Python 3.8+. |
| Command registration fail | Cài Claude Code, rồi chạy lại setup. |
| Command `/tdk-` không hiển thị | Restart Claude Code từ project root sau khi setup xong. |
