# Setup Guide

Dùng guide này khi command TDK chưa hiển thị, dependency bị thiếu, hoặc consumer project vừa clone cần setup local.

## Fast Path

Chạy từ consumer project root:

```bash
bash .specify/setup.sh
```

Script sẽ kiểm tra prerequisite, cài Bun nếu thiếu, cài dependency TypeScript setup, tạo hoặc verify Python venv, kiểm tra config detection, và đăng ký các plugin marketplace có sẵn.

## Options

```bash
bash .specify/setup.sh --help
bash .specify/setup.sh --force
bash .specify/setup.sh --skip-venv
bash .specify/setup.sh --skip-config
bash .specify/setup.sh --skip-plugins
```

## Sau Khi Setup

Làm theo các manual step mà script in ra. Tối thiểu:

- Cài Claude Code nếu script báo đang thiếu.
- Enable Context7 plugin khi cần docs-seeker support.
- Mở Claude Code tại consumer project root.
- Verify command `/tdk-` hiển thị trong Claude Code chat.

## Khắc Phục Sự Cố

| Vấn đề | Cách xử lý |
|---|---|
| Cài Bun fail | Chạy lại `bash .specify/setup.sh`; nếu vẫn fail, cài Bun thủ công từ `https://bun.sh`. |
| Python venv fail | Chạy lại không dùng `--skip-venv`; đảm bảo có Python 3.8+. |
| Plugin registration fail | Cài Claude Code, rồi chạy lại setup không dùng `--skip-plugins`. |
| Command `/tdk-` không hiển thị | Restart Claude Code từ project root sau khi setup xong. |
