import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { diagnose, ratchet, STACK_IDS } from '../index.mjs';

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
        assert.ok(Number.isInteger(r.stage) && r.stage >= 0 && r.stage <= 5, `${r.id} stage=${r.stage}`);
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

test('--json：stdout 只有一个 JSON 对象，9 个检查带 stage 原样进 results', () => {
    const dir = makeRepo(CLEAN);
    const payload = parseOnlyJson(runCli([dir, '--json']));
    assert.strictEqual(payload.tool, 'verify-doctor');
    assert.strictEqual(payload.target, path.resolve(dir));
    assert.deepEqual(payload.results.map(r => r.id).sort(), [...IDS].sort());
    // 报告顺序即阶段顺序，agent 不用自己排
    const stages = payload.results.map(r => r.stage);
    assert.deepStrictEqual(stages, [...stages].sort((a, b) => a - b));
});

test('--json 与人类模式退出码一致，--strict 在两种模式下同样把 warn 升成 error', () => {
    const clean = makeRepo(CLEAN);                                  // 零 error
    const gappy = makeRepo({ 'src/a.js': 'export const a = 1;\n' }); // 多处阶段门缺口（warn）
    const withOnly = makeRepo({ ...CLEAN, 'test/only.test.ts': ONLY_CALL }); // error
    for (const [args, code] of [[[clean], 0], [[gappy], 0], [[gappy, '--strict'], 1], [[withOnly], 1]]) {
        assert.strictEqual(runCli(args).status, code, `人类模式 ${args.join(' ')}`);
        assert.strictEqual(runCli([...args, '--json']).status, code, `JSON 模式 ${args.join(' ')}`);
    }
    // --strict 下 warn 必须真的变成 error，而不是只改退出码
    const strict = parseOnlyJson(runCli([gappy, '--strict', '--json']));
    assert.strictEqual(strict.summary.warn, 0);
    assert.ok(strict.summary.error > 0);
});

test('--baseline --json：输出基线写入结果而不是体检报告', () => {
    const dir = makeRepo(CLEAN);
    const res = runCli([dir, '--baseline', '--json']);
    assert.strictEqual(res.status, 0);
    const payload = parseOnlyJson(res);
    assert.deepStrictEqual(
        payload.results.map(r => r.id),
        ['eslint_disable', 'ts_ignore', 'any_type', 'test_skip', 'test_only', 'baseline-write'],
    );
    const write = payload.results.find(r => r.id === 'baseline-write');
    assert.strictEqual(write.level, 'ok');
    assert.ok(fs.existsSync(path.join(dir, '.verify-baseline.json')), '基线文件要真的写出来');

    // 拒绝写入时两种模式同为 exit 1，JSON 里点名原因
    const files = { ...CLEAN, '.verify-baseline.json': '{"test_only": 0}\n', 'test/only.test.ts': ONLY_CALL };
    assert.strictEqual(runCli([makeRepo(files), '--baseline']).status, 1);
    const refused = runCli([makeRepo(files), '--baseline', '--json']);
    assert.strictEqual(refused.status, 1);
    const refusal = parseOnlyJson(refused).results.find(r => r.id === 'baseline-write');
    assert.strictEqual(refusal.level, 'error');
    assert.match(refusal.message, /test_only 0→1/);
});

test('--help 退出码 0 且列出全部 flag', () => {
    const res = runCli(['--help']);
    assert.strictEqual(res.status, 0);
    for (const flag of ['--strict', '--baseline', '--json', '--help']) {
        assert.ok(res.stdout.includes(flag), `--help 应列出 ${flag}`);
    }
    assert.match(res.stdout, /退出码/);
});

// ── 多技术栈：JS/TS 之外的四个生态 ─────────────────────────────────────────
// 下面的夹具敢直接写 `#[test]` / `unwrap()` / `//nolint` 字面量，是因为逃逸口与
// 跳测指标按技术栈分别统计：Rust 的正则只扫 .rs、Go 的只扫 .go，本文件是 .mjs，
// 不会自己撞上自己的规则。JS/TS 形态（skip/only）仍必须插值拼出。

/** Rust 主流约定：测试内联在源文件里，unwrap 是这个生态的逃逸口。 */
const RUST_REPO = {
    'Cargo.toml': '[package]\nname = "demo"\nversion = "0.1.0"\n',
    'src/main.rs': [
        'fn main() { println!("{}", load().unwrap()); }',
        'fn load() -> Result<u8, ()> { Ok(1) }',
        '',
        '#[cfg(test)]',
        'mod tests {',
        '    #[test]',
        '    fn loads() { assert_eq!(super::load().unwrap(), 1); }',
        '}',
        '',
    ].join('\n'),
};

test('STACK_IDS 就是文档承诺的 5 个技术栈标记', () => {
    assert.deepStrictEqual(STACK_IDS, ['js-ts', 'python', 'go', 'rust', 'java-kotlin']);
});

test('Rust：内联 #[test] 的源文件同时算源与测试，unwrap/expect 进逃逸口', () => {
    const checks = diagnose(makeRepo(RUST_REPO));
    const cmd = byId(checks, 'verify-command');
    assert.match(cmd.message, /技术栈 Rust/);
    assert.match(cmd.message, /源文件 1 个 · 测试文件 1 个/);
    assert.doesNotMatch(cmd.message, /未发现测试文件/);
    assert.doesNotMatch(cmd.message, /没有任务运行器/);
    assert.match(cmd.message, /Cargo\.toml（cargo test \/ cargo clippy）/);

    // 对一个没有 JS 的仓库报「无 ts-ignore / any」是零信息量的绿灯
    const esc = byId(checks, 'escape-ratchet');
    assert.equal(esc.level, 'warn');
    assert.match(esc.message, /unwrap\/expect=2/);
    assert.doesNotMatch(esc.message, /eslint-disable/);

    // 「无测试文件」这个前提是错的，后续检查不该再借它跳过
    assert.doesNotMatch(byId(checks, 'flaky-quarantine').message, /未发现测试文件/);
});

test('无任何已识别技术栈：escape-ratchet 报 info「不适用」而不是绿灯', () => {
    const checks = diagnose(makeRepo({ 'README.md': '# 文档仓库\n', 'docs/guide.md': '只有文档\n' }));
    const esc = byId(checks, 'escape-ratchet');
    assert.equal(esc.level, 'info');
    assert.notEqual(esc.level, 'ok');
    assert.match(esc.message, /不适用/);
    // 类型层与 lint 层同理：无可检之物一律 info
    assert.equal(byId(checks, 'type-strict').level, 'info');
    assert.match(byId(checks, 'type-strict').message, /不适用/);
    assert.match(byId(checks, 'lint-hardness').message, /不适用/);
});

test('verify-command 认各生态约定入口：Cargo.toml / go.mod / pyproject.toml / pom.xml / build.gradle', () => {
    const cases = [
        [{ 'Cargo.toml': '[package]\n', 'src/lib.rs': 'pub fn a() {}\n' }, /Cargo\.toml（cargo test \/ cargo clippy）/],
        [{ 'go.mod': 'module demo\n', 'main.go': 'package main\n' }, /go\.mod（go test \.\/\.\.\.）/],
        [{ 'pyproject.toml': '[project]\nname = "demo"\n', 'app.py': 'x = 1\n' }, /pyproject\.toml（pytest \/ tox \/ nox）/],
        [{ 'pom.xml': '<project/>\n', 'src/main/java/A.java': 'class A {}\n' }, /pom\.xml（mvn test）/],
        [{ 'build.gradle.kts': 'plugins {}\n', 'src/main/kotlin/A.kt': 'class A\n' }, /build\.gradle\.kts（gradle test）/],
    ];
    for (const [files, re] of cases) {
        const cmd = byId(diagnose(makeRepo(files)), 'verify-command');
        assert.match(cmd.message, re, `未认出 ${Object.keys(files)[0]}`);
        assert.doesNotMatch(cmd.message, /没有任务运行器/, `${Object.keys(files)[0]} 仍被说成没有入口`);
    }
});

test('Java/Kotlin：src/test/java 路径与内联 @Test 都算测试文件', () => {
    const checks = diagnose(makeRepo({
        'pom.xml': '<project><modules><module>core</module></modules></project>\n',
        'src/main/java/Svc.java': 'class Svc { @SuppressWarnings("unchecked") void run() {} }\n',
        'src/test/java/SvcTest.java': 'class SvcTest { @Test void runs() {} }\n',
        'core/src/main/java/Inline.java': 'class Inline { @Test void inline() {} }\n',
    }));
    const cmd = byId(checks, 'verify-command');
    assert.match(cmd.message, /技术栈 Java\/Kotlin/);
    assert.match(cmd.message, /源文件 2 个 · 测试文件 2 个/);
    assert.match(byId(checks, 'escape-ratchet').message, /SuppressWarnings=1/);
    assert.match(byId(checks, 'module-boundary').message, /Maven 多模块/);
});

test('Go：nolint 进逃逸口，缺 golangci-lint 点名 lint 层', () => {
    const checks = diagnose(makeRepo({
        'go.mod': 'module demo\n',
        'store.go': 'package store\n\nvar cache = map[string]int{} //nolint:gochecknoglobals\n',
        'store_test.go': 'package store\n',
    }));
    const esc = byId(checks, 'escape-ratchet');
    assert.match(esc.message, /nolint=1/);
    assert.doesNotMatch(esc.message, /any=/);
    assert.match(byId(checks, 'lint-hardness').message, /golangci-lint/);
});

test('Python：缺 mypy/pyright 点名类型层，type: ignore 进逃逸口，strict 与 ruff 齐全则 ok', () => {
    const bare = diagnose(makeRepo({
        'pyproject.toml': '[project]\nname = "demo"\n',
        'app.py': 'x = 1  # type: ignore\n',
        'tests/test_app.py': 'def test_x():\n    assert True\n',
    }));
    assert.equal(byId(bare, 'type-strict').level, 'warn');
    assert.match(byId(bare, 'type-strict').message, /mypy\/pyright/);
    assert.match(byId(bare, 'escape-ratchet').message, /type-ignore\/noqa=1/);
    assert.match(byId(bare, 'lint-hardness').message, /ruff/);

    const strict = diagnose(makeRepo({
        'pyproject.toml': '[tool.mypy]\nstrict = true\n\n[tool.ruff]\nselect = ["ALL"]\n',
        'app.py': 'x: int = 1\n',
        'tests/test_app.py': 'def test_x():\n    assert True\n',
    }));
    assert.equal(byId(strict, 'type-strict').level, 'ok');
    assert.match(byId(strict, 'lint-hardness').message, /Python lint 配置/);
});

test('Rust：clippy 只 -W 不 -D 时点名 lint 硬度，-D warnings 则 ok', () => {
    const step = flag => `jobs:\n  t:\n    steps:\n      - run: cargo clippy -- ${flag}\n`;
    const soft = byId(diagnose(makeRepo({ ...RUST_REPO, '.github/workflows/ci.yml': step('-W clippy::all') })), 'lint-hardness');
    assert.equal(soft.level, 'warn');
    assert.match(soft.message, /-D warnings/);

    const hard = byId(diagnose(makeRepo({ ...RUST_REPO, '.github/workflows/ci.yml': step('-D warnings') })), 'lint-hardness');
    assert.match(hard.message, /clippy 以 -D warnings/);
    assert.notEqual(hard.level, 'warn');
});

test('flaky-quarantine：Rust #[ignore] 算隔离测试，.only 对非 JS/TS 仓库标注不适用', () => {
    const flaky = byId(diagnose(makeRepo({
        'Cargo.toml': '[package]\n',
        'src/lib.rs': '#[cfg(test)]\nmod t {\n    #[test]\n    #[ignore]\n    fn slow() {}\n}\n',
    })), 'flaky-quarantine');
    assert.equal(flaky.level, 'warn');
    assert.match(flaky.message, /\.only 不适用/);
    assert.match(flaky.message, /1 处 skip/);
});

test('确定性：各栈的硬等待与真实时钟都被点名，不再只认 JS 形态', () => {
    const rust = byId(diagnose(makeRepo({
        'Cargo.toml': '[package]\n',
        'src/lib.rs': '#[cfg(test)]\nmod t {\n    #[test]\n    fn slow() { std::thread::sleep(d); let _ = std::time::Instant::now(); }\n}\n',
    })), 'determinism');
    assert.match(rust.message, /硬等待 1 处/);
    assert.match(rust.message, /真实时间\/随机 1 处/);

    const go = byId(diagnose(makeRepo({
        'go.mod': 'module demo\n',
        'a_test.go': 'package a\n\nfunc TestX(t *testing.T) { time.Sleep(d); _ = time.Now() }\n',
    })), 'determinism');
    assert.match(go.message, /硬等待 1 处/);
    assert.match(go.message, /真实时间\/随机 1 处/);
});

test('棘轮：Rust 仓库只写该生态的指标，旧基线缺新指标时不崩也不假绿', () => {
    const dir = makeRepo(RUST_REPO);
    const set = ratchet(dir, { write: true });
    assert.equal(set.written, true);
    assert.deepEqual(set.rows.map(r => r.key), ['rust_unwrap', 'rust_unsafe', 'rust_allow', 'test_skip']);
    const baseline = JSON.parse(fs.readFileSync(path.join(dir, '.verify-baseline.json'), 'utf-8'));
    assert.equal(baseline.rust_unwrap, 2);
    assert.equal('eslint_disable' in baseline, false, 'Rust 仓库不该被写入一堆 0 的 JS 指标');
    assert.equal(byId(diagnose(dir), 'escape-ratchet').level, 'ok');

    // 旧基线只覆盖 JS 指标：既不报错，也不能用「未超基线」给 Rust 逃逸口开绿灯
    const stale = byId(diagnose(makeRepo({ ...RUST_REPO, '.verify-baseline.json': '{"any_type": 0}\n' })), 'escape-ratchet');
    assert.equal(stale.level, 'warn');
    assert.match(stale.message, /无棘轮基线/);

    // 混合栈仓库：JS 指标进了基线、Rust 指标没进 → 点名缺口而不是报 ok
    const mixed = byId(diagnose(makeRepo({
        ...CLEAN,
        ...RUST_REPO,
        '.verify-baseline.json': '{"eslint_disable": 0, "ts_ignore": 0, "any_type": 0}\n',
    })), 'escape-ratchet');
    assert.equal(mixed.level, 'warn');
    assert.match(mixed.message, /还没进基线/);
});

test('不受支持的技术栈（Ruby）：没有探针的检查一律 info，不得出现零信息量的 ok', () => {
    // 语言无关的部分全部做对，好让「假绿灯」无处藏身：唯一能变红的只剩探针缺失
    const checks = diagnose(makeRepo({
        'Makefile': 'check:\n\tTZ=UTC ruby -Itests tests/app_test.rb --format json\n',
        '.github/workflows/ci.yml': CI_WITH_ARTIFACT,
        '.github/PULL_REQUEST_TEMPLATE.md': '## 复现命令\n\n## 证据\n',
        'lib/app.rb': "require 'net/http'\ndef run\n  sleep 5\n  Time.now\nend\n",
        'tests/app_test.rb': "require 'test/unit'\nclass T < Test::Unit::TestCase\n  def test_x\n    sleep 5\n    assert_equal 1, 1\n  end\nend\n",
    }));

    // 测试里明明写着 sleep 5 与 Time.now，报「测试无硬等待」就是零信息量的绿灯
    const det = byId(checks, 'determinism');
    assert.equal(det.level, 'info');
    assert.match(det.message, /不适用/);
    assert.doesNotMatch(det.message, /测试无硬等待/);
    assert.doesNotMatch(det.message, /测试无真实时间/);

    const flaky = byId(checks, 'flaky-quarantine');
    assert.notEqual(flaky.level, 'ok');
    assert.match(flaky.message, /skip 不适用/);
    assert.doesNotMatch(flaky.message, /无 skip 测试/);

    for (const id of ['type-strict', 'lint-hardness', 'escape-ratchet']) {
        const c = byId(checks, id);
        assert.equal(c.level, 'info', `${id} 无探针却报 ${c.level}`);
        assert.match(c.message, /不适用/);
    }

    // 剩下还能报 ok 的，必须是与语言无关、确实核实过的事实
    const LANG_AGNOSTIC = new Set(['verify-command', 'failure-artifacts', 'module-boundary', 'evidence-template']);
    for (const c of checks) {
        if (c.level === 'ok') assert.ok(LANG_AGNOSTIC.has(c.id), `${c.id} 在无探针的仓库里报了 ok：${c.message}`);
    }
});
