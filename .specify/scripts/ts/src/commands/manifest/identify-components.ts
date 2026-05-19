// Identify plugin components (skills/agents/hooks/commands) by directory structure.
// Strict 1-to-1 port of Python identify_components(). No behavioral changes.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PluginComponents } from './types';

/**
 * Detect skills/agents/hooks/commands in a plugin directory.
 * Returns object with insertion order matching Python: skills → agents → hooks → commands.
 */
export function identifyComponents(pluginDir: string, pluginName: string): PluginComponents {
  // Initialize in Python insertion order
  const components: PluginComponents = {
    skills: {},
    agents: {},
    hooks: {},
    commands: {},
  };

  // Skills: plugin/skills/{name}/ (is dir)
  const skillsDir = path.join(pluginDir, 'skills');
  if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
    const entries = fs.readdirSync(skillsDir).sort();
    for (const name of entries) {
      const fullPath = path.join(skillsDir, name);
      if (fs.statSync(fullPath).isDirectory()) {
        components.skills[name] = {};
      }
    }
  }

  // Agents: plugin/agents/{name}.md (is file)
  const agentsDir = path.join(pluginDir, 'agents');
  if (fs.existsSync(agentsDir) && fs.statSync(agentsDir).isDirectory()) {
    const entries = fs.readdirSync(agentsDir).sort();
    for (const name of entries) {
      const fullPath = path.join(agentsDir, name);
      if (fs.statSync(fullPath).isFile() && name.endsWith('.md')) {
        components.agents[path.basename(name, '.md')] = {};
      }
    }
  }

  // Hooks: plugin/hooks/ (must contain hooks.json) — keyed by plugin name
  const hooksDir = path.join(pluginDir, 'hooks');
  const hooksJson = path.join(hooksDir, 'hooks.json');
  if (fs.existsSync(hooksDir) && fs.statSync(hooksDir).isDirectory() && fs.existsSync(hooksJson) && fs.statSync(hooksJson).isFile()) {
    components.hooks[pluginName] = {};
  }

  // Commands: plugin/commands/{name}/ (dir) or {name}.md (file)
  const commandsDir = path.join(pluginDir, 'commands');
  if (fs.existsSync(commandsDir) && fs.statSync(commandsDir).isDirectory()) {
    const entries = fs.readdirSync(commandsDir).sort();
    for (const name of entries) {
      const fullPath = path.join(commandsDir, name);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        components.commands[name] = {};
      } else if (stat.isFile() && name.endsWith('.md')) {
        components.commands[path.basename(name, '.md')] = {};
      }
    }
  }

  return components;
}
