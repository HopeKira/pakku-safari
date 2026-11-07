import {get_config} from '../background/config';
import {get_state, HAS_SESSION_STORAGE} from '../background/state';
import {HAS} from '../core/api_support';
import {WorkerMaker} from '../core/worker_pool';

let debug = document.getElementById('debug')!;
let error = document.getElementById('error')!;

function stringify_error(e: any) {
    return (e instanceof Error) ? (`${e.message} (${JSON.stringify(e.stack)})`) : JSON.stringify(e);
}

window.addEventListener('error', (e)=>{
    error.textContent += '\n\n**Exception:** `' + stringify_error(e.error) + '`';
});
window.addEventListener('unhandledrejection', (e)=>{
    error.textContent += '\n\n**Exception in Promise:** `' + stringify_error(e.reason) + '`';
});

debug.textContent += '<summary>[Debug Info]</summary>';
debug.textContent += '\n\n**Version:** ' + chrome.runtime.getManifest().version;
debug.textContent += '\n\n**Channel:** safari';
debug.textContent += '\n\n**User Agent:** `' + navigator.userAgent + '`';
debug.textContent += '\n\n**Has Session Storage:** `' + JSON.stringify(HAS_SESSION_STORAGE) + '`';

// This page is itself a diagnostic tool, so a missing API must not break it.
debug.textContent += '\n\n**API:** `' + JSON.stringify(HAS) + '`';
debug.textContent += '\n\n**Background:** `persistent background page (no service worker expected)`';

if(HAS.permissions) {
    chrome.permissions.getAll(function(perms) {
        debug.textContent += '\n\n**Permissions:** `' + JSON.stringify(perms) + '`';
    });
}

if(HAS.declarativeNetRequest) {
    chrome.declarativeNetRequest.getDynamicRules(function(rules) {
        debug.textContent += '\n\n**DNR Rules:** `' + JSON.stringify(rules) + '`';
    });
}

// Content scripts are declared statically in manifest.json (including
// world: 'MAIN'), so there is no getRegisteredContentScripts() to query.

debug.textContent += '\n\n**localStorage:** `' + JSON.stringify(localStorage) + '`';
get_config().then((config)=>{
    debug.textContent += '\n\n**Config:** `' + JSON.stringify(config) + '`';
}, (e)=>{
    debug.textContent += '\n\n**Config:** FAILED `' + stringify_error(e) + '`';

    chrome.storage.local.get((config)=>{
        if(chrome.runtime.lastError) {
            debug.textContent += '\n\n**Config (storage):** FAILED `' + chrome.runtime.lastError + '`';
        } else {
            debug.textContent += '\n\n**Config (storage):** `' + JSON.stringify(config) + '`';
        }
    });
});
get_state().then((state)=>{
    debug.textContent += '\n\n**State:** `' + JSON.stringify(state) + '`';
}, (e)=>{
    debug.textContent += '\n\n**State:** FAILED `' + stringify_error(e) + '`';

    let store = HAS_SESSION_STORAGE ? chrome.storage.session : chrome.storage.local;
    store.get((state)=>{
        if(chrome.runtime.lastError) {
            debug.textContent += '\n\n**State (storage):** FAILED `' + chrome.runtime.lastError + '`';
        } else {
            debug.textContent += '\n\n**State (storage):** `' + JSON.stringify(state) + '`';
        }
    });
});

chrome.tabs.query({}, function(tabs) {
    debug.textContent += '\n\n**Tabs:**';
    for(let tab of tabs) {
        debug.textContent += '\n\n- ID=' + tab.id + ' status=' + tab.status + ' `' + tab.url + '`';
    }
});

fetch(chrome.runtime.getURL('/assets/similarity-gen.wasm'))
    .then((resp)=>resp.arrayBuffer())
    .then((buf)=>{
        let val = WebAssembly.validate(buf)
        debug.textContent += '\n\n**Wasm Validate:** `' + val + '` (' + buf.byteLength +  ' bytes)';
    });

async function test_worker() {
    let maker = new WorkerMaker();
    await maker.spawn();
    debug.textContent += '\n\n**Worker is Simulated:** `' + maker.use_simulated + '`';
}
void test_worker();

(async function() {
    throw new Error('async error log is working');
})();
throw new Error('error log is working');

// DO NOT PUT ANYTHING BEYOND THIS LINE because the previous stmt will throw
