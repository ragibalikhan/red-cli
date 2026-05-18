import { execSync } from 'child_process';
import chalk from 'chalk';

const WCAG_CRITERIA = {
  '1.1.1': { name: 'Non-text Content', level: 'A', desc: 'All non-text content has text alternative' },
  '1.3.1': { name: 'Info and Relationships', level: 'A', desc: 'Semantic structure is programmatically determined' },
  '1.4.1': { name: 'Use of Color', level: 'A', desc: 'Color is not only means of conveying information' },
  '2.1.1': { name: 'Keyboard', level: 'A', desc: 'All functionality via keyboard' },
  '2.4.1': { name: 'Bypass Blocks', level: 'A', desc: 'Skip navigation links present' },
  '2.4.6': { name: 'Headings and Labels', level: 'AA', desc: 'Headings describe topic, labels describe purpose' },
  '2.4.7': { name: 'Focus Visible', level: 'AA', desc: 'Keyboard focus indicator visible' },
  '3.1.1': { name: 'Language of Page', level: 'A', desc: 'Human language of page is programmatically determined' },
  '4.1.1': { name: 'Parsing', level: 'A', desc: 'No duplicate IDs, proper nesting' },
  '4.1.2': { name: 'Name, Role, Value', level: 'A', desc: 'Components have proper ARIA attributes' },
  '1.4.3': { name: 'Contrast (Minimum)', level: 'AA', desc: 'Text has 4.5:1 contrast ratio' },
  '1.4.4': { name: 'Resize Text', level: 'AA', desc: 'Text can resize to 200%' }
};

export class VPATEngine {
  constructor(toolsRegistry) {
    this.tools = toolsRegistry;
    this.results = [];
  }

  async run(url, options = {}) {
    const { standard = 'wcag2.1', crawl = false, depth = 1 } = options;

    console.log(chalk.red(`\n╭─ ♿ VPAT/A11y Testing: ${url} ────────────────────────────────╮`));
    console.log(chalk.red(`│  Standard: ${standard}`));

    const results = {
      url,
      standard,
      startTime: new Date(),
      findings: [],
      criteria: {}
    };

    console.log(chalk.cyan('│  Running automated tests...'));

    let ranTool = false;

    if (this.tools.isToolAvailable('accessibility', 'axe')) {
      await this.runAxe(url, results);
      ranTool = true;
    } else if (this.tools.isToolAvailable('accessibility', 'pa11y')) {
      await this.runPa11y(url, results);
      ranTool = true;
    } else if (this.tools.isToolAvailable('accessibility', 'lighthouse')) {
      await this.runLighthouse(url, results);
      ranTool = true;
    } else {
      console.log(chalk.yellow('│  ⚠️  No accessibility tools installed'));
      console.log(chalk.dim('│  Install axe, pa11y, or lighthouse for automated testing'));
    }

    if (!ranTool || results.findings.length === 0) {
      await this.runBuiltInAccessibility(url, results);
    }

    this.checkManualCriteria(results);
    this.displayResults(results);

    results.endTime = new Date();
    this.results = results.findings;
    return results;
  }

  async runAxe(url, results) {
    try {
      console.log(chalk.dim('│  ▶ Running axe-core...'));
      const output = execSync(`npx @axe-core/cli ${url} --json 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 60000
      });

      const parsed = JSON.parse(output);
      for (const issue of parsed) {
        results.findings.push({
          type: 'accessibility',
          severity: this.mapAxeImpact(issue.impact),
          criterion: issue.id,
          message: issue.description,
          nodes: issue.nodes?.length || 0
        });
      }

      console.log(chalk.green('│  ✅ axe-core: ') + `${results.findings.length} issues found`);
    } catch {
      console.log(chalk.dim('│  ⚪ axe-core: Failed to run'));
    }
  }

  async runPa11y(url, results) {
    try {
      console.log(chalk.dim('│  ▶ Running pa11y...'));
      const output = execSync(`pa11y ${url} --json 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 60000
      });

      const parsed = JSON.parse(output);
      for (const issue of parsed.issues || []) {
        results.findings.push({
          type: 'accessibility',
          severity: issue.code === 'error' ? 'high' : 'medium',
          message: issue.message,
          code: issue.code
        });
      }

      console.log(chalk.green('│  ✅ pa11y: ') + `${results.findings.length} issues`);
    } catch {
      console.log(chalk.dim('│  ⚪ pa11y: Failed'));
    }
  }

  async runLighthouse(url, results) {
    try {
      console.log(chalk.dim('│  ▶ Running Lighthouse...'));
      const output = execSync(`lighthouse ${url} --only-chategories=accessibility --json 2>/dev/null | tail -1`, {
        encoding: 'utf-8',
        timeout: 120000
      });

      const parsed = JSON.parse(output);
      const score = parsed.categories?.accessibility?.score * 100 || 0;

      results.findings.push({
        type: 'accessibility_score',
        severity: score >= 90 ? 'pass' : score >= 50 ? 'warning' : 'fail',
        score: Math.round(score)
      });

      console.log(chalk.green('│  ✅ Lighthouse: ') + `${Math.round(score)}% accessibility score`);
    } catch {
      console.log(chalk.dim('│  ⚪ Lighthouse: Failed'));
    }
  }

  checkManualCriteria(results) {
    console.log(chalk.cyan('│  Manual Testing Checklist:'));

    const manualChecks = [
      { id: '1.1.1', status: 'manual', note: 'Check alt text on all images' },
      { id: '1.3.1', status: 'manual', note: 'Verify semantic HTML structure' },
      { id: '2.1.1', status: 'manual', note: 'Test with keyboard only' },
      { id: '2.4.7', status: 'manual', note: 'Verify visible focus indicators' },
      { id: '4.1.2', status: 'manual', note: 'Test with screen reader' }
    ];

    for (const check of manualChecks) {
      const criterion = WCAG_CRITERIA[check.id];
      results.criteria[check.id] = { ...criterion, status: check.status, note: check.note };
      console.log(chalk.dim(`│    □ ${check.id} ${criterion?.name || ''}`));
    }
  }

  async runBuiltInAccessibility(url, results) {
    console.log(chalk.dim('│  ▶ Running comprehensive WCAG checks...'));

    const { execSync } = await import('child_process');

    let html = '';
    try {
      html = execSync(`curl -sL --max-time 15 "${url}" 2>&1 | head -c 50000`, {
        encoding: 'utf-8',
        timeout: 20000
      });
    } catch (e) {
      console.log(chalk.dim(`  ⚪ Could not fetch page: ${e.message}`));
      return;
    }

    const findings = [];

    if (!html.match(/<html[^>]+lang=/i)) {
      findings.push({
        type: 'accessibility',
        severity: 'high',
        criterion: '3.1.1',
        title: 'Missing lang attribute on <html>',
        message: 'The html element must have a lang attribute',
        fix: 'Add lang="en" or appropriate language code to your <html> tag',
        wcag: 'WCAG 3.1.1'
      });
    }

    const imagesWithoutAlt = (html.match(/<img(?![^>]*alt=)[^>]*>/gi) || []).length;
    if (imagesWithoutAlt > 0) {
      findings.push({
        type: 'accessibility',
        severity: 'high',
        criterion: '1.1.1',
        title: `${imagesWithoutAlt} images missing alt text`,
        message: 'All images must have alt attribute',
        fix: 'Add descriptive alt attributes to all <img> tags',
        wcag: 'WCAG 1.1.1'
      });
    }

    const inputsWithoutLabel = [];
    const inputMatches = html.match(/<input[^>]*>/gi) || [];
    const labelMatches = html.match(/<label[^>]*>/gi) || [];
    const ariaLabelMatches = html.match(/aria-label=/gi) || [];

    for (const input of inputMatches) {
      if (!input.includes('alt=') && !input.includes('aria-label') && !input.includes('id=')) {
        inputsWithoutLabel.push(input.slice(0, 50));
      }
    }
    if (inputsWithoutLabel.length > labelMatches.length && inputsWithoutLabel.length > ariaLabelMatches.length) {
      findings.push({
        type: 'accessibility',
        severity: 'high',
        criterion: '1.3.1',
        title: 'Form inputs may lack labels',
        message: `${inputsWithoutLabel.length} inputs found without associated labels`,
        fix: 'Add <label> elements or aria-label attributes to all form inputs',
        wcag: 'WCAG 1.3.1'
      });
    }

    if (!html.match(/skip.*nav|skip.*content|skipnav/i)) {
      findings.push({
        type: 'accessibility',
        severity: 'medium',
        criterion: '2.4.1',
        title: 'No skip navigation link found',
        message: 'Page should have a skip navigation link',
        fix: 'Add a "Skip to main content" link as first focusable element',
        wcag: 'WCAG 2.4.1'
      });
    }

    if (!html.match(/<title>[^<]+<\/title>/i)) {
      findings.push({
        type: 'accessibility',
        severity: 'high',
        criterion: '2.4.2',
        title: 'Missing or empty page title',
        message: 'Page must have a descriptive title',
        fix: 'Add a descriptive <title> element',
        wcag: 'WCAG 2.4.2'
      });
    }

    const h1Count = (html.match(/<h1[^>]*>/gi) || []).length;
    if (h1Count === 0) {
      findings.push({
        type: 'accessibility',
        severity: 'medium',
        criterion: '2.4.6',
        title: 'No H1 heading found',
        message: 'Page should have exactly one H1 heading',
        fix: 'Add exactly one H1 heading per page describing the page topic',
        wcag: 'WCAG 2.4.6'
      });
    } else if (h1Count > 1) {
      findings.push({
        type: 'accessibility',
        severity: 'medium',
        criterion: '2.4.6',
        title: 'Multiple H1 headings found',
        message: 'Page has multiple H1 headings',
        fix: 'Use only one H1 heading per page',
        wcag: 'WCAG 2.4.6'
      });
    }

    const headings = html.match(/<h[1-6][^>]*>/gi) || [];
    let prevLevel = 0;
    for (const h of headings) {
      const level = parseInt(h.match(/h([1-6])/i)[1]);
      if (prevLevel > 0 && level - prevLevel > 1) {
        findings.push({
          type: 'accessibility',
          severity: 'low',
          criterion: '2.4.6',
          title: 'Heading level skipped',
          message: `Heading hierarchy jumps from h${prevLevel} to h${level}`,
          fix: 'Use heading levels in sequential order without skipping',
          wcag: 'WCAG 2.4.6'
        });
        break;
      }
      prevLevel = level;
    }

    const emptyLinks = (html.match(/<a[^>]*href=[^>]*>[\s]*<\/a>/gi) || []).length;
    if (emptyLinks > 0) {
      findings.push({
        type: 'accessibility',
        severity: 'medium',
        criterion: '2.4.4',
        title: `${emptyLinks} empty links found`,
        message: 'Links must have discernible text',
        fix: 'Add text content to links or use aria-label',
        wcag: 'WCAG 2.4.4'
      });
    }

    const buttonsWithoutLabel = (html.match(/<button[^>]*>[\s]*<\/button>/gi) || []).length;
    if (buttonsWithoutLabel > 0) {
      findings.push({
        type: 'accessibility',
        severity: 'medium',
        criterion: '4.1.2',
        title: `${buttonsWithoutLabel} buttons without labels`,
        message: 'Buttons must have accessible names',
        fix: 'Add text content or aria-label to buttons',
        wcag: 'WCAG 4.1.2'
      });
    }

    const iframes = html.match(/<iframe[^>]*>/gi) || [];
    for (const iframe of iframes) {
      if (!iframe.includes('title=') && !iframe.includes('aria-label')) {
        findings.push({
          type: 'accessibility',
          severity: 'high',
          criterion: '4.1.2',
          title: 'Iframe missing title',
          message: 'iframes must have title attribute',
          fix: 'Add title attribute to iframe element',
          wcag: 'WCAG 4.1.2'
        });
      }
    }

    const langMatches = html.match(/lang="([^"]+)"/i);
    if (langMatches) {
      const lang = langMatches[1].toLowerCase();
      const validLangs = ['en', 'es', 'fr', 'de', 'zh', 'ja', 'ko', 'ar', 'pt', 'ru', 'it', 'nl'];
      if (!validLangs.some(l => lang.startsWith(l))) {
        findings.push({
          type: 'accessibility',
          severity: 'low',
          criterion: '3.1.1',
          title: 'Unusual language code',
          message: `Language code "${lang}" may not be valid`,
          fix: 'Use standard ISO 639-1 language codes',
          wcag: 'WCAG 3.1.1'
        });
      }
    }

    results.findings.push(...findings);
    console.log(chalk.green(`  ✅ WCAG checks: ${findings.length} findings`));
  }

  mapAxeImpact(impact) {
    return { critical: 'critical', serious: 'high', moderate: 'medium', minor: 'low' }[impact] || 'info';
  }

  displayResults(results) {
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, pass: 0 };

    for (const f of results.findings) {
      const sev = f.severity || 'info';
      if (bySeverity[sev] !== undefined) bySeverity[sev]++;
    }

    console.log(chalk.red('│'));
    console.log(chalk.red('│  Results:'));
    console.log(chalk.red('│    Pass/Fail: ') + bySeverity.pass);
    console.log(chalk.red('│    Critical: ') + bySeverity.critical);
    console.log(chalk.red('│    High: ') + bySeverity.high);
    console.log(chalk.red('│    Medium: ') + bySeverity.medium);
    console.log(chalk.red('│    Low: ') + bySeverity.low);
    console.log(chalk.red('╰──────────────────────────────────────────────────────────╯'));
  }

  generateVPATReport(format = 'md') {
    const sections = [
      '# VPAT Accessibility Report\n',
      '## Product Information',
      `- URL: ${this.results.url || 'N/A'}`,
      `- Date: ${new Date().toISOString()}`,
      '- Standard: WCAG 2.1 Level AA\n',
      '## Results Summary',
      this.results.map(f => `- ${f.criterion || f.type}: ${f.severity} - ${f.message || ''}`).join('\n')
    ];

    return sections.join('\n');
  }
}

export default VPATEngine;