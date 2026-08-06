#!/usr/bin/env node
// agentsmd-lint — AGENTS.md / CLAUDE.md 质量检查器。零依赖，Node ≥ 20。
//
// "Treat your agent memory file like code" 的工具化落地。规则全部来自
// 可验证的社区共识与真实事故（见仓库 incidents/ 与 practices/）：
//   max-lines      文件过长稀释注意力（社区共识上限 ~200 行）
//   placeholder    模板占位符没填完就上岗（TODO/TBD/<项目名>…）
//   vague          "酌情/适当/properly" 类不可执行措辞
//   dead-script    引用了 package.json 里不存在的 npm 脚本（命令必须真实可跑）
//   empty-section  空标题节（写了骨架没填肉）
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// 中文占位符支排除 HTML 标签：标签以字母/斜杠/! 开头（<img …>、</p>、<!-- -->），
// 占位符 <项目名> 不会。含中文 alt 的合法 HTML 嵌入不是占位符。
const PLACEHOLDER_RE = /\b(?:TODO|TBD|FIXME|XXX)\b|待补充|待填写|<(?:your|fill|insert|placeholder)\b[^>\n]*>|<(?![a-zA-Z/!])[^>\n]*[\u4e00-\u9fff][^>\n]*>/;
const VAGUE_RE = /\b(?:appropriately|properly|as needed|if necessary|best practices?)\b|酌情|适当地?|视情况|尽量|尽可能/i;
const NPM_SCRIPT_RE = /\bnpm (?:run\s+([A-Za-z0-9:_-]+)|(test)\b)/g;

/**
 * 对 Markdown 文本执行全部规则。
 * @param {string} text 文件内容
 * @param {{maxLines?: number, pkg?: {scripts?: Record<string,string>}|null}} opts
 *   pkg 为 null/undefined 时跳过 dead-script（没有 package.json 可校验）
 * @returns {{level: 'error'|'warn', rule: string, line: number, message: string}[]}
 */
export function lint(text, { maxLines = 200, pkg = null } = {}) {
    const findings = [];
    const lines = text.split('\n');

    // max-lines：只数非空行，空行不该被惩罚
    const effective = lines.filter(l => l.trim() !== '').length;
    if (effective > maxLines) {
        findings.push({
            level: 'warn', rule: 'max-lines', line: 1,
            message: `${effective} 行非空内容（上限 ${maxLines}）——每行在每次会话都消耗上下文预算，删掉 agent 能自己推断的`,
        });
    }

    let inFence = false;
    let prevHeading = null; // { level, line, hasBody }
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const n = i + 1;

        if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
        const heading = !inFence && line.match(/^(#{1,6})\s+\S/);

        // 行内 code span 是"提及"而非"使用"——规则表里引用 `TODO`/`酌情` 做示例
        // 是合法的。placeholder/vague 在剥离 `...` 后匹配；dead-script 仍扫原文
        // （命令恰恰都写在反引号里）。
        const prose = line.replace(/`[^`]*`/g, '');

        // placeholder：占位符在围栏代码块里同样说明没填完，不豁免围栏
        const ph = prose.match(PLACEHOLDER_RE);
        if (ph) {
            findings.push({
                level: 'error', rule: 'placeholder', line: n,
                message: `占位符未替换: "${ph[0]}"`,
            });
        }

        // vague：跳过代码块（命令不是散文），跳过标题
        if (!inFence && !heading) {
            const v = prose.match(VAGUE_RE);
            if (v) {
                findings.push({
                    level: 'warn', rule: 'vague', line: n,
                    message: `不可执行的措辞: "${v[0]}"——换成具体条件或具体命令`,
                });
            }
        }

        // dead-script：npm 脚本引用必须存在
        if (pkg) {
            for (const m of line.matchAll(NPM_SCRIPT_RE)) {
                const name = m[1] || m[2];
                if (!pkg.scripts || !(name in pkg.scripts)) {
                    findings.push({
                        level: 'error', rule: 'dead-script', line: n,
                        message: `引用了不存在的 npm 脚本 "${name}"（package.json scripts 里没有）`,
                    });
                }
            }
        }

        // empty-section：先记正文再判节边界（次序反了会把"最后一行正文"误判为空节）
        if (heading) {
            // 同级/更高级标题出现时结算上一节；更深的子标题本身就是父节的内容
            if (prevHeading && !prevHeading.hasBody && heading[1].length <= prevHeading.level) {
                findings.push({
                    level: 'warn', rule: 'empty-section', line: prevHeading.line,
                    message: '空标题节——没有内容的骨架请删掉',
                });
            }
            prevHeading = { level: heading[1].length, line: n, hasBody: false };
        } else if (prevHeading && (inFence || line.trim() !== '')) {
            prevHeading.hasBody = true; // 代码块也算正文
        }
    }

    // EOF 结算最后一节
    if (prevHeading && !prevHeading.hasBody) {
        findings.push({
            level: 'warn', rule: 'empty-section', line: prevHeading.line,
            message: '空标题节——没有内容的骨架请删掉',
        });
    }

    return findings;
}

/** 读取文件旁边的 package.json（同目录，找不到返回 null）。 */
export function siblingPackage(filePath) {
    try {
        const p = path.join(path.dirname(path.resolve(filePath)), 'package.json');
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch {
        return null;
    }
}

function main(argv) {
    const args = argv.slice(2);
    const maxIdx = args.indexOf('--max-lines');
    let maxLines = 200;
    if (maxIdx !== -1) {
        maxLines = Number(args[maxIdx + 1]);
        args.splice(maxIdx, 2);
    }
    if (args.length === 0 || Number.isNaN(maxLines)) {
        console.error('用法: agentsmd-lint [--max-lines N] <AGENTS.md> [more.md ...]');
        process.exit(2);
    }

    let errors = 0;
    for (const file of args) {
        const text = fs.readFileSync(file, 'utf-8');
        const findings = lint(text, { maxLines, pkg: siblingPackage(file) });
        for (const f of findings) {
            console.log(`${f.level === 'error' ? '✖' : '⚠'} ${file}:${f.line} [${f.rule}] ${f.message}`);
            if (f.level === 'error') errors++;
        }
        if (findings.length === 0) console.log(`✓ ${file} 无问题`);
    }
    process.exit(errors > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    main(process.argv);
}
