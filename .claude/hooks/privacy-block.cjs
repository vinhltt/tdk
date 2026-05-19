#!/usr/bin/env node
/**
 * privacy-block.cjs - Block access to sensitive files unless user-approved
 *
 * Standalone version for commondragon project.
 * Blocks .env, credentials, private keys, SSH keys from being read/edited.
 *
 * Flow:
 * 1. Claude tries: Read ".env" -> BLOCKED
 * 2. Claude asks user for permission via AskUserQuestion
 * 3. User approves -> Claude uses `bash cat` to read
 * 4. User denies -> Claude skips the file
 *
 * Exit Codes:
 * - 0: Allowed
 * - 2: Blocked (sensitive file or search pattern)
 */

const path = require('path');

// Safe file patterns - exempt from privacy checks
const SAFE_PATTERNS = [
  /\.example$/i,
  /\.sample$/i,
  /\.template$/i,
];

// Privacy-sensitive file path patterns
const PRIVACY_PATTERNS = [
  /^\.env$/,
  /^\.env\./,
  /\.env$/,
  /\/\.env\./,
  /credentials/i,
  /secrets?\.ya?ml$/i,
  /\.pem$/,
  /\.key$/,
  /id_rsa/,
  /id_ed25519/,
  /\.mcp\.json$/i           // MCP config contains API keys
];

// Sensitive search patterns — block Grep/Bash searching for secrets
const SENSITIVE_SEARCH_PATTERNS = [
  /api[_-]?key/i,
  /secret[_-]?key/i,
  /access[_-]?token/i,
  /auth[_-]?token/i,
  /private[_-]?key/i,
  /password/i,
  /bearer/i,
  /obsidian[_-]?api/i,
];

/**
 * Check if path is a safe file (example/sample/template)
 */
function isSafeFile(testPath) {
  if (!testPath) return false;
  const basename = path.basename(testPath);
  return SAFE_PATTERNS.some(p => p.test(basename));
}

/**
 * Check if path matches privacy-sensitive patterns
 */
function isPrivacySensitive(testPath) {
  if (!testPath) return false;

  let normalized = testPath.replace(/\\/g, '/');
  try { normalized = decodeURIComponent(normalized); } catch (_) {}

  if (isSafeFile(normalized)) return false;

  const basename = path.basename(normalized);
  return PRIVACY_PATTERNS.some(p => p.test(basename) || p.test(normalized));
}

/**
 * Check if a search pattern targets sensitive content (API keys, tokens, etc.)
 * Returns the matched term or false.
 */
function detectSensitiveSearch(toolInput) {
  if (!toolInput) return false;

  // Grep tool: check the search pattern field
  if (toolInput.pattern) {
    for (const p of SENSITIVE_SEARCH_PATTERNS) {
      if (p.test(toolInput.pattern)) return toolInput.pattern;
    }
  }

  // Bash tool: check grep/rg/findstr commands for sensitive terms
  if (toolInput.command) {
    const cmd = toolInput.command;
    if (/\b(grep|rg|findstr|ack|ag)\b/i.test(cmd)) {
      for (const p of SENSITIVE_SEARCH_PATTERNS) {
        const m = cmd.match(p);
        if (m) return m[0];
      }
    }
  }

  return false;
}

/**
 * Extract file paths from tool input
 */
function extractPaths(toolInput) {
  const paths = [];
  if (!toolInput) return paths;

  if (toolInput.file_path) paths.push(toolInput.file_path);
  if (toolInput.path) paths.push(toolInput.path);
  // Note: toolInput.pattern is a regex for Grep, handled by detectSensitiveSearch

  if (toolInput.command) {
    // Extract .env file references
    const envMatch = toolInput.command.match(/\.env[^\s]*/g) || [];
    envMatch.forEach(p => paths.push(p));

    // Extract SSH key and sensitive file references from commands
    const sensitivePathPatterns = [
      /(?:~|\$HOME|%USERPROFILE%)\/\.ssh\/[^\s"'|;&>]+/gi,
      /[A-Za-z]:[\\/][^\s"'|;&>]*[\\/]\.ssh[\\/][^\s"'|;&>]+/gi,
      /\/home\/[^\s"'|;&>]*\/\.ssh\/[^\s"'|;&>]+/gi,
      /[^\s"'|;&>]*id_rsa[^\s"'|;&>]*/gi,
      /[^\s"'|;&>]*id_ed25519[^\s"'|;&>]*/gi,
      /[^\s"'|;&>]*\.pem(?:\s|$|")/gi,
      /[^\s"'|;&>]*\.key(?:\s|$|")/gi,
      /[^\s"'|;&>]*credentials[^\s"'|;&>]*/gi,
      /[^\s"'|;&>]*secrets?\.ya?ml/gi,
    ];
    for (const pattern of sensitivePathPatterns) {
      const matches = toolInput.command.match(pattern) || [];
      matches.forEach(p => paths.push(p.trim()));
    }
  }

  // Strip surrounding quotes from extracted paths
  return paths.filter(Boolean).map(p => p.replace(/^["']+|["']+$/g, ''));
}

/**
 * Format block message with AskUserQuestion JSON marker
 */
function formatBlockMessage(filePath) {
  const basename = path.basename(filePath);
  const promptData = {
    type: 'PRIVACY_PROMPT',
    file: filePath,
    basename,
    question: {
      header: 'File Access',
      text: `I need to read "${basename}" which may contain sensitive data (API keys, passwords, tokens). Do you approve?`,
      options: [
        { label: 'Yes, approve access', description: `Allow reading ${basename} this time` },
        { label: 'No, skip this file', description: 'Continue without accessing this file' }
      ]
    }
  };

  return `
\x1b[36mNOTE:\x1b[0m This is not an error - this block protects sensitive data.

\x1b[33mPRIVACY BLOCK\x1b[0m: Sensitive file access requires user approval

  \x1b[33mFile:\x1b[0m ${filePath}

  This file may contain secrets (API keys, passwords, tokens).

\x1b[90m@@PRIVACY_PROMPT_START@@\x1b[0m
${JSON.stringify(promptData, null, 2)}
\x1b[90m@@PRIVACY_PROMPT_END@@\x1b[0m

  \x1b[34mClaude:\x1b[0m Use AskUserQuestion tool with the JSON above, then:
  \x1b[32mIf "Yes":\x1b[0m Use bash to read: cat "${filePath}"
  \x1b[31mIf "No":\x1b[0m  Continue without this file.
`;
}

/**
 * Format block message for sensitive search patterns
 */
function formatSearchBlockMessage(searchTerm) {
  const promptData = {
    type: 'PRIVACY_PROMPT',
    file: `search:${searchTerm}`,
    basename: searchTerm,
    question: {
      header: 'Sensitive Search',
      text: `Searching for "${searchTerm}" may expose secrets (API keys, tokens). Do you approve?`,
      options: [
        { label: 'Yes, approve search', description: `Allow searching for ${searchTerm} this time` },
        { label: 'No, skip this search', description: 'Continue without this search' }
      ]
    }
  };

  return `
\x1b[36mNOTE:\x1b[0m This is not an error - this block protects sensitive data.

\x1b[33mPRIVACY BLOCK\x1b[0m: Sensitive search pattern requires user approval

  \x1b[33mPattern:\x1b[0m ${searchTerm}

  Searching for this pattern may expose secrets.

\x1b[90m@@PRIVACY_PROMPT_START@@\x1b[0m
${JSON.stringify(promptData, null, 2)}
\x1b[90m@@PRIVACY_PROMPT_END@@\x1b[0m

  \x1b[34mClaude:\x1b[0m Use AskUserQuestion tool with the JSON above, then:
  \x1b[32mIf "Yes":\x1b[0m Proceed with the search
  \x1b[31mIf "No":\x1b[0m  Skip this search.
`;
}

// Main
async function main() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let hookData;
  try {
    hookData = JSON.parse(input);
  } catch (_) {
    process.exit(0);
  }

  const { tool_input: toolInput } = hookData;

  // Check 1: Content-based detection — block searching for sensitive patterns
  const sensitiveMatch = detectSensitiveSearch(toolInput);
  if (sensitiveMatch) {
    console.error(formatSearchBlockMessage(sensitiveMatch));
    process.exit(2);
  }

  // Check 2: Path-based detection — block access to sensitive files
  const paths = extractPaths(toolInput);

  for (const testPath of paths) {
    if (!isPrivacySensitive(testPath)) continue;

    console.error(formatBlockMessage(testPath));
    process.exit(2);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
