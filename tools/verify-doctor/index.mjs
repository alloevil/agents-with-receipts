#!/usr/bin/env node
// verify-doctor — 仓库「验得动」体检器：agent 能否自己验证工作成果。零依赖，Node ≥ 20。
//
// 按阶段门跑 9 项检查（阶段 0 → 5，前一阶段没达标，进下一阶段没有意义）：
//   verify-command     阶段 0  一条命令起应用 + 一条命令跑全量验证
//   determinism        阶段 1  测试无硬等待 / 真实时钟 / 真实网络，验证命令固定 TZ
//   failure-artifacts  阶段 2  CI 有机器可解析报告 + if: always() 的证据 artifact
//   module-boundary    阶段 3  模块与依赖边界有机械约束（结构层 > 机械层）
//   type-strict        阶段 3  类型层的逃逸口是否封死（TS strict / mypy·pyright strict）
//   lint-hardness      阶段 3  lint 规则是 error 不是 warn、警告零容忍、生成物 drift 门
//   escape-ratchet     阶段 3  各生态的逃逸口（disable / ignore / any / unwrap / nolint）被棘轮监控
//   flaky-quarantine   阶段 5  .only 零容忍，skip 有 FLAKY 标注、未过期、进清单，retry 不掩盖 flaky
//   evidence-template  阶段 4  PR 模板强制复现命令与证据
//
// 五个技术栈各自实现探测（见 STACK_IDS）：JS/TS · Python · Go · Rust · Java/Kotlin。
// 最高优先的设计规则——**绿灯必须有信息量**：某个检查在当前仓库无可检之物时一律报 info
// 并写明「不适用：<原因>」，绝不报 ok。ok 只表示「检查过了，确实干净」。对一个没有 JS 的
// 仓库报「无 ts-ignore」是绿灯零信息量，与「warn 等于不存在」是同一种失效模式。
//
// 退出码：只有 error 级导致 exit 1。阶段门缺口默认 warn，`--strict` 把 warn 升成 error。
// `--baseline` 写 `.verify-baseline.json` 立棘轮基线；默认模式只校验，不写文件。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
// 四个 CLI 共用同一套 --json 输出（schema 只需学一次），helper 住在 agentsmd-lint
import { renderJson } from '../agentsmd-lint/index.mjs';

/** 棘轮基线文件名。 */
const BASELINE_FILE = '.verify-baseline.json';

/** 支持的技术栈标记：测试识别与逃逸口统计按生态分别实现。 */
export const STACK_IDS = ['js-ts', 'python', 'go', 'rust', 'java-kotlin'];

/** 技术栈显示名，与 tools/verify-doctor/README.md 的覆盖表逐字一致。 */
const STACK_LABELS = {
    'js-ts': 'JS/TS',
    python: 'Python',
    go: 'Go',
    rust: 'Rust',
    'java-kotlin': 'Java/Kotlin',
};

/** 各技术栈的源文件扩展名。 */
const STACK_FILE_RE = {
    'js-ts': /\.[cm]?[jt]sx?$/,
    python: /\.py$/,
    go: /\.go$/,
    rust: /\.rs$/,
    'java-kotlin': /\.(java|kt)$/,
};

/** 五个栈的显示名连成一句，供「不适用」文案用。 */
const ALL_STACK_LABELS = STACK_IDS.map(s => STACK_LABELS[s]).join('、');

/**
 * 测试文件路径判定（tests/spec/__tests__/e2e 目录，或 *.test.* / *_test.go / test_*.py 命名）。
 * Maven/Gradle 的 `src/test/java/**`、`src/test/kotlin/**` 由 `tests?/` 这一分支覆盖。
 */
const TEST_RE = /(^|\/)(tests?|spec|__tests__|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.go$|(^|\/)test_[^/]*\.py$|[^/]*_test\.py$/;

/**
 * 测试文件内容判定：Rust 与 Java/Kotlin 的主流约定是测试内联在源文件里，
 * 只按路径认测试会把这类仓库判成「零测试」——本工具最初就是这么错的。
 */
const STACK_TEST_CONTENT_RE = {
    rust: /#\[(?:\w+::)?test\]|#\[cfg\(test\)\]/,
    'java-kotlin': /@(?:Parameterized)?Test\b/,
};

/** 源文件扩展名判定。 */
const CODE_RE = /\.([cm]?[jt]sx?|go|py|rs|java|kt|rb|swift)$/;

/** 验证命令的落脚处：任务运行器、package.json scripts、CI workflow。 */
const RUNNER_RE = /(^|\/)([Jj]ustfile|[Mm]akefile|Taskfile\.ya?ml|package\.json)$|^\.github\/workflows\//;

/**
 * 各生态的约定验证入口：清单文件 → 该生态里人人都知道的命令。
 * 没有 justfile 不等于「agent 不知道怎么跑」——有 Cargo.toml 就等于有 `cargo test`。
 */
const CONVENTIONAL_ENTRIES = [
    { re: /(^|\/)Cargo\.toml$/, commands: 'cargo test / cargo clippy', doc: 'https://doc.rust-lang.org/cargo/commands/cargo-test.html' },
    { re: /(^|\/)go\.mod$/, commands: 'go test ./...', doc: 'https://pkg.go.dev/cmd/go#hdr-Test_packages' },
    { re: /(^|\/)(pyproject\.toml|tox\.ini|noxfile\.py)$/, commands: 'pytest / tox / nox', doc: 'https://tox.wiki/en/stable/' },
    { re: /(^|\/)pom\.xml$/, commands: 'mvn test', doc: 'https://maven.apache.org/guides/introduction/introduction-to-the-pom.html' },
    { re: /(^|\/)build\.gradle(\.kts)?$/, commands: 'gradle test', doc: 'https://docs.gradle.org/current/userguide/multi_project_builds.html' },
];

/** 依赖清单：判断 mock 框架、betterer 这类工具是否被采用。 */
const MANIFEST_RE = /(^|\/)(package\.json|pyproject\.toml|requirements[^/]*\.txt|Gemfile|go\.mod)$/;

/** 递归兜底时跳过的目录。 */
const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', 'vendor', 'target',
    '.venv', 'venv', '.env', '__pycache__', '.tox', '.nox', '.mypy_cache',
    '.pytest_cache', '.ruff_cache', '.gradle', '.idea', '.next', 'coverage', '.svn',
]);

/**
 * 棘轮受控指标：每一项都是「agent 会用来刷绿的手段」，只允许下降。
 * `res` 按技术栈分别给正则，只有仓库真的有该栈源码时才统计——对没有 JS 的仓库
 * 报「无 ts-ignore」是零信息量的绿灯。
 * 两条注释型指令要求前面有注释起始符（真正的 disable 指令必然是注释），
 * 顺带把散文里提到的 eslint-disable 排除掉；`an[y]` 的字符类同理防自匹配。
 */
const RATCHET_METRICS = [
    { key: 'eslint_disable', scope: 'src', label: 'eslint-disable', res: { 'js-ts': /(?:\/\/|\/\*|<!--|#)\s*eslint-disable/g } },
    { key: 'ts_ignore', scope: 'src', label: 'ts-ignore/expect-error', res: { 'js-ts': /(?:\/\/|\/\*|<!--)\s*@ts-(?:expect-error|ignore)/g } },
    { key: 'any_type', scope: 'src', label: 'any', res: { 'js-ts': /(?::[ \t]*an[y]\b|\bas an[y]\b)/g } },
    { key: 'py_type_ignore', scope: 'src', label: 'type-ignore/noqa', res: { python: /#\s*type:\s*ignore|#\s*noqa/g } },
    { key: 'go_nolint', scope: 'src', label: 'nolint', res: { go: /\/\/\s*nolint/g } },
    { key: 'rust_unwrap', scope: 'src', label: 'unwrap/expect', res: { rust: /\.unwrap\(\)|\.expect\(/g } },
    { key: 'rust_unsafe', scope: 'src', label: 'unsafe', res: { rust: /\bunsafe\s/g } },
    { key: 'rust_allow', scope: 'src', label: 'allow 属性', res: { rust: /#\[allow\(/g } },
    { key: 'java_suppress', scope: 'src', label: 'SuppressWarnings', res: { 'java-kotlin': /@SuppressWarnings/g } },
    {
        key: 'test_skip', scope: 'tests', label: 'skip', res: {
            // xit/xdescribe 要 \b：否则 exit( 这类普通调用会被算成隔离测试
            'js-ts': /\.skip\(|\bxit\(|\bxdescribe\(/g,
            python: /@pytest\.mark\.skip/g,
            go: /t\.Skip\(/g,
            rust: /#\[ignore\b/g,
            'java-kotlin': /@Disabled\b|@Ignore\b/g,
        },
    },
    // 独占执行是 JS/TS 特有形态：pytest / go test / cargo test 都没有这个概念
    { key: 'test_only', scope: 'tests', label: 'only', res: { 'js-ts': /\.only\(|\bfit\(|\bfdescribe\(/g } },
];

/** 各栈的硬等待形态（固定时长 sleep，flaky 头号来源）。 */
const HARD_WAIT_RE = {
    'js-ts': /(?:sleep|waitForTimeout)\(\d{3,}/g,
    python: /time\.sleep\(\d/g,
    go: /time\.Sleep\(/g,
    rust: /thread::sleep/g,
    'java-kotlin': /Thread\.sleep\(/g,
};

/** 各栈的真实时钟与随机源。 */
const NON_DET_RE = {
    'js-ts': /Math\.random|Date\.now|new Date\(\)|uuid4?\(\)/g,
    python: /time\.time\(\)|uuid4?\(\)/g,
    go: /time\.Now\(|math\/rand/g,
    rust: /SystemTime::now|Instant::now|rand::/g,
    'java-kotlin': /new Date\(\)|new Random\(/g,
};

/** 阶段小标题，报告按 stage 分组输出。 */
const STAGE_TITLES = [
    '阶段 0 · 单命令启动与验证',
    '阶段 1 · 验证确定性',
    '阶段 2 · 失败可解析 + 证据 artifact',
    '阶段 3 · 硬约束（结构 > 类型 > 机械）',
    '阶段 4 · 证据式 review',
    '阶段 5 · 自动合入前置',
];

/** 级别严重度，合成一个检查的多条子结论时取最大值。 */
const RANK = { ok: 0, info: 1, warn: 2, error: 3 };

/** 递归列出目录下的文件相对路径（跳过 SKIP_DIRS）。 */
function walk(root, rel, out) {
    let entries;
    try {
        entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(root, rel ? `${rel}/${entry.name}` : entry.name, out);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
            out.push(rel ? `${rel}/${entry.name}` : entry.name);
        }
    }
    return out;
}

/**
 * 仓库文件清单。优先 `git ls-files`（尊重 .gitignore、避开构建产物），
 * 不是 git 仓库或还没有任何提交时递归兜底。
 * @param {string} root 仓库根目录绝对路径
 * @returns {string[]} 相对路径列表
 */
export function listFiles(root) {
    try {
        const out = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        const files = out.split('\n').filter(Boolean);
        if (files.length > 0) return files;
    } catch {
        // 非 git 仓库
    }
    return walk(root, '', []);
}

/**
 * 把 Rust 源文件切成生产区与内联测试区。Rust 的测试惯例是内联在源文件里
 * （`#[cfg(test)] mod tests { … }` 或 `#[test] fn … { … }`），逃逸口只该看生产区、
 * 确定性/flaky 只该看测试区——否则测试里惯用的 `.unwrap()` 会被算成生产逃逸口，
 * 让棘轮被测试噪音主导，甚至可以「加一个生产 unwrap、删一个测试 unwrap」蒙混过关。
 * 花括号配平是启发式的：字符串/注释里的花括号可能让切分略有偏差，对 warn 级检查可接受。
 * @param {string} text 源文件内容
 * @returns {{prod: string, test: string}} 生产区与测试区文本
 */
function splitRustRegions(text) {
    const attr = /#\[cfg\(test\)\]|#\[(?:\w+::)?test\]/g;
    let prod = '';
    let test = '';
    let cursor = 0;
    let m;
    while ((m = attr.exec(text))) {
        if (m.index < cursor) continue;
        prod += text.slice(cursor, m.index);
        const brace = text.indexOf('{', m.index);
        if (brace === -1) { test += text.slice(m.index); cursor = text.length; break; }
        let depth = 0;
        let k = brace;
        for (; k < text.length; k++) {
            const c = text[k];
            if (c === '{') depth++;
            else if (c === '}' && --depth === 0) { k++; break; }
        }
        test += text.slice(m.index, k);
        cursor = k;
        attr.lastIndex = k;
    }
    prod += text.slice(cursor);
    return { prod, test };
}

/**
 * 一次体检共享的上下文：文件清单 + 技术栈识别 + 带缓存的读取与计数。
 * @param {string} root 仓库根目录绝对路径
 */
function createContext(root) {
    const files = listFiles(root);
    const cache = new Map();

    /** 读文件文本，失败或二进制读不出时返回空串。 */
    const read = rel => {
        if (cache.has(rel)) return cache.get(rel);
        let text = '';
        try {
            text = fs.readFileSync(path.join(root, rel), 'utf-8');
        } catch {
            // 读不到就当空文件
        }
        cache.set(rel, text);
        return text;
    };

    const code = files.filter(f => CODE_RE.test(f));
    const stacks = STACK_IDS.filter(s => code.some(f => STACK_FILE_RE[s].test(f)));

    /** 路径规则 + 内容探测双路：Rust / Java 的测试常内联在源文件里。 */
    const isTest = rel => {
        if (TEST_RE.test(rel)) return true;
        const stack = STACK_IDS.find(s => STACK_FILE_RE[s].test(rel));
        const contentRe = stack ? STACK_TEST_CONTENT_RE[stack] : undefined;
        return contentRe ? contentRe.test(read(rel)) : false;
    };
    const tests = code.filter(isTest);
    // 同一个文件既是源又是测试是 Rust 的常态：两个集合都要收它，否则逃逸口统计会漏掉整个仓库
    const srcs = code.filter(f => !TEST_RE.test(f));

    /** 文件清单里是否有路径匹配 re 的文件。 */
    const has = re => files.some(f => re.test(f));

    /** 路径匹配 fileRe 的文件子集。 */
    const pick = fileRe => files.filter(f => fileRe.test(f));

    /** 保证正则带 g 标志，可安全用于 String.match 全量计数。 */
    const globalize = re => (re.flags.includes('g') ? re : new RegExp(re.source, `${re.flags}g`));

    /** 在给定文件集合里统计 re 的命中次数（整文件）。 */
    const count = (list, re) => {
        const g = globalize(re);
        let n = 0;
        for (const rel of list) {
            const hits = read(rel).match(g);
            if (hits) n += hits.length;
        }
        return n;
    };

    /** 文件属于哪个技术栈（按扩展名），认不出返回 undefined。 */
    const stackOf = rel => STACK_IDS.find(s => STACK_FILE_RE[s].test(rel));

    const regionCache = new Map();
    /**
     * 文件在给定 scope（'src' | 'tests'）下真正要扫描的文本。Rust 内联测试必须切开，
     * 其余语言测试与源码分文件，整篇返回（清单已按 src/tests 分好）。
     */
    const regionText = (rel, scope) => {
        if (stackOf(rel) !== 'rust') return read(rel);
        const key = `${rel}|${scope}`;
        if (!regionCache.has(key)) {
            const { prod, test } = splitRustRegions(read(rel));
            regionCache.set(`${rel}|src`, prod);
            regionCache.set(`${rel}|tests`, test);
        }
        return regionCache.get(key);
    };

    const stackCache = new Map();

    /** 某个技术栈在 scope（'src' | 'tests'）里的文件子集。 */
    const stackFiles = (stack, scope) => {
        const key = `${stack}|${scope}`;
        let list = stackCache.get(key);
        if (!list) {
            list = (scope === 'tests' ? tests : srcs).filter(f => STACK_FILE_RE[stack].test(f));
            stackCache.set(key, list);
        }
        return list;
    };

    /** 按技术栈分别用 reMap[stack] 统计命中次数，只算真的存在的栈，并按区域切分文本。 */
    const countByStack = (scope, reMap) => {
        let n = 0;
        for (const stack of stacks) {
            const re = reMap[stack];
            if (!re) continue;
            const g = globalize(re);
            for (const rel of stackFiles(stack, scope)) {
                const hits = regionText(rel, scope).match(g);
                if (hits) n += hits.length;
            }
        }
        return n;
    };

    /** 跨栈按测试区域统计 re，用于与语言无关的网络调用扫描。 */
    const countTests = re => {
        const g = globalize(re);
        let n = 0;
        for (const rel of tests) {
            const hits = regionText(rel, 'tests').match(g);
            if (hits) n += hits.length;
        }
        return n;
    };

    /** 路径匹配 fileRe 的任一文件内容命中 contentRe。 */
    const inAny = (fileRe, contentRe) => pick(fileRe).some(rel => contentRe.test(read(rel)));

    return { root, files, stacks, tests, srcs, read, has, pick, count, countTests, stackFiles, countByStack, inAny };
}

/**
 * 把一个检查内的多条子结论合成单个结果对象：级别取最严重，message/advice 顺序拼接。
 * @param {string} id 检查 id
 * @param {number} stage 阶段 0–5
 * @param {{level: 'ok'|'warn'|'error'|'info', message: string, advice?: string}[]} findings 子结论
 */
function fold(id, stage, findings) {
    let level = 'ok';
    for (const f of findings) if (RANK[f.level] > RANK[level]) level = f.level;
    const advice = findings.map(f => f.advice).filter(Boolean).join('；');
    const result = { id, stage, level, message: findings.map(f => f.message).join('；') };
    if (advice) result.advice = advice;
    return result;
}

/** 仓库识别到的技术栈显示名，一个都没有时返回 null。 */
function stackSummary(ctx) {
    return ctx.stacks.length > 0 ? ctx.stacks.map(s => STACK_LABELS[s]).join('、') : null;
}

/** 阶段 0：单命令起应用 + 单命令跑全量验证。 */
function checkVerifyCommand(ctx) {
    const findings = [];
    const runners = [
        ['just', /(^|\/)[Jj]ustfile$/],
        ['make', /(^|\/)[Mm]akefile$/],
        ['task', /(^|\/)Taskfile\.ya?ml$/],
    ].filter(([, re]) => ctx.has(re)).map(([name]) => name);
    const hasPkg = ctx.has(/(^|\/)package\.json$/);
    // 生态约定入口：报告里必须先说清识别到了什么，再谈缺什么
    const entries = CONVENTIONAL_ENTRIES
        .map(e => {
            const file = ctx.pick(e.re)[0];
            return file ? { name: file.split('/').pop(), commands: e.commands, doc: e.doc } : null;
        })
        .filter(Boolean);

    if (runners.length > 0) {
        findings.push({ level: 'ok', message: `有任务运行器：${runners.join('、')}` });
    } else if (hasPkg || entries.length > 0) {
        const known = [
            ...(hasPkg ? ['package.json scripts'] : []),
            ...entries.map(e => `${e.name}（${e.commands}）`),
        ].join('、');
        if (hasPkg) {
            findings.push({ level: 'info', message: `无 justfile/Makefile/Taskfile，验证入口只能靠：${known}` });
        } else {
            findings.push({
                level: 'warn',
                message: `识别到生态约定入口：${known}，但没有一条命令跑完全部检查，agent 得自己拼`,
                advice: `加 justfile 把 ${entries[0].commands} 收成一条 check（https://just.systems/man/en/ · ${entries[0].doc}）`,
            });
        }
    } else {
        findings.push({
            level: 'warn',
            message: '没有任务运行器、生态清单（Cargo.toml/go.mod/pyproject.toml/pom.xml/build.gradle）或 scripts 入口，agent 得自己猜怎么跑',
            advice: '加 justfile，至少定义 dev / check 两条（https://just.systems/man/en/）',
        });
    }

    if (hasPkg) {
        const pkg = ctx.read('package.json');
        if (/"(dev|start|serve)"\s*:/.test(pkg)) {
            findings.push({ level: 'ok', message: '有启动脚本（dev/start/serve）' });
        } else {
            findings.push({
                level: 'warn',
                message: 'package.json 无 dev/start 脚本',
                advice: '加一条幂等启动命令，内含依赖起停与健康等待（https://docs.npmjs.com/cli/v11/using-npm/scripts）',
            });
        }
        if (/"(check|verify|ci|validate)"\s*:/.test(pkg)) {
            findings.push({ level: 'ok', message: '有聚合验证入口（check/verify/ci/validate）' });
        } else {
            findings.push({
                level: 'warn',
                message: '无聚合验证入口，agent 需自己拼 typecheck + lint + test',
                advice: '加 "check": "npm run typecheck && npm run lint && npm test"，本地与 CI 共用同一条',
            });
        }
    }

    if (ctx.tests.length === 0) {
        findings.push({
            level: 'warn',
            message: '未发现测试文件（路径与内联测试属性双路都没命中），验证回路不存在',
            advice: '先为核心路径加冒烟测试，否则后面几个阶段都无从谈起',
        });
    } else {
        const stackText = stackSummary(ctx);
        findings.push({
            level: 'ok',
            message: `${stackText ? `技术栈 ${stackText} · ` : ''}源文件 ${ctx.srcs.length} 个 · 测试文件 ${ctx.tests.length} 个`,
        });
    }
    return fold('verify-command', 0, findings);
}

/**
 * 阶段 1：验证确定性——硬等待、真实时钟与随机、真实网络、时区。
 * 测试文件不属于受支持的 5 个技术栈时（Ruby / Swift / C++ …）报 info「不适用」：
 * 一条探针都没有还说「测试无硬等待」，是零信息量的绿灯。
 */
function checkDeterminism(ctx) {
    const findings = [];
    if (ctx.tests.length > 0 && ctx.stacks.length === 0) {
        findings.push({
            level: 'info',
            message: `不适用：${ctx.tests.length} 个测试文件都不属于 ${ALL_STACK_LABELS}，没有硬等待/时钟/网络的探针可用`,
        });
    } else if (ctx.tests.length > 0) {
        const hardWait = ctx.countByStack('tests', HARD_WAIT_RE);
        if (hardWait > 0) {
            findings.push({
                level: 'warn',
                message: `测试里硬等待 ${hardWait} 处（固定时长 sleep/waitForTimeout）`,
                advice: '改条件等待 waitFor(cond)，硬等待是 flaky 头号来源（https://playwright.dev/docs/api/class-page#page-wait-for-timeout · https://doc.rust-lang.org/std/thread/fn.sleep.html）',
            });
        } else {
            findings.push({ level: 'ok', message: '测试无硬等待' });
        }

        const nonDet = ctx.countByStack('tests', NON_DET_RE);
        if (nonDet > 0) {
            findings.push({
                level: 'warn',
                message: `测试直接用真实时间/随机 ${nonDet} 处`,
                advice: '注入固定时钟与固定 seed（https://vitest.dev/api/vi.html）',
            });
        } else {
            findings.push({ level: 'ok', message: '测试无真实时间/随机源' });
        }

        const net = ctx.countTests(/fetch\(|axios\.|requests\.(get|post)|http\.get|reqwest::/g);
        const MOCK_RE = /msw|nock|vcr|responses|httpretty|mock-server|undici[^\n]*MockAgent|httpmock|wiremock/;
        const mocked = ctx.inAny(MANIFEST_RE, MOCK_RE) || ctx.tests.some(f => MOCK_RE.test(ctx.read(f)));
        if (net > 0 && !mocked) {
            findings.push({
                level: 'warn',
                message: `测试里真实网络调用 ${net} 处且无 mock 框架`,
                advice: '引入 msw/nock 拦截，并在 CI 断网跑以证明没有漏网（https://mswjs.io/docs/）',
            });
        } else if (net > 0) {
            findings.push({ level: 'ok', message: '有网络调用但已引入 mock 框架（仍建议 CI 断网验证）' });
        } else {
            findings.push({ level: 'ok', message: '测试无直接网络调用' });
        }
    }

    if (ctx.inAny(RUNNER_RE, /\bTZ=/)) {
        findings.push({ level: 'ok', message: '验证命令固定了 TZ' });
    } else {
        findings.push({
            level: 'warn',
            message: '验证命令未固定 TZ',
            advice: '验证命令前置 TZ=UTC，消除时区导致的抖动',
        });
    }
    return fold('determinism', 1, findings);
}

/** 阶段 2：失败输出可解析 + 证据 artifact 无条件上传。 */
function checkFailureArtifacts(ctx) {
    const findings = [];
    const WORKFLOW_RE = /^\.github\/workflows\/.+\.ya?ml$/;
    if (!ctx.has(WORKFLOW_RE)) {
        findings.push({
            level: 'warn',
            message: '无 CI workflow，没有任何机械门禁',
            advice: '先建一个 CI，只跑一条聚合验证命令',
        });
    } else {
        findings.push({ level: 'ok', message: '有 CI workflow' });
        if (ctx.inAny(WORKFLOW_RE, /upload-artifact/)) {
            findings.push({ level: 'ok', message: 'CI 上传 artifact' });
            if (ctx.inAny(WORKFLOW_RE, /if:\s*(\$\{\{\s*)?always\(\)/)) {
                findings.push({ level: 'ok', message: 'artifact 失败时也上传（if: always()）' });
            } else {
                findings.push({
                    level: 'warn',
                    message: 'artifact 未加 if: always()，失败时恰好拿不到证据',
                    advice: '给 upload-artifact 步骤加 if: always()（https://github.com/actions/upload-artifact · https://docs.github.com/en/actions/reference/evaluate-expressions-in-workflows-and-actions）',
                });
            }
        } else {
            findings.push({
                level: 'warn',
                message: 'CI 不产出 artifact，agent 与人都拿不到失败证据',
                advice: '上传 .artifacts/（截图/trace/JSON 报告）并加 if: always()（https://github.com/actions/upload-artifact）',
            });
        }
    }

    if (ctx.inAny(RUNNER_RE, /--reporter[ =][\w,.-]*json|--outputFile|junit|--format[ =]json/i)) {
        findings.push({ level: 'ok', message: '测试有机器可解析输出（json/junit）' });
    } else {
        findings.push({
            level: 'warn',
            message: '测试只有人类可读日志',
            advice: '加 json/junit reporter，失败断言才能直接喂给 agent 修',
        });
    }
    return fold('failure-artifacts', 2, findings);
}

/** 阶段 3 结构层：模块与依赖边界，报告命中的最强一档。 */
function checkModuleBoundary(ctx) {
    const hasGo = ctx.stacks.includes('go');
    // 从强到弱：物理包边界 > 编译器隔离 > 依赖检查器 > lint 规则
    const tiers = [
        {
            hit: () => ctx.has(/(^|\/)package\.json$/) && /"workspaces"/.test(ctx.read('package.json')),
            message: 'monorepo workspaces（物理包边界，最强一档）',
        },
        {
            hit: () => ctx.inAny(/(^|\/)Cargo\.toml$/, /\[workspace\][\s\S]*?members\s*=/),
            message: 'Cargo workspace 多 crate 物理边界（https://doc.rust-lang.org/cargo/reference/workspaces.html）',
        },
        {
            hit: () => ctx.inAny(/(^|\/)pom\.xml$/, /<modules>/),
            message: 'Maven 多模块物理边界（https://maven.apache.org/guides/introduction/introduction-to-the-pom.html）',
        },
        {
            hit: () => ctx.inAny(/(^|\/)settings\.gradle(\.kts)?$/, /include[( ]/),
            message: 'Gradle 多项目物理边界（https://docs.gradle.org/current/userguide/multi_project_builds.html）',
        },
        {
            hit: () => hasGo && ctx.has(/(^|\/)internal\//),
            message: 'Go internal/ 编译器级隔离（https://pkg.go.dev/cmd/go#hdr-Internal_Directories）',
        },
        {
            hit: () => ctx.countByStack('src', { rust: /\bpub\(crate\)/g }) >= 3,
            message: 'Rust pub(crate) 可见性收敛（编译器级，https://doc.rust-lang.org/reference/visibility-and-privacy.html）',
        },
        {
            hit: () => ctx.has(/(^|\/)\.dependency-cruiser\.(json|jsonc|js|cjs|mjs)$/),
            message: 'dependency-cruiser 边界规则（https://github.com/sverweij/dependency-cruiser）',
        },
        {
            hit: () => ctx.inAny(/(^|\/)(\.importlinter|setup\.cfg|pyproject\.toml)$/, /importlinter|import-linter/),
            message: 'import-linter contracts（https://import-linter.readthedocs.io/en/stable/）',
        },
        {
            hit: () => ctx.inAny(/(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/, /archunit/i),
            message: 'ArchUnit 架构测试（https://www.archunit.org/）',
        },
        {
            hit: () => ctx.inAny(/(^|\/)eslint\.config\.[cm]?[jt]s$|(^|\/)\.eslintrc/, /no-restricted-imports/),
            message: 'eslint no-restricted-imports（弱于物理边界，可接受）',
        },
    ];
    const strongest = tiers.find(t => t.hit());
    if (strongest) {
        return fold('module-boundary', 3, [{ level: 'ok', message: `模块边界最强一档：${strongest.message}` }]);
    }
    return fold('module-boundary', 3, [{
        level: 'warn',
        message: '无任何模块/依赖边界约束，跨层引用不会失败',
        advice: '先加 dependency-cruiser 禁跨 feature、禁环（https://github.com/sverweij/dependency-cruiser），能拆包就直接拆 workspaces（https://docs.npmjs.com/cli/v11/using-npm/workspaces）；Rust 拆 workspace crate、Java 拆 Maven module 同理',
    }]);
}

/** TS 类型层子结论：tsconfig 的逃逸口是否封死。 */
function tsTypeFindings(ctx) {
    if (!ctx.has(/(^|\/)tsconfig\.json$/)) {
        const hasTs = ctx.srcs.some(f => /\.[cm]?tsx?$/.test(f));
        return [hasTs
            ? {
                level: 'warn',
                message: '有 TS 源码但没有 tsconfig.json，类型层完全没设门',
                advice: '加 tsconfig.json 并开 strict（https://www.typescriptlang.org/tsconfig/#strict）',
            }
            : { level: 'info', message: '无 tsconfig.json，跳过类型层检查' },
        ];
    }
    const tsconfigPath = ctx.files.find(f => /(^|\/)tsconfig\.json$/.test(f));
    const ts = ctx.read(tsconfigPath);
    const findings = [];
    if (/"strict"\s*:\s*true/.test(ts)) {
        findings.push({ level: 'ok', message: 'tsconfig strict: true' });
    } else {
        findings.push({
            level: 'warn',
            message: 'tsconfig 未开 strict',
            advice: '先开 strict（https://www.typescriptlang.org/tsconfig/#strict）',
        });
    }
    if (/"noUncheckedIndexedAccess"\s*:\s*true/.test(ts)) {
        findings.push({ level: 'ok', message: 'noUncheckedIndexedAccess: true' });
    } else {
        findings.push({
            level: 'warn',
            message: '未开 noUncheckedIndexedAccess',
            advice: '数组/索引访问的 undefined 漏洞靠它挡（https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess）',
        });
    }
    return findings;
}

/** Python 类型层子结论：mypy / pyright 是否存在且开到 strict。 */
function pyTypeFindings(ctx) {
    const PY_TYPE_FILE_RE = /(^|\/)(mypy\.ini|\.mypy\.ini|setup\.cfg|pyproject\.toml|pyrightconfig\.json|tox\.ini)$/;
    const CHECKER_RE = /\bmypy\b|pyright/i;
    const hasChecker = ctx.inAny(PY_TYPE_FILE_RE, CHECKER_RE) || ctx.inAny(RUNNER_RE, CHECKER_RE);
    if (!hasChecker) {
        return [{
            level: 'warn',
            message: '有 Python 源码但没有 mypy/pyright 配置，类型层完全没设门',
            advice: '加 mypy 并开 --strict（https://mypy.readthedocs.io/en/stable/command_line.html），或用 pyright 的 typeCheckingMode: strict（https://microsoft.github.io/pyright/#/configuration）',
        }];
    }
    const strictOn = ctx.inAny(PY_TYPE_FILE_RE, /strict\s*=\s*[Tt]rue|"?typeCheckingMode"?\s*[:=]\s*"strict"/)
        || ctx.inAny(RUNNER_RE, /mypy[^\n]*--strict/);
    return [strictOn
        ? { level: 'ok', message: 'Python 类型检查已开 strict（mypy/pyright）' }
        : {
            level: 'warn',
            message: '有 mypy/pyright 但未开 strict，未标注的函数体不会被检查',
            advice: 'mypy 开 strict = true（https://mypy.readthedocs.io/en/stable/command_line.html），pyright 开 typeCheckingMode: strict（https://microsoft.github.io/pyright/#/configuration）',
        },
    ];
}

/**
 * 阶段 3 类型层：类型逃逸口是否封死。
 * 只有 JS/TS 与 Python 有独立的「类型严格度」配置层；Go/Rust/Java 的类型由编译器强制，
 * 该栈没有可查的类型配置时报 info「不适用」，绝不用 ok 冒充。
 */
function checkTypeStrict(ctx) {
    const findings = [];
    if (ctx.stacks.includes('js-ts') || ctx.has(/(^|\/)tsconfig\.json$/)) findings.push(...tsTypeFindings(ctx));
    if (ctx.stacks.includes('python')) findings.push(...pyTypeFindings(ctx));
    if (findings.length === 0) {
        const stackText = stackSummary(ctx);
        return fold('type-strict', 3, [{
            level: 'info',
            message: stackText
                ? `不适用：${stackText} 的类型由编译器强制，没有独立的类型严格度配置可查（clippy / -Werror 归 lint-hardness）`
                : `不适用：未识别到 ${ALL_STACK_LABELS} 任一技术栈的源码`,
        }]);
    }
    return fold('type-strict', 3, findings);
}

/** eslint 子结论：规则档位与 --max-warnings=0。 */
function eslintFindings(ctx) {
    const ESLINT_FILE_RE = /(^|\/)eslint\.config\.[cm]?[jt]s$|(^|\/)\.eslintrc(\.[a-z]+)?$/;
    const configs = ctx.pick(ESLINT_FILE_RE).slice(0, 5);
    if (configs.length === 0) return [{ level: 'info', message: '无 eslint 配置，跳过 lint 硬度检查' }];
    const findings = [];
    const warns = ctx.count(configs, /"warn"|'warn'/g);
    const errors = ctx.count(configs, /"error"|'error'/g);
    if (warns > 0) {
        findings.push({
            level: 'warn',
            message: `lint 规则档位 error=${errors} warn=${warns}——warn 等于不存在：人忽略、agent 当噪音过滤`,
            advice: '转 error；改不动的进基线 + 棘轮，绝不降级（https://eslint.org/docs/latest/use/suppressions）',
        });
    } else {
        findings.push({ level: 'ok', message: `lint 规则全是 error 档（error=${errors}）` });
    }
    if (ctx.inAny(RUNNER_RE, /--max-warnings[ =]0/)) {
        findings.push({ level: 'ok', message: 'lint 用 --max-warnings=0 机械保证' });
    } else {
        findings.push({
            level: 'warn',
            message: 'lint 未加 --max-warnings=0，warn 会静默积累',
            advice: '验证命令里写 eslint . --max-warnings=0（https://eslint.org/docs/latest/use/command-line-interface#--max-warnings）',
        });
    }
    return findings;
}

/**
 * 阶段 3 机械层：各栈 lint 是否以「警告即失败」收口，加生成物 drift 门。
 * 判定的是硬度而不是「有没有配」：clippy 只 -W 不 -D，等于 lint 只是建议。
 */
function checkLintHardness(ctx) {
    const findings = [];
    // clippy / -Werror 这类硬度开关落在 CI、任务运行器或构建清单里
    const HARDNESS_HOSTS_RE = /^\.github\/workflows\/|(^|\/)([Jj]ustfile|[Mm]akefile|Taskfile\.ya?ml|package\.json|Cargo\.toml|clippy\.toml|pom\.xml|build\.gradle(\.kts)?)$/;

    if (ctx.stacks.includes('js-ts') || ctx.has(/(^|\/)eslint\.config\.[cm]?[jt]s$|(^|\/)\.eslintrc/)) {
        findings.push(...eslintFindings(ctx));
    }

    if (ctx.stacks.includes('python')) {
        const RUFF_FILE_RE = /(^|\/)(ruff\.toml|\.ruff\.toml|pyproject\.toml|setup\.cfg|tox\.ini|\.flake8)$/;
        const LINTER_RE = /\bruff\b|\bflake8\b|\bpylint\b/i;
        if (ctx.inAny(RUFF_FILE_RE, LINTER_RE) || ctx.inAny(RUNNER_RE, LINTER_RE)) {
            findings.push({ level: 'ok', message: '有 Python lint 配置（ruff/flake8/pylint）' });
        } else {
            findings.push({
                level: 'warn',
                message: '有 Python 源码但没有 ruff/flake8/pylint 配置，lint 层完全没设门',
                advice: '加 ruff 并把规则集写进 pyproject.toml，CI 里跑 ruff check（https://docs.astral.sh/ruff/configuration/）',
            });
        }
    }

    if (ctx.stacks.includes('rust')) {
        const denied = ctx.inAny(HARDNESS_HOSTS_RE, /-D[ =]?\s*warnings|--deny[ =]warnings|deny\(warnings\)/)
            || ctx.countByStack('src', { rust: /#!\[deny\(/g }) > 0;
        if (denied) {
            findings.push({ level: 'ok', message: 'clippy 以 -D warnings / deny(warnings) 收口' });
        } else {
            findings.push({
                level: 'warn',
                message: 'clippy 未以 -D warnings 收口，警告只是建议——warn 等于不存在',
                advice: 'CI 里跑 cargo clippy --all-targets -- -D warnings（https://doc.rust-lang.org/clippy/usage.html · https://doc.rust-lang.org/rustc/lints/levels.html）',
            });
        }
    }

    if (ctx.stacks.includes('go')) {
        if (ctx.has(/(^|\/)\.golangci\.(ya?ml|toml|json)$/) || ctx.inAny(RUNNER_RE, /golangci-lint/)) {
            findings.push({ level: 'ok', message: '有 golangci-lint 配置' });
        } else {
            findings.push({
                level: 'warn',
                message: '有 Go 源码但没有 golangci-lint，只有 go vet 的最小集',
                advice: '加 .golangci.yml 并在 CI 里跑 golangci-lint run（https://golangci-lint.run/）',
            });
        }
    }

    if (ctx.stacks.includes('java-kotlin')) {
        if (ctx.inAny(HARDNESS_HOSTS_RE, /-Werror/)) {
            findings.push({ level: 'ok', message: 'javac/kotlinc 以 -Werror 收口' });
        } else {
            findings.push({
                level: 'warn',
                message: '有 Java/Kotlin 源码但编译未加 -Werror，警告会静默积累',
                advice: 'compilerArgs 里加 -Werror（https://docs.oracle.com/en/java/javase/21/docs/specs/man/javac.html）',
            });
        }
    }

    if (findings.length === 0) {
        findings.push({
            level: 'info',
            message: `不适用：未识别到 ${ALL_STACK_LABELS} 任一技术栈的源码，没有可查的 lint 体系`,
        });
    }

    const hasCodegen = ctx.inAny(RUNNER_RE, /codegen|generate|openapi|prisma|protoc|graphql/i);
    if (!hasCodegen) {
        findings.push({ level: 'info', message: '未发现 codegen 入口，跳过生成物 drift 检查' });
    } else if (ctx.inAny(/^\.github\/workflows\/|(^|\/)([Jj]ustfile|[Mm]akefile)$/, /git diff --exit-code/)) {
        findings.push({ level: 'ok', message: '有生成物 drift 检查（git diff --exit-code）' });
    } else {
        findings.push({
            level: 'warn',
            message: '有 codegen 但无 drift 检查，生成物可能没提交',
            advice: 'CI 里跑 codegen 后接 git diff --exit-code（schema/migration/i18n 同理）',
        });
    }
    return fold('lint-hardness', 3, findings);
}

/**
 * 阶段 3 逃逸口：各生态「刷绿手段」的数量必须被棘轮监控。
 * 只统计仓库里实际存在的语言——一个已识别语言都没有时报 info「不适用」，绝不报 ok。
 * 判定顺序：已用 betterer → ok；否则比对 .verify-baseline.json；两者都无且计数 > 0 → warn。
 */
function checkEscapeRatchet(ctx) {
    const escapes = activeMetrics(ctx).filter(m => m.scope === 'src');
    if (escapes.length === 0) {
        return fold('escape-ratchet', 3, [{
            level: 'info',
            message: `不适用：未识别到 ${ALL_STACK_LABELS} 任一技术栈的源码，没有已知形态的逃逸口可查`,
        }]);
    }
    const counts = countMetrics(ctx);
    const total = escapes.reduce((n, m) => n + counts[m.key], 0);
    const tally = escapes.map(m => `${m.label}=${counts[m.key]}`).join(' ');
    const scanned = stackSummary(ctx);

    // betterer 只管 JS/TS：它管不到 unwrap / nolint，别让它替别的栈开绿灯
    const hasBetterer = (ctx.has(/(^|\/)package\.json$/) && /betterer/.test(ctx.read('package.json')))
        || ctx.has(/(^|\/)\.betterer\.results$/);
    const outsideBetterer = escapes.filter(m => !m.res['js-ts']);
    if (hasBetterer && outsideBetterer.every(m => counts[m.key] === 0)) {
        return fold('escape-ratchet', 3, [{
            level: 'ok',
            message: `逃逸口（${tally}）已用成熟工具 betterer 管理棘轮（https://phenomnomnominal.github.io/betterer/）`,
        }]);
    }

    const baseline = readBaseline(ctx.root);
    // 旧基线只覆盖部分技术栈时，缺的指标视为无基线：不崩、也不拿「未超基线」掩盖它
    const tracked = escapes.filter(m => baseline && typeof baseline[m.key] === 'number');
    if (tracked.length > 0) {
        const over = tracked
            .filter(m => counts[m.key] > baseline[m.key])
            .map(m => `${m.label} ${baseline[m.key]}→${counts[m.key]}`);
        if (over.length > 0) {
            return fold('escape-ratchet', 3, [{
                level: 'error',
                message: `逃逸口超出棘轮基线：${over.join('、')}`,
                advice: `修根因，不要加 disable 注释；确实要放宽先降基线再改 ${BASELINE_FILE}`,
            }]);
        }
        const missing = escapes.filter(m => !tracked.includes(m) && counts[m.key] > 0);
        if (missing.length > 0) {
            return fold('escape-ratchet', 3, [{
                level: 'warn',
                message: `逃逸口（${tally}）未超过 ${BASELINE_FILE} 基线，但 ${missing.map(m => `${m.label}=${counts[m.key]}`).join(' ')} 还没进基线`,
                advice: `重跑 verify-doctor --baseline，把新技术栈的指标补进 ${BASELINE_FILE}`,
            }]);
        }
        return fold('escape-ratchet', 3, [{ level: 'ok', message: `逃逸口（${tally}）未超过 ${BASELINE_FILE} 基线` }]);
    }

    if (total === 0) {
        return fold('escape-ratchet', 3, [{ level: 'ok', message: `已扫 ${scanned} 源码，无逃逸口（${tally}）` }]);
    }
    return fold('escape-ratchet', 3, [{
        level: 'warn',
        message: `${scanned} 逃逸口 ${total} 处（${tally}）且无棘轮基线`,
        advice: `跑 verify-doctor --baseline 立基线，CI 里只检查不增；或直接上 betterer（https://phenomnomnominal.github.io/betterer/）${ctx.stacks.includes('rust') ? '；unwrap/expect 换成 ? 与显式错误类型（https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html）' : ''}`,
    }]);
}

/** 阶段 5 flaky 治理：.only 零容忍，skip 要有 FLAKY 标注且未过期，retry 不掩盖问题。 */
function checkFlakyQuarantine(ctx) {
    const findings = [];
    if (ctx.tests.length === 0) {
        return fold('flaky-quarantine', 5, [{
            level: 'info',
            message: '不适用：未发现测试文件（路径与内联测试属性双路都没命中），flaky 治理无从谈起',
        }]);
    }
    const counts = countMetrics(ctx);
    const skips = counts.test_skip ?? 0;

    // 独占执行只有 JS/TS 有，别对 cargo test / pytest 仓库假装检查过
    if (ctx.stacks.includes('js-ts')) {
        if ((counts.test_only ?? 0) > 0) {
            findings.push({
                level: 'error',
                message: `${counts.test_only} 处 .only——会静默跳过同文件其余测试，绿灯无信息量`,
                advice: '零容忍：删掉 .only（https://nodejs.org/api/test.html）',
            });
        } else {
            findings.push({ level: 'ok', message: '无 .only' });
        }
    } else {
        findings.push({ level: 'info', message: '.only 不适用：无 JS/TS 测试文件（独占执行是 JS/TS 特有形态）' });
    }

    if (skips > 0) {
        const tags = ctx.count(ctx.tests, /FLAKY:\s*#\d+\s+@\S+\s+due\s+\d{4}-\d{2}-\d{2}/g);
        const today = new Date().toISOString().slice(0, 10);
        const expired = [];
        for (const rel of ctx.tests) {
            for (const m of ctx.read(rel).matchAll(/FLAKY:\s*#(\d+)\s+@\S+\s+due\s+(\d{4}-\d{2}-\d{2})/g)) {
                if (m[2] < today) expired.push(`#${m[1]} due ${m[2]}`);
            }
        }
        if (tags < skips) {
            findings.push({
                level: 'warn',
                message: `${skips} 处 skip（含 pytest.mark.skip / t.Skip / #[ignore] / @Disabled）只有 ${tags} 处有机械可校验的标注`,
                advice: '统一标记 FLAKY: #issue @owner due YYYY-MM-DD，CI 校验格式与到期，数量进棘轮（https://docs.pytest.org/en/stable/how-to/skipping.html · https://pkg.go.dev/testing#T.Skip）',
            });
        } else {
            findings.push({ level: 'ok', message: `${skips} 处 skip 全部有 FLAKY 标注` });
        }
        if (expired.length > 0) {
            findings.push({
                level: 'warn',
                message: `隔离标注已过期：${expired.join('、')}`,
                advice: '过期未修则删测试，并评估收回该路径的自动合入权限',
            });
        }
        const baseline = readBaseline(ctx.root);
        if (baseline && typeof baseline.test_skip === 'number' && skips > baseline.test_skip) {
            findings.push({
                level: 'error',
                message: `隔离测试数超出基线 ${baseline.test_skip}→${skips}，隔离清单只允许下降`,
                advice: '新增隔离条目需显式批准，批准后再更新基线',
            });
        }
        if (ctx.has(/(^|\/)(\.agent-flaky\.json|\.verify-flaky\.json|FLAKY\.md)$/)) {
            findings.push({ level: 'ok', message: '有 flaky 隔离清单' });
        } else {
            findings.push({
                level: 'warn',
                message: '有隔离测试但没有 flaky 清单，不知道验证可信度',
                advice: '先跑 20 次同 commit 统计不稳定项，把结果落进 FLAKY.md 并给每条定责任人与到期日',
            });
        }
    } else if (ctx.stacks.length === 0) {
        // 一条 skip 探针都没有，就不能拿「无 skip 测试」当绿灯
        findings.push({ level: 'info', message: `skip 不适用：测试文件都不属于 ${ALL_STACK_LABELS}，没有跳测标记的探针可用` });
    } else {
        findings.push({ level: 'ok', message: '无 skip 测试' });
    }

    // 只认 retry 的配置形态与 flaky 注解，不认散文里的 flaky 二字
    const RETRY_RE = /retries?\s*:\s*[1-9]|--retries?[ =][1-9]|repeat-each|@flaky\b|\.flaky\(/g;
    const retry = ctx.count(ctx.tests, RETRY_RE) + ctx.count(ctx.pick(RUNNER_RE), RETRY_RE);
    if (retry > 0) {
        findings.push({
            level: 'warn',
            message: `存在 retry / flaky 标记 ${retry} 处——retry 掩盖 flaky 而非修复`,
            advice: 'retry 只允许临时用，且必须同时进隔离清单并记 issue',
        });
    } else {
        findings.push({ level: 'ok', message: '无 retry 配置' });
    }
    return fold('flaky-quarantine', 5, findings);
}

/** 阶段 4 证据式 review：PR 模板是否强制复现命令与证据。 */
function checkEvidenceTemplate(ctx) {
    const TPL_RE = /PULL_REQUEST_TEMPLATE|pull_request_template/;
    const templates = ctx.pick(TPL_RE);
    if (templates.length === 0) {
        return fold('evidence-template', 4, [{
            level: 'warn',
            message: '无 PR 模板，证据靠自觉',
            advice: '加模板强制三项：复现命令 / 证据 artifact / 影响面与回滚方式（https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository）',
        }]);
    }
    const text = templates.map(rel => ctx.read(rel)).join('\n');
    const missing = [];
    if (!/复现|repro/i.test(text)) missing.push('复现命令');
    if (!/证据|evidence|artifact|截图|screenshot|trace/i.test(text)) missing.push('证据');
    if (missing.length > 0) {
        return fold('evidence-template', 4, [{
            level: 'warn',
            message: `有 PR 模板但没要求：${missing.join('、')}`,
            advice: '模板里留出「复现命令」「证据」「影响面」三个必填小节',
        }]);
    }
    return fold('evidence-template', 4, [{ level: 'ok', message: 'PR 模板要求复现命令与证据' }]);
}

/** 读棘轮基线，缺失或损坏返回 null。 */
function readBaseline(root) {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(root, BASELINE_FILE), 'utf-8'));
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/** 当前仓库用得上的棘轮指标：该指标至少覆盖一个仓库里真的存在的技术栈。 */
function activeMetrics(ctx) {
    return RATCHET_METRICS.filter(m => ctx.stacks.some(s => m.res[s]));
}

/** 统计当前仓库用得上的棘轮指标的值。 */
function countMetrics(ctx) {
    const counts = {};
    for (const m of activeMetrics(ctx)) counts[m.key] = ctx.countByStack(m.scope, m.res);
    return counts;
}

/**
 * 棘轮：统计逃逸口与隔离测试数量，对比基线；write 时写入新基线。
 * 只处理仓库里实际存在的技术栈的指标（Rust 仓库不会被写入一堆 0 的 JS 指标）。
 * 任一指标高于旧基线或存在 .only 时 fail=true，此时拒绝写入。
 * @param {string} repoDir 仓库根目录
 * @param {{write?: boolean}} [options] write=true 写 .verify-baseline.json
 * @returns {{rows: {key: string, current: number, baseline: number, status: string}[], fail: boolean, reasons: string[], written: boolean, path: string}}
 */
export function ratchet(repoDir, options = {}) {
    const root = path.resolve(repoDir);
    const ctx = createContext(root);
    const metrics = activeMetrics(ctx);
    const counts = countMetrics(ctx);
    const baseline = readBaseline(root);
    const rows = [];
    const reasons = [];
    for (const m of metrics) {
        const current = counts[m.key];
        const base = baseline && typeof baseline[m.key] === 'number' ? baseline[m.key] : -1;
        let status = '=';
        if (base < 0) status = '(无基线)';
        else if (current > base) {
            status = `↑ 超出 ${current - base}`;
            reasons.push(`${m.key} ${base}→${current}`);
        } else if (current < base) status = '↓ 可收紧基线';
        rows.push({ key: m.key, current, baseline: base, status });
    }
    if ((counts.test_only ?? 0) > 0) reasons.push(`.only ${counts.test_only} 处（零容忍）`);

    const target = path.join(root, BASELINE_FILE);
    const fail = reasons.length > 0;
    let written = false;
    if (options.write && !fail) {
        const payload = { _note: 'verify-doctor 棘轮基线：逃逸口与隔离测试只允许下降。CI 跑 verify-doctor 校验。', _updated: new Date().toISOString().slice(0, 10) };
        for (const m of metrics) payload[m.key] = counts[m.key];
        fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
        written = true;
    }
    return { rows, fail, reasons, written, path: target };
}

/**
 * 对仓库执行全部检查。
 * @param {string} repoDir 仓库根目录
 * @returns {{id: string, stage: number, level: 'ok'|'warn'|'error'|'info', message: string, advice?: string}[]}
 */
export function diagnose(repoDir) {
    const ctx = createContext(path.resolve(repoDir));
    return [
        checkVerifyCommand(ctx),
        checkDeterminism(ctx),
        checkFailureArtifacts(ctx),
        checkModuleBoundary(ctx),
        checkTypeStrict(ctx),
        checkLintHardness(ctx),
        checkEscapeRatchet(ctx),
        checkEvidenceTemplate(ctx),
        checkFlakyQuarantine(ctx),
    ];
}

const MARK = { ok: '✓', warn: '⚠', error: '✖', info: '·' };

const USAGE = `用法: verify-doctor [repo路径] [--strict] [--baseline] [--json]

  <repo路径>    默认当前目录
  --strict      把阶段门缺口（warn）升成 error，退出码随之变红
  --baseline    写 ${BASELINE_FILE} 立棘轮基线（有指标高于旧基线或存在 .only 时拒绝写入）
  --json        输出单个 JSON 对象（字段见 tools/verify-doctor/README.md）
  --help        显示本说明

支持的技术栈: ${ALL_STACK_LABELS}（检查项无可检之物时报 info「不适用」，不报 ok）

退出码: 0 = 无 error 级检查 · 1 = 有 error 级检查（或拒绝写入基线）· 2 = 用法错误`;

function main(argv) {
    const args = argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        console.log(USAGE);
        process.exit(0);
    }
    const json = args.includes('--json');
    const strict = args.includes('--strict');
    const baselineMode = args.includes('--baseline');
    const repoDir = args.find(a => !a.startsWith('-')) ?? '.';
    if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
        console.error(`用法: verify-doctor [repo路径]（${repoDir} 不是目录）`);
        process.exit(2);
    }

    if (baselineMode) {
        const { rows, fail, reasons, written, path: target } = ratchet(repoDir, { write: true });
        // --json + --baseline：输出基线写入结果，而不是体检报告
        if (json) {
            const results = rows.map(r => {
                const entry = {
                    id: r.key,
                    level: r.status.startsWith('↑') ? 'error' : 'info',
                    message: `当前 ${r.current} · 基线 ${r.baseline < 0 ? '无' : r.baseline} · ${r.status}`,
                    stage: 3,
                    current: r.current,
                };
                if (r.baseline >= 0) entry.baseline = r.baseline;
                return entry;
            });
            results.push(written
                ? { id: 'baseline-write', level: 'ok', message: `基线已写入 ${target}`, stage: 3, file: target }
                : {
                    id: 'baseline-write', level: 'error',
                    message: `拒绝写入基线：${reasons.join('、')}`,
                    advice: '先把超出基线的指标降下来，再重新立基线',
                    stage: 3, file: target,
                });
            process.exit(renderJson({ tool: 'verify-doctor', target: path.resolve(repoDir), results }));
        }
        // 中日文字符渲染宽度是 2，表头的填充按渲染宽度算，别按字符数
        console.log(`${'指标'.padEnd(16)}${'当前'.padStart(4)}${'基线'.padStart(6)}`);
        for (const r of rows) {
            const base = r.baseline < 0 ? '-' : String(r.baseline);
            console.log(`${r.key.padEnd(18)}${String(r.current).padStart(6)}${base.padStart(8)}  ${r.status}`);
        }
        if (fail) {
            console.error(`\n拒绝写入基线：${reasons.join('、')}。先降下来。`);
            process.exit(1);
        }
        console.log(`\n基线已写入 ${target}`);
        process.exit(0);
    }

    const checks = diagnose(repoDir);
    // --strict 在两种模式下同样把 warn 升成 error：退出码必须一致
    if (json) {
        const results = checks.map(c => {
            const entry = { id: c.id, level: strict && c.level === 'warn' ? 'error' : c.level, message: c.message };
            if (c.advice) entry.advice = c.advice;
            entry.stage = c.stage;
            return entry;
        });
        process.exit(renderJson({ tool: 'verify-doctor', target: path.resolve(repoDir), results }));
    }
    const count = { ok: 0, warn: 0, error: 0 };
    console.log(`verify-doctor  ${path.resolve(repoDir)}`);
    for (let stage = 0; stage < STAGE_TITLES.length; stage++) {
        const group = checks.filter(c => c.stage === stage);
        if (group.length === 0) continue;
        console.log(`\n── ${STAGE_TITLES[stage]}`);
        for (const c of group) {
            const level = strict && c.level === 'warn' ? 'error' : c.level;
            if (level in count) count[level]++;
            console.log(`${MARK[level]} [${c.id}] ${c.message}${c.advice ? `\n    → ${c.advice}` : ''}`);
        }
    }
    console.log(`\nverify-ready: ok ${count.ok} · warn ${count.warn} · error ${count.error}`);
    process.exit(count.error > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main(process.argv);
}
