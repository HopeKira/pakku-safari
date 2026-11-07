# Safari 构建与验证

## 从干净源码生成工程

需要 macOS、Xcode（含命令行工具）、Node.js 22 或更高版本、npm。执行：

```sh
npm ci --ignore-scripts
npm test
npm run build:safari
xcrun safari-web-extension-converter dist/S \
  --project-location ./safari-project \
  --app-name "Pakku Safari Preview" \
  --bundle-identifier com.example.pakku.safari.preview \
  --swift --macos-only --copy-resources --no-open --no-prompt
```

转换器在部分 Xcode 版本中显示为 `safari-web-extension-packager`。如果命令参数不同，以本机 `xcrun safari-web-extension-converter --help` 为准。目标目录应为新目录；不要覆盖已有签名工程。

生成后打开对应 `.xcodeproj`，选择自己的唯一 Bundle Identifier 和签名团队。Xcode 27.0 转换器生成的宿主 App 标识可能与命令参数不同：请确认宿主 App 使用 `com.example.pakku.safari.preview`，扩展使用 `com.example.pakku.safari.preview.Extension`，且宿主页面中的扩展标识也一致。扩展标识必须以宿主 App 标识加点号为前缀，否则原生编译校验会失败。示例标识用于本机构建预览，不代表可直接分发的签名身份。运行宿主 App，再根据 Safari 扩展设置启用扩展并授权 B 站访问。开发测试可能需要 Safari 的允许未签名扩展选项。

`--copy-resources` 复制当时的 `dist/S`；修改 TypeScript 后必须重新构建并重新生成工程，或在 Xcode 中同步更新扩展资源，避免测试旧版本。

## 当前适配内容

Manifest 变换位于 `Gruntfile.js` 的 `safari_manifest()`：移除 Chrome 专属的 `minimum_chrome_version`、把 optional host 权限并入 `host_permissions`、把 `declarativeNetRequestWithHostAccess` 换成 `declarativeNetRequest`、把 service worker 改成持久化后台页。

以下两项已从 Safari manifest 中删除，因为它们不受支持且会触发转换器警告：

- `notifications` 权限 —— Safari 没有 `chrome.notifications`，运行时由 `core/api_support.ts` 的守卫兜底
- `options_ui.open_in_tab` —— 选项页由 Safari 自己从扩展设置中打开，快捷键也在 Safari 设置 → 扩展 中修改（弹窗里的快捷键提示已改为文字说明，不再尝试打开 `chrome://extensions/shortcuts`）

XHR 钩子使用 Safari 18+ 原生支持的 `content_scripts[].world = 'MAIN'` 静态声明，不再通过 ISOLATED 注入器创建 `<script>` 标签。后者受页面 CSP 限制、多一次 DOM 注入，仅为不支持 `world` 的旧 Chrome/Firefox 保留在 `assets/xhr_hook_injector.js`。

⚠️ Xcode 27.2 的转换器会打印 `world 不受支持` 的警告，但这是转换器白名单落后：**它只警告、不删键**，生成的 `Pakku Extension/Resources/manifest.json` 里 `world: "MAIN"` 完整保留，运行时由 Safari 18+ 解析。可据此忽略该警告。若现场验证发现钩子未生效，把 `Gruntfile.js` 里那条声明的 `js` 改回 `/assets/xhr_hook_injector.js` 并去掉 `world` 即可回退。

配置存储：Safari 没有 `storage.sync`，`config.ts` 自动回落到 `storage.local`；`state.ts` 在模拟 session storage 时只清理自己拥有的键，避免误删用户设置。设置不会跨设备同步。

后台通信失败或超过 2 秒时仍会用公共默认配置，但 **tabid 记为 0，不写统计、不发徽标**，弹窗会主动探测内容脚本：脚本存活时显示「扩展已就绪，正在等待弹幕数据」，而不是误报「没有发现B站播放器」。刷新页面即可恢复完整统计。

## 人工运行检查

- 在 Safari 扩展页确认加载成功与授权范围。
- 打开 B 站普通视频，检查弹幕过滤与合并、面板和样式。
- 修改选项、刷新视频、关闭全局开关，确认效果；特别检查后台异常时的行为。
- 检查多标签、iframe、跳转视频、徽标和播放器增强功能。
- 用户脚本只使用可信示例，确认 Worker 与 WASM 能正常加载。

2026 年 6 月的本机移植曾观察到核心过滤可用及后台通信不稳定；这些历史观察不等于当前版本运行测试，也不能确认 storage 或 background 是根因。本次以独立扩展包构建、重新生成的工程编译和回归测试为证据，不复用旧工程的个人签名与安装状态。

## 构建与 Release 对应的免费测试包

仓库中的 `native/` 包含经整理的宿主及扩展工程。执行：

```sh
npm ci --ignore-scripts
sh scripts/build-macos-test.sh
```

脚本先构建并同步扩展资源，然后以 Release 同时编译 arm64/x86_64，最低构建目标设为 macOS 12。它先为扩展、再为宿主 App 加上 ad-hoc 临时签名并验证，输出 `release/` 中的 ZIP 和 SHA-256。不需要 Apple 账号、证书或公证凭据。

`native/.../Extension/Resources` 为生成目录，不提交源码；同一版本的 TypeScript、资源、锁文件、Grunt 配置与原生工程共同构成对应源码。Release 同步提供完整源码档案与许可证。实际其他系统运行兼容性需另行验证。
