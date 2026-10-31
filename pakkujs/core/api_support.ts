// Safari 对扩展 API 的支持不完整，且有两种不同的失败方式：
// 1) 整个命名空间缺失（如 notifications）——直接访问 chrome.xxx.yyy 会抛 TypeError，
//    发生在模块顶层会中断整个脚本，后面的监听器全部注册不上
// 2) 命名空间存在但调用即失败（如 storage.sync）
//
// 这里统一做一次存在性检测，各模块引用这些常量即可，不用各写一遍。
// 注意：只判断「对象存在」不够，存不存在的判断和会不会抛错的判断要分开做。

const ANY_CHROME = chrome as any;

export const HAS = {
    notifications: !!ANY_CHROME.notifications,
    permissions: !!ANY_CHROME.permissions?.getAll,
    contextMenus: !!ANY_CHROME.contextMenus,
    commands: !!ANY_CHROME.commands,
    declarativeNetRequest: !!ANY_CHROME.declarativeNetRequest?.getDynamicRules,
    scripting: !!ANY_CHROME.scripting,
    extension: !!ANY_CHROME.extension,
};
