import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { diagnose, gitignoreCovers } from '../index.mjs';

const CLI = new URL('../index.mjs', import.meta.url).pathname;

/** 四个 CLI 共用的 level 白名单。 */
const LEVELS = ['ok', 'warn', 'error', 'info'];

function runCli(args) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8' });
}

/**
 * 断言 stdout 里只有一个 JSON 对象：没有人类输出混入、没有 ANSI、summary 与 results 自洽。
 * @returns {{tool: string, target: string, summary: object, results: object[]}}
 */
function parseOnlyJson(res) {
    assert.strictEqual(res.stderr, '', 'JSON 模式不该往 stderr 写东西');
    assert.match(res.stdout, /^\{[\s\S]*\}\n$/, 'stdout 必须是单个 JSON 对象');
    assert.doesNotMatch(res.stdout, /\u001b\[/, '不得含 ANSI');
    const payload = JSON.parse(res.stdout);
    for (const r of payload.results) {
        assert.ok(LEVELS.includes(r.level), `level=${r.level} 不在白名单内`);
        assert.ok(!('advice' in r) || typeof r.advice === 'string', 'advice 缺失就省略键，不输出 null');
    }
    assert.deepStrictEqual(
        LEVELS.map(l => payload.summary[l]),
        LEVELS.map(l => payload.results.filter(r => r.level === l).length),
        'summary 必须等于 results 的 level 计数',
    );
    return payload;
}

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

const IDS = ['agents-md', 'claude-md', 'rules', 'hooks', 'skills', 'secrets', 'ci-gate'];

test('--json：stdout 只有一个 JSON 对象，7 个 check id 原样进 results', () => {
    const dir = makeRepo({ 'AGENTS.md': CLEAN_AGENTS });
    const payload = parseOnlyJson(runCli([dir, '--json']));
    assert.strictEqual(payload.tool, 'agents-doctor');
    assert.strictEqual(payload.target, path.resolve(dir));
    assert.deepStrictEqual(payload.results.map(r => r.id), IDS);
    // stage 只属于 verify-doctor，line 只属于 agentsmd-lint
    assert.ok(payload.results.every(r => !('stage' in r) && !('line' in r)));
});

test('--json 与人类模式退出码一致', () => {
    const dirty = makeRepo({ 'AGENTS.md': CLEAN_AGENTS, '.env': 'TOKEN=x\n' }); // secrets → error
    const clean = makeRepo({ 'AGENTS.md': CLEAN_AGENTS });
    for (const [dir, code] of [[dirty, 1], [clean, 0]]) {
        assert.strictEqual(runCli([dir]).status, code, `人类模式 ${dir}`);
        assert.strictEqual(runCli([dir, '--json']).status, code, `JSON 模式 ${dir}`);
    }
    assert.strictEqual(parseOnlyJson(runCli([dirty, '--json'])).summary.error, 1);
});

test('--help 退出码 0 且列出全部 flag', () => {
    const res = runCli(['--help']);
    assert.strictEqual(res.status, 0);
    for (const flag of ['--json', '--help']) {
        assert.ok(res.stdout.includes(flag), `--help 应列出 ${flag}`);
    }
    assert.match(res.stdout, /退出码/);
});
