import {install_dnr_rule} from "./danmu_update_blocker";
import {get_config, hotfix_on_update, save_config} from "./config";
import {get_state, HAS_SESSION_STORAGE, init_state, save_state, reset_state_store} from "./state";
import {LocalizedConfig} from "../core/types";
import {HAS} from '../core/api_support';

// Safari-only background page. chrome.notifications does not exist on Safari, so
// there is no permission-repair prompt or ON/OFF toast here; state is reflected
// by the toolbar badge and the popup instead.

const DEFAULT_BADGE_BGCOLOR = '#26c';

async function reset_badge() {
    // reset badge options because options during the previous launch might not be cleared away
    await chrome.action.setBadgeText({text: ''});
    await chrome.action.setBadgeBackgroundColor({color: DEFAULT_BADGE_BGCOLOR});
    if(HAS.setBadgeTextColor)
        await chrome.action.setBadgeTextColor({color: 'white'});
}

async function install_context_menu() {
    if(!HAS.contextMenus)
        return;

    chrome.contextMenus.removeAll(()=>{
        chrome.contextMenus.create({
            id: 'toggle-global-switch',
            title: '切换工作状态',
            contexts: ['action'],
        });
        chrome.contextMenus.create({
            id: 'show-local',
            title: '处理本地弹幕',
            contexts: ['action'],
        });
    });
}

async function perform_init() {
    let is_init = await init_state();
    if(is_init)
        await reset_badge();
}
void perform_init();

async function toggle_global_switch() {
    let new_switch = !(await get_state()).GLOBAL_SWITCH;
    await save_state({
        GLOBAL_SWITCH: new_switch,
    });
    await chrome.action.setBadgeText({
        text: new_switch ? '' : 'zzz',
    });

    // notify popup and content scripts
    chrome.runtime.sendMessage({type: 'reload_popup_state', tabid: null})
        .catch(()=>{});
    let cur_tabid = (await chrome.tabs.query({active: true, currentWindow: true}))[0]?.id || null;
    // Safari does not expose tab.url without the "tabs" permission. Sending to
    // tabs without our content script simply rejects and is ignored.
    for(let tab of await chrome.tabs.query({})) {
        chrome.tabs.sendMessage(tab.id!, {type: 'reload_danmu', key: new_switch ? 2 : 1, trigger_player: (tab.id===cur_tabid)})
            .catch(()=>{});
    }

    return new_switch;
}

function install_declarative_stuff() {
    // re-install declarative stuff on every startup
    void install_dnr_rule();
    void install_context_menu();
    // xhr_hook.js and injected.css are declared statically in manifest.json
    // (world: 'MAIN' is supported by Safari 18+), so no scripting registration.
}

chrome.runtime.onStartup.addListener(async ()=>{
    install_declarative_stuff();

    if(!HAS_SESSION_STORAGE) {
        console.error('pakku state: EMULATING session storage');
        await reset_state_store();
        // redo the init since the state is reset
        await perform_init();
    }
});

chrome.runtime.onInstalled.addListener(async (details)=>{
    install_declarative_stuff();

    if(details.reason==='install') {
        void chrome.tabs.create({url: chrome.runtime.getURL('page/options.html')});
    }

    if(details.reason==='update') {
        console.log('pakku config: try to migrate');
        let config = await get_config();
        hotfix_on_update(config);
        await save_config(config);
    }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if(msg.type==='get_local_config') {
        async function worker() {
            let is_pure_env = msg.is_pure_env;

            let tabid = sender.tab?.id;
            let config = await get_config();
            let state = await get_state();

            let userscript = config.USERSCRIPT || '';
            if(state[`USERSCRIPT_${tabid}`])
                userscript = userscript + '\n\n' + state[`USERSCRIPT_${tabid}`];

            let local_config: LocalizedConfig = {
                ...config,
                READ_PLAYER_BLACKLIST: is_pure_env ? false : config.READ_PLAYER_BLACKLIST,
                USERSCRIPT: userscript,

                BLACKLIST: [],
                GLOBAL_SWITCH: state.GLOBAL_SWITCH,
                SKIP_INJECT: is_pure_env,
            };

            return {
                tabid: sender.tab?.id,
                local_config: local_config,
            };
        }

        worker().then((res)=>{
            sendResponse({
                error: null,
                result: res,
            });
        }, (err)=>{
            sendResponse({
                error: ''+err,
            });
        });
        return true;
    }
    else if(msg.type==='update_badge') {
        if(!msg.tabid) {
            console.error('pakku background: no tabid for update_badge');
            return;
        }

        // may throw error because the tabid may be closing
        chrome.action.setBadgeText({
            tabId: msg.tabid,
            text: msg.text,
        })
            .then(()=>
                chrome.action.setBadgeBackgroundColor({
                    tabId: msg.tabid,
                    color: msg.bgcolor || DEFAULT_BADGE_BGCOLOR,
                })
            )
            .catch(()=>{});

        // refresh the popup
        chrome.runtime.sendMessage({type: 'reload_popup_state', tabid: msg.tabid})
            .catch(()=>{});
    }
    else if(msg.type==='toggle_switch') {
        let perform = async ()=>{
            await toggle_global_switch();
            sendResponse(null);
        }
        void perform();
        return true;
    }
    else if(msg.type==='reset_dnr_status') {
        void install_dnr_rule();
    }
    else if(msg.type==='xhr_proxy') {
        let perform = async ()=>{
            try {
                let res = await fetch(msg.url);
                let status = res.status;
                let text = await res.text();
                sendResponse({
                    error: null,
                    text: text,
                    status: status,
                });
            } catch(e) {
                sendResponse({
                    error: e,
                });
            }
        }
        void perform();
        return true;
    }
});

function handle_command(name: string) {
    if(name==='toggle-global-switch') {
        void toggle_global_switch();
    }
    else if(name==='show-local') {
        void chrome.tabs.create({url: chrome.runtime.getURL('/page/parse_local.html')});
    }
}

if(HAS.commands) {
    chrome.commands.onCommand.addListener(function(name) {
        handle_command(name);
    });
}

if(HAS.contextMenus) {
    chrome.contextMenus.onClicked.addListener(function(info, tab) {
        handle_command(info.menuItemId as string);
    });
}
