#!/bin/bash
# Setup Python Virtual Environment for Claude Code
# Location: .venv in project root
# Compatible with: Linux, macOS, Git Bash, WSL
# Run from: setup-claude-code/setup-python-venv.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Get project root (script directory parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
VENV_PATH="$PROJECT_ROOT/.venv"

echo -e "${CYAN}=== Claude Code Python venv Setup ===${NC}"
echo -e "${WHITE}Project: $PROJECT_ROOT${NC}"

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo -e "${RED}✗ Python not found. Please install Python 3.8+ first.${NC}"
        echo -e "${YELLOW}  Download from: https://www.python.org/downloads/${NC}"
        exit 1
    fi
    PYTHON_CMD="python"
else
    PYTHON_CMD="python3"
fi

PYTHON_VERSION=$($PYTHON_CMD --version 2>&1)
echo -e "${GREEN}✓ Python found: $PYTHON_VERSION${NC}"

# Remove old venv if exists
if [ -d "$VENV_PATH" ]; then
    echo -e "${YELLOW}Removing existing venv...${NC}"
    rm -rf "$VENV_PATH"
fi

# Create new virtual environment
echo -e "${YELLOW}Creating virtual environment...${NC}"
$PYTHON_CMD -m venv "$VENV_PATH"

# Determine Python executable in venv
if [ -f "$VENV_PATH/bin/python" ]; then
    VENV_PYTHON="$VENV_PATH/bin/python"
elif [ -f "$VENV_PATH/Scripts/python.exe" ]; then
    VENV_PYTHON="$VENV_PATH/Scripts/python.exe"
else
    echo -e "${RED}✗ Failed to create virtual environment${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Virtual environment created${NC}"

# Upgrade pip
echo -e "${YELLOW}Upgrading pip...${NC}"
"$VENV_PYTHON" -m pip install --upgrade pip --quiet

# Install common dependencies
echo -e "${YELLOW}Installing common dependencies...${NC}"
"$VENV_PYTHON" -m pip install --quiet \
    requests \
    python-dotenv \
    pyyaml \
    gitpython

# Check for requirements.txt in project root
REQUIREMENTS_FILE="$PROJECT_ROOT/requirements.txt"
if [ -f "$REQUIREMENTS_FILE" ]; then
    echo -e "${YELLOW}Installing from requirements.txt...${NC}"
    "$VENV_PYTHON" -m pip install -r "$REQUIREMENTS_FILE" --quiet
    echo -e "${GREEN}✓ Requirements installed${NC}"
fi

# Verify installation
echo -e "\n${CYAN}=== Verification ===${NC}"
VENV_PYTHON_VERSION=$("$VENV_PYTHON" --version 2>&1)
echo -e "${GREEN}✓ venv Python: $VENV_PYTHON_VERSION${NC}"

PACKAGE_COUNT=$("$VENV_PYTHON" -m pip list --format=freeze | wc -l)
echo -e "${GREEN}✓ Installed packages: $PACKAGE_COUNT${NC}"

echo -e "\n${CYAN}=== Setup Complete ===${NC}"
echo -e "${GREEN}Virtual environment ready at: $VENV_PATH${NC}"
echo -e "\n${YELLOW}To use this venv:${NC}"

if [ -f "$VENV_PATH/bin/activate" ]; then
    echo -e "${WHITE}  Activate: source .venv/bin/activate${NC}"
    echo -e "${WHITE}  Or use directly: .venv/bin/python${NC}"
else
    echo -e "${WHITE}  Activate: source .venv/Scripts/activate${NC}"
    echo -e "${WHITE}  Or use directly: .venv/Scripts/python.exe${NC}"
fi

echo -e "\n${YELLOW}This venv can be used by:${NC}"
echo -e "${WHITE}  - Scripts in .claude/skills/${NC}"
echo -e "${WHITE}  - Scripts in .specify/${NC}"
echo -e "${WHITE}  - Project development${NC}"
