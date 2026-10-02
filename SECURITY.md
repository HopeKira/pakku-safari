# 安全与发布检查

本仓库公开用于源码备份、学习和作品展示。源码可公开不等于扩展已通过全面运行验证。

## 公开前处理

- 公开副本使用干净历史；未携带本机旧提交中的个人导出偏好。
- 排除 macOS 崩溃报告、审计原始报告、签名材料、构建结果和个人工程状态。
- 保留 GPLv3 与上游归属；纳入实际使用的 npm 锁文件。
- 配置回退复用公共 DEFAULT_CONFIG，深复制数组，不保存个人过滤偏好。

## 每次修改后的复查

需要 Python 3、Git 和 Gitleaks 8.30.1。安装后，执行 `npm ci --ignore-scripts` 和 `sh scripts/security-check.sh`。扫描当前文件与全部可达 Git 历史；工具缺失或失败会阻止检查完成。报告默认写入被忽略的 `.security-reports`，不得直接公开原始报告。也应人工查看暂存文件、README、截图、资产中的个人信息；规则扫描不能保证不存在敏感内容。

然后按顺序构建 Safari、Chrome、Firefox 和 Edge。发布 CI 固定第三方 Actions 的提交版本，以只读权限执行敏感内容检查与构建。

较完整的审查还应运行：

```sh
npm audit --json > .security-reports/npm-audit.json
semgrep scan --config p/javascript --config p/typescript --config p/owasp-top-ten \
  --metrics off --json --output .security-reports/semgrep.json pakkujs userscript_docs
# DeepSec 0.2.0，仅本地分析，不上传远程 L3
# 设置自己的私有报告路径与工具配置目录后运行：
deepsec shield scan . --layer l1 --no-remote-l3 --format json --output .security-reports/deepsec-l1.json
deepsec shield scan . --layer l2 --no-remote-l3 --format json --output .security-reports/deepsec-l2.json
```

具体 DeepSec 子命令以安装版本帮助为准。将工具退出状态、覆盖范围和每条发现一起复核，不能只看“扫描完成”。npm audit 非零通常表示依赖有已知漏洞，需要人工区分构建工具与打包运行代码；不要自动执行 `npm audit fix --force`。

## 本次审查结论与剩余风险

2026-10-02 使用 Gitleaks 8.30.1、Semgrep 1.179.0、DeepSec 0.2.0、npm audit，并人工复核 Manifest、消息桥、XHR/fetch、DOM 输出、Worker/WASM、用户脚本、构建脚本、许可和发布范围。

DeepSec L2 的四项 innerHTML 告警是固定模板或清空容器，未发现攻击者输入进入对应 HTML；L1 未发现命中。Semgrep 的通配 postMessage 告警涉及上游跨页面通信，仍需结合 Safari 实际 origin、source 和 iframe 验证。Semgrep 对 `options.html` 和 `troubleshooting.html` 报告部分解析警告，不能视为完整覆盖。生成的 protobuf、WASM 二进制及浏览器实际权限边界没有获得完整静态覆盖；未执行模糊测试或完整动态渗透测试。

已知限制：后台失联回退无法可靠遵循用户保存的关闭开关，使用临时标签编号；消息桥对 source/origin 的验证和 URL 正则可进一步收紧；npm audit 仍报告 8 项 high（无 moderate/critical），涉及旧 Grunt 构建依赖。现有信息不足以将这些全部定性为普通网页可利用的高危漏洞，也不能据此宣称没有风险。

用户脚本会执行 JavaScript，属于上游明确支持的功能。仅运行可信脚本；Worker 隔离不意味着禁止网络访问。本次未发现可证实的 Safari 新增凭据泄漏或任意网站可调用后台请求代理的路径。

如果发现真实凭据，先撤销或轮换，再清理文件与历史。删除当前文件不会撤回已公开的历史、缓存或他人的副本。请勿在公开 issue 中粘贴 token、完整配置、Cookie 或崩溃报告。
