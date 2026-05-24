import chalk from 'chalk';

const timers = new Map();

export const commands = [
  {
    name: '/track',
    aliases: ['/t'],
    description: 'Toggle per-task timer: /track <task>',
    args: [{ name: 'task', required: true, description: 'Task name' }],
    run(task) {
      if (!task) {
        console.log(chalk.yellow('  Usage: /track <task>'));
        return;
      }

      const existing = timers.get(task);
      if (existing && !existing.ended) {
        existing.ended = Date.now();
        const duration = existing.ended - existing.started;
        const seconds = Math.floor(duration / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        console.log(chalk.green(`  ⏱  Stopped "${task}": ${mins}m ${secs}s`));
      } else {
        timers.set(task, { started: Date.now(), ended: null });
        console.log(chalk.cyan(`  ▶ Started tracking "${task}"`));
      }
    }
  },
  {
    name: '/tracked',
    aliases: ['/ts'],
    description: 'Show all tracked task timers and totals',
    run() {
      if (timers.size === 0) {
        console.log(chalk.yellow('  No tracked tasks.'));
        return;
      }

      let totalMs = 0;
      console.log(chalk.bold('\n⏱  Tracked Tasks'));
      for (const [task, data] of timers) {
        const end = data.ended || Date.now();
        const duration = end - data.started;
        totalMs += duration;
        const seconds = Math.floor(duration / 1000);
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const status = data.ended ? chalk.dim('(done)') : chalk.green('(running)');
        console.log(`  ${chalk.cyan(task)}: ${mins}m ${secs}s ${status}`);
      }

      const totalSecs = Math.floor(totalMs / 1000);
      const totalMins = Math.floor(totalSecs / 60);
      const remSecs = totalSecs % 60;
      console.log(chalk.dim(`  Total: ${totalMins}m ${remSecs}s\n`));
    }
  }
];

export const tools = [];

export function init(ctx) {
  // Persist timers via project memory if available
  if (ctx?.pluginManager) {
    // Could hook into agent memory for persistence
  }
}
