import { test } from 'node:test';
import assert from 'node:assert';
import { lint } from '../index.mjs';

const byRule = (findings, rule) => findings.filter(f => f.rule === rule);

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
