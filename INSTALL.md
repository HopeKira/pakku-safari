# Safari 免费测试包安装

无需 Xcode、Node.js 或 Apple 开发者会员。下载发布附件 `Pakku-Safari-Preview-macOS-universal.zip`；包含 Apple Silicon 和 Intel 两种架构。

本包使用本地 ad-hoc 临时签名，仅用于二进制完整性；没有 Apple 开发者身份认证或公证，Safari 按未签名扩展测试方式使用。构建最低目标为 macOS 12，本扩展使用 Manifest V3，需要 Safari 15.4 或更新版本；旧系统及其他机器尚未实测，不能保证兼容。

1. 解压 ZIP，把 `Pakku Safari Preview.app` 拖到“应用程序”。如果已安装过其他 pakku Safari 版本，先在 Safari 中停用旧版，避免两个版本同时处理弹幕。
2. 打开 App。如果 macOS 因无法验证开发者而阻止打开，在“系统设置 → 隐私与安全性”中，按提示选择此 App 的“仍要打开”。仅在你信任来源并核对下载文件后操作。
3. 在 Safari 设置的“高级”页开启网页开发者功能，再到“开发者”设置或“开发”菜单开启“允许未签名扩展”（不同 Safari 版本位置可能不同）。
4. 在 Safari 的“扩展”设置中启用 pakku，并允许它访问 B 站。可以通过 App 的按钮打开扩展设置。
5. 打开 B 站视频验证弹幕合并、面板和设置。退出并重新启动 Safari 后，测试授权可能失效，需要再次允许未签名扩展并启用。

不需要关闭整个系统的 Gatekeeper 或 SIP。本包不会自动修改系统安全设置或要求输入 Apple ID。

## 文件校验

Release 中提供 SHA256SUMS.txt。终端进入下载目录后执行：

```sh
shasum -a 256 Pakku-Safari-Preview-macOS-universal.zip
```

将结果与校验文件中的散列比较。测试包和源码来自相同发布版本，原始许可证见 LICENSE.txt。

## 限制和卸载

目前验证了扩展包与原生宿主构建、双架构和临时签名；本次尚未完成实际 Safari 功能测试、下载隔离状态下的首次打开测试或其他机器验证。若无法加载，请提供系统/Safari 版本和去除个人信息后的错误描述，不要提交完整浏览器配置或崩溃报告。

后台配置回退、设置同步、徽标等限制见 README.md 和 SECURITY.md。Safari 转换器还提示 notifications 和 open_in_tab 字段不受支持。用户脚本只运行可信内容。

卸载时先在 Safari 中关闭扩展，再删除 App；已有扩展配置是否保留由 Safari 管理。

Apple 参考：[测试运行扩展](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)、[打开未经公证的 App](https://support.apple.com/102445)。

Manifest V3 版本参考：[WebKit Safari 15.4 说明](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)。
