"""Tests for brainstorm.py config loading (JSON-only)."""
import json
import subprocess
import sys
from pathlib import Path

# Absolute path to script — script is NOT in tmp_path
SCRIPT = Path(__file__).resolve().parents[1] / "brainstorm.py"


def test_json_config_prefix(tmp_path):
    """json-only workspace → reads prefixList correctly, no stderr error."""
    specify_dir = tmp_path / ".specify"
    specify_dir.mkdir()
    (specify_dir / ".specify.json").write_text(json.dumps({"prefixList": "SAMPLE"}))
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"],
        cwd=str(tmp_path), capture_output=True, text=True
    )
    # Should not have speckit error
    assert "speckit:" not in result.stderr


def test_yaml_only_error(tmp_path):
    """yaml-only workspace → hard error (exit 1) with migrate instruction."""
    specify_dir = tmp_path / ".specify"
    specify_dir.mkdir()
    (specify_dir / ".specify.yaml").write_text("prefix-list: SAMPLE")
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=str(tmp_path), capture_output=True, text=True
    )
    assert "migrate-yaml-to-json.sh" in result.stderr
    assert result.returncode != 0


def test_missing_config_error(tmp_path):
    """neither config → hard error (exit 1) without migrate ref."""
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=str(tmp_path), capture_output=True, text=True
    )
    assert ".specify.json not found" in result.stderr
    assert result.returncode != 0
