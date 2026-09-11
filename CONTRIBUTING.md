# 贡献指南

## 收录标准

**rosetta/**：每个单元格的文字必须链接到具体的官方文档页（厂商文档/官方博客），不接受第三方教程、聚合站、论坛。修正过期信息的 PR 请附官方链接。

**practices/**：每条断言必须有出处（官方文档/官方博客优先），标注验证日期。

**templates/**：改动必须能通过 `agentsmd-lint` 的反向检验（模板本身应触发 placeholder 规则，说明占位符齐全）。

**tools/**：零依赖优先；必须带测试；Node ≥ 20。

## 内容纪律

- 中文为主，术语保留英文原文（AGENTS.md、hooks、sandbox…）
- 半衰期意识：发现过期内容，**删除或修正**，不要堆"历史版本"
- 宁缺毋滥：拿不准的不收

## 站点渲染

`practices/*.md` 同时是三种东西：GitHub 上的正文、`llms-full.txt` 的来源、以及 GitHub Pages 上的静态页。静态页由 Jekyll 用 Liquid **先渲染一次**再转 Markdown，因此正文里出现 Liquid 语法会被吃掉：

- `{{ ... }}` 会被当成 Liquid 变量求值，语法不合法时**静默丢空**。GitHub Actions 表达式 `${{ !cancelled() }}` 在线上就只剩一个 `$`。
- 要保留这种文本，用 HTML 注释包住 `{% raw %}` / `{% endraw %}`：GitHub 上不可见，Jekyll 上生效。范例见 `practices/09-verifiable-repo.md`。

本机验证（可选，需要本机装了 jekyll）：

```bash
ruby -e '' && gem install jekyll --no-document --user-install   # 只装一次
jekyll build --config _config.yml --destination /tmp/site --baseurl ""   # --baseurl "" 让站内绝对链接在本机也点得动
python3 -m http.server -d /tmp/site 8878
```

GitHub Pages 默认启用 `jekyll-optional-front-matter`、`jekyll-readme-index` 等插件，本机要复现完整行为时把它们写进一份临时 config 一起 `--config` 进去（不要写进仓库的 `_config.yml`：Pages 一旦看到 `plugins:` 就只加载列出来的那几个）。构建输出里出现 `Liquid Warning` 就是有内容被吃掉了。

## 提交流程

1. Fork & PR，一个主题一个 PR
2. 涉及事实修正的，PR 描述里给出官方文档链接
3. 跑 `npm test` 确保工具测试全绿
