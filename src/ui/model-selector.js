import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config.js';
import { Agent } from '../agent.js';
import { NVIDIA_MODELS } from '../config.js';

const NVIDIA_SELECTABLE_MODELS = NVIDIA_MODELS.map((model, index) => ({
  number: 22 + index,
  label: `${model.name} (NVIDIA)`,
  model: model.id,
  provider: "nvidia",
  description: model.description,
  pricing: "NVIDIA API",
  contextWindow: model.context,
  badge: "nvidia"
}));

const SELECTABLE_MODELS = [
  // Anthropic Models
  {
    number: 1,
    label: "Default (recommended)",
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    description: "Best balance of speed & intelligence",
    pricing: "$3/$15 per Mtok",
    contextWindow: "200K",
    badge: null
  },
  {
    number: 2,
    label: "Opus",
    model: "claude-opus-4-20250514",
    provider: "anthropic",
    description: "Most powerful for complex tasks",
    pricing: "$15/$75 per Mtok",
    contextWindow: "200K",
    badge: null
  },
  {
    number: 3,
    label: "Sonnet (1M context)",
    model: "claude-sonnet-4-20250514",
    provider: "anthropic",
    description: "Best for large codebases and long sessions",
    pricing: "$3/$15 per Mtok",
    contextWindow: "1M",
    badge: null
  },
  {
    number: 4,
    label: "Haiku",
    model: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    description: "Fastest for quick answers",
    pricing: "$1/$5 per Mtok",
    contextWindow: "200K",
    badge: null
  },
  {
    number: 5,
    label: "GPT-4o",
    model: "gpt-4o",
    provider: "openai",
    description: "OpenAI · Best multimodal model",
    pricing: "$5/$15 per Mtok",
    contextWindow: "128K",
    badge: null
  },
  {
    number: 6,
    label: "GPT-4 Turbo",
    model: "gpt-4-turbo",
    provider: "openai",
    description: "OpenAI · Powerful with large context",
    pricing: "$10/$30 per Mtok",
    contextWindow: "128K",
    badge: null
  },
  {
    number: 7,
    label: "Gemini 2.5 Flash",
    model: "gemini-2.5-flash",
    provider: "gemini",
    description: "Google · Latest fast model (1M context)",
    pricing: "$0.35/$0.70 per Mtok",
    contextWindow: "1M",
    badge: null
  },
  {
    number: 8,
    label: "Gemini 2.5 Pro",
    model: "gemini-2.5-pro",
    provider: "gemini",
    description: "Google · Most capable (1M context)",
    pricing: "$1.25/$5 per Mtok",
    contextWindow: "1M",
    badge: null
  },
  {
    number: 9,
    label: "Gemini 2.5 Flash Lite",
    model: "gemini-2.5-flash-lite",
    provider: "gemini",
    description: "Google · Cheapest (1M context)",
    pricing: "$0.175/$0.35 per Mtok",
    contextWindow: "1M",
    badge: null
  },
  {
    number: 10,
    label: "Gemini 2.0 Flash",
    model: "gemini-2.0-flash",
    provider: "gemini",
    description: "Google · Fast and efficient",
    pricing: "Free tier available",
    contextWindow: "1M",
    badge: null
  },
  {
    number: 11,
    label: "MiniMax M2.5 Free",
    model: "minimax-m2.5-free",
    provider: "opencode",
    description: "OpenCode Zen · Free",
    pricing: "Free",
    contextWindow: "200K",
    badge: "zen"
  },
  {
    number: 12,
    label: "DeepSeek V4 Flash Free",
    model: "deepseek-v4-flash-free",
    provider: "opencode",
    description: "OpenCode Zen · Free",
    pricing: "Free",
    contextWindow: "200K",
    badge: "zen"
  },
  {
    number: 13,
    label: "Nemotron 3 Super Free",
    model: "nemotron-3-super-free",
    provider: "opencode",
    description: "OpenCode Zen · Free",
    pricing: "Free",
    contextWindow: "200K",
    badge: "zen"
  },
  {
    number: 14,
    label: "Qwen3.6 Plus Free",
    model: "qwen3.6-plus-free",
    provider: "opencode",
    description: "OpenCode Zen · Free limited time",
    pricing: "Free",
    contextWindow: "262K",
    badge: "zen"
  },
  {
    number: 15,
    label: "GLM-5 Free",
    model: "glm-5-free",
    provider: "opencode",
    description: "OpenCode Zen · 1M context, free limited",
    pricing: "Free",
    contextWindow: "1M",
    badge: "zen"
  },
  {
    number: 16,
    label: "Qwen3 Coder 480B",
    model: "qwen3-coder-480b",
    provider: "opencode",
    description: "OpenCode Zen · Powerful coding model",
    pricing: "$0.45/$1.50 per Mtok",
    contextWindow: "262K",
    badge: "zen"
  },
  {
    number: 17,
    label: "GPT-5.1 Codex Mini",
    model: "gpt-5.1-codex-mini",
    provider: "opencode",
    description: "OpenCode Zen · Efficient code model",
    pricing: "$0.25/$2 per Mtok",
    contextWindow: "200K",
    badge: "zen"
  },
  {
    number: 18,
    label: "GPT-5.1 Codex",
    model: "gpt-5.1-codex",
    provider: "opencode",
    description: "OpenCode Zen · Full code capabilities",
    pricing: "$1.07/$8.50 per Mtok",
    contextWindow: "200K",
    badge: "zen"
  },
  {
    number: 19,
    label: "GPT-5.2",
    model: "gpt-5.2",
    provider: "opencode",
    description: "OpenCode Zen · Latest GPT model",
    pricing: "$1.75/$14 per Mtok",
    contextWindow: "200K",
    badge: "zen"
  },
  {
    number: 20,
    label: "ollama/llama3",
    model: "llama3",
    provider: "ollama",
    description: "Local · No internet required",
    pricing: "Free",
    contextWindow: "8K",
    badge: "local"
  },
  {
    number: 21,
    label: "Custom model",
    model: null,
    provider: null,
    description: "Enter any model string manually",
    pricing: null,
    contextWindow: null,
    badge: "custom"
  },

  

  // NVIDIA Hosted Open Source Models
  ...NVIDIA_SELECTABLE_MODELS
];

const EFFORT_LEVELS = [
  { label: "High effort", value: "high", description: "(default)", maxTokens: 8096 },
  { label: "Medium effort", value: "medium", description: "", maxTokens: 4096 },
  { label: "Low effort", value: "low", description: "", maxTokens: 2048 },
  { label: "Min effort", value: "min", description: "", maxTokens: 1024 }
];

export class ModelSelector {
  constructor(currentModel = 'claude-sonnet-4-20250514', currentEffort = 'high') {
    this.models = SELECTABLE_MODELS;
    this.effortLevels = EFFORT_LEVELS;
    this.selectedIndex = 0;
    this.effortIndex = 0;
    this.currentModel = currentModel;
    this.currentEffort = currentEffort;

    // Find current effort index
    this.effortIndex = this.effortLevels.findIndex(e => e.value === currentEffort);
    if (this.effortIndex === -1) this.effortIndex = 0;

    // Find current model in list
    for (let i = 0; i < this.models.length; i++) {
      if (this.models[i].model === currentModel) {
        this.selectedIndex = i;
        break;
      }
    }
  }

  async show() {
    // Save original raw mode state as instance property
    this._originalRawMode = process.stdin.isRaw;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    this.render();

    return new Promise((resolve) => {
      const handleKey = (char, key) => {
        // Number keys 1-9 (for items 1-9)
        if (char >= '1' && char <= '9' && !key.shift) {
          const index = parseInt(char) - 1;
          if (index < this.models.length) {
            this.selectedIndex = index;
            this.render();
          }
          return;
        }

        // For items 10-19, use number + shift or just navigate with arrows
        // Allow Enter to confirm selection in current position

        switch (key.name) {
          case 'up':
            this.selectedIndex = Math.max(0, this.selectedIndex - 1);
            this.render();
            break;
          case 'down':
            this.selectedIndex = Math.min(this.models.length - 1, this.selectedIndex + 1);
            this.render();
            break;
          case 'left':
            this.effortIndex = Math.max(0, this.effortIndex - 1);
            this.render();
            break;
          case 'right':
            this.effortIndex = Math.min(this.effortLevels.length - 1, this.effortIndex + 1);
            this.render();
            break;
          case 'return': // Enter
            this.cleanup(handleKey);
            if (this.models[this.selectedIndex].badge === 'custom') {
              // Custom model - prompt for input
              this.promptCustomModel().then(result => {
                if (result) {
                  resolve({ model: result, effort: this.effortLevels[this.effortIndex].value });
                } else {
                  resolve(null);
                }
              });
            } else {
              resolve({
                model: this.models[this.selectedIndex].model,
                provider: this.models[this.selectedIndex].provider,
                effort: this.effortLevels[this.effortIndex].value
              });
            }
            return;
          case 'escape':
            this.cleanup(handleKey);
            resolve(null);
            return;
          case 'ctrl-c':
            this.cleanup(handleKey);
            resolve(null);
            return;
        }
      };

      this.handleKey = handleKey;
      process.stdin.on('keypress', handleKey);
    });
  }

  cleanup(handleKey) {
    process.stdin.removeListener('keypress', handleKey);
    if (!this._originalRawMode && process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    // Pause stdin to let the main REPL recover properly
    if (process.stdin.isTTY) {
      process.stdin.pause();
    }
    this.clearMenu();
  }

  async promptCustomModel() {
    // Clean up first
    this.clearMenu();

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(chalk.cyan('\n  Enter model string: '), (answer) => {
        rl.close();
        if (answer.trim()) {
          resolve(answer.trim());
        } else {
          resolve(null);
        }
      });
    });
  }

  render() {
    this.clearMenu();

    const maxWidth = process.stdout.columns || 80;
    const menuWidth = Math.min(70, maxWidth - 10);

    // Header
    const lines = [];
    lines.push(chalk.bold.white('\n  Select model'));
    lines.push(chalk.dim('  Switch between AI providers and models. Applies to this session and future'));
    lines.push(chalk.dim('  Red CLI sessions. For other/previous model names, specify with --model.'));
    lines.push('');

    // Models
    for (let i = 0; i < this.models.length; i++) {
      const m = this.models[i];
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? chalk.cyan('❯ ') : '  ';
      const numStr = `${m.number}.`;
      const label = isSelected ? chalk.bold.cyan(m.label) : chalk.white(m.label);

      // Check if this is current model
      const isCurrent = m.model === this.currentModel;
      const checkmark = isCurrent ? chalk.green(' ✓') : '';

      // Badge
      let badgeStr = '';
      if (m.badge === 'local') {
        badgeStr = ' ' + chalk.blue('[Local]');
      } else if (m.badge === 'custom') {
        badgeStr = ' ' + chalk.magenta('[Custom]');
      } else if (m.badge === 'nvidia') {
        badgeStr = ' ' + chalk.green('[NVIDIA]');
      } else if (m.badge === 'zen') {
        badgeStr = ' ' + chalk.magenta('[OpenCode Zen]');
      }

      // Description and pricing
      const descAndPrice = m.pricing
        ? chalk.dim(` ${m.description} · ${m.pricing}`)
        : chalk.dim(` ${m.description}`);

      lines.push(`${prefix}${numStr.padEnd(3)} ${label}${checkmark}${badgeStr}${descAndPrice}`);
    }

    lines.push('');

    // Effort selector
    const effortLabel = chalk.bold('Effort:');
    let effortStr = '';
    for (let i = 0; i < this.effortLevels.length; i++) {
      const e = this.effortLevels[i];
      const isEffortSelected = i === this.effortIndex;
      const circle = isEffortSelected ? chalk.yellow('●') : chalk.dim('○');
      const label = isEffortSelected ? chalk.bold.white(e.label) : chalk.dim(e.label);
      const desc = e.description ? chalk.dim(` ${e.description}`) : '';
      effortStr += `${circle} ${label}${desc}  `;
    }

    lines.push(chalk.dim('  ') + effortLabel);
    lines.push(chalk.dim('  ') + effortStr);
    lines.push('');
    lines.push(chalk.dim('  Enter to confirm · Esc to cancel'));

    // Store line count for clearing
    this._lastRenderLines = lines.length + 2;

    // Print all at once
    process.stdout.write(lines.join('\n') + '\n');
  }

  clearMenu() {
    if (this._lastRenderLines > 0) {
      process.stdout.write('\x1b[' + this._lastRenderLines + 'A\x1b[0J');
      this._lastRenderLines = 0;
    }
  }
}

export async function selectModel(currentModel = 'claude-sonnet-4-20250514', currentEffort = 'high') {
  const selector = new ModelSelector(currentModel, currentEffort);
  return await selector.show();
}

export default { selectModel, ModelSelector };
