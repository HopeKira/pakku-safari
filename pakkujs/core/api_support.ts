// Safari-only build. Apple implements only a subset of the WebExtensions API:
// touching a missing namespace at module top level throws TypeError and kills
// the whole script (all later listeners never register). Keep detection only
// for APIs we actually call whose presence is not guaranteed on current Safari.
// APIs we no longer use (notifications, extension, scripting) are gone together
// with their call sites.

const ANY_CHROME = chrome as any;

export const HAS = {
    contextMenus: !!ANY_CHROME.contextMenus,
    commands: !!ANY_CHROME.commands,
    permissions: !!ANY_CHROME.permissions?.getAll,
    declarativeNetRequest: !!ANY_CHROME.declarativeNetRequest?.getDynamicRules,
    setBadgeTextColor: !!ANY_CHROME.action?.setBadgeTextColor,
};
