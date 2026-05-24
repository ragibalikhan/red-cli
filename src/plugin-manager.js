import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const PLUGINS_DIR = join(homedir(), '.red', 'plugins');

export class PluginManager {
  constructor() {
    this.plugins = [];
    this.commands = [];
    this.tools = [];
  }

  async loadPlugins() {
    if (!existsSync(PLUGINS_DIR)) return;

    const files = readdirSync(PLUGINS_DIR)
      .filter(f => f.endsWith('.js') || f.endsWith('.mjs'));

    for (const file of files) {
      try {
        const pluginPath = join(PLUGINS_DIR, file);
        const plugin = await import(pluginPath);

        if (plugin.commands && Array.isArray(plugin.commands)) {
          for (const cmd of plugin.commands) {
            this.commands.push(cmd);
          }
        }

        if (plugin.tools && Array.isArray(plugin.tools)) {
          this.tools.push(...plugin.tools);
        }

        if (typeof plugin.init === 'function') {
          const ctx = { pluginManager: this };
          await plugin.init(ctx);
        }

        this.plugins.push({
          name: file.replace(/\.(js|mjs)$/, ''),
          path: pluginPath,
          exports: plugin
        });
      } catch (err) {
        console.error(chalk.red(`  ✗ Failed to load plugin ${file}: ${err.message}`));
      }
    }
  }

  findCommand(name) {
    const normalized = name.toLowerCase();
    for (const cmd of this.commands) {
      if (cmd.name?.toLowerCase() === normalized) return cmd;
      if (cmd.aliases?.some(a => a.toLowerCase() === normalized)) return cmd;
    }
    return null;
  }

  getCommands() {
    return this.commands;
  }

  getTools() {
    return this.tools;
  }

  getPlugins() {
    return this.plugins;
  }

  listPlugins() {
    if (this.plugins.length === 0) {
      console.log(chalk.yellow('  No plugins installed.'));
      console.log(chalk.dim('  Install plugins to ~/.red/plugins/*.{js,mjs}'));
      return;
    }

    console.log(chalk.bold('\n🔌 Installed Plugins'));
    for (const plugin of this.plugins) {
      const cmdCount = plugin.exports.commands?.length || 0;
      const toolCount = plugin.exports.tools?.length || 0;
      console.log(`  ${chalk.cyan(plugin.name)}: ${cmdCount} commands, ${toolCount} tools`);
    }
    console.log();
  }
}

export function createPluginManager() {
  return new PluginManager();
}
