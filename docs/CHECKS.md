# 本地检查与文章迁移检查

这些命令用于无需人工打开网页的检查。它们不执行 build、不暂存或提交 Git、不改写文章，也不移动图片。未新增依赖或目录。

## 日常使用

```powershell
pnpm check:local
```

依次运行文章检查、离线回归测试和 Astro 静态检查，不要求开发服务已启动。Astro 检查可能更新自身生成的类型和缓存。

也可以单独运行：

| 命令 | 用途 |
| --- | --- |
| `pnpm check:content` | 检查全部文章，包括草稿，不联网 |
| `pnpm check:content --json` | 输出结构化结果，方便后续迁移工具使用 |
| `pnpm check:content --strict` | 将整理建议也视为失败，适合有意清理旧格式时使用 |
| `pnpm test` | 内容、订阅、评论、字体、搜索链接、正文图片策略和海报换行的离线测试，不要求开发服务 |
| `pnpm test:frontend` | 检查本地服务实际输出，需要开发服务已启动 |
| `pnpm test:production-search` | 只读启动已有 dist，验证真实 Pagefind 全文搜索、正式链接及正文命中导航；不自动构建 |
| `pnpm check:performance` | 对已有 dist 测量首页、STA、夏令营的桌面冷／热缓存加载并与基线比较；不自动构建 |
| `pnpm check:links` | 检查已有 dist 中正文链接的目标、章节锚点和附件，站内错误会阻止 CI |
| `pnpm check:migration --source=... --target=... --report=.git/article-import.json` | 生成单篇迁移前的路径、图片身份、内容与评论标识计划；不复制或改写原稿 |
| `pnpm check:migration --verify=.git/article-import.json` | 对照迁移前计划核验目标文章，保护其他文章和资源；用法见 MIGRATION_GUIDE.md |
| `pnpm check:links --base=http://localhost:4321` | 对当前开发服务检查全部文章及旧入口，无需构建 |
| `node --use-env-proxy scripts/check-links.mjs --external-only --report=.git/external-links.json` | 对源文章中的外链、外部图片及资源卡片生成只读报告，不因外部网络不确定而阻止提交 |
| `pnpm test:frontend http://localhost:4322` | 检查指定地址的本地服务 |
| `node scripts/run-browser-checks.mjs http://localhost:4321` | 统一执行评论、阅读、归档、目录、分享、搜索、图片、打印及下述故障恢复检查 |
| `pnpm test:cross-browser http://localhost:4321` | Chromium、Firefox、WebKit 的归档搜索、正文定位、目录、分享键盘操作、主题降级和后退恢复 |
| `node scripts/check-image-integrity.mjs http://localhost:4321` | 全量核对文章与旧入口的源图哈希、srcset、打印图片、实际浏览器解码及 RSS／Atom 图片身份 |
| `node scripts/check-image-integrity.mjs --built=dist` | 检查已有构建产物的本地图片，无需浏览器或联网；CI 在 Astro 构建后自动运行 |

上述检查不执行网站构建。GitHub CI 已接入离线检查、统一浏览器回归及构建产物图片验证；真实评论授权和邮件通知仍由真实服务验收。

## 浏览器测试与证据

先安装测试所需的浏览器：`pnpm exec playwright-core install chromium firefox webkit`。本机 Chromium 测试默认使用 Edge；使用下载的 Chromium 时设置 `PLAYWRIGHT_CHANNEL=chromium`。Linux CI 使用 `--with-deps` 安装对应系统依赖。浏览器未安装或启动失败直接报错，不会记为通过。实现依据：[Playwright 浏览器说明](https://playwright.dev/docs/browsers)。

统一入口还运行现有的 `test-comments-site.mjs`、`test-comments-theme.mjs` 和 `test-frontend.mjs`，覆盖文章评论入口、快速主题切换、逐帧配色、全部公开文章与旧入口及 RSS／Atom 输出。20 分钟评论巡检继续按需运行，不放入每次提交。

评论整站测试先执行一次初始重载，再以当前文档为基准检查 GTM／Clarity 实际执行一次，并用 `performance.timeOrigin` 确认后续 Swup 导航没有整页重载。不能累加整个浏览器上下文的网络请求次数来判定重复初始化，避免开发服务启动重载或预取造成误报；初始重载和导航后的断言均保存截图。

补充的行为检查：

- `test-reading-experience.mjs --only=toc`：真实滚动到 STA 的不同深层分支，检查当前分支展开、旧分支收起、高亮、进度推进，以及全部展开后再恢复自动跟随。
- `test-reading-experience.mjs --only=archive-combinations`：对照文章元数据检查分类下的真实标签；先选标签再选不兼容分类时，分类选项、原标签及无结果状态保留；刷新和清除筛选结果正确。
- `test-comments-theme.mjs`：保留评论逐帧防闪检查；在 STA、夏令营、数理方程长文中部暂停真实圆形转场，对比切换前、中、后的像素，检查内容未消失。该项使用 Chromium 合成器，不可作为跨浏览器动画结论。
- `test-article-tools.mjs --only=fonts`：通过 Chromium 的实际字形字体信息核对正文英文、数字、半角标点与中文、全角标点的分配，不只检查 CSS 字体名称或下载成功。
- `test-article-tools.mjs --only=clipboard`：独立浏览器上下文不替换剪贴板 API，实际点击 RSS、Atom、代码及文章分享复制按钮，再读取真实剪贴板；原故障测试继续验证权限拒绝后的降级处理。
- `test-cross-browser.mjs`：三个引擎执行同一套核心流程；1440、960、720px 是视口检查，不能当作真实浏览器缩放测试。显式移除 View Transition API 验证降级路径，完整圆形动画仍由 Chromium 专项检查。WebKit 测试不等同于真实 Safari／iOS 设备验收。

上述新增流程由 `browser-test-utils.mjs` 收集未处理异常及控制台错误，每步截图和结果写入已有 `.git/prove-it-*` 文件。CI 无论成功失败均上传为 `browser-test-evidence` 附件，保留 7 天；不提交截图。完成审核后删除本轮无用截图和临时实验文件，仅保留本节维护说明。

测试替身只隔离无关服务或制造指定故障，不替换被验证的页面逻辑、字体、剪贴板或转场。通用隔离器使用本地已安装的同一套 Material Symbols 图标数据响应图标 API，避免外部图标服务超时干扰行为检查；这不代表远端图标 API 可用。模拟 giscus 的检查只证明博客侧集成行为，不证明真实登录、评论发布或邮件通知可用；远端配置可单独运行 `pnpm check:comments --remote`。Meting 歌单、CORS、音频和封面仍需按项目约定另行实际请求。

新增断言需进行一次破坏验证：临时禁用待保护的行为，确认测试因对应断言失败，恢复源文件后再通过。不能把浏览器启动或服务连接失败当作成功发现缺陷。开发浏览器套件不代替生产产物检查，生成的 Pagefind、图片和发布后字体仍分别由构建 job 和发布验证负责。

2026-10-27 验证：`pnpm check:local` 的 52 项离线测试通过，Astro 检查 129 个文件无错误或警告；统一浏览器入口前 8 组通过，跨浏览器组在隔离外部图标请求后单独重跑，三个引擎的 18 个步骤全部通过。目录展开、分类标签、字体、真实复制、转场正文可见性、主题降级均完成“破坏后失败、恢复后通过”验证；仅重命名目录内部辅助函数时行为测试仍通过。未保留任何实验性的业务源码改动。

## 运行环境与故障回归

2026-10-26：为修复已知依赖漏洞，升级至 Astro 7.4.2；Node 最低要求为 22.23.4，`.node-version` 固定已验证的 24.20.0，供 CI 和 Cloudflare Pages 使用。保留原有 unified Markdown 插件、HTML 压缩行为及 Tailwind 3；样式通过 PostCSS 和 `src/styles/tailwind.css` 加载，未修改 Astro 源码。字体、图标和滚动条等外观依赖保留原版本。`package.json` 中的安全 overrides 随上游修复复查，移除时重新运行依赖审计和字体处理测试。

以下检查已接入统一浏览器入口：

- `node scripts/test-failure-recovery.mjs http://localhost:4321`：模拟存储被禁用或写满、剪贴板权限拒绝、音频全部失效，检查设置保持、复制、代码折叠和有限重试。
- `pnpm test:navigation:memory http://localhost:4321`：连续切页 32 次，检查旧文档、节点、监听器和定时器不持续增长，音乐实例和播放不中断。响应式横幅的临时解析文档通过 Swup 结束钩子释放，不能只删除图片节点而保留其旧媒体查询所属文档。

故障测试屏蔽开发工具栏和外部统计请求，模拟的评论与音乐故障不代表真实服务可用性；Meting 仍需按项目约定单独实测。本轮对比了升级前后 18 篇文章的正文、标题锚点、图片元数据和正式链接，确认一致；字体测试继续核对真实字形和可变轴。

相册比例排版可单独运行 `node scripts/test-reading-experience.mjs http://localhost:4321 --only=albums`。检查照片下载前后的尺寸预留、横竖幅原始比例、瀑布流间距、桌面与缩放对应的窄视口、逐张原图放大及导航返回；同时检查死亡搁浅、剑星等比例相册的按行顺序及 2～4 列下的末行居中。等比例相册的排版检查使用与实际照片同尺寸的内存 SVG，避免下载大量游戏截图；SCU 的放大检查使用真实原图。此项随统一浏览器回归进入 CI，比例识别的舍入误差和无尺寸回退由 `pnpm test` 覆盖。

## 桌面加载基线

使用已有生产产物、1440×1000 视口、2 倍 CPU 放慢、40ms 延迟和 10Mbps 网络；首页、STA、夏令营分别测量 3 次独立冷缓存及随后热缓存重载，取中位数。HTTPS 第三方服务不参与这项实验，浏览器缓存保持启用。记录首屏文字字体就绪、可见图片解码完成时间、LCP、CLS、第一方资源解压体积和请求数。实验室时间不能代替读者实际网络表现，也不把无交互的实验当作 INP 测量。

首次测量发现三个大横幅及隐藏壁纸占用了首屏网络。轮播现在使用 picture 按屏幕选择原图，后续帧在解码后才切换；未启用的全屏壁纸不请求图片。图片内容、字体及版式保持原配置。浏览器回归覆盖轮播、暂停、两种屏幕选图和全屏模式启用后的加载。

2026-10-19 的 CI 三次采样中位数：第一方首屏资源体积由首页 14.70 MB、STA 15.56 MB、夏令营 14.89 MB，降至 6.97 MB、7.83 MB、7.16 MB，减少约 50%–53%。原始横幅文件未压缩或替换。基线记录在 `scripts/performance-baseline.json`，附来源提交和 CI 地址。CI 对 Astro＋Pagefind 产物采样，保留完整本地 WOFF2；发布流程中的字体子集化另由共享字体测试覆盖，实际部署体积可能更小。

本批复核：49 项离线测试；已有文章与旧入口的 373 处正文链接检查通过，外链报告为 18 个可访问、2 个跳转、10 个访问受限，无 404／410。迁移工具用 STA 进行只读计划及验证，核对 13 个图片文件与引用，并保护其余 132 个文件。所有文章与字体源文件保持不变；临时计划及完整报告验收后删除。

`--samples=1 --no-budget` 可快速诊断，`--report=.git/performance-report.json` 保存临时报告；`--record` 要求至少 3 次采样并显式更新 `scripts/performance-baseline.json`，更新后必须审查差异。体积阈值为基线增加 25% 加 16KiB，请求数增加 25% 加 3，CLS 不超过 0.1 或基线加 0.03；加载时间显著增加仅作提示，避免 CI 机器波动误报。CI 保存每轮报告 14 天。

## 内容检查范围

`scripts/check-content.mjs` 使用 Markdown 语法树，不把代码示例或公式中的图片语法误认为实际图片。YAML、Markdown 解析器复用 Astro 已安装的依赖；元数据与 Astro 共用 `src/content-schema.ts`，不会维护第二套字段规则。

以下问题报告为错误，退出码为 1：

- frontmatter 缺失、YAML 重复字段、字段类型错误、空白标题、无效日历日期。
- 加密标记开启却未设置密码，避免文章模板回退为公开正文。
- Astro 文章 ID 重复、自定义永久链接或旧入口冲突、与静态页面重名、根级永久链接含无效路径段。
- 本地封面、正文图片、文件附件丢失；路径大小写与磁盘不一致；本机绝对路径或越界路径。
- 使用未经资源解析的原生 HTML 相对图片地址。
- 百度卡片地址不合法、URL 提取码与卡片提取码冲突，或 GitHub 卡片仓库格式不正确。

以下问题仅提供整理建议，默认退出码仍为 0：旧图片目录、封面不在文章同级、缺少简介、标题跳级、更新日期早于发布日期、相对附件链接需要确认发布地址。不会因为旧目录的命名不同就自动搬动资源或判定文章不可用。

`check:content` 不对远程图片和下载链接发起网络请求。外链需显式使用上面的 `--external-only`：先 HEAD，遇到不支持或错误状态用 GET 复核，仅读取响应头并取消正文；HTTP 404／410 标为疑似失效，401／403／429 为访问受限，超时、DNS 和服务端错误为待复核，不自动删除或替换文章链接。HTTP 200 只代表地址可访问，不能证明网盘文件或登录后内容有效。源文件存在也不等于附件已发布，相对附件会另外提醒。文章正文的中英文空格等编辑风格仍由迁移时审阅，检查器不会批量改写原文。

## 实际页面与订阅检查

启动现有开发服务后运行 `pnpm test:frontend`。若只需要检查项目而不执行内容同步，可使用：

```powershell
pnpm exec astro dev --host localhost --port 4321
```

脚本按当前源文章动态生成检查清单，新增文章后无需手动维护文章数量或路径：

- 请求每篇公开文章及保留的旧入口，检查正文、canonical 和搜索排除标记。
- 将全部文章 HTML 加入内存中的 Pagefind 索引，确认一篇文章只有一个索引片段，不写入 dist。
- 请求全部本地正文图片，确认 HTTP 200 和图片响应类型。
- 严格验证 RSS、Atom 的 XML；逐篇对照源文章，检查无遗漏、无重复、无草稿或加密文章，并核对发布日期排序和两个订阅的文章顺序。
- 对照实际文章的图片数量，防止订阅漏图；检查订阅图片均为绝对地址，并请求其中的本地图片验证可访问性。
- 保留搜索去重、大小写、短语、多关键词和安全高亮的原有回归检查。

这项检查验证的是开发服务的真实输出，不代替生产 build。它也不验证屏幕上的布局或主题动画效果；本轮没有修改这些功能。

## 本轮订阅修复

RSS 与 Atom 原先以文章 ID 推算图片目录，但 Astro ID 会小写化并移除末尾 index，无法可靠还原真实路径。现在统一通过 `src/utils/feed-utils.ts` 按文章 `filePath` 解析，保留原始大小写，支持多级目录、中文和编码文件名；同一文章的重复图片只处理一次。SVG 使用资源 URL，位图沿用 Astro 图片处理。

正文中的 HTML 图片包裹先正常解析，再经过清洗，避免显示原始 span 字符串。Atom 的标题、简介、分类、链接等动态值进行 XML 转义，正文里的 `]]>` 通过拆分 CDATA 保留；语言改用 Atom 根元素的 `xml:lang`。

不自动还原或改动文章。工具脚本与 package.json 命令可以独立移除；共用元数据规则的 `src/content.config.ts` 与 `src/content-schema.ts` 应成组恢复。订阅修复涉及两个 XML 入口与 `src/utils/feed-utils.ts`，需要回退时一起处理。

## 本次验证记录

2026-10-15：21 项离线测试通过；Astro 检查 110 个文件，诊断为 0 错误、0 警告、0 提示。通过语法树对比，抽出的文章 schema 与原有规则等价。

内容检查覆盖 18 篇文章、111 个本地资源，0 个错误；4 条建议仅涉及旧图片目录。HTTP 回归覆盖全部公开文章与旧入口、18 个唯一 Pagefind 文章片段、97 个本地正文图片地址，以及 RSS、Atom 中的 97 个本地图片地址。两个订阅均为合法 XML，文章清单、顺序和逐篇图片数量一致。JSON 输出、严格模式和命令退出码也已验证。

生产构建验证：`pnpm build` 成功，生成 55 个页面，完成 Pagefind 索引与字体压缩。对 `astro preview` 的生产输出运行完整 HTTP 回归通过：18 篇文章及旧入口正常，95 个优化后的本地正文图片地址和 95 个订阅图片地址均可访问，RSS 与 Atom 校验通过。直接读取生成的 Pagefind 片段，确认收录 18 篇唯一文章和关于页，旧文章入口未重复收录。

音乐 API 请求失败已修复：原配置域名在当前环境返回 DNS `ENOTFOUND`，主题自带备用地址返回 HTTP 404。已将配置、播放器默认地址与字体压缩脚本默认地址统一为 [meting-api 项目文档](https://github.com/injahow/meting-api) 提供的 `https://api.injahow.cn/meting/`，保留原网易云歌单。真实网络检查确认歌单返回 4 首歌曲、允许跨域，4 首歌曲的音频和封面地址均可访问。重新执行 `pnpm build` 成功，日志确认读取 4 首歌曲并补充 41 个歌单字符，未再跳过音乐文字收集。

仍有浏览器兼容数据过旧、原文 KaTeX 写法及隐藏示例相册缺少封面的非阻塞提示。构建未新增文章或锁文件变动。未进行 Git 暂存、提交或推送，未修改文章、页面样式或依赖锁文件，未使用 computer-use。
