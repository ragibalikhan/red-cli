import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';

const ANALYTICS_PATH = join(homedir(), '.red', 'analytics.json');

const MODEL_PRICING = {
  // OpenCode Zen - Free models
  'minimax-m2.5-free': { input: 0, output: 0 },
  'deepseek-v4-flash-free': { input: 0, output: 0 },
  'nemotron-3-super-free': { input: 0, output: 0 },
  'qwen3.6-plus-free': { input: 0, output: 0 },
  'glm-5-free': { input: 0, output: 0 },
  // OpenCode Zen - Paid models
  'gpt-5.1-codex-mini': { input: 0.25, output: 2 },
  'gpt-5.2': { input: 1.75, output: 14 },
  'gpt-5.1-codex': { input: 1.07, output: 8.5 },
  'qwen3-coder-480b': { input: 0.45, output: 1.5 },
};

function ensureAnalyticsDir() {
  const dir = dirname(ANALYTICS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function loadAnalytics() {
  try {
    if (existsSync(ANALYTICS_PATH)) {
      return JSON.parse(readFileSync(ANALYTICS_PATH, 'utf-8'));
    }
  } catch {}
  return {
    sessions: [],
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalCacheCreationIn: 0,
    totalCacheReadIn: 0,
    toolCalls: {},
    modelUsage: {},
    startDate: new Date().toISOString()
  };
}

function saveAnalytics(data) {
  ensureAnalyticsDir();
  writeFileSync(ANALYTICS_PATH, JSON.stringify(data, null, 2));
}

export class Analytics {
  constructor() {
    this.data = loadAnalytics();
    this.currentSession = {
      id: Date.now().toString(),
      startTime: new Date().toISOString(),
      tokensIn: 0,
      tokensOut: 0,
      cacheCreationIn: 0,
      cacheReadIn: 0,
      toolCalls: [],
      model: null,
      provider: null
    };
  }

  startSession(model, provider) {
    this.currentSession = {
      id: Date.now().toString(),
      startTime: new Date().toISOString(),
      tokensIn: 0,
      tokensOut: 0,
      cacheCreationIn: 0,
      cacheReadIn: 0,
      toolCalls: [],
      model,
      provider
    };
  }

  addTokens(input, output) {
    this.currentSession.tokensIn += input;
    this.currentSession.tokensOut += output;
  }

  addProviderUsage({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens }) {
    this.currentSession.tokensIn += inputTokens;
    this.currentSession.tokensOut += outputTokens;
    this.currentSession.cacheCreationIn += cacheCreationInputTokens;
    this.currentSession.cacheReadIn += cacheReadInputTokens;
  }

  addToolCall(toolName) {
    this.currentSession.toolCalls.push(toolName);

    if (!this.data.toolCalls[toolName]) {
      this.data.toolCalls[toolName] = 0;
    }
    this.data.toolCalls[toolName]++;
  }

  endSession() {
    this.currentSession.endTime = new Date().toISOString();
    this.currentSession.duration = new Date(this.currentSession.endTime) - new Date(this.currentSession.startTime);

    this.data.sessions.push(this.currentSession);
    this.data.totalTokensIn += this.currentSession.tokensIn;
    this.data.totalTokensOut += this.currentSession.tokensOut;
    this.data.totalCacheCreationIn += this.currentSession.cacheCreationIn;
    this.data.totalCacheReadIn += this.currentSession.cacheReadIn;

    if (this.currentSession.model) {
      if (!this.data.modelUsage[this.currentSession.model]) {
        this.data.modelUsage[this.currentSession.model] = 0;
      }
      this.data.modelUsage[this.currentSession.model] +=
        this.currentSession.tokensIn + this.currentSession.tokensOut;
    }

    saveAnalytics(this.data);

    return this.currentSession;
  }

  getCurrentSession() {
    return this.currentSession;
  }

  getSessionStats() {
    const session = this.currentSession;
    const pricing = MODEL_PRICING[session.model] || { input: 0.003, output: 0.015 };

    const inputCost = (session.tokensIn / 1000) * pricing.input;
    const outputCost = (session.tokensOut / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    return {
      tokensIn: session.tokensIn,
      tokensOut: session.tokensOut,
      toolCalls: session.toolCalls.length,
      cost: totalCost,
      duration: session.duration
    };
  }

  getUsage(since = 'month') {
    const now = new Date();
    let startDate;

    if (since === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (since === 'month') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(this.data.startDate);
    }

    const relevantSessions = this.data.sessions.filter(s => new Date(s.startTime) >= startDate);

    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalCacheCreationIn = 0;
    let totalCacheReadIn = 0;
    let totalDuration = 0;
    const toolCounts = {};
    const modelCounts = {};

    for (const session of relevantSessions) {
      totalTokensIn += session.tokensIn;
      totalTokensOut += session.tokensOut;
      totalCacheCreationIn += session.cacheCreationIn || 0;
      totalCacheReadIn += session.cacheReadIn || 0;
      totalDuration += session.duration || 0;

      for (const tool of (session.toolCalls || [])) {
        toolCounts[tool] = (toolCounts[tool] || 0) + 1;
      }

      if (session.model) {
        modelCounts[session.model] = (modelCounts[session.model] || 0) +
          session.tokensIn + session.tokensOut;
      }
    }

    let totalCost = 0;
    for (const [model, tokens] of Object.entries(modelCounts)) {
      const pricing = MODEL_PRICING[model] || { input: 0.003, output: 0.015 };
      totalCost += (tokens / 1000) * ((pricing.input + pricing.output) / 2);
    }

    return {
      sessions: relevantSessions.length,
      totalTime: totalDuration,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      cacheCreationIn: totalCacheCreationIn,
      cacheReadIn: totalCacheReadIn,
      cost: totalCost,
      tools: toolCounts,
      models: modelCounts
    };
  }

  displaySessionUsage() {
    const stats = this.getSessionStats();
    const session = this.currentSession;

    console.log(chalk.bold('\n📊 Current Session'));
    console.log(chalk.dim(`  Tokens in: ${stats.tokensIn.toLocaleString()}`));
    console.log(chalk.dim(`  Tokens out: ${stats.tokensOut.toLocaleString()}`));
    console.log(chalk.dim(`  Tool calls: ${stats.toolCalls}`));
    console.log(chalk.dim(`  Est. cost: ~$${stats.cost.toFixed(4)}`));

    if (session.cacheCreationIn > 0 || session.cacheReadIn > 0) {
      const totalCache = session.cacheCreationIn + session.cacheReadIn;
      const hitRate = totalCache > 0 ? (session.cacheReadIn / totalCache) * 100 : 0;

      const isAnthropic = session.provider === 'anthropic' || (session.model && /^claude/i.test(session.model));
      let saved = 0;
      if (isAnthropic) {
        saved = (session.cacheCreationIn / 1000000) * 1.25 + (session.cacheReadIn / 1000000) * 0.10;
      } else {
        saved = (session.cacheReadIn / 1000000) * 0.50;
      }

      console.log(chalk.dim(`  Cache write: ${session.cacheCreationIn.toLocaleString()}`));
      console.log(chalk.dim(`  Cache read:  ${session.cacheReadIn.toLocaleString()}`));
      console.log(chalk.dim(`  Hit rate:    ${hitRate.toFixed(1)}%`));
      console.log(chalk.dim(`  💰 Saved:    ~$${saved.toFixed(4)}`));
    }
    console.log();
  }

  displayUsage(since = 'month') {
    const usage = this.getUsage(since);

    const hours = Math.floor(usage.totalTime / 3600000);
    const mins = Math.floor((usage.totalTime % 3600000) / 60000);

    console.log(chalk.cyan(`
╭─ 📊 Usage This ${since === 'week' ? 'Week' : since === 'month' ? 'Month' : 'All Time'} ─${'─'.repeat(40)}╮
│  Sessions: ${usage.sessions}  •  Total time: ${hours}h ${mins}m
│
│  Tokens
│   Input:   ${usage.tokensIn.toLocaleString()}   ($${(usage.tokensIn / 1000 * 0.003).toFixed(2)})
│   Output:    ${usage.tokensOut.toLocaleString()}   ($${(usage.tokensOut / 1000 * 0.015).toFixed(2)})
│   Total:               ~$${usage.cost.toFixed(2)}
│
│  Top models:
    `));

    const sortedModels = Object.entries(usage.models).sort((a, b) => b[1] - a[1]);
    const totalModelTokens = Object.values(usage.models).reduce((a, b) => a + b, 0);

    for (const [model, tokens] of sortedModels.slice(0, 3)) {
      const percent = Math.round((tokens / totalModelTokens) * 100);
      const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
      console.log(chalk.cyan('│   ') + model.slice(0, 25) + ' ' + bar + ' ' + percent + '%');
    }

    console.log(chalk.cyan('│'));
    console.log(chalk.cyan('│  Most used tools:'));

    const sortedTools = Object.entries(usage.tools).sort((a, b) => b[1] - a[1]);
    if (sortedTools.length > 0) {
      console.log(chalk.cyan('│   ') + sortedTools.slice(0, 3).map(([t, c]) => `${t} (${c})`).join('  •  '));
    } else {
      console.log(chalk.cyan('│   ') + chalk.dim('(none)'));
    }

    if (usage.cacheCreationIn > 0 || usage.cacheReadIn > 0) {
      const totalCache = usage.cacheCreationIn + usage.cacheReadIn;
      const hitRate = totalCache > 0 ? (usage.cacheReadIn / totalCache) * 100 : 0;
      const saved = (usage.cacheCreationIn / 1000000) * 1.25 + (usage.cacheReadIn / 1000000) * 0.10;

      console.log(chalk.cyan('│'));
      console.log(chalk.cyan('│  📦 Prompt Caching'));
      console.log(chalk.cyan('│') + chalk.dim(`   Write:     ${usage.cacheCreationIn.toLocaleString()}`));
      console.log(chalk.cyan('│') + chalk.dim(`   Read:      ${usage.cacheReadIn.toLocaleString()}`));
      console.log(chalk.cyan('│') + chalk.dim(`   Hit rate:  ${hitRate.toFixed(1)}%`));
      console.log(chalk.cyan('│') + chalk.dim(`   💰 Saved:  ~$${saved.toFixed(4)}`));
    }

    console.log(chalk.cyan('╰') + '─'.repeat(54) + '╯\n');
  }

  reset() {
    this.data = {
      sessions: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCacheCreationIn: 0,
      totalCacheReadIn: 0,
      toolCalls: {},
      modelUsage: {},
      startDate: new Date().toISOString()
    };
    saveAnalytics(this.data);
    console.log(chalk.green('Analytics reset.'));
  }
}

export function createAnalytics() {
  return new Analytics();
}

export default Analytics;