# pakku.js Safari 移植

基于 [xmcp/pakku.js](https://github.com/xmcp/pakku.js) 的 Safari Web Extension 适配项目。pakku 原作提供 B 站弹幕合并、过滤和播放器增强功能；本仓库用于展示我对浏览器扩展跨平台移植的实践。

## 我的修改

- 在 Grunt 构建流程中增加 Safari 扩展包，调整 Manifest 的后台脚本、权限和内容脚本注入方式。
- 调整 Safari 下的后台通信、配置读取回退及页面注入兼容逻辑。
- 整理可复现的 Safari 工程生成步骤和已知限制。
- 公开前移除个人 Chrome 导出偏好，回退使用上游公共默认设置；增加回归测试、锁文件和发布检查。

移植基于上游提交 `2cb6f52`。原有弹幕处理算法、界面、资源与主体功能来自上游，并非从零开发。

## 免编译测试包

GitHub Release 测试附件将提供支持 Apple Silicon 和 Intel 的 App，无需自行编译。它使用免费 ad-hoc 临时签名，未经过 Apple 公证；需要在 Safari 中允许未签名扩展。下载、启用、系统提示及已知限制见 [安装说明](INSTALL.md)。这不是 App Store 或 Developer ID 正式分发包。

## 构建

需要 Node.js 22 或更高版本以及 npm。Safari 原生工程需要 macOS 和 Xcode。

```sh
npm ci --ignore-scripts
npm test
npm run build:safari
```

Safari 扩展资源输出到 `dist/S`。从这些资源生成 Xcode 工程并选择本机签名的方法见 [SAFARI.md](SAFARI.md)。仓库包含对应原生工程源码，不包含个人证书或配置导出。免费测试包构建方法见 [SAFARI.md](SAFARI.md)。

其他构建目标：`npm run build:chrome`、`npm run build:firefox`、`npm run build:edg`。它们共享临时目录，请按顺序运行。

## 当前状态与限制

后台不响应时，兼容性回退会启用公共默认设置；此时无法读取已保存的关闭开关，且临时标签编号不是真实浏览器标签编号。选项同步、徽标及部分播放器功能仍可能有兼容性问题。

依赖中的旧构建工具仍有已知漏洞。用户脚本属于可执行代码，只应启用自己理解并信任的脚本。审查范围、剩余问题与复查方法见 [SECURITY.md](SECURITY.md)。

## 上游与许可

原作者：**xmcp**。本仓库保留 [GPLv3 许可证](LICENSE.txt) 和[上游 README](README.upstream.md)。上游 README 中的 Chrome、Edge、Firefox 商店与安装链接指向原项目，不是本移植的 Safari 下载入口。

若继续分发本项目或包含扩展资源的 Safari App，请遵守 GPLv3，提供相应源码并保留作者及许可说明。
