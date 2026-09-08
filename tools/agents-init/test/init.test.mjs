import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detect, render } from '../index.mjs';
import { lint } from '../../agentsmd-lint/index.mjs';

const CLI = new URL('../index.mjs', import.meta.url).pathname;

/** 在 tmpdir 里搭一个假仓库。值为 null 表示建目录，字符串表示写文件。 */
function makeRepo(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-init-'));
    for (const [rel, content] of Object.entries(files)) {
        const p = path.join(dir, rel);
        if (content === null) {
            fs.mkdirSync(p, { recursive: true });
        } else {
            fs.mkdirSync(path.dirname(p), { recursive: true });
            fs.writeFileSync(p, content);
        }
    }
    return dir;
}

function runCli(args) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8' });
}

const cmds = detection => detection.commands.map(c => c.cmd);

test('npm 项目：scripts 里存在的才生成，test 用 npm test，无关脚本不收', () => {
    const dir = makeRepo({
        'package.json': JSON.stringify({
            name: 'demo-app',
            description: '演示用的假项目。',
            scripts: { test: 'node --test', build: 'tsc', lint: 'eslint .', docs: 'typedoc' },
        }),
    });
    const d = detect(dir);
    assert.strictEqual(d.name, 'demo-app');
    assert.strictEqual(d.description, '演示用的假项目。');
    assert.deepStrictEqual(cmds(d), ['npm test', 'npm run build', 'npm run lint']);

    const text = render(d);
    assert.match(text, /^# demo-app\n/);
    assert.ok(text.includes('演示用的假项目。'));
    assert.ok(text.includes('| 测试 | `npm test` |'));
    assert.ok(text.includes('| 构建 | `npm run build` |'));
    assert.ok(!text.includes('docs'), 'docs 不在收录名单里，不该进命令表');
});

test('packageManager 含 pnpm 时命令换前缀', () => {
    const dir = makeRepo({
        'package.json': JSON.stringify({
            name: 'p',
            packageManager: 'pnpm@9.1.0',
            scripts: { test: 'vitest', dev: 'vite' },
        }),
    });
    assert.deepStrictEqual(cmds(detect(dir)), ['pnpm test', 'pnpm run dev']);
});

test('cargo 项目：test/build/clippy 三件套，target/ 进 never', () => {
    const dir = makeRepo({ 'Cargo.toml': '[package]\nname = "x"\n', target: null });
    const d = detect(dir);
    assert.deepStrictEqual(cmds(d), ['cargo test', 'cargo build', 'cargo clippy']);
    assert.deepStrictEqual(d.neverDirs, ['target']);
    assert.ok(render(d).includes('- 不手改生成物目录 `target/`'));
});

test('pyproject 无 pytest 痕迹：不编命令，只给注释提示', () => {
    const dir = makeRepo({ 'pyproject.toml': '[project]\nname = "y"\n' });
    const d = detect(dir);
    assert.deepStrictEqual(cmds(d), []);
    assert.strictEqual(d.notes.length, 1);
    const text = render(d);
    assert.ok(!text.includes('pytest\n'), '不该出现编造的 pytest 命令行');
    assert.ok(text.includes('<!-- Python：'), '提示必须以注释形式出现');
});

test('多语言共存全部收录', () => {
    const dir = makeRepo({
        'package.json': JSON.stringify({ name: 'poly', scripts: { test: 'node --test' } }),
        'Cargo.toml': '[package]\nname = "poly"\n',
        'pyproject.toml': '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n',
        'go.mod': 'module example.com/poly\n',
        dist: null,
        node_modules: null,
    });
    const d = detect(dir);
    assert.deepStrictEqual(cmds(d), [
        'npm test', 'cargo test', 'cargo build', 'cargo clippy', 'pytest', 'go test ./...',
    ]);
    assert.deepStrictEqual(d.neverDirs, ['dist', 'node_modules']);
});

test('生成物过 lint() 零命中：有描述、无描述、空仓库三种形态', () => {
    const rich = makeRepo({
        'package.json': JSON.stringify({
            name: 'rich', description: '有描述的项目。',
            scripts: { test: 'node --test', build: 'x', lint: 'y', dev: 'z', format: 'w' },
        }),
        dist: null,
    });
    const bare = makeRepo({ 'package.json': JSON.stringify({ name: 'bare', scripts: {} }) });
    const empty = makeRepo({});
    for (const dir of [rich, bare, empty]) {
        const pkgPath = path.join(dir, 'package.json');
        const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) : null;
        assert.deepStrictEqual(lint(render(detect(dir)), { pkg }), []);
    }
});

test('CLI：已存在不覆盖 exit 1 并提示 --force；--force 覆盖', () => {
    const dir = makeRepo({
        'AGENTS.md': '# 手写的\n\n别动我。\n',
        'package.json': JSON.stringify({ name: 'cli-a', scripts: { test: 'node --test' } }),
    });
    const refuse = runCli([dir]);
    assert.strictEqual(refuse.status, 1);
    assert.match(refuse.stderr, /--force/);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8'), '# 手写的\n\n别动我。\n');

    const forced = runCli([dir, '--force']);
    assert.strictEqual(forced.status, 0);
    const text = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.match(text, /^# cli-a\n/);
    assert.match(forced.stdout, /零命中/);
});

test('CLI --link：CLAUDE.md 不存在建软链，已存在跳过', () => {
    const dir = makeRepo({ 'go.mod': 'module example.com/l\n' });
    const first = runCli([dir, '--link']);
    assert.strictEqual(first.status, 0);
    const claude = path.join(dir, 'CLAUDE.md');
    assert.strictEqual(fs.readlinkSync(claude), 'AGENTS.md');
    assert.match(fs.readFileSync(claude, 'utf-8'), /^# /, '软链要能读到生成物');

    const second = runCli([dir, '--link', '--force']);
    assert.strictEqual(second.status, 0);
    assert.match(second.stdout, /跳过/);
    assert.strictEqual(fs.readlinkSync(claude), 'AGENTS.md', '已存在的软链不该被动');
});

test('CLI 端到端：生成 + 自跑 lint 零命中 + 输出前缀约定', () => {
    const dir = makeRepo({
        'package.json': JSON.stringify({
            name: 'e2e', description: '端到端验证仓库。',
            scripts: { test: 'node --test', lint: 'eslint .' },
        }),
        'Cargo.toml': '[package]\nname = "e2e"\n',
        node_modules: null,
    });
    const r = runCli([dir]);
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /✓ 已写入/);
    assert.match(r.stdout, /✓ agentsmd-lint 零命中/);
    const text = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf-8');
    assert.ok(text.includes('| 测试 | `npm test` |'));
    assert.ok(text.includes('`cargo clippy`'));
    assert.ok(text.includes('`node_modules/`'));
    assert.ok(text.includes('.env'));
    assert.ok(text.includes('force push'));
});

/** 四个 CLI 共用的 level 白名单。 */
const LEVELS = ['ok', 'warn', 'error', 'info'];

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

test('--json：stdout 只有一个 JSON 对象，写了什么/探测到什么/自检结果都在里面', () => {
    const dir = makeRepo({
        'package.json': JSON.stringify({ name: 'json-app', description: '机器可读输出验证。', scripts: { test: 'node --test', build: 'tsc' } }),
        dist: null,
    });
    const payload = parseOnlyJson(runCli([dir, '--link', '--json']));
    assert.strictEqual(payload.tool, 'agents-init');
    assert.strictEqual(payload.target, path.resolve(dir));

    const write = payload.results.find(r => r.id === 'write');
    assert.strictEqual(write.level, 'ok');
    assert.strictEqual(write.file, path.join(dir, 'AGENTS.md'));

    const detect = payload.results.find(r => r.id === 'detect');
    assert.strictEqual(detect.level, 'info');
    assert.match(detect.message, /npm test/);
    assert.match(detect.message, /npm run build/);

    assert.match(payload.results.find(r => r.id === 'never-dirs').message, /dist/);
    assert.strictEqual(payload.results.find(r => r.id === 'link').file, path.join(dir, 'CLAUDE.md'));
    // 生成物必须过自检：只有一条 no-findings，没有任何规则命中
    assert.strictEqual(payload.results.find(r => r.id === 'no-findings').level, 'ok');
    assert.strictEqual(payload.summary.error, 0);
});

test('--json 与人类模式退出码一致：拒绝覆盖时都是 1，且 JSON 仍是单个对象', () => {
    const files = { 'AGENTS.md': '# 手写的\n\n别动我。\n', 'package.json': JSON.stringify({ name: 'p', scripts: { test: 'node --test' } }) };
    const human = runCli([makeRepo(files)]);
    const json = runCli([makeRepo(files), '--json']);
    assert.strictEqual(human.status, 1);
    assert.strictEqual(json.status, 1);
    const payload = parseOnlyJson(json);
    const write = payload.results.find(r => r.id === 'write');
    assert.strictEqual(write.level, 'error');
    assert.match(write.advice, /--force/);

    // 正常写入路径两种模式同为 0
    assert.strictEqual(runCli([makeRepo({}), '--json']).status, 0);
    assert.strictEqual(runCli([makeRepo({})]).status, 0);
});

test('--help 退出码 0 且列出全部 flag', () => {
    const res = runCli(['--help']);
    assert.strictEqual(res.status, 0);
    for (const flag of ['--force', '--link', '--json', '--help']) {
        assert.ok(res.stdout.includes(flag), `--help 应列出 ${flag}`);
    }
    assert.match(res.stdout, /退出码/);
});

test('不存在的目标目录给干净的用法错误 exit 2，不抛 Node 栈，stdout 保持空', () => {
    for (const args of [['/nonexistent-xyz-agents-init'], ['/nonexistent-xyz-agents-init', '--json']]) {
        const res = runCli(args);
        assert.equal(res.status, 2, `${args.join(' ')} 应 exit 2`);
        assert.equal(res.stdout, '', 'stdout 必须干净，agent 才能安全解析');
        assert.match(res.stderr, /用法: agents-init/);
        assert.doesNotMatch(res.stderr, /at .*node:fs|writeFileUtf8/, '不得泄漏 Node 栈');
    }
});
