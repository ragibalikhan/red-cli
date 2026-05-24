import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const PLUGINS_DIR = 'examples/plugins';

describe('Example Plugins', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('quote-of-the-day.mjs', () => {
    it('should export commands array with /qotd', async () => {
      const plugin = await import('../examples/plugins/quote-of-the-day.mjs');
      expect(plugin.commands).toBeInstanceOf(Array);
      expect(plugin.commands.length).toBeGreaterThan(0);
      expect(plugin.commands[0].name).toBe('/qotd');
      expect(plugin.commands[0].aliases).toContain('/quote');
      expect(typeof plugin.commands[0].run).toBe('function');
    });

    it('should export tools array', async () => {
      const plugin = await import('../examples/plugins/quote-of-the-day.mjs');
      expect(plugin.tools).toBeInstanceOf(Array);
    });

    it('should not throw on run', async () => {
      const plugin = await import('../examples/plugins/quote-of-the-day.mjs');
      expect(() => plugin.commands[0].run()).not.toThrow();
    });

    it('should export init function', async () => {
      const plugin = await import('../examples/plugins/quote-of-the-day.mjs');
      expect(typeof plugin.init).toBe('function');
    });
  });

  describe('port-scan-cache.mjs', () => {
    it('should export commands array with /portcache', async () => {
      const plugin = await import('../examples/plugins/port-scan-cache.mjs');
      expect(plugin.commands).toBeInstanceOf(Array);
      expect(plugin.commands.length).toBeGreaterThan(0);
      expect(plugin.commands[0].name).toBe('/portcache');
      expect(plugin.commands[0].aliases).toContain('/pc');
      expect(typeof plugin.commands[0].run).toBe('function');
    });

    it('should export tools array with cached_portscan', async () => {
      const plugin = await import('../examples/plugins/port-scan-cache.mjs');
      expect(plugin.tools).toBeInstanceOf(Array);
      expect(plugin.tools.length).toBeGreaterThan(0);
      expect(plugin.tools[0].name).toBe('cached_portscan');
      expect(typeof plugin.tools[0].execute).toBe('function');
    });

    it('should export init function', async () => {
      const plugin = await import('../examples/plugins/port-scan-cache.mjs');
      expect(typeof plugin.init).toBe('function');
    });

    it('should handle missing host gracefully', async () => {
      const plugin = await import('../examples/plugins/port-scan-cache.mjs');
      await expect(plugin.commands[0].run()).resolves.not.toThrow();
    });
  });

  describe('time-tracker.mjs', () => {
    it('should export commands array with /track and /tracked', async () => {
      const plugin = await import('../examples/plugins/time-tracker.mjs');
      expect(plugin.commands).toBeInstanceOf(Array);
      expect(plugin.commands.length).toBe(2);
      expect(plugin.commands[0].name).toBe('/track');
      expect(plugin.commands[1].name).toBe('/tracked');
    });

    it('should toggle timer on /track', async () => {
      const plugin = await import('../examples/plugins/time-tracker.mjs');
      const trackCmd = plugin.commands.find(c => c.name === '/track');
      expect(trackCmd).toBeDefined();
      expect(() => trackCmd.run('test task')).not.toThrow();
    });

    it('should handle missing task for /track', async () => {
      const plugin = await import('../examples/plugins/time-tracker.mjs');
      const trackCmd = plugin.commands.find(c => c.name === '/track');
      expect(() => trackCmd.run()).not.toThrow();
    });

    it('should export tools array', async () => {
      const plugin = await import('../examples/plugins/time-tracker.mjs');
      expect(plugin.tools).toBeInstanceOf(Array);
    });
  });

  describe('PluginManager compatibility', () => {
    it('should be loadable by PluginManager', async () => {
      const { PluginManager } = await import('../src/plugin-manager.js');
      const mgr = new PluginManager();
      const plugin = await import('../examples/plugins/quote-of-the-day.mjs');
      expect(plugin.commands).toBeDefined();
      expect(plugin.tools).toBeDefined();
      if (plugin.commands) {
        for (const cmd of plugin.commands) {
          mgr.commands.push(cmd);
        }
      }
      if (plugin.tools) {
        mgr.tools.push(...plugin.tools);
      }
      expect(mgr.getCommands().length).toBeGreaterThan(0);
      expect(mgr.getTools()).toBeDefined();
    });
  });
});
