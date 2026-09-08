import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lint } from '../index.mjs';

const byRule = (findings, rule) => findings.filter(f => f.rule === rule);

const CLI = new URL('../index.mjs', import.meta.url).pathname;

/** 四个 CLI 共用的 level 白名单。 */
const LEVELS = ['ok', 'warn', 'error', 'info'];

/** 在 tmpdir 里写一组文件（相对路径 → 内容），返回目录。 */
function makeDir(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsmd-lint-'));
    for (const [rel, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, rel), content);
    return dir;
}

function runCli(args) {
    return spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf-8' });
}

/**
 * 断言 stdout 里只有一个 JSON 对象：没有人类输出混入、没有 ANSI、summary 与 results 自洽。
 * @returns {{tool: string, target: string|string[], summary: object, results: object[]}}
 */
function parseOnlyJson(res) {
    assert.strictEqual(res.stderr, '', 'JSON 模式不该往 stderr 写东西');
    assert.match(res.stdout, /^\{[\s\S]*\}\n$/, 'stdout 必须是单个 JSON 对象');
    assert.doesNotMatch(res.stdout, /\u001b\[/, '不得含 ANSI');
    const payload = JSON.parse(res.stdout);
    for (const r of payload.results) {
        assert.ok(LEVELS.includes(r.level), `level=${r.level} 不在白名单内`);
        assert.ok(typeof r.id === 'string' && r.id.length > 0 && r.message.length > 0);
        assert.ok(!('advice' in r) || typeof r.advice === 'string', 'advice 缺失就省略键，不输出 null');
    }
    assert.deepStrictEqual(
        LEVELS.map(l => payload.summary[l]),
        LEVELS.map(l => payload.results.filter(r => r.level === l).length),
        'summary 必须等于 results 的 level 计数',
    );
    return payload;
}

test('干净的文件零告警', () => {
    const text = [
        '# 项目',
        '',
        '一句话概述。',
        '',
        '## 命令',
        '',
        '- 测试: `npm test`',
    ].join('\n');
    assert.deepStrictEqual(lint(text, { pkg: { scripts: { test: 'node --test' } } }), []);
});

test('max-lines 只数非空行，超限告警', () => {
    const filler = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const spaced = filler.flatMap(l => [l, '', '']); // 90 行但只有 30 行非空
    assert.strictEqual(byRule(lint(spaced.join('\n'), { maxLines: 30 }), 'max-lines').length, 0);
    assert.strictEqual(byRule(lint(spaced.join('\n'), { maxLines: 29 }), 'max-lines').length, 1);
});

test('placeholder：TODO/中文占位/<your ...> 报 error，且带行号', () => {
    const f = lint(['# t', 'ok 内容', 'TODO: 补充', '目标是 <项目名>', '<your command here>'].join('\n'));
    const ph = byRule(f, 'placeholder');
    assert.strictEqual(ph.length, 3);
    assert.deepStrictEqual(ph.map(x => x.line), [3, 4, 5]);
    assert.ok(ph.every(x => x.level === 'error'));
});

test('vague：中英文模糊措辞告警，代码块和标题跳过', () => {
    const f = lint([
        '# 酌情处理',              // 标题跳过
        '出错时酌情重试。',         // 命中
        'Handle errors properly.', // 命中
        '```',
        'run-properly --as-needed', // 代码块跳过
        '```',
    ].join('\n'));
    const v = byRule(f, 'vague');
    assert.deepStrictEqual(v.map(x => x.line), [2, 3]);
});

test('dead-script：npm 脚本必须存在；无 package.json 时跳过', () => {
    const text = ['# t', '正文', '跑 `npm run build` 和 `npm test`，再 `npm run lint`'].join('\n');
    const pkg = { scripts: { test: 'x', lint: 'y' } };
    const dead = byRule(lint(text, { pkg }), 'dead-script');
    assert.strictEqual(dead.length, 1);
    assert.match(dead[0].message, /"build"/);
    assert.strictEqual(dead[0].level, 'error');
    // 没有 package.json 可校验 → 不报
    assert.strictEqual(byRule(lint(text, { pkg: null }), 'dead-script').length, 0);
});

test('empty-section：空标题节告警，有正文/代码块的不报', () => {
    const f = lint([
        '# 总览',
        '有正文。',
        '## 空节',
        '## 有代码块的节',
        '```',
        'cmd',
        '```',
        '## 结尾空节',
    ].join('\n'));
    const es = byRule(f, 'empty-section');
    assert.deepStrictEqual(es.map(x => x.line), [3, 8]);
});

test('深层子标题不误报父节为空', () => {
    // "## 父" 后紧跟 "### 子"（更深层级）属于正常结构，不算空节
    const f = lint(['## 父', '### 子', '子的内容。'].join('\n'));
    assert.strictEqual(byRule(f, 'empty-section').length, 0);
});

test('行内 code span 是提及不是使用：`TODO`/`酌情` 不报，围栏内占位符仍报', () => {
    const mention = lint(['# t', '规则表引用 `TODO` 与 `酌情` 做示例是合法的。'].join('\n'));
    assert.strictEqual(mention.length, 0);
    // 围栏代码块里的占位符仍然说明模板没填完
    const fence = lint(['# t', '正文', '```', 'cp <项目名>.conf /etc/', '```'].join('\n'));
    assert.strictEqual(fence.filter(f => f.rule === 'placeholder').length, 1);
});

test('含中文 alt 的 HTML 标签不是占位符', () => {
    const f = lint(['# t', '正文', '<img src="./a.svg" width="100%" alt="第一板块：跨工具对照，每格都是官方链接。">'].join('\n'));
    assert.strictEqual(f.filter(x => x.rule === 'placeholder').length, 0);
    // 真占位符仍然要抓
    assert.strictEqual(lint(['# t', '正文', '目标是 <项目名>'].join('\n')).filter(x => x.rule === 'placeholder').length, 1);
});

// package.json 与被检文件同目录：dead-script 才有可校验的脚本清单
const FIXTURE = {
    'package.json': '{"name":"fixture","scripts":{"test":"node --test"}}',
    'dirty.md': ['# t', '', 'TODO: 补充', '出错时酌情重试。', '', '跑 `npm run build`'].join('\n'),
    'clean.md': ['# t', '', '一句话概述。', '', '## 命令', '', '- 测试: `npm test`'].join('\n'),
};

test('--json：stdout 只有一个 JSON 对象，多文件仍是单个对象', () => {
    const dir = makeDir(FIXTURE);
    const files = [path.join(dir, 'dirty.md'), path.join(dir, 'clean.md')];
    const res = runCli(['--json', ...files]);
    const payload = parseOnlyJson(res);
    assert.strictEqual(payload.tool, 'agentsmd-lint');
    assert.deepStrictEqual(payload.target, files, 'target 是绝对路径数组');
    // 规则 id 原样进 results，带行号与所属文件
    assert.ok(payload.results.some(r => r.id === 'placeholder' && r.level === 'error' && r.line === 3));
    assert.ok(payload.results.some(r => r.id === 'vague' && r.level === 'warn' && r.line === 4));
    assert.ok(payload.results.some(r => r.id === 'dead-script' && r.level === 'error' && r.file === files[0]));
    // 干净文件给一条 ok，summary.ok 才有意义
    assert.ok(payload.results.some(r => r.id === 'no-findings' && r.level === 'ok' && r.file === files[1]));
    assert.strictEqual(payload.summary.error, 2);
});

test('--json 与人类模式退出码一致', () => {
    const dir = makeDir(FIXTURE);
    for (const [file, code] of [['dirty.md', 1], ['clean.md', 0]]) {
        const target = path.join(dir, file);
        assert.strictEqual(runCli([target]).status, code, `人类模式 ${file}`);
        assert.strictEqual(runCli(['--json', target]).status, code, `JSON 模式 ${file}`);
    }
});

test('--help 退出码 0 且列出全部 flag', () => {
    const res = runCli(['--help']);
    assert.strictEqual(res.status, 0);
    for (const flag of ['--max-lines', '--json', '--help']) {
        assert.ok(res.stdout.includes(flag), `--help 应列出 ${flag}`);
    }
    assert.match(res.stdout, /退出码/);
});

test('读不到的目标（目录 / 不存在）给干净的用法错误 exit 2，不抛 Node 栈，stdout 保持空', () => {
    const dir = makeDir({});
    for (const target of [dir, path.join(dir, 'nope.md')]) {
        for (const args of [[target], [target, '--json']]) {
            const res = runCli(args);
            assert.equal(res.status, 2, `${args.join(' ')} 应 exit 2`);
            assert.equal(res.stdout, '', 'stdout 必须干净，agent 才能安全解析');
            assert.match(res.stderr, /用法: agentsmd-lint/);
            assert.doesNotMatch(res.stderr, /at .*node:fs|readFileUtf8/, '不得泄漏 Node 栈');
        }
    }
});
