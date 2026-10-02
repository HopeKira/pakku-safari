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

Manifest 变换位于 `Gruntfile.js`：移除 Chrome 特定最低版本字段、调整 DNR 权限和后台脚本形式、添加必要内容脚本和样式。本机 Xcode 27.0 转换器提示 `notifications` 和 `open_in_tab` 不受支持，通知与选项打开方式需要实际验证。实现限于 B 站相关主机；未增加任意网站或 cookie 权限。

后台通信失败或超过 2 秒时使用公共默认设置作为兼容回退，不包含个人导出配置。回退无法获知用户保存的关闭开关，并且使用临时标签编号，因此设置同步和徽标显示存在限制。

## 人工运行检查

- 在 Safari 扩展页确认加载成功与授权范围。
- 打开 B 站普通视频，检查弹幕过滤与合并、面板和样式。
- 修改选项、刷新视频、关闭全局开关，确认效果；特别检查后台异常时的行为。
- 检查多标签、iframe、跳转视频、徽标和播放器增强功能。
- 用户脚本只使用可信示例，确认 Worker 与 WASM 能正常加载。

2026 年 6 月的本机移植曾观察到核心过滤可用及后台通信不稳定；这些历史观察不等于当前版本运行测试，也不能确认 storage 或 background 是根因。本次以独立扩展包构建、重新生成的工程编译和回归测试为证据，不复用旧工程的个人签名与安装状态。
