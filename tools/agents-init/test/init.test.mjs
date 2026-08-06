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
