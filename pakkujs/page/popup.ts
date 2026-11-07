import {get_state} from '../background/state';
import {get_config} from '../background/config';
import {HAS} from '../core/api_support';

const IS_SAFARI = process.env.PAKKU_CHANNEL==='safari';

function id(x: string) {
    return document.getElementById(x) as HTMLElement;
}

let options_href = chrome.runtime.getURL('/page/options.html');
(id('pakku-logo') as HTMLAnchorElement).href = options_href;
id('version').textContent = chrome.runtime.getManifest().version;

for(let elem of document.querySelectorAll('a[data-options-link]') as NodeListOf<HTMLAnchorElement>) {
    elem.target = '_blank';
    elem.href = options_href + '#' + elem.dataset.optionsLink;
    elem.title = '调整相关设置';
}

let switch_btn = id('switch');
let hint_text = id('hint-text');

if(HAS.commands) {
    chrome.commands.getAll(function(cmds) {
        for(let cmd of cmds) {
            let elem = id('command-' + cmd.name);
            if(elem) {
                elem.textContent = cmd.shortcut || '';
                if(IS_SAFARI) {
                    // Safari has no chrome://extensions/shortcuts. Shortcuts live in
                    // Safari Settings → Extensions, which cannot be opened by URL.
                    elem.title = '在 Safari 设置 → 扩展 中修改快捷键';
                } else {
                    elem.onclick = function() {
                        void chrome.tabs.create({url: 'chrome://extensions/shortcuts'});
                    };
                }
            }
        }
    });
}

let tabid = 0;
let blacklist_rows: HTMLElement[] = [];

function probe_content_script(): Promise<boolean> {
    return new Promise((resolve) => {
        let done = false;
        let finish = (v: boolean) => {
            if(!done) { done = true; resolve(v); }
        };
        // A tab without our content script never calls back, so bound the wait.
        setTimeout(()=>finish(false), 600);
        try {
            // Chrome MV3 may return a Promise here even with a callback; a tab
            // without our content script rejects it. Swallow that rejection.
            let maybe_promise: any = chrome.tabs.sendMessage(tabid, {type: 'ping'}, (res: any) => {
                finish(!!(res && !res.error));
            });
            if(maybe_promise && typeof maybe_promise.catch === 'function')
                maybe_promise.catch(()=>finish(false));
        } catch(e) {
            finish(false);
        }
    });
}

function get_tabid_and_loadui() {
    let finish = function(d: chrome.tabs.Tab[], how: string) {
        tabid = d[0]?.id || 0;
        console.log('pakku popup: tabid=' + tabid + ' via ' + how);
        void loadui();
    };

    chrome.tabs.query({active: true, currentWindow: true}, function(d) {
        // Safari 的 popover 可能被当作独立窗口，currentWindow 会查不到标签页
        if(d && d.length)
            finish(d, 'currentWindow');
        else
            chrome.tabs.query({active: true, lastFocusedWindow: true}, function(d2) {
                finish(d2 || [], (d2 && d2.length) ? 'lastFocusedWindow' : 'none');
            });
    });
}

async function loadui() {
    let state = await get_state();
    let enabled = state.GLOBAL_SWITCH;

    switch_btn.classList.add(enabled ? 'on' : 'off');
    switch_btn.classList.remove(enabled ? 'off' : 'on');
    switch_btn.textContent = enabled ? '工作中' : '休息中';

    id('pakku-title').classList.remove('display-none');
    id('exception').classList.add('display-none');
    id('result').classList.add('display-none');
    id('userscript-btn').classList.add('display-none');

    for(let row of blacklist_rows)
        row.remove();
    blacklist_rows = [];

    let general = enabled ? '本页面没有发现B站播放器' : 'zzzzzzzzzz'
    if(!tabid) {
        hint_text.textContent = general;
        return;
    }

    let stats = state[`STATS_${tabid}`];
    if(!stats) {
        console.log(
            'pakku popup: no stats for tabid ' + tabid + ', known STATS keys = ' +
            Object.keys(state).filter(k=>k.startsWith('STATS_')).join(',')
        );
        hint_text.textContent = general;
        // Safari-only: "No stats" does not mean "no player" — the content script
        // can be alive and merging danmaku while stats have not been produced yet
        // (fresh reload, or the background fell back to public defaults). Ask the
        // tab directly instead of showing the misleading "no player found".
        // Gated on IS_SAFARI so Chrome/Firefox keep their exact existing wording.
        if(IS_SAFARI)
            void probe_content_script().then(alive => {
                if(alive && hint_text.textContent === general)
                    hint_text.textContent = '扩展已就绪，正在等待弹幕数据';
            });
        return;
    }

    if(stats.type==='message') {
        hint_text.textContent = stats.message;
    }
    else if(stats.type==='error') {
        id('pakku-title').classList.add('display-none');
        id('exception').classList.remove('display-none');
    }
    else if(stats.type==='done') {
        id('pakku-title').classList.add('display-none');
        id('result').classList.remove('display-none');
        (id('link-danmu-count') as HTMLAnchorElement).href = chrome.runtime.getURL(`/page/view_result.html?tabid=${tabid}`);

        if(stats['deleted_blacklist_each']) {
            let blacklist_matches = Object.entries(stats['deleted_blacklist_each']).sort((a, b) => a[1] - b[1]);
            let blacklist_insertion_point = id('blacklist-insertion-point');
            for(let [name, count] of blacklist_matches) {
                let row = document.createElement('tr');
                blacklist_insertion_point.insertAdjacentElement('afterend', row);
                blacklist_rows.push(row);

                row.className = 'status-header-deleted';

                row.appendChild(document.createElement('td'));

                let col_name = document.createElement('td');
                col_name.textContent = '▸' + name;
                col_name.title = name;
                row.appendChild(col_name);

                let col_count = document.createElement('td');
                col_count.textContent = ''+count;
                row.appendChild(col_count);
            }
        }
    }

    for(let name in stats)
        if(id('status-' + name)) {
            let r = (stats as any)[name];
            let elem = id('status-' + name);
            let row = elem.closest('tr');
            if(row) {
                if(r==='' || r===0)
                    row.classList.add('display-none');
                else
                    row.classList.remove('display-none');
            }
            elem.textContent = (typeof r === 'number') ? Math.ceil(r) : r;
        }

    for(let category of ['combined', 'deleted', 'ignored', 'modified', 'info']) {
        let rows = Array.from(document.querySelectorAll(`.status-header-${category}:not(.display-none)`));
        for(let row of rows) {
            row.classList.remove('first-item');
        }
        if(rows.length)
            rows[0].classList.add('first-item');
    }

    let config = await get_config();
    if(config.ADVANCED_USER) {
        id('userscript-btn').classList.remove('display-none');
        id('userscript-btn').onclick = function() {
            void chrome.tabs.create({url: chrome.runtime.getURL('/page/userscript_editor.html?tabid='+tabid)});
        };
    }
}

switch_btn.addEventListener('click', async function() {
    await chrome.runtime.sendMessage({type: 'toggle_switch'});
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if(request.type==='reload_popup_state') {
        if(!request.tabid || request.tabid===tabid) {
            console.log('pakku popup: reload state');
            void loadui();
        }
    }
});

get_tabid_and_loadui();