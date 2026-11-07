# pakku.js Safari 版

基于 [xmcp/pakku.js](https://github.com/xmcp/pakku.js) 的 Safari Web Extension 移植。pakku 提供 B 站弹幕合并、过滤和播放器增强。

**本仓库只面向 macOS 的 Safari（macOS 27.3 / Safari 18+）**，不再构建 Chrome / Edge / Firefox，也不再保留跨浏览器的兼容分支。

## 相对上游的改动

- 构建链收敛为单渠道：`Gruntfile.js` 只有一个 `build` 任务，`pakkujs/manifest.json` 直接就是 Safari 原生形态，不再做 manifest 改写。
- 使用 Safari 原生能力：`background.scripts` 持久化后台页、`content_scripts[].world = "MAIN"` 静态注入 XHR 钩子、`declarativeNetRequest`、`storage.local`。
- 移除上游为 Chrome / Firefox / 旧版 Safari 准备的分支与兜底：多目标 manifest 变换、权限修复流程、注入器绕路、`storage.sync` 回落、动态 content script 注册等。
- 对齐 Safari 交互：快捷键改为在 Safari 设置 → 扩展 中修改；选项页不再轮询 Chrome 商店版本、不再显示商店求好评链接。
- 数量标记改用 `×N`：Unicode 下标字符（U+2080 系列）画在基线下方，Safari 的字体回退会把它们压得更低，被 B站 固定行高的弹幕行裁掉下半。

移植基于上游提交 `2cb6f52`。弹幕处理算法、界面与主体功能来自上游，并非从零开发。

## 构建

需要 macOS、Xcode（含命令行工具）、Node.js 22 或更高版本、npm。

```sh
npm ci --ignore-scripts
npm test
npm run build          # 产出 dist/S
```

从 `dist/S` 生成 Xcode 工程、签名、安装与验证的完整步骤见 [SAFARI.md](SAFARI.md)。

## 已知限制

- 本机用免费 Apple Development 证书签名且未公证，Safari 每次启动会静默取消扩展勾选，需要手动重新启用。
- 依赖中的旧构建工具仍有已知漏洞；用户脚本属于可执行代码，只应启用自己理解并信任的脚本。

## 上游与许可

原作者：**xmcp**。本仓库保留 [GPLv3 许可证](LICENSE.txt)。

若继续分发本项目或包含扩展资源的 Safari App，请遵守 GPLv3，提供相应源码并保留作者及许可说明。
