#!/usr/bin/env node
// agents-init — 从真实项目探测生成 AGENTS.md 起点。零依赖，Node ≥ 20。
//
// 不生成"放之四海皆准"的模板：命令表只写探测到的真实命令，边界只写
// 探测到的真实生成物目录。生成物必须能过 agentsmd-lint 零命中——
// 生成器自己产出会被 linter 抓的文本是自打脸。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { lint } from '../agentsmd-lint/index.mjs';

/** 读 JSON，文件不存在或不是合法 JSON 返回 null。 */
function readJson(p) {
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
        return null;
    }
}

function isDir(p) {
    try {
        return fs.statSync(p).isDirectory();
    } catch {
        return false;
    }
}

// package.json scripts 里值得进命令表的键 → 表里的用途列。
// 顺序即表里的展示顺序：测试永远第一行。
const NPM_SCRIPTS = [
    ['test', '测试'],
    ['build', '构建'],
    ['lint', 'Lint'],
    ['dev', '开发'],
    ['format', '格式化'],
];

// 存在即列入 never 边界的生成物目录。
const GENERATED_DIRS = ['dist', 'build', 'target', 'node_modules'];

/**
 * 探测仓库：项目名、一句话描述、真实可跑的命令、生成物目录。
 * 多语言共存时全部收录。
 * @param {string} repoDir
 * @returns {{name: string, description: string,
 *   commands: {purpose: string, cmd: string}[],
 *   notes: string[], neverDirs: string[]}}
 */
export function detect(repoDir) {
    const dir = path.resolve(repoDir);
    const commands = [];
    const notes = [];
    let name = path.basename(dir);
    let description = '';

    // Node：scripts 里存在的才生成，test 用 `npm test`，其余 `npm run X`。
    // packageManager 含 pnpm/yarn 时换前缀（命令必须和仓库实际用法一致）。
    const pkg = readJson(path.join(dir, 'package.json'));
    if (pkg) {
        if (typeof pkg.name === 'string' && pkg.name) name = pkg.name;
        if (typeof pkg.description === 'string') description = pkg.description;
        const pmField = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
        const pm = pmField.includes('pnpm') ? 'pnpm' : pmField.includes('yarn') ? 'yarn' : 'npm';
        const scripts = pkg.scripts ?? {};
        for (const [script, purpose] of NPM_SCRIPTS) {
            if (script in scripts) {
                commands.push({
                    purpose,
                    cmd: script === 'test' ? `${pm} test` : `${pm} run ${script}`,
                });
            }
        }
    }

    // Rust
    if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
        commands.push(
            { purpose: '测试', cmd: 'cargo test' },
            { purpose: '构建', cmd: 'cargo build' },
            { purpose: 'Lint', cmd: 'cargo clippy' },
        );
    }

    // Python：只有找到 pytest 痕迹才敢写命令，否则留注释提示而不是瞎编
    const pyprojectPath = path.join(dir, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
        const pyproject = fs.readFileSync(pyprojectPath, 'utf-8');
        if (pyproject.includes('pytest')) {
            commands.push({ purpose: '测试', cmd: 'pytest' });
        } else {
            notes.push('Python：pyproject.toml 里没找到 pytest——确认真实测试命令后补进上表');
        }
    }

    // Go
    if (fs.existsSync(path.join(dir, 'go.mod'))) {
        commands.push({ purpose: '测试', cmd: 'go test ./...' });
    }

    const neverDirs = GENERATED_DIRS.filter(d => isDir(path.join(dir, d)));

    return { name, description, commands, notes, neverDirs };
}

/**
 * 把探测结果渲染成 AGENTS.md 文本。产出保证过 agentsmd-lint 零命中：
 * 没有占位符、没有模糊措辞、命令表只含真实存在的脚本、没有空节。
 * @param {ReturnType<typeof detect>} detection
 * @returns {string}
 */
export function render({ name, description, commands, notes, neverDirs }) {
    const lines = [`# ${name}`, ''];
    lines.push(description || '一句话介绍：补充本项目的定位。', '');

    lines.push('## 常用命令', '');
    if (commands.length > 0) {
        lines.push('| 用途 | 命令 |', '|---|---|');
        for (const { purpose, cmd } of commands) {
            lines.push(`| ${purpose} | \`${cmd}\` |`);
        }
    } else {
        lines.push('未探测到构建/测试命令——补一行真实可跑的命令再上岗。');
    }
    for (const note of notes) {
        lines.push('', `<!-- ${note} -->`);
    }

    lines.push('', '## 边界', '', '### never', '');
    for (const d of neverDirs) {
        lines.push(`- 不手改生成物目录 \`${d}/\``);
    }
    lines.push('- 不读取、不提交 `.env`');

    lines.push('', '### ask-first', '');
    lines.push('- 新增运行时依赖', '- 修改 CI 配置', '- 对任何分支 force push');

    lines.push('', '<!-- 这是起点：agent 犯一次错就补一条边界，定期跑 agentsmd-lint。 -->', '');
    return lines.join('\n');
}

function main(argv) {
    const args = argv.slice(2);
    const force = args.includes('--force');
    const link = args.includes('--link');
    const positional = args.filter(a => !a.startsWith('--'));
    if (positional.length > 1) {
        console.error('用法: agents-init [repo路径] [--force] [--link]');
        process.exit(2);
    }
    const repoDir = path.resolve(positional[0] ?? '.');
    const target = path.join(repoDir, 'AGENTS.md');

    if (fs.existsSync(target) && !force) {
        console.error(`✖ ${target} 已存在——不覆盖手写内容，确认要重新生成请加 --force`);
        process.exit(1);
    }

    const text = render(detect(repoDir));
    fs.writeFileSync(target, text);
    console.log(`✓ 已写入 ${target}`);

    if (link) {
        const claude = path.join(repoDir, 'CLAUDE.md');
        let exists = true;
        try {
            fs.lstatSync(claude); // 不跟随软链：坏链也算已存在
        } catch {
            exists = false;
        }
        if (exists) {
            console.log('⚠ CLAUDE.md 已存在，跳过软链');
        } else {
            fs.symlinkSync('AGENTS.md', claude);
            console.log(`✓ 已软链 ${claude} -> AGENTS.md`);
        }
    }

    // 生成完立刻自检：生成器产出会被 linter 抓的文本是 bug
    const findings = lint(text, { pkg: readJson(path.join(repoDir, 'package.json')) });
    let errors = 0;
    for (const f of findings) {
        console.log(`${f.level === 'error' ? '✖' : '⚠'} ${target}:${f.line} [${f.rule}] ${f.message}`);
        if (f.level === 'error') errors++;
    }
    if (findings.length === 0) console.log('✓ agentsmd-lint 零命中');
    process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main(process.argv);
}
