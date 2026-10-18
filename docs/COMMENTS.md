# 文章评论（giscus）

网站继续静态部署。评论由独立公开 GitHub 仓库的 Discussions 托管，通过 [giscus](https://giscus.app/zh-CN) 显示。读者使用 GitHub 账号发言；评论公开，支持 Markdown、代码块和数学公式。管理员通过 GitHub 管理、删除或锁定讨论，通知由 GitHub 的订阅和个人通知设置控制。

## 当前状态

评论仓库 `Asround/Asround_Blog_Comments` 已创建，Discussions、“文章评论”分类及 giscus 应用授权已配置，`giscus.json` 已允许正式站点和本地开发地址。该仓库已克隆到 `E:\Git_projects\Asround_Blog_Comments`，`main` 跟踪 `origin/main`。`src/config.ts` 已填入真实公开 ID，`commentConfig.enable` 为 `true`。用户已完成 GitHub 登录并发布测试留言；真实服务已验证保存、刷新、正式与旧入口共用讨论、站内切页、代码及两类公式渲染和主题联动。回复通知仍待验收；正式站点需部署后生效。没有修改文章正文。

## 账号配置参考（本项目已完成）

1. 创建独立**公开**仓库，预定 `Asround/Asround_Blog_Comments`（若更换名称，同步修改 `commentConfig.giscus.repo`）。不要使用博客源码仓库。
2. 在该仓库 Settings → General → Features 启用 Discussions。
3. 创建“文章评论”分类，选择 **Announcements** 类型。让 giscus 创建每篇文章的讨论，避免普通读者在分类中另开无关主题。
4. 安装 [giscus GitHub App](https://github.com/apps/giscus)，只授权评论仓库。在 [giscus 配置页](https://giscus.app/zh-CN) 选中仓库和分类，取得 `data-repo-id`、`data-category-id` 两个**公开 ID**。
5. 在**评论仓库根目录**添加 `giscus.json`，允许正式站点和本地验收地址（此文件不放在博客项目中）：

   ```json
   {
     "origins": [
       "https://asround-blog.pages.dev",
       "http://localhost:4321"
     ]
   }
   ```

   其他端口、预览域名或未来新域名需明确加入。端口和协议属于 origin，文章路径不属于 origin。规则见 [官方高级配置](https://github.com/giscus/giscus/blob/main/ADVANCED-USAGE.md)。
6. 在 `src/config.ts` 填写真实 `repoId` 和 `categoryId`，确认分类名称后将 `enable` 改为 `true`。不要填写个人访问令牌、客户端密钥或其他秘密。
7. 运行下方检查，再进行真实服务验收。未配置完整时组件隐藏；启用状态的配置检查会报错，避免把隐藏状态误认为接入成功。

## 网站行为与维护

- 只在允许评论的文章末尾显示；`comment: false`、草稿和加密文章不显示。首页、归档和关于页没有评论框。
- 文章右侧阅读工具栏提供评论气泡按钮，使用原生锚点直达评论区域，支持键盘操作；关闭评论的文章没有无效入口。
- 接近评论区前约 400px 才加载官方组件。只有有效讨论元数据或“讨论不存在”才算数据就绪；高度消息只调整布局，不取消 20 秒数据加载计时。超过 20 秒时，已创建的 iframe 会保留，读者可以继续等待或手动重新加载；晚到的数据会原地恢复。组件尚未创建时超时则清理未完成的加载，提供重试和 GitHub 入口。
- 临时错误和限流显示相应提示，保留 iframe 及其自身的登录、恢复入口；高度消息不会清除错误提示。首次数据就绪前明确的仓库、分类配置错误单独处理。手动重新加载前提示复制未发送内容；本站不因运行时错误自动销毁编辑器，但无法保证 giscus 自身重置编辑器、切页或刷新时保留草稿。
- 使用 `specific` 映射和严格匹配。搜索限制在配置的分类，新讨论也在该分类创建。正式链接、旧 `/posts/.../` 链接、查询参数及不同域名共用文章正式路径作为标识。
- 跟随网站深浅主题：一次加载官方 `preferred_color_scheme` 双配色样式，通过 iframe 的 `color-scheme` 切换，不在切换中请求另一份主题 CSS，也不重新加载 iframe，保留正在输入的内容。圆形过渡的快照更新回调不等待绘制帧，避免浏览器暂停绘制时触发超时并跳过动画；在 `transition.ready` 后等待三帧，让画面遮罩与圆形裁切进入合成器再同步评论配色，兼容透明评论背景。测试同时检查圆形动画创建、完整播放及颜色不反转，防止仅验证最终配色而漏掉动画失效。页面离开时清理实例、观察器、定时器与待完成的样式请求。
- 主评论输入恢复官方默认的 100px 最小高度，在支持 `field-sizing: content` 的浏览器中随换行及折行自动增高，达到 500px 后内部滚动；旧浏览器保留 giscus 原有增高逻辑及拖动调高。成功发送清空内容或手动清空时恢复默认高度，未发送的非空内容保留高度。预览和短回复使用官方布局。样式在博客的 `public/giscus.css` 维护，通过 `public/_headers` 允许评论服务跨域读取。
- 评论界面采用网站默认色相 305 的深浅配色、透明背景、12px 编辑器圆角及 8px 按钮圆角；选中标签、按钮与焦点使用柔和紫色。官方代码高亮和成功、警告、错误配色保留。调色变量集中在 `public/giscus.css` 的 `--asround-*`，不随访客的自定义色相实时变化。
- `pnpm dev` 下页面读取本站 CSS，再通过官方主题配置消息传入组件；远端 iframe 无需访问 localhost，不依赖浏览器的本地网络访问权限。正式构建仍从 `siteConfig.siteURL` 读取样式。修改本地 CSS 后刷新文章即可查看真实组件，无需提前发布。
- 评论仓库 `giscus.json` 的 `defaultCommentOrder` 设为 `newest`，新留言默认排在顶部输入框之后。没有根据评论数量推测本人提交成功或强制滚动，以免其他读者留言时干扰阅读。
- `commentConfig.giscus.themeStylesheet` 默认为 `/giscus.css`，相对于正式站点解析。加载前检查 HTTP 状态和 CSS 响应类型；2 秒不可用、返回 HTML 或资源尚未部署时回退官方主题，继续显示可用评论。增强样式不新增外部 CDN。
- 评论区提供折叠的 Markdown 与公式写法提示，以及 GitHub 讨论区入口。浏览器禁用本地存储等情况下，显示重试和 GitHub 入口，避免未捕获的组件构造异常。
- 评论区标记 `data-pagefind-ignore`，不参与站内搜索；评论 iframe 内的数据也不会进入静态文章索引。
- 默认没有额外图片上传服务。GitHub/giscus 原生支持的 Markdown 图片链接仍按服务自身规则处理。

通常无需给文章新增 frontmatter。若已上线文章需要改永久链接，在改名的同时将**原来的评论标识**写入 `commentId`，例如原标识为 `/STA/`：

```yaml
permalink: STA-new
commentId: /STA/
```

已启用后随意更改 `commentId`、仓库或分类可能切换到新的讨论。不要批量给旧文章生成新 ID。检查脚本会拒绝重复标识，包括自定义标识与另一篇文章默认路径之间的冲突。

## 检查命令

```sh
pnpm check:local
# 显式联网检查公开仓库、giscus 分类权限、真实 ID 和允许来源
pnpm check:comments --remote
# 另一个终端启动本地开发服务；不需要 build
pnpm exec astro dev --host localhost --port 4321
pnpm test:frontend
pnpm test:comments:browser
pnpm test:comments:site
pnpm test:comments:theme
# 默认持续 20 分钟，不发布测试留言
pnpm test:comments:soak
# 也可指定站点与时长（0–60 分钟）
pnpm test:comments:site https://asround-blog.pages.dev --soak=25
# 整站切页资源回收与音乐连续播放
pnpm test:navigation:memory
```

浏览器脚本通过 `playwright-core` 启动本机 Edge，无需 computer-use 或浏览器下载。其他已安装浏览器可用 `PLAYWRIGHT_CHANNEL=chrome`（按终端语法设置环境变量）。`test:comments:browser` 直接加载开发组件，需要 Astro 开发服务；站内回归与逐帧测试也可通过命令末尾的 URL 参数指定正式站点。不会写入真实留言。

组件测试临时拦截本地测试 URL，加载真实 Svelte 组件和官方 giscus 组件，只模拟远端 iframe。覆盖延迟加载、映射、主题与草稿保留、错误来源消息过滤、空讨论、故障重试、只收到高度时的超时、限流登录入口、临时错误不销毁草稿、晚到数据恢复、首次配置错误、卸载再进入、导入未完成时离开、增强 CSS 成功与回退、禁用存储和模拟登录回调。它不修改正式配置，也不证明真实 GitHub 授权、内容渲染或通知已经可用。

GitHub CI 的检查任务安装 Playwright 配套 Chromium，并在本地开发服务上运行上述组件浏览器测试（`PLAYWRIGHT_CHANNEL=chromium`）；服务有启动等待、执行超时和退出清理。无需 GitHub 令牌，不读取或发布真实留言。整站切页和逐帧动效测试仍保留为单独检查命令，不计入这一 CI 门槛。

站内测试使用真实页面和 Swup，验证入口显示范围、鼠标与键盘锚点、输入高度、帮助提示、页面切换清理，以及 Clarity/GTM 不被重复初始化。逐帧测试点击真实工具栏按钮，通过浏览器合成画面的像素序列检查配色是否只改变一次，能够发现仅检查最终 DOM 状态时漏掉的瞬时闪色。

持续巡检反复进入归档及两篇长文章，输入未发布的模拟草稿并切换主题，检查评论实例和评论消息监听器没有累积；总 DOM 与事件计数仅作为整站诊断数据输出，不等同于整站无内存泄漏的保证。测试在结束时释放路由与浏览器资源，导航超过 30 秒会明确报错。

整站切页回归另外检查文档、DOM、全局监听器和定时器数量，以及音乐播放是否连续。播放器只在挂载后创建音频元素，避免浏览器的原生媒体活动保留 Swup 解析的旧文档；布局监听器清理旧注册或只初始化一次，文章更新时间时钟只在当前页面需要时运行。内存测试使用本地生成的静音音频，不发布评论，并屏蔽仅开发环境存在的 Astro 调试工具栏，避免其审计按钮影响计数。

公共菜单、打字效果、公告和 Markdown 委托事件通过 `runOnce` 注册，避免生产构建内联的小脚本被 Swup 重复执行；需要随页面更新的逻辑仍通过 `onPageView` 订阅。内存测试还检查切页后菜单键盘操作和单次复制，剪贴板仅写入测试替身。

GitHub CI 执行离线内容检查、评论配置与静态样式检查、单元测试和 Astro 检查；远端检查和浏览器检查单独运行，以免外部服务或本机浏览器影响离线 CI。

## 真实服务回归参考

- [STA](http://localhost:4321/STA/)：接近底部才出现评论，无远端配置报错；切换深浅主题保留未发布草稿。
- 同一文章从正式地址与原 `/posts/.../` 地址访问：显示同一条测试评论，GitHub 讨论中的回链指向正式站点。
- 切到其他文章，再前进/后退：每篇文章各自对应讨论，只显示一个评论框；归档无评论框。
- 使用 GitHub 账号登录，发布下面内容，确认段落、代码及两类公式实际渲染，再从 GitHub 验证回复通知与管理操作。

````markdown
**评论验收**：中文 Markdown 与 `inline code`。

```python
print("hello")
```

行内公式： $`E=mc^2`$ 。

$$
\int_0^1 x^2\,dx=\frac{1}{3}
$$
````

公式采用 giscus 自身的数学渲染，与文章正文 KaTeX 分开。实际验收中，不带空格、直接紧邻中文标点的 `$E=mc^2$` 未渲染；上面包含反引号的行内写法与 `$$` 行间写法均已验证。GitHub 通知是否发邮件取决于读者个人设置，网站无需新增邮件服务。

## 快速回退

将 `commentConfig.enable` 改为 `false` 即停止展示和加载评论，不删除远端数据。旧 Twikoo 配置保留；只有拥有真实有效的 Twikoo 服务时才可切换 `provider: "twikoo"` 并启用，当前示例 `envId` 不代表可用服务。

`public/giscus.css` 的 `--asround-comment-min-height` 和 `--asround-comment-max-height` 分别控制输入高度上下限；删除空输入框的 `:placeholder-shown` 规则可单独撤销清空后的高度复位。清空 `commentConfig.giscus.themeStylesheet` 可整体恢复官方样式。评论仓库的 `defaultCommentOrder` 改为 `oldest` 可恢复最早优先。样式需要随博客部署，评论仓库不需要构建。博客源码推送 `master`，独立评论仓库的配置和维护说明推送 `main`。

本次新增依赖为固定版本 `giscus`（运行时）与 `playwright-core`（开发测试）。不引入数据库、后端、个人令牌或自建邮件服务。
