#!/usr/bin/env node
// agents-doctor — 仓库 agent-ready 体检器。零依赖，Node ≥ 20。
//
// 对一个仓库跑 8 项检查，回答"这个仓库对 AI agent 友好吗"：
//   agents-md   根 AGENTS.md 存在且通过 agentsmd-lint
//   claude-md   CLAUDE.md 应是指向 AGENTS.md 的软链，不该漂移
//   rules       条件规则目录（Claude/Cursor/Copilot）有哪几家
//   hooks       四家 hooks 配置存在性
//   skills      三个 skills 目录下有无 SKILL.md
//   adr         决策记录（ADR）存在且被 AGENTS.md 指到——历史动机可查
//   secrets     .env / credentials.json 等敏感文件必须被 .gitignore 覆盖
//   ci-gate     CI workflow 里有没有 agentsmd-lint 门禁
//
// 路径清单与 rosetta/README.md 已核实的跨工具对照一致。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { lint, renderJson, siblingPackage, takeFlag } from '../agentsmd-lint/index.mjs';

/** 列出 dir 下匹配 filter 的文件名（目录不存在返回 []）。 */
function listDir(dir, filter) {
    try {
        return fs.readdirSync(dir).filter(filter);
    } catch {
        return [];
    }
}

/** dir 的直接子目录中含 SKILL.md 的子目录名列表。 */
function skillDirs(dir) {
    return listDir(dir, () => true).filter(name => {
        try {
            return fs.statSync(path.join(dir, name, 'SKILL.md')).isFile();
        } catch {
            return false;
        }
    });
}

/**
 * .gitignore 是否覆盖某个文件名。简单包含判断：逐行去注释后，
 * 精确匹配文件名（允许前导 /）或 `.env*` 式前缀通配。
 */
export function gitignoreCovers(gitignoreText, fileName) {
    for (const raw of gitignoreText.split('\n')) {
        let line = raw.trim();
        if (line === '' || line.startsWith('#')) continue;
        if (line.startsWith('/')) line = line.slice(1);
        if (line === fileName) return true;
        if (line.endsWith('*') && line.length > 1 && fileName.startsWith(line.slice(0, -1))) return true;
    }
    return false;
}

/**
 * 对仓库执行全部检查。
 * @param {string} repoDir 仓库根目录
 * @returns {{id: string, level: 'ok'|'warn'|'error'|'info', message: string, advice?: string}[]}
 */
export function diagnose(repoDir) {
    const root = path.resolve(repoDir);
    const checks = [];
    const at = p => path.join(root, p);

    // 1. agents-md：根 AGENTS.md 存在且干净
    const agentsPath = at('AGENTS.md');
    const hasAgents = fs.existsSync(agentsPath);
    if (!hasAgents) {
        checks.push({
            id: 'agents-md',
            level: 'error',
            message: '根目录没有 AGENTS.md——agent 每次会话都从零开始',
            advice: '照 practices/00-agent-ready-walkthrough.md Step 1 写一份，或跑 tools/agents-init 生成骨架',
        });
    } else {
        const findings = lint(fs.readFileSync(agentsPath, 'utf-8'), { pkg: siblingPackage(agentsPath) });
        const errs = findings.filter(f => f.level === 'error').length;
        const warns = findings.filter(f => f.level === 'warn').length;
        if (errs > 0) {
            checks.push({
                id: 'agents-md',
                level: 'error',
                message: `AGENTS.md 存在，但 agentsmd-lint 报 ${errs} error / ${warns} warn`,
                advice: 'node tools/agentsmd-lint/index.mjs AGENTS.md 看逐条明细',
            });
        } else if (warns > 0) {
            checks.push({
                id: 'agents-md',
                level: 'warn',
                message: `AGENTS.md 存在，agentsmd-lint 报 ${warns} warn`,
                advice: 'node tools/agentsmd-lint/index.mjs AGENTS.md 看逐条明细',
            });
        } else {
            checks.push({ id: 'agents-md', level: 'ok', message: 'AGENTS.md 存在且通过 agentsmd-lint' });
        }
    }

    // 2. claude-md：应是指向 AGENTS.md 的软链
    const claudePath = at('CLAUDE.md');
    let claudeStat = null;
    try {
        claudeStat = fs.lstatSync(claudePath);
    } catch {
        // 不存在
    }
    if (!claudeStat) {
        checks.push({
            id: 'claude-md',
            level: 'warn',
            message: '没有 CLAUDE.md——Claude Code 读不到项目 memory',
            advice: 'ln -s AGENTS.md CLAUDE.md',
        });
    } else if (claudeStat.isSymbolicLink()) {
        const target = fs.readlinkSync(claudePath);
        if (path.resolve(root, target) === agentsPath) {
            checks.push({ id: 'claude-md', level: 'ok', message: 'CLAUDE.md 是指向 AGENTS.md 的软链，单一事实来源' });
        } else {
            checks.push({
                id: 'claude-md',
                level: 'warn',
                message: `CLAUDE.md 是软链但指向 ${target}，不是 AGENTS.md`,
                advice: 'ln -sf AGENTS.md CLAUDE.md',
            });
        }
    } else if (hasAgents && fs.readFileSync(claudePath, 'utf-8') === fs.readFileSync(agentsPath, 'utf-8')) {
        checks.push({
            id: 'claude-md',
            level: 'info',
            message: 'CLAUDE.md 与 AGENTS.md 内容相同但是独立文件，将来会漂移',
            advice: 'rm CLAUDE.md && ln -s AGENTS.md CLAUDE.md',
        });
    } else {
        checks.push({
            id: 'claude-md',
            level: 'warn',
            message: hasAgents
                ? 'CLAUDE.md 与 AGENTS.md 内容不同——两份 memory 已经漂移'
                : 'CLAUDE.md 是独立文件且没有 AGENTS.md 可对照',
            advice: '合并进 AGENTS.md 后 ln -sf AGENTS.md CLAUDE.md',
        });
    }

    // 3. rules：三家条件规则目录
    const ruleSources = [
        ['Claude', at('.claude/rules'), n => n.endsWith('.md')],
        ['Cursor', at('.cursor/rules'), n => n.endsWith('.mdc')],
        ['Copilot', at('.github/instructions'), n => n.endsWith('.instructions.md')],
    ];
    const rulesFound = ruleSources.filter(([, dir, filter]) => listDir(dir, filter).length > 0).map(([name]) => name);
    checks.push({
        id: 'rules',
        level: 'info',
        message: rulesFound.length > 0
            ? `条件规则：${rulesFound.join('、')} 已配置`
            : '没有条件规则（可选项）——Codex 无 glob 机制，需要时用嵌套 AGENTS.md',
    });

    // 4. hooks：四家 hooks 配置
    const hooksFound = [];
    let hooksWarn = null;
    const claudeSettings = at('.claude/settings.json');
    if (fs.existsSync(claudeSettings)) {
        try {
            if (JSON.parse(fs.readFileSync(claudeSettings, 'utf-8')).hooks) hooksFound.push('Claude');
        } catch {
            hooksWarn = '.claude/settings.json 不是合法 JSON';
        }
    }
    if (fs.existsSync(at('.codex/hooks.json'))) hooksFound.push('Codex');
    if (fs.existsSync(at('.cursor/hooks.json'))) hooksFound.push('Cursor');
    if (listDir(at('.github/hooks'), n => n.endsWith('.json')).length > 0) hooksFound.push('Copilot');
    if (hooksWarn) {
        checks.push({ id: 'hooks', level: 'warn', message: hooksWarn, advice: '修复 JSON 后 hooks 才会生效' });
    } else {
        checks.push({
            id: 'hooks',
            level: 'info',
            message: hooksFound.length > 0 ? `hooks：${hooksFound.join('、')} 已配置` : '没有 hooks 配置（可选项）',
        });
    }

    // 5. skills：三个 skills 目录下的 */SKILL.md
    const skillSources = [
        ['Claude', at('.claude/skills')],
        ['通用', at('.agents/skills')],
        ['Copilot', at('.github/skills')],
    ];
    const skillsFound = skillSources
        .map(([name, dir]) => [name, skillDirs(dir).length])
        .filter(([, count]) => count > 0)
        .map(([name, count]) => `${name} ${count} 个`);
    checks.push({
        id: 'skills',
        level: 'info',
        message: skillsFound.length > 0 ? `skills：${skillsFound.join('、')}` : '没有 skills（可选项）',
    });

    // 6. adr：决策记录（ADR）存在且被 AGENTS.md 指到
    // agent 看得懂现状，但查不到「为什么当初这样做」——决策记录是唯一不随代码漂移的动机来源。
    // 没有它是可选项（info）；有却没接进 memory 文件才是缺口（warn）：agent 不知道它存在 = 等于没有。
    const ADR_DIRS = ['docs/adr', 'docs/adrs', 'docs/decisions', 'docs/architecture/decisions', 'adr', 'adrs', 'decisions'];
    const adrDirs = ADR_DIRS.filter(d => listDir(at(d), n => n.endsWith('.md')).length > 0);
    const adrFiles = [
        ...listDir(at(''), n => n.endsWith('.adr.md')),
        ...listDir(at('docs'), n => n.endsWith('.adr.md')).map(n => `docs/${n}`),
    ];
    if (adrDirs.length === 0 && adrFiles.length === 0) {
        checks.push({
            id: 'adr',
            level: 'info',
            message: '没有决策记录（可选项）——agent 看得懂现状，但查不到「为什么当初这样做」',
            advice: '把重大取舍记成 ADR 放进 docs/adr/（https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/what-is-an-adr.html），并从 AGENTS.md 指过去',
        });
    } else {
        const where = [...adrDirs, ...adrFiles].join('、');
        const agentsText = hasAgents ? fs.readFileSync(agentsPath, 'utf-8') : '';
        if (/\badrs?\b|决策记录|architecture decision/i.test(agentsText)) {
            checks.push({ id: 'adr', level: 'ok', message: `决策记录在 ${where}，AGENTS.md 指得到` });
        } else {
            checks.push({
                id: 'adr',
                level: 'warn',
                message: `决策记录在 ${where}，但 AGENTS.md 没提到——agent 不知道历史动机在哪`,
                advice: `在 AGENTS.md 加一行指向 ${adrDirs[0] ?? adrFiles[0]}，否则每次会话 agent 都从零猜「为什么这样做」`,
            });
        }
    }

    // 7. secrets：敏感文件必须被 .gitignore 覆盖
    const SECRET_FILES = ['.env', '.env.local', 'credentials.json', 'cookies.json'];
    const present = SECRET_FILES.filter(f => fs.existsSync(at(f)));
    if (present.length === 0) {
        checks.push({ id: 'secrets', level: 'ok', message: '根目录没有常见敏感文件' });
    } else {
        let gitignore = '';
        try {
            gitignore = fs.readFileSync(at('.gitignore'), 'utf-8');
        } catch {
            // 无 .gitignore = 什么都没覆盖
        }
        const uncovered = present.filter(f => !gitignoreCovers(gitignore, f));
        if (uncovered.length > 0) {
            checks.push({
                id: 'secrets',
                level: 'error',
                message: `敏感文件未被 .gitignore 覆盖：${uncovered.join('、')}——agent 一次 git add -A 就泄露`,
                advice: `把 ${uncovered.join(' ')} 加进 .gitignore`,
            });
        } else {
            checks.push({ id: 'secrets', level: 'ok', message: `敏感文件（${present.join('、')}）已被 .gitignore 覆盖` });
        }
    }

    // 8. ci-gate：workflow 里有没有 agentsmd-lint 门禁
    const workflowsDir = at('.github/workflows');
    const workflows = listDir(workflowsDir, n => /\.ya?ml$/.test(n));
    if (!fs.existsSync(workflowsDir)) {
        checks.push({ id: 'ci-gate', level: 'info', message: '没有 .github/workflows——memory 文件质量没有 CI 兜底' });
    } else {
        const gated = workflows.some(n => fs.readFileSync(path.join(workflowsDir, n), 'utf-8').includes('agentsmd-lint'));
        if (gated) {
            checks.push({ id: 'ci-gate', level: 'ok', message: 'CI 里有 agentsmd-lint 门禁' });
        } else {
            checks.push({
                id: 'ci-gate',
                level: 'info',
                message: '有 CI workflow 但没接 agentsmd-lint 门禁',
                advice: '照 practices/00-agent-ready-walkthrough.md Step 5 加一步 node tools/agentsmd-lint/index.mjs AGENTS.md',
            });
        }
    }

    return checks;
}

const MARK = { ok: '✓', warn: '⚠', error: '✖', info: '·' };

const USAGE = `用法: agents-doctor [repo路径] [--json]

  <repo路径>    默认当前目录
  --json        输出单个 JSON 对象（字段见 tools/agents-doctor/README.md）
  --help        显示本说明

退出码: 0 = 无 error 级检查 · 1 = 有 error 级检查 · 2 = 用法错误`;

function main(argv) {
    const args = argv.slice(2);
    if (takeFlag(args, '--help', '-h')) {
        console.log(USAGE);
        process.exit(0);
    }
    const json = takeFlag(args, '--json');
    const repoDir = args[0] ?? '.';
    if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
        console.error(`用法: agents-doctor [repo路径]（${repoDir} 不是目录）`);
        process.exit(2);
    }
    const checks = diagnose(repoDir);
    if (json) {
        process.exit(renderJson({ tool: 'agents-doctor', target: path.resolve(repoDir), results: checks }));
    }
    const count = { ok: 0, warn: 0, error: 0 };
    for (const c of checks) {
        if (c.level in count) count[c.level]++;
        console.log(`${MARK[c.level]} [${c.id}] ${c.message}${c.advice ? `\n    → ${c.advice}` : ''}`);
    }
    console.log(`\nagent-ready: ok ${count.ok} · warn ${count.warn} · error ${count.error}`);
    process.exit(count.error > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main(process.argv);
}
