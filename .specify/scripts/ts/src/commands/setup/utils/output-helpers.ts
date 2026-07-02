import type { StepStatus, StepResult } from '../types';

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const CYAN = '\x1b[0;36m';
const WHITE = '\x1b[1;37m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';

export function banner(projectRoot: string, force: boolean): string {
  const lines = [
    `${BOLD}${CYAN}`,
    '╔══════════════════════════════════════════════════════╗',
    '║                    TDK Installer                     ║',
    '╚══════════════════════════════════════════════════════╝',
    NC,
    `${WHITE}Project root: ${projectRoot}${NC}`,
  ];
  if (force) lines.push(`${YELLOW}Mode: --force (reinstall all)${NC}`);
  lines.push('');
  return lines.join('\n');
}

export function stepHeader(label: string): string {
  return `${BOLD}${label}${NC}`;
}

export function statusIcon(status: StepStatus): string {
  switch (status) {
    case 'pass': return `${GREEN}✓ PASS${NC}`;
    case 'fail': return `${RED}✗ FAIL${NC}`;
    case 'skipped': return `${YELLOW}⟳ SKIP${NC}`;
  }
}

export function successMsg(msg: string): string {
  return `  ${GREEN}✓ ${msg}${NC}`;
}

export function failMsg(msg: string): string {
  return `  ${RED}✗ ${msg}${NC}`;
}

export function skipMsg(msg: string): string {
  return `  ${YELLOW}⟳ ${msg}${NC}`;
}

interface StepEntry {
  label: string;
  result: StepResult;
}

export function summaryTable(steps: StepEntry[]): string {
  const lines = [
    `${BOLD}${CYAN}━━━ Installation Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`,
    '',
  ];
  for (const { label, result } of steps) {
    lines.push(`  ${label}  ${statusIcon(result.status)}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function manualSteps(claudeFound: boolean): string {
  const lines = [
    `${BOLD}${CYAN}━━━ Manual Setup Steps ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`,
    '',
  ];

  if (!claudeFound) {
    lines.push(`${BOLD}1. Install Claude Code${NC}`);
    lines.push('   Follow: https://docs.anthropic.com/en/docs/claude-code/getting-started');
    lines.push('');
    lines.push(`${BOLD}2. Register Context7 Marketplace (after installing Claude Code)${NC}`);
    lines.push(`   ${WHITE}claude plugin marketplace add https://github.com/upstash/context7${NC}`);
    lines.push('   Local marketplace (.claude-plugin/) is auto-detected at git root.');
    lines.push('   Guide: .specify/docs/en/guides/setup/setup-guide.md');
    lines.push('');
  }

  lines.push(`${BOLD}Enable Context7 MCP Plugin in settings${NC}`);
  lines.push('   Add to .claude/settings.json → enabledPlugins:');
  lines.push(`   ${WHITE}"context7-plugin@context7-marketplace": true${NC}`);
  lines.push('   Guide: .specify/docs/en/guides/setup/setup-guide.md');
  lines.push('');
  lines.push(`${BOLD}GitHub MCP Plugin (optional — repo browsing)${NC}`);
  lines.push('   Guide: .specify/docs/en/guides/setup/setup-guide.md');
  lines.push('');
  lines.push(`${BOLD}Obsidian Plugin Setup (optional)${NC}`);
  lines.push('   Guide: .specify/docs/en/guides/setup/setup-guide.md');
  lines.push('');

  return lines.join('\n');
}

export function finalMessage(hasFails: boolean): string {
  if (hasFails) {
    return `${RED}Some steps failed. Fix issues above and re-run: bash .specify/setup.sh${NC}`;
  }
  return [
    `${GREEN}Automated setup complete! Follow manual steps above to finish.${NC}`,
    `${WHITE}Run '/tdk-' commands in Claude Code to verify TDK is ready.${NC}`,
  ].join('\n');
}
