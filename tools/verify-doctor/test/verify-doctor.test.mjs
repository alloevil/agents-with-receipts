import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnose, ratchet } from '../index.mjs';

/** 在 tmpdir 里搭一个假仓库：files 是 相对路径 → 内容 的映射。 */
function makeRepo(files = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-doctor-'));
    for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
    }
    return dir;
}

// 用插值拼出零容忍的独占调用：本文件若字面写出它，verify-doctor 体检自己这个仓库就会红。
const ONLY_CALL = `test.on${'ly'}('x', () => {});`;

const CI_WITH_ARTIFACT = [
    'jobs:',
    '  check:',
    '    steps:',
    '      - run: TZ=UTC just check',
    '      - uses: actions/upload-artifact@v4',
    '        if: always()',
    '        with: { name: evidence, path: .artifacts/ }',
    '',
].join('\n');

/** 干净仓库：任务运行器 + 聚合入口 + CI artifact + 物理包边界 + PR 模板 + 确定性测试。 */
const CLEAN = {
    'justfile': 'check:\n\tTZ=UTC eslint . --max-warnings=0\n\tvitest run --reporter=json --outputFile=.artifacts/test.json\n',
    'package.json': JSON.stringify({ workspaces: ['packages/*'], scripts: { dev: 'just dev', check: 'just check' } }, null, 2),
    '.github/workflows/ci.yml': CI_WITH_ARTIFACT,
    '.github/PULL_REQUEST_TEMPLATE.md': '## 复现命令\n\n## 证据\n\n## 影响面\n',
    'src/app.ts': 'export const add = (a: number, b: number) => a + b;\n',
    'tsconfig.json': '{ "compilerOptions": { "strict": true, "noUncheckedIndexedAccess": true } }\n',
    'test/app.test.ts': "import { add } from '../src/app';\nassert(add(1, 2) === 3);\n",
};

const byId = (checks, id) => checks.find(c => c.id === id);

const IDS = [
    'verify-command', 'determinism', 'failure-artifacts', 'module-boundary', 'type-strict',
    'lint-hardness', 'escape-ratchet', 'flaky-quarantine', 'evidence-template',
];

test('9 个检查 id 全部出现，stage 是 0–5 的整数，级别合法', () => {
    const checks = diagnose(makeRepo(CLEAN));
    assert.deepEqual(checks.map(c => c.id).sort(), [...IDS].sort());
    for (const c of checks) {
        assert.ok(Number.isInteger(c.stage) && c.stage >= 0 && c.stage <= 5, `${c.id} stage=${c.stage}`);
        assert.ok(['ok', 'warn', 'error', 'info'].includes(c.level), `${c.id} level=${c.level}`);
        assert.ok(c.message.length > 0);
    }
    const stages = Object.fromEntries(checks.map(c => [c.id, c.stage]));
    assert.deepEqual(stages, {
        'verify-command': 0,
        determinism: 1,
        'failure-artifacts': 2,
        'module-boundary': 3,
        'type-strict': 3,
        'lint-hardness': 3,
        'escape-ratchet': 3,
        'evidence-template': 4,
        'flaky-quarantine': 5,
    });
});

test('干净仓库（运行器 + CI artifact + 物理包边界）：零 error', () => {
    const checks = diagnose(makeRepo(CLEAN));
    assert.deepEqual(checks.filter(c => c.level === 'error'), []);
    assert.equal(byId(checks, 'verify-command').level, 'ok');
    assert.equal(byId(checks, 'failure-artifacts').level, 'ok');
    assert.match(byId(checks, 'module-boundary').message, /workspaces/);
    assert.equal(byId(checks, 'type-strict').level, 'ok');
    assert.equal(byId(checks, 'evidence-template').level, 'ok');
});

test('.only 一律 error（零容忍），无 .only 时该项 ok', () => {
    const dirty = diagnose(makeRepo({ ...CLEAN, 'test/only.test.ts': ONLY_CALL }));
    const flaky = byId(dirty, 'flaky-quarantine');
    assert.equal(flaky.level, 'error');
    assert.match(flaky.message, /\.only/);
    assert.equal(byId(diagnose(makeRepo(CLEAN)), 'flaky-quarantine').level, 'ok');
});

// 夹具里的 skip 调用与 FLAKY 标注必须用插值拼出，不能写成字面量：本工具会扫描
// 自己的测试文件，字面量会被当成真实的隔离测试，让仓库自查长期挂着假阳性 warn。
// 检查器对自己误报，就是在训练人忽略警告——正是 10 章批判的「warn 等于不存在」。
const SKIP_CALL = `test.${'skip'}('flaps', () => {});\n`;
const flakyTag = (due) => `// ${'FLAKY'}: #4213 @alice due ${due} — 隔离原因\n`;

test('skip：无标注 warn，标注齐全且有清单 ok，标注过期 warn，有隔离项无清单 warn', () => {
    const bare = diagnose(makeRepo({ ...CLEAN, 'test/q.test.ts': SKIP_CALL }));
    const bareCheck = byId(bare, 'flaky-quarantine');
    assert.equal(bareCheck.level, 'warn');
    assert.match(bareCheck.message, /skip/);

    const TAGGED = flakyTag('2999-09-30') + SKIP_CALL;
    const noList = byId(diagnose(makeRepo({ ...CLEAN, 'test/q.test.ts': TAGGED })), 'flaky-quarantine');
    assert.equal(noList.level, 'warn');
    assert.match(noList.message, /flaky 清单/);

    const tagged = diagnose(makeRepo({ ...CLEAN, 'test/q.test.ts': TAGGED, 'FLAKY.md': '- #4213 @alice due 2999-09-30\n' }));
    assert.equal(byId(tagged, 'flaky-quarantine').level, 'ok');

    const expired = diagnose(makeRepo({
        ...CLEAN,
        'FLAKY.md': '- #4213 @alice due 2020-01-01\n',
        'test/q.test.ts': flakyTag('2020-01-01') + SKIP_CALL,
    }));
    const expiredCheck = byId(expired, 'flaky-quarantine');
    assert.equal(expiredCheck.level, 'warn');
    assert.match(expiredCheck.message, /过期/);
});

test('betterer 已采用 → escape-ratchet 为 ok 并注明已用成熟工具', () => {
    const withEscapes = { ...CLEAN, 'src/dirty.ts': 'const x = 1 as any; // eslint-disable-line\n' };
    const noTool = byId(diagnose(makeRepo(withEscapes)), 'escape-ratchet');
    assert.equal(noTool.level, 'warn');
    assert.match(noTool.message, /无棘轮基线/);

    const withBetterer = byId(diagnose(makeRepo({
        ...withEscapes,
        'package.json': JSON.stringify({ scripts: { betterer: 'betterer ci' } }),
        '.betterer.results': '// BETTERER RESULTS V2.\n',
    })), 'escape-ratchet');
    assert.equal(withBetterer.level, 'ok');
    assert.match(withBetterer.message, /betterer/);
});

test('棘轮：立基线后校验通过，逃逸口增加后校验失败', () => {
    const dir = makeRepo({ ...CLEAN, 'src/dirty.ts': 'const x = 1 as any;\n// @ts-ignore\nconst y = 2;\n' });

    const set = ratchet(dir, { write: true });
    assert.equal(set.fail, false);
    assert.equal(set.written, true);
    const baseline = JSON.parse(fs.readFileSync(path.join(dir, '.verify-baseline.json'), 'utf-8'));
    assert.equal(baseline.any_type, 1);
    assert.equal(baseline.ts_ignore, 1);
    assert.equal(baseline.test_only, 0);
    assert.match(baseline._note, /棘轮/);
    assert.match(baseline._updated, /^\d{4}-\d{2}-\d{2}$/);

    const clean = ratchet(dir);
    assert.equal(clean.fail, false);
    assert.equal(byId(diagnose(dir), 'escape-ratchet').level, 'ok');

    fs.writeFileSync(path.join(dir, 'src/more.ts'), 'const z = 3 as any;\n');
    const regressed = ratchet(dir);
    assert.equal(regressed.fail, true);
    assert.match(regressed.reasons.join(' '), /any_type 1→2/);
    const check = byId(diagnose(dir), 'escape-ratchet');
    assert.equal(check.level, 'error');
    assert.match(check.message, /超出棘轮基线/);

    // 拒绝把变高的数字写成新基线
    const refused = ratchet(dir, { write: true });
    assert.equal(refused.written, false);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir, '.verify-baseline.json'), 'utf-8')).any_type, 1);
});

test('棘轮：存在 .only 时拒绝写基线', () => {
    const dir = makeRepo({ ...CLEAN, 'test/only.test.ts': ONLY_CALL });
    const result = ratchet(dir, { write: true });
    assert.equal(result.fail, true);
    assert.equal(result.written, false);
    assert.match(result.reasons.join(' '), /零容忍/);
    assert.equal(fs.existsSync(path.join(dir, '.verify-baseline.json')), false);
});

test('无 tsconfig.json → type-strict 为 info；有 TS 源码却无 tsconfig → warn', () => {
    const { 'tsconfig.json': _drop, 'src/app.ts': _ts, 'test/app.test.ts': _tsTest, ...noTs } = CLEAN;
    const jsRepo = byId(diagnose(makeRepo({ ...noTs, 'src/app.js': 'export const add = (a, b) => a + b;\n', 'test/app.test.js': 'add(1, 2);\n' })), 'type-strict');
    assert.equal(jsRepo.level, 'info');
    assert.match(jsRepo.message, /跳过/);

    const tsRepo = byId(diagnose(makeRepo({ ...noTs, 'src/app.ts': 'export const x: number = 1;\n' })), 'type-strict');
    assert.equal(tsRepo.level, 'warn');

    const loose = byId(diagnose(makeRepo({ ...CLEAN, 'tsconfig.json': '{ "compilerOptions": { "strict": false } }' })), 'type-strict');
    assert.equal(loose.level, 'warn');
    assert.match(loose.message, /strict/);
});

test('缺 dev/check 脚本、无 CI、无边界约束的仓库：逐项点名且默认不 error', () => {
    const checks = diagnose(makeRepo({
        'package.json': JSON.stringify({ scripts: { test: 'node --test' } }),
        'src/app.js': 'export const x = 1;\n',
        'test/app.test.js': "await new Promise(r => setTimeout(r, 10));\nconst t = Date.now();\nawait fetch('https://example.com');\n",
    }));
    const cmd = byId(checks, 'verify-command');
    assert.equal(cmd.level, 'warn');
    assert.match(cmd.message, /dev\/start/);
    assert.match(cmd.message, /聚合验证入口/);

    assert.equal(byId(checks, 'failure-artifacts').level, 'warn');
    assert.match(byId(checks, 'failure-artifacts').message, /无 CI workflow/);
    assert.equal(byId(checks, 'module-boundary').level, 'warn');
    assert.equal(byId(checks, 'evidence-template').level, 'warn');

    const det = byId(checks, 'determinism');
    assert.equal(det.level, 'warn');
    assert.match(det.message, /真实时间\/随机/);
    assert.match(det.message, /真实网络调用/);
    assert.match(det.message, /未固定 TZ/);

    // 阶段门缺口默认全是 warn，退出码不该红（本仓库自己 dogfood 靠这条）
    assert.deepEqual(checks.filter(c => c.level === 'error'), []);
});

test('确定性：硬等待被点名，mock 框架存在时网络调用不算缺口', () => {
    const hard = byId(diagnose(makeRepo({
        ...CLEAN,
        'test/slow.test.ts': 'await page.waitForTimeout(500);\n',
    })), 'determinism');
    assert.match(hard.message, /硬等待 1 处/);

    const mocked = byId(diagnose(makeRepo({
        ...CLEAN,
        'package.json': JSON.stringify({ workspaces: ['packages/*'], devDependencies: { msw: '^2' }, scripts: { dev: 'x', check: 'y' } }),
        'test/net.test.ts': "await fetch('/api');\n",
    })), 'determinism');
    assert.match(mocked.message, /已引入 mock 框架/);
});

test('CI 有 artifact 但缺 if: always() → warn 点名 always()', () => {
    const checks = diagnose(makeRepo({
        ...CLEAN,
        '.github/workflows/ci.yml': 'jobs:\n  check:\n    steps:\n      - uses: actions/upload-artifact@v4\n        with: { path: .artifacts/ }\n',
    }));
    const artifacts = byId(checks, 'failure-artifacts');
    assert.equal(artifacts.level, 'warn');
    assert.match(artifacts.message, /always\(\)/);
});

test('lint 硬度：warn 档规则与缺 --max-warnings=0 都被点名；无 eslint 配置则跳过', () => {
    const soft = byId(diagnose(makeRepo({
        ...CLEAN,
        'justfile': 'check:\n\teslint .\n',
        'eslint.config.js': 'export default [{ rules: { "no-console": "warn", "eqeqeq": "error" } }];\n',
    })), 'lint-hardness');
    assert.equal(soft.level, 'warn');
    assert.match(soft.message, /error=1 warn=1/);
    assert.match(soft.message, /--max-warnings=0/);

    const skipped = byId(diagnose(makeRepo(CLEAN)), 'lint-hardness');
    assert.equal(skipped.level, 'info');
    assert.match(skipped.message, /无 eslint 配置/);
});

test('模块边界：只报命中的最强一档', () => {
    const both = byId(diagnose(makeRepo({
        ...CLEAN,
        '.dependency-cruiser.json': '{ "forbidden": [] }',
    })), 'module-boundary');
    assert.match(both.message, /workspaces/);

    const cruiser = byId(diagnose(makeRepo({
        ...CLEAN,
        'package.json': JSON.stringify({ scripts: { dev: 'x', check: 'y' } }),
        '.dependency-cruiser.json': '{ "forbidden": [] }',
    })), 'module-boundary');
    assert.match(cruiser.message, /dependency-cruiser/);

    const goRepo = byId(diagnose(makeRepo({
        'go.mod': 'module example.com/app\n',
        'internal/store/store.go': 'package store\n',
        'main_test.go': 'package main\n',
    })), 'module-boundary');
    assert.match(goRepo.message, /internal\//);

    const lintOnly = byId(diagnose(makeRepo({
        'eslint.config.js': 'export default [{ rules: { "no-restricted-imports": ["error", {}] } }];\n',
        'src/a.js': 'export const a = 1;\n',
    })), 'module-boundary');
    assert.match(lintOnly.message, /no-restricted-imports/);
});

test('PR 模板存在但不要求证据 → warn 点名缺项', () => {
    const checks = diagnose(makeRepo({ ...CLEAN, '.github/PULL_REQUEST_TEMPLATE.md': '## 说明\n\n随便写点什么\n' }));
    const tpl = byId(checks, 'evidence-template');
    assert.equal(tpl.level, 'warn');
    assert.match(tpl.message, /复现命令/);
    assert.match(tpl.message, /证据/);
});

test('每条 warn/error 都带 advice，且 advice 里的链接都是官方文档', () => {
    const checks = diagnose(makeRepo({ 'src/a.js': 'export const a = 1;\n' }));
    for (const c of checks) {
        if (c.level === 'warn' || c.level === 'error') assert.ok(c.advice, `${c.id} 缺 advice`);
    }
    const links = checks.flatMap(c => (c.advice ?? '').match(/https?:\/\/[^\s（）)]+/g) ?? []);
    assert.ok(links.length > 0);
    for (const link of links) assert.match(link, /^https:\/\//);
});
