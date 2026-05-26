import { search } from '@inquirer/prompts';
import chalk from 'chalk';
import { CommandRegistry } from '../commands/registry.js';

const registry = new CommandRegistry();

/**
 * Show a live searchable slash command menu.
 * Returns the selected command name, or null if cancelled.
 */
export async function showLiveSlashMenu() {
  const allCommands = registry.getAll();
  const abortController = new AbortController();

  const escHandler = (ch, key) => {
    if (key && key.name === 'escape') {
      abortController.abort();
    }
  };
  process.stdin.on('keypress', escHandler);

  try {
    const choice = await search({
      message: chalk.red('Command:'),
      source: async (input) => {
        const query = (input || '').replace(/^\//, '').toLowerCase();
        const filtered = !query ? allCommands : registry.search(query);

        return filtered.map(cmd => {
          const aliases = cmd.aliases?.length > 0 ? chalk.dim(` (${cmd.aliases.join(', ')})`) : '';
          const name = chalk.cyan(cmd.name);
          const desc = chalk.dim(' — ' + (cmd.description || '').slice(0, 60));
          return {
            name: `${cmd.icon || ' '} ${name}${aliases}${desc}`,
            value: cmd.name
            // Removed `description` field — it leaks into readline buffer
          };
        });
      },
      pageSize: 12
    }, {
      signal: abortController.signal
    });

    return choice;
  } catch (err) {
    if (err.name === 'ExitPromptError' || err.name === 'AbortPromptError' || err.message?.includes('User force closed') || err.message?.includes('aborted')) {
      return null;
    }
    throw err;
  } finally {
    process.stdin.removeListener('keypress', escHandler);
  }
}

export default { showLiveSlashMenu };
