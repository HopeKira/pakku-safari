import {url_finder} from "../protocol/urls";
import {BADGE_ERR_JS, handle_proto_view, handle_task, scheduler} from "../core/scheduler";
import {get_state, remove_state} from "../background/state";
import {get_config, DEFAULT_CONFIG} from "../background/config";
import {AjaxResponse, BlacklistItem, int, LocalizedConfig, MessageStats} from "../core/types";
import {process_local, userscript_sandbox} from "./sandboxed";
import {ProtobufIngressSeg, ProtobufView} from "../protocol/interface_protobuf";

function get_player_blacklist(): BlacklistItem[] {
    type BlockListType = {
        type: 0 | 1 | 2; // 0 text (case insensitive), 1 regexp (case sensitive), 2 user
        filter: string;
        opened: boolean;
        id: int;
    }[];
    type BpxProfileType = {
        blockList: BlockListType
        dmSetting: {
            status: boolean;
        };
    };
    try {
        let j = JSON.parse(window.localStorage.getItem('bpx_player_profile')!) as BpxProfileType;
        if(!j) // possibly in another domain
            j = {
                blockList: [],
                dmSetting: {status: false},
            };
        if(!j.dmSetting.status) // blacklist disabled
            j.blockList = [];

        let extra = JSON.parse(window.localStorage.getItem('pakku_extra_blacklist') || '[]') as BlockListType;
        j.blockList.push(...extra);

        let ret = (
            j.blockList
                .filter(item=>item.opened && [0, 1].includes(item.type))
                .map(item=>[item.type===1, item.filter] as BlacklistItem)
                .filter(item=>{
                    if(item[0]) {
                        try {
                            new RegExp(item[1]);
                        } catch(e) {
                            return false;
                        }
                    }
                    return true;
                })
        );
        console.log('pakku injected: got player blacklist', ret);
        return ret;
    } catch(e) {
        console.error('pakku injected: cannot get player blacklist', e);
        return [];
    }
}

let tabid: null | int = null;
let local_config: null | LocalizedConfig = null;
let unreg_userscript = true;

function _really_get_local_config(is_pure_env: boolean): Promise<{tabid: int, local_config: LocalizedConfig}> {
    return new Promise((resolve, reject) => {
        let resolved = false;

        // Fallback: use public defaults when the Safari background cannot respond
        let do_fallback = () => {
            if(resolved) return;
            resolved = true;
            console.log('pakku diag: fallback START');

            let fallback_tabid: int = Date.now();
            let local_config: LocalizedConfig = {
                // Keep mutable arrays independent of the public defaults.
                ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
                READ_PLAYER_BLACKLIST: !is_pure_env,
                BLACKLIST: [],
                GLOBAL_SWITCH: true,
                SKIP_INJECT: is_pure_env,
            } as LocalizedConfig;

            console.log('pakku diag: fallback DONE, tabid=' + fallback_tabid);
            resolve({ tabid: fallback_tabid, local_config });

            // 后台可能只是启动慢：稍后再问一次，拿到真实 tabid 就换回来，
            // 否则统计会写到 STATS_<时间戳> 上，弹窗按真实 tabid 永远查不到
            setTimeout(function() {
                chrome.runtime.sendMessage({type: 'get_local_config', is_pure_env: is_pure_env}, function(res) {
                    if(!(res && !res.error && res.result && res.result.tabid))
                        return;
                    let old_tabid = tabid;
                    ({tabid, local_config} = res.result);
                    if(local_config && local_config.READ_PLAYER_BLACKLIST)
                        local_config.BLACKLIST.push(...get_player_blacklist());
                    console.log('pakku diag: adopt real tabid=' + tabid);
                    if(old_tabid)
                        void remove_state([`STATS_${old_tabid}`]);
                });
            }, 5000);
        };

        // Set a timeout: if background doesn't respond, use fallback
        let timer = setTimeout(do_fallback, 2000);

        chrome.runtime.sendMessage({
            type: 'get_local_config',
            is_pure_env: is_pure_env,
        }, (res)=>{
            if(resolved) return;
            clearTimeout(timer);

            if(res && !res.error) {
                resolved = true;
                resolve(res.result);
            } else if(res && res.error) {
                console.warn('pakku injected: background config failed, using fallback:', res.error);
                do_fallback();
            } else {
                // Safari may call callback with undefined if background didn't respond properly
                console.warn('pakku injected: no background response, using fallback');
                do_fallback();
            }
        });
    });
}

async function get_local_config(is_pure_env: boolean = false): Promise<LocalizedConfig> {
    if(!local_config) {
        ({tabid, local_config} = await _really_get_local_config(is_pure_env));

        if(local_config.READ_PLAYER_BLACKLIST)
            local_config.BLACKLIST.push(...get_player_blacklist());

        // storage cleanup
        window.onbeforeunload = function() {
            if(unreg_userscript)
                void remove_state([`STATS_${tabid}`, `USERSCRIPT_${tabid}`]);
            else
                void remove_state([`STATS_${tabid}`]);

            // in case of page refresh: clear the badge
            try {
                chrome.runtime.sendMessage({type: 'update_badge', tabid: tabid, text: null})
                    .catch(()=>{});
            } catch(e) {}
        };
    }
    return local_config;
}

void get_local_config();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if(msg.type==='ping') {
        sendResponse({error: null});
    }
    else if(msg.type==='refresh') {
        unreg_userscript = false;
        window.location.reload();
    }
    else if(msg.type==='dump_result') {
        let s = scheduler;
        if(!s) {
            sendResponse({
                error: '当前标签没有弹幕处理结果',
            });
        } else {
            let resp: AjaxResponse = s.dump_result(msg.step, msg.egress);
            if(!resp)
                    sendResponse({
                        error: `处理结果为 ${resp}`,
                    });
            else if(typeof resp.data === 'string')
                try {
                    sendResponse({
                        error: null,
                        text: resp.data,
                        ingress: s!.ingress,
                    });
                } catch(e) {
                    alert(`无法传输弹幕处理结果：\n${(e as Error).message}`);
                }
            else
                sendResponse({
                    error: `处理结果为 ${resp.data.constructor.name}`,
                });
        }
    }
    else if(msg.type==='reload_danmu') {
        local_config = null;
        if(msg.trigger_player && window.reload_danmu_magic)
            window.reload_danmu_magic(msg.key);
    }
    else {
        console.log('pakku injected: unknown chrome message', msg.type);
    }
});

function is_bilibili(origin: string): boolean {
    return origin.endsWith('.bilibili.com') || origin.endsWith('//bilibili.com');
}

let ext_domain = chrome.runtime.getURL('');
if(ext_domain.endsWith('/'))
    ext_domain = ext_domain.slice(0, -1);

function is_proto_view(x: any): x is [ProtobufIngressSeg, ProtobufView] {
    // ts is too weak to inference this, let's add a type guard to teach it
    return x[1].type==='proto_view';
}

window.addEventListener('message', async function(event) {
    if(is_bilibili(event.origin) && event.data.type=='pakku_ping') {
        event.source!.postMessage({
            type: 'pakku_pong',
        }, event.origin as any);
    }
    else if(is_bilibili(event.origin) && event.data.type=='pakku_ajax_request') {
        console.log('pakku diag: got ajax request', event.data.url);
        let sendResponse = (resp: AjaxResponse) => {
            console.log('pakku diag: sendResponse called, resp =', resp ? 'data' : 'null');
            event.source!.postMessage({
                type: 'pakku_ajax_response',
                url: event.data.url,
                resp: resp,
            }, event.origin as any);
        };

        url_finder.protoapi_img_url = window.localStorage.getItem('wbi_img_url');
        url_finder.protoapi_sub_url = window.localStorage.getItem('wbi_sub_url');

        let url = url_finder.find(event.data.url);
        if(!url) {
            console.log('pakku diag: url NOT matched');
            sendResponse(null);
            return;
        }
        console.log('pakku diag: url matched, ingress=' + url[0].type + ' egress=' + url[1].type);

        if(!local_config) {
            console.log('pakku diag: local_config is null, loading...');
            try {
                local_config = await get_local_config();
                console.log('pakku diag: config loaded OK, GLOBAL_SWITCH=' + local_config.GLOBAL_SWITCH + ' tabid=' + tabid);
            } catch(e: any) {
                console.error('pakku diag: config load FAILED', e?.message || e);
                if(tabid) {
                    let msg = `读取配置时出错\n${e.message || e}\n\nStacktrace:\n${e.stack || '(null)'}\n\nIngress:\n${JSON.stringify(url[0])}`;
                    new MessageStats('error', BADGE_ERR_JS, msg).notify(tabid);
                }

                sendResponse(null);
                return;
            }
        }

        if(
            !local_config.GLOBAL_SWITCH &&
            !(url[0].type==='proto_seg' && url[0].is_magicreload) // still process magic reload requests to avoid HTTP 400
        ) {
            console.log('pakku diag: SKIPPED, global switch is OFF');
            sendResponse(null);
            return;
        }

        if(is_proto_view(url)) {
            console.log('pakku diag: handling as proto_view');
            try {
                handle_proto_view(url[0], event.data.url, local_config, tabid!)
                    .then((ab)=>{
                        sendResponse({
                            data: new Uint8Array(ab),
                        });
                    })
                    .catch((e: any)=>{
                        console.error('pakku diag: proto_view FAILED', e?.message || e);
                        sendResponse(null);
                    });
            } catch(e: any) {
                console.error('pakku diag: proto_view exception', e?.message || e);
                sendResponse(null);
            }
            return;
        }

        console.log('pakku diag: calling handle_task');
        try {
            handle_task(url[0], url[1], sendResponse, local_config, tabid!);
            console.log('pakku diag: handle_task returned');
        } catch(e: any) {
            console.error('pakku diag: handle_task exception', e?.message || e);
            sendResponse(null);
        }
    }
    else if(event.origin===ext_domain && event.data.type==='pakku_userscript_sandbox_request') {
        let res = await userscript_sandbox(event.data.script);
        event.source!.postMessage({
            type: 'pakku_userscript_sandbox_result',
            result: res,
        }, event.origin as any);
    }
    else if(event.origin===ext_domain && event.data.type==='pakku_process_local_request') {
        let config = await get_local_config(true);
        config.GLOBAL_SWITCH = true;

        let res = await process_local(event.data.ingress, event.data.egress, config, tabid!);
        event.source!.postMessage({
            type: 'pakku_process_local_result',
            result: res,
        }, event.origin as any);
    }
},false);