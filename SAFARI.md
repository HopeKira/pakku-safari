# Safari 构建与验证

本仓库只面向 macOS 的 Safari（macOS 27.3 / Safari 18+），**不再构建 Chrome / Edge / Firefox**。

`pakkujs/manifest.json` 已经是 Safari 原生形态，构建时不再做任何 manifest 改写；`Gruntfile.js` 只有一个 `build` 任务。

## 构建

需要 macOS、Xcode（含命令行工具）、Node.js 22 或更高版本、npm。

```sh
npm ci --ignore-scripts
npm test
npm run build          # 产出 dist/S

xcrun safari-web-extension-converter dist/S \
  --project-location ./safari-project \
  --app-name "Pakku" \
  --bundle-identifier com.hopekira.pakku.safari \
  --swift --macos-only --copy-resources --no-open --no-prompt
```

转换器在部分 Xcode 版本中显示为 `safari-web-extension-packager`。

⚠️ **重新生成工程前，把旧的 `safari-project/` 移到废纸篓，不要 `rm -rf`**：本机 safe-delete 钩子会在文件数超过阈值时拦截，转换器随即复用旧目录，导致 `.app` 里仍是上一版 JS。生成后务必核对 md5：

```sh
md5 -q dist/S/generated/popup.js \
  "safari-project/build/Build/Products/Release/Pakku.app/Contents/PlugIns/Pakku Extension.appex/Contents/Resources/generated/popup.js"
```

⚠️ Xcode 27.2 的转换器会打印 `world 不受支持` 警告，但它**只警告、不删键**——生成的 `Pakku Extension/Resources/manifest.json` 里 `world: "MAIN"` 完整保留，运行时由 Safari 18+ 解析。可忽略该警告。

## 签名

Xcode 27 转换器生成的宿主 App 标识是 `com.hopekira.pakku.Pakku`，必须改成 `com.hopekira.pakku.safari`：扩展标识必须以宿主标识加点号为前缀，否则原生编译校验（`ValidateEmbeddedBinary`）会失败。

```sh
sed -i '' 's/"PRODUCT_BUNDLE_IDENTIFIER": "com.hopekira.pakku.Pakku"/"PRODUCT_BUNDLE_IDENTIFIER": "com.hopekira.pakku.safari"/' \
  safari-project/Pakku/Pakku.xcodeproj/project.xcproj

cd safari-project && xcodebuild -project Pakku/Pakku.xcodeproj -scheme Pakku \
  -configuration Release -derivedDataPath build -destination 'platform=macOS' \
  DEVELOPMENT_TEAM=S89Z4QW6TN CODE_SIGN_STYLE=Automatic CODE_SIGN_IDENTITY="Apple Development" \
  -allowProvisioningUpdates
```

（`DEVELOPMENT_TEAM` 换成你自己的 Team ID。）

安装与注册：

```sh
cp -R build/Build/Products/Release/Pakku.app /Applications/
LSREG=/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister
$LSREG -f /Applications/Pakku.app
pluginkit -a "/Applications/Pakku.app/Contents/PlugIns/Pakku Extension.appex"
```

## Safari 原生适配要点

- `background.scripts` 持久化后台页（不是 service worker）
- `content_scripts[].world = "MAIN"` 静态注入 `xhr_hook.js`，不再需要「ISOLATED 注入器创建 `<script>` 标签」的绕路
- `declarativeNetRequest`；ws/wss 直接并入 `host_permissions`（Safari 没有 `optional_host_permissions`）
- 不声明 `notifications` / `scripting` / `open_in_tab` / `minimum_chrome_version` 等 Safari 不支持的键
- 配置只用 `storage.local`（Safari 没有 `storage.sync`）
- 数量标记用 `×N`：Unicode 下标字符（U+2080 系列）画在基线下方，Safari 的字体回退会把它们压得更低，被 B站 固定行高的弹幕行裁掉下半
- 快捷键在 Safari 设置 → 扩展 中修改；弹窗不再尝试打开不存在的 `chrome://extensions/shortcuts`

## 已知限制

- 本机用免费 Apple Development 证书签名且未公证，Safari **每次启动会静默取消扩展勾选**，需要手动重新启用（系统设置里没有可点的「仍要允许」，因为 App 没有隔离属性）
- `declarativeNetRequest` 的 WebSocket 阻断在 Safari 上是否生效需实测（对应 BREAK_UPDATE 功能）
- 后台通信超过 2 秒会回退到公共默认配置，此时 tabid 记为 0、不写统计；弹窗改为提示「扩展已就绪，正在等待弹幕数据」，不再误报「没有发现B站播放器」

## 人工运行检查

- B站视频页 Console 出现 `pakku: inject xhr hook`，弹幕过滤与合并生效
- 弹窗显示统计表格，块内标记为 `×N`
- 选项页从 Safari 设置 → 扩展 打开，版本号带 `_S`，没有 Chrome 商店更新提示
- 切换全局开关后，已打开的 B站 页面立即刷新
- 修改设置后重开 Safari，设置仍在（验证 `storage.local` 不再被 `clear()` 误删）
