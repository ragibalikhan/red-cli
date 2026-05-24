import { MODES, getModeConfig } from './config.js';

export { MODES, getModeConfig };

export function getModeTools(allTools, mode) {
  const modeConfig = getModeConfig(mode);
  if (modeConfig.tools === 'all') {
    return allTools;
  }
  if (Array.isArray(modeConfig.tools)) {
    return allTools.filter(t => modeConfig.tools.includes(t.name));
  }
  return [];
}

export function getModePromptAddon(mode) {
  const modeConfig = getModeConfig(mode);
  return modeConfig.promptAddon || '';
}

export const MODE_COLORS = {
  recon: 'cyan',
  scan: 'yellow',
  exploit: 'red',
  report: 'green',
  osint: 'blue',
  audit: 'magenta'
};

export function getModeColor(mode) {
  return MODE_COLORS[mode] || 'cyan';
}