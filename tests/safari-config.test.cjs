const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function declaration(path, name) {
  const source = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const node = source.statements.find(n => n.name?.text === name ||
    (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.text === name)));
  assert.ok(node, `Missing declaration ${name}`);
  return node.getText(source).replace(/^export /, '');
}
function harness() {
  let callback, timeout;
  const context = vm.createContext({
    console: {log() {}, warn() {}, error() {}}, Date,
    setTimeout(fn) { timeout = fn; }, clearTimeout() {},
    chrome: {runtime: {lastError: null, sendMessage(_message, cb) {callback = cb;}}},
    get_player_blacklist() { return []; },
  });
  const code = declaration('pakkujs/background/config.ts', 'DEFAULT_CONFIG') + '\n' +
    declaration('pakkujs/content_script/main.ts', '_really_get_local_config') +
    '\nglobalThis.defaults = DEFAULT_CONFIG; globalThis.readConfig = _really_get_local_config;';
  vm.runInContext(ts.transpileModule(code, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText, context);
  return {context, expire() {timeout();}, respond(value) {callback(value);}};
}
function plain(value) {return JSON.parse(JSON.stringify(value));}
function expected(h, pure) {
  return {...plain(h.context.defaults), READ_PLAYER_BLACKLIST: !pure,
    BLACKLIST: [], GLOBAL_SWITCH: true, SKIP_INJECT: pure};
}

test('timeout uses public defaults instead of exported personal preferences', async () => {
  const h = harness(); const pending = h.context.readConfig(false); h.expire();
  const {local_config: config} = await pending;
  assert.deepEqual(plain(config), expected(h, false));
});
test('background errors use public defaults in pure mode', async () => {
  const h = harness(); const pending = h.context.readConfig(true);
  h.respond({error: 'unavailable'});
  const {local_config: config} = await pending;
  assert.deepEqual(plain(config), expected(h, true));
});
test('a successful response preserves the saved disabled switch', async () => {
  const h = harness(); const pending = h.context.readConfig(false);
  const saved = {...expected(h, false), GLOBAL_SWITCH: false}; h.respond({result: {local_config: saved, tabid: 42}});
  const {local_config: config, tabid} = await pending;
  assert.equal(config.GLOBAL_SWITCH, false); assert.equal(tabid, 42);
});
test('mutating fallback arrays cannot change public defaults or another read', async () => {
  const h = harness(); const baseline = plain(h.context.defaults);
  const first = h.context.readConfig(false); h.expire(); const {local_config: config} = await first;
  config.FORCELIST[0][1] = 'changed'; config.WHITELIST.push(['x', 'y']);
  assert.deepEqual(plain(h.context.defaults), baseline);
  const second = h.context.readConfig(false); h.expire();
  assert.deepEqual(plain((await second).local_config), expected(h, false));
});
