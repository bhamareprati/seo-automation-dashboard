import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const root = path.resolve(__dirname, '../..');
const srcDir = path.join(root, 'src');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = () => walk(srcDir).filter((f) => /\.(js|jsx|mjs|cjs)$/.test(f));
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

const IMPORT_PATTERN =
  /(?:require\(\s*['"]([^'"]+)['"]\s*\)|from\s+['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\))/gm;

function importsOf(source) {
  return [...source.matchAll(IMPORT_PATTERN)].map((m) => m[1] || m[2] || m[3] || m[4]);
}

/** Resolves an import to a project folder such as "pipeline", or a package name. */
function targetOf(fromFile, spec) {
  let resolved = null;
  if (spec.startsWith('@/')) resolved = spec.slice(2);
  else if (spec.startsWith('.')) {
    resolved = path.relative('src', path.posix.join(path.posix.dirname(fromFile), spec)).split(path.sep).join('/');
    if (resolved.startsWith('..')) return { kind: 'outside', name: resolved };
  }
  if (resolved !== null) return { kind: 'project', name: resolved.split('/')[0] };
  return { kind: 'package', name: spec };
}

const FRAMEWORK = /^(next($|\/)|react($|\/)|react-dom($|\/))/;
const CAPABILITIES = ['crawlers', 'analyzers', 'ai', 'reports', 'delivery'];

/** Which imports each layer may use. Returns the rule a file falls under. */
function ruleFor(file) {
  const inFolder = (name) => file.startsWith(`src/${name}/`);
  if (file.startsWith('src/app/api/')) {
    return { forbidProject: ['crawlers', 'analyzers', 'ai', 'mocks'] };
  }
  if (file.startsWith('src/app/') || inFolder('components')) {
    return { forbidProject: ['pipeline', 'mocks', ...CAPABILITIES] };
  }
  if (inFolder('pipeline')) return { forbidProject: ['app', 'components'], forbidFramework: true };
  if (CAPABILITIES.some(inFolder)) return { forbidProject: ['pipeline', 'app', 'components'], forbidFramework: true };
  if (inFolder('lib')) {
    return { forbidProject: ['pipeline', 'app', 'components', 'mocks', ...CAPABILITIES], forbidFramework: true };
  }
  if (inFolder('mocks')) return { forbidAllProject: true, forbidFramework: true };
  return null;
}

function findViolations(file, source) {
  const rule = ruleFor(file);
  if (!rule) return [];
  const bad = [];
  for (const spec of importsOf(source)) {
    const target = targetOf(file, spec);
    if (target.kind === 'project') {
      const sibling = file.startsWith(`src/${target.name}/`);
      if (rule.forbidAllProject && !sibling) bad.push(spec);
      if (rule.forbidProject?.includes(target.name)) bad.push(spec);
    }
    if (target.kind === 'package' && rule.forbidFramework && FRAMEWORK.test(target.name)) bad.push(spec);
  }
  return bad;
}

describe('code rules', () => {
  it('no dangerouslySetInnerHTML in src', () => {
    const offenders = sourceFiles().filter((f) => fs.readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('next/image is not used, and the image optimizer stays off', () => {
    const offenders = sourceFiles().filter((f) => fs.readFileSync(f, 'utf8').includes('next/image'));
    expect(offenders.map(rel)).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'next.config.js'), 'utf8')).toContain('images: { unoptimized: true }');
  });

  it('security headers are configured', () => {
    const config = require(path.join(root, 'next.config.js'));
    expect(config.poweredByHeader).toBe(false);
    return config.headers().then(([rule]) => {
      expect(rule.source).toBe('/:path*');
      expect(Object.fromEntries(rule.headers.map((h) => [h.key, h.value]))).toMatchObject({
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
      });
    });
  });

  it('the pipeline deploys only after tests pass, and only from main', () => {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci-cd.yml'), 'utf8');
    const deploy = workflow.slice(workflow.indexOf('  deploy:'));
    expect(deploy).toContain('needs: test');
    expect(deploy).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).not.toMatch(/--prebuilt\s+--prod|vercel@latest/);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).git.deploymentEnabled).toBe(false);
  });

  it('private files stay out of Git', () => {
    const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    for (const entry of ['.env', '.env.*', '!.env.example', '/docs/', '.vercel/', '.neon']) {
      expect(ignore.split(/\r?\n/), entry).toContain(entry);
    }
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
    const leaked = tracked.filter((f) => /^(docs\/|\.neon$|\.vercel\/)|(^|\/)\.env($|\.(?!example$))/.test(f));
    expect(leaked).toEqual([]);

    // Covers .gitignore and this machine's own .git/info/exclude rules.
    const ignoredButTracked = execFileSync('git', ['ls-files', '--cached', '--ignored', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
    expect(ignoredButTracked.trim()).toBe('');
  });

  it('no credentials or private identifiers are in tracked files', () => {
    // Generic shapes of real keys, built in pieces so this test doesn't match itself.
    const PATTERNS = [
      new RegExp(`sk-${'ant'}-[A-Za-z0-9]`),
      new RegExp(`${'npg'}_[A-Za-z0-9]{6,}`),
      new RegExp(`${'napi'}_[A-Za-z0-9]{6,}`),
      new RegExp(`[a-z]+://[^\\s'"]+:[^\\s'"@]+@[^\\s'"]*(${'neon\\.tech'}|${'upstash\\.io'})`),
    ];

    // The actual private values come from local files Git ignores, so they're never written in a tracked file.
    const readLocal = (name) => {
      const file = path.join(root, name);
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    };
    const envValues = `${readLocal('.env')}\n${readLocal('.env.test-logins')}`
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .filter((line) => /(URL|SECRET|KEY|HASH|PASSWORD|TOKEN)/.test(line.split('=')[0]) && !line.startsWith('APP_URL'))
      .map((line) => line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, ''));
    const privateTerms = readLocal('.env.private-terms')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'));
    const privateValues = [...envValues, ...privateTerms].filter((value) => value.length >= 3);

    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    const problems = tracked
      .filter((f) => !/\.(ico|png|jpg|woff2?)$/.test(f))
      .filter((f) => fs.existsSync(path.join(root, f)))
      .flatMap((f) => {
        const text = fs.readFileSync(path.join(root, f), 'utf8');
        const lower = text.toLowerCase();
        const shapes = PATTERNS.filter((pattern) => pattern.test(text)).map(() => `${f}: looks like a credential`);
        const values = privateValues.filter((value) => lower.includes(value.toLowerCase())).map(() => `${f}: contains a private value`);
        return [...shapes, ...values];
      });
    expect(problems).toEqual([]);
  });

  it('local servers listen on this machine only', () => {
    const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(scripts.dev).toContain('-H 127.0.0.1');
    expect(scripts.start).toContain('-H 127.0.0.1');
  });

  it('no process.env outside env.js and mocks/index.js', () => {
    const allowed = new Set(['src/lib/env.js', 'src/mocks/index.js']);
    const offenders = sourceFiles()
      .map(rel)
      .filter((f) => !allowed.has(f))
      .filter((f) => fs.readFileSync(path.join(root, f), 'utf8').includes('process.env'));
    expect(offenders).toEqual([]);
  });

  it('no secret variable has a NEXT_PUBLIC prefix', () => {
    const files = [...sourceFiles(), path.join(root, '.env.example')];
    const offenders = files.filter((f) => fs.readFileSync(f, 'utf8').includes('NEXT_PUBLIC_'));
    expect(offenders.map(rel)).toEqual([]);
  });

  it('layer import rules hold', () => {
    const problems = sourceFiles().flatMap((full) => {
      const file = rel(full);
      return findViolations(file, fs.readFileSync(full, 'utf8')).map((spec) => `${file} imports ${spec}`);
    });
    expect(problems).toEqual([]);
  });

  it('layer checker catches real violations', () => {
    expect(findViolations('src/pipeline/a.js', "const x = require('next/server');")).toHaveLength(1);
    expect(findViolations('src/pipeline/a.js', "const x = require('../app/page');")).toHaveLength(1);
    expect(findViolations('src/crawlers/a.js', "const x = require('../pipeline/runAudit');")).toHaveLength(1);
    expect(findViolations('src/app/admin/page.js', "import x from '@/pipeline/runAudit';")).toHaveLength(1);
    expect(findViolations('src/app/api/x/route.js', "import x from '@/mocks';")).toHaveLength(1);
    expect(findViolations('src/lib/a.js', "const x = require('../crawlers/site');")).toHaveLength(1);
    expect(findViolations('src/mocks/a.js', "const x = require('../lib/env');")).toHaveLength(1);
    expect(findViolations('src/crawlers/a.js', "const { getEnv } = require('../lib/env');")).toHaveLength(0);
    expect(findViolations('src/app/api/x/route.js', "import { prisma } from '@/lib/prisma';")).toHaveLength(0);
  });
});
