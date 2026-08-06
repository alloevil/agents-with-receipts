import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnose, gitignoreCovers } from '../index.mjs';

/** 在 tmpdir 里搭一个假仓库：files 是 相对路径 → 内容 的映射。 */
function makeRepo(files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-doctor-'));
    for (const [rel, content] of Object.entries(files)) {
        const p = path.join(dir, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
    }
    return dir;
}

const CLEAN_AGENTS = [
    '# 项目',
    '',
    '一句话概述。',
    '',
    '## 命令',
    '',
    '- 测试: `node --test`',
    '',
].join('\n');

const byId = (checks, id) => checks.find(c => c.id === id);

test('空仓库：AGENTS.md 缺失是 error，CLAUDE.md 缺失是 warn', () => {
    const checks = diagnose(makeRepo());
    const agents = byId(checks, 'agents-md');
    assert.strictEqual(agents.level, 'error');
    assert.match(agents.advice, /agents-init/);
    assert.strictEqual(byId(checks, 'claude-md').level, 'warn');
    assert.match(byId(checks, 'claude-md').advice, /ln -s/);
    // 没有敏感文件 → secrets ok
    assert.strictEqual(byId(checks, 'secrets').level, 'ok');
});

test('全套齐全的仓库：零 error，软链和门禁都被认出', () => {
    const dir = makeRepo({
        'AGENTS.md': CLEAN_AGENTS,
        '.claude/settings.json': JSON.stringify({ hooks: { PostToolUse: [] } }),
        '.gitignore': '# secrets\n.env*\ncredentials.json\n',
        '.env': 'TOKEN=x\n',
        '.github/workflows/ci.yml': 'run: node tools/agentsmd-lint/index.mjs AGENTS.md\n',
    });
    fs.symlinkSync('AGENTS.md', path.join(dir, 'CLAUDE.md'));
    const checks = diagnose(dir);
    assert.strictEqual(checks.filter(c => c.level === 'error').length, 0);
    assert.strictEqual(byId(checks, 'agents-md').level, 'ok');
    assert.strictEqual(byId(checks, 'claude-md').level, 'ok');
    assert.strictEqual(byId(checks, 'secrets').level, 'ok');
    assert.strictEqual(byId(checks, 'ci-gate').level, 'ok');
    assert.match(byId(checks, 'hooks').message, /Claude/);
});

test('CLAUDE.md 是普通文件且内容漂移 → warn；内容相同 → info 建议软链', () => {
    const drift = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS, 'CLAUDE.md': '# 另一份\n\n完全不同的内容。\n' }));
    assert.strictEqual(byId(drift, 'claude-md').level, 'warn');
    assert.match(byId(drift, 'claude-md').message, /漂移/);

    const copy = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS, 'CLAUDE.md': CLEAN_AGENTS }));
    assert.strictEqual(byId(copy, 'claude-md').level, 'info');
    assert.match(byId(copy, 'claude-md').advice, /ln -s/);
});

test('软链指向别处不算数', () => {
    const dir = makeRepo({ 'AGENTS.md': CLEAN_AGENTS, 'OTHER.md': 'x\n' });
    fs.symlinkSync('OTHER.md', path.join(dir, 'CLAUDE.md'));
    assert.strictEqual(byId(diagnose(dir), 'claude-md').level, 'warn');
});

test('.env 存在但没被 .gitignore 覆盖 → error，点名文件', () => {
    const none = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS, '.env': 'TOKEN=x\n' }));
    assert.strictEqual(byId(none, 'secrets').level, 'error');
    assert.match(byId(none, 'secrets').message, /\.env/);

    // .gitignore 只盖了 .env，credentials.json 漏网
    const partial = diagnose(makeRepo({
        'AGENTS.md': CLEAN_AGENTS,
        '.gitignore': '.env\n',
        '.env': 'x\n',
        'credentials.json': '{}\n',
    }));
    assert.strictEqual(byId(partial, 'secrets').level, 'error');
    assert.match(byId(partial, 'secrets').message, /credentials\.json/);
    assert.doesNotMatch(byId(partial, 'secrets').message, /：\.env、/);
});

test('gitignoreCovers：注释行不算，.env* 通配和前导 / 都能盖住', () => {
    assert.strictEqual(gitignoreCovers('# .env\n', '.env'), false);
    assert.strictEqual(gitignoreCovers('.env*\n', '.env.local'), true);
    assert.strictEqual(gitignoreCovers('/.env\n', '.env'), true);
    assert.strictEqual(gitignoreCovers('node_modules\n', '.env'), false);
    // 裸 * 不该盖住一切（length > 1 守卫）
    assert.strictEqual(gitignoreCovers('*\n', '.env'), false);
});

test('AGENTS.md 含 TODO（lint error）→ 本项降级为 error；只有 vague → warn', () => {
    const todo = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS + '\nTODO: 补充部署流程\n' }));
    assert.strictEqual(byId(todo, 'agents-md').level, 'error');

    const vague = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS + '\n出错时视情况重试。\n' }));
    assert.strictEqual(byId(vague, 'agents-md').level, 'warn');
});

test('hooks：.claude/settings.json 解析失败 → warn；无 hooks 键不计入', () => {
    const bad = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS, '.claude/settings.json': '{oops' }));
    assert.strictEqual(byId(bad, 'hooks').level, 'warn');

    const noKey = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS, '.claude/settings.json': '{"model":"x"}' }));
    assert.strictEqual(byId(noKey, 'hooks').level, 'info');
    assert.doesNotMatch(byId(noKey, 'hooks').message, /Claude/);
});

test('rules 与 skills：找到的家数出现在汇总里', () => {
    const checks = diagnose(makeRepo({
        'AGENTS.md': CLEAN_AGENTS,
        '.cursor/rules/style.mdc': 'x\n',
        '.github/instructions/api.instructions.md': 'x\n',
        '.claude/skills/deploy/SKILL.md': '# deploy\n',
    }));
    const rules = byId(checks, 'rules');
    assert.strictEqual(rules.level, 'info');
    assert.match(rules.message, /Cursor/);
    assert.match(rules.message, /Copilot/);
    assert.doesNotMatch(rules.message, /Claude、/);
    assert.match(byId(checks, 'skills').message, /Claude 1 个/);
});

test('ci-gate：有 workflow 无门禁 → info 带 advice；无 workflows 目录 → info', () => {
    const noGate = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS, '.github/workflows/ci.yaml': 'run: npm test\n' }));
    assert.strictEqual(byId(noGate, 'ci-gate').level, 'info');
    assert.match(byId(noGate, 'ci-gate').advice, /Step 5/);

    const noDir = diagnose(makeRepo({ 'AGENTS.md': CLEAN_AGENTS }));
    assert.strictEqual(byId(noDir, 'ci-gate').level, 'info');
    assert.match(byId(noDir, 'ci-gate').message, /没有 \.github\/workflows/);
});
