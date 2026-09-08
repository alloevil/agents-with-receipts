# agents-with-receipts

有据可查的 agentic coding 实践手册 + 四个配套 CLI 工具（lint / doctor / init / verify）。两条轴：agent 读得懂这个仓库、agent 验得动自己的工作成果。内容原则：每条断言必须带官方出处，过期即删。

## 常用命令

| 用途 | 命令 |
|---|---|
| 测试 | `npm test` |
| 单工具测试 | `node --test tools/agentsmd-lint/test/lint.test.mjs` |
| 手册自检 | `npm run lint:self`（README + rosetta + practices 全部过 agentsmd-lint） |
| 仓库体检 | `node tools/agents-doctor/index.mjs .` |
| 验证回路体检 | `node tools/verify-doctor/index.mjs .` |
| 本地预览站点 | `python3 -m http.server 8877`（index.html 直接 fetch 仓库 Markdown 渲染，零构建） |

## 边界

### never

- 不读取、不提交 `.env`
- 不改 `rosetta/README.md` 的单元格事实，除非同时附上官方文档链接（每格文字本身就是链接）
- 不新增无出处的实践断言（practices/ 每条要有「依据」行）

### ask-first

- 新增运行时依赖（现状零依赖是卖点）
- 修改 CI 配置
- 对任何分支 force push

## 发布

改了 `assets/readme/*.svg` 要用 `sips -s format png x.svg --out /tmp/x.png` 渲染后肉眼检查再提交；站点无需构建，push 即部署（GitHub Pages，~2 分钟生效）。

<!-- 这是起点：agent 犯一次错就补一条边界，定期跑 agentsmd-lint。 -->
