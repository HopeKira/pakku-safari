const { createFilter } = require("rollup-pluginutils");
const alias = require('@rollup/plugin-alias');

// based on https://github.com/TrySound/rollup-plugin-string
function templating(opts = {}) {
    function minify(code) {
        return code
            .replace(/^\s+/mg, '') // remove indentations
            .replace(/[\r\n]/g, ''); // remove linebreaks
    }

    const filter = createFilter('**/*.template.js', null);
    return {
        name: "templating",
        transform(code, id) {
            if(filter(id)) {
                return {
                    code: `export default ${JSON.stringify(minify(code))};`,
                    map: {mappings: ""},
                };
            }
        },
    };
}

function firefox_manifest(src, path) {
    if(path.endsWith('manifest.json')) {
        let obj = JSON.parse(src);

        delete obj.minimum_chrome_version;

        // https://github.com/w3c/webextensions/issues/119
        obj.host_permissions = obj.host_permissions.concat(obj.optional_host_permissions);
        delete obj.optional_host_permissions;

        // https://github.com/mozilla/web-ext/issues/2532
        obj.background.scripts = [obj.background.service_worker];
        delete obj.background.service_worker;

        obj.browser_specific_settings = {
            gecko: {
                id: '{646d57f4-d65c-4f0d-8e80-5800b92cfdaa}',
                strict_min_version: '113.0',
                // version requirement due to:
                // - https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest
                // - https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API
            },
        };

        return JSON.stringify(obj);
    }
}

function safari_manifest(src, path) {
    if(path.endsWith('manifest.json')) {
        let obj = JSON.parse(src);

        // Chrome-only field; Safari ignores it and the converter warns about unknown keys.
        delete obj.minimum_chrome_version;

        // Safari has no optional_host_permissions. Fold ws/wss into host_permissions
        // so BREAK_UPDATE keeps its grant without a runtime permission request.
        if (obj.optional_host_permissions) {
            obj.host_permissions = obj.host_permissions.concat(obj.optional_host_permissions);
            delete obj.optional_host_permissions;
        }

        if (obj.permissions) {
            // Safari has no chrome.notifications at all: declaring it only produces a
            // converter warning and an unnecessary permission prompt. The runtime
            // guards in core/api_support.ts already handle its absence.
            obj.permissions = obj.permissions
                .filter(p => p !== 'notifications')
                .map(p => p === 'declarativeNetRequestWithHostAccess' ? 'declarativeNetRequest' : p);
        }

        // Safari opens the options page itself (from its own extension settings);
        // open_in_tab is Chrome/Firefox-only and the converter warns about it.
        if (obj.options_ui)
            delete obj.options_ui.open_in_tab;

        // Safari loads a persistent background page, not a service worker.
        if (obj.background && obj.background.service_worker) {
            obj.background.scripts = [obj.background.service_worker];
            delete obj.background.service_worker;
        }

        // Safari 18+ honours content_scripts[].world = 'MAIN', so xhr_hook.js can be
        // injected by the browser directly into the page world. The old approach
        // (an ISOLATED injector that appends a <script src=extension-url> tag) is
        // subject to the page CSP, costs an extra DOM injection and needs the hook
        // to be a web-accessible resource. It is still kept for Chrome/Firefox
        // versions without `world` support, but Safari no longer needs it.
        const HOOK_MATCHES = ['*://*.bilibili.com/*'];
        const HOOK_EXCLUDES = [
            'https://www.bilibili.com/robots.txt?pakku_sandbox',
            'https://message.bilibili.com/*',
        ];

        obj.content_scripts.push({
            matches: HOOK_MATCHES,
            exclude_matches: HOOK_EXCLUDES,
            js: ['/generated/xhr_hook.js'],
            run_at: 'document_start',
            world: 'MAIN',
        });

        obj.content_scripts.push({
            matches: HOOK_MATCHES,
            exclude_matches: HOOK_EXCLUDES,
            css: ['/generated/injected.css'],
            run_at: 'document_start',
        });

        return JSON.stringify(obj);
    }
}

module.exports = function(grunt) {
    require('load-grunt-tasks')(grunt);
    let typescript = require('@rollup/plugin-typescript');
    let commonjs = require('@rollup/plugin-commonjs');
    let {nodeResolve} = require('@rollup/plugin-node-resolve');
    let alias = require('@rollup/plugin-alias');
    let replace = require('@rollup/plugin-replace');

    const NORMAL_DIR = [
        'assets',
        'page',
    ];

    function make_filelist(list, src_type, src_dir = 'pakkujs', dest_dir = 'dist/_') {
        return list.map(function(x) {
            return {
                expand: true,
                cwd: src_dir + '/' + x,
                src: src_type,
                dest: dest_dir + '/' + x + '/',
            };
        });
    }

    const COPY_FILES = [
        ...make_filelist(['assets'], ['**/*']),
        ...make_filelist(['page'], ['**/*.html', 'img/*']),
        {
            src: ['pakkujs/LICENSE.txt'],
            dest: 'dist/_/LICENSE.txt',
        },
    ];

    const MANIFEST_FILES = [
        {
            src: ['pakkujs/manifest.json'],
            dest: 'dist/_/manifest.json',
        },
    ];

    const ROLLUP_FILES = {
        'dist/_/generated/background.js': 'pakkujs/background/background.ts',
        'dist/_/generated/xhr_hook.js': 'pakkujs/content_script/xhr_hook.ts',
        'dist/_/generated/content_script.js': 'pakkujs/content_script/main.ts',
        'dist/_/generated/combine_worker.js': 'pakkujs/core/combine_worker.ts',
        'dist/_/generated/injected.js': 'pakkujs/injected/do_inject.ts',
        'dist/_/generated/options.js': 'pakkujs/page/options.ts',
        'dist/_/generated/popup.js': 'pakkujs/page/popup.ts',
        'dist/_/generated/troubleshooting.js': 'pakkujs/page/troubleshooting.ts',
        'dist/_/generated/view_result.js': 'pakkujs/page/view_result.ts',
        'dist/_/generated/parse_local.js': 'pakkujs/page/parse_local.ts',
        'dist/_/generated/userscript_editor.js': 'pakkujs/page/userscript_editor.ts',
    };

    const TERSER_FILES = Object.fromEntries(Object.keys(ROLLUP_FILES).map(k => [k, [k]]));

    function ROLLUP_PLUGINS(channel) {
        return [
            templating(),
            typescript({
                cacheDir: 'dist/ts_cache',
                outputToFilesystem: true,
            }),
            nodeResolve({
                browser: true,
            }),
            alias({
                entries: [
                    {find: 'protobufjs/minimal', replacement: 'protobufjs/dist/minimal/protobuf.min.js'},
                ],
            }),
            commonjs(),
            replace({
                preventAssignment: true,
                'eval': 'undefined', // https://github.com/protobufjs/protobuf.js/issues/593
               'process.env.PAKKU_CHANNEL': `"${channel}"`,
            }),
        ];
    }

    grunt.initConfig({
        watch: {
            scripts: {
                files: 'pakkujs/**/*',
                tasks: ['dev'],
                options: {
                    interrupt: true,
                },
            },
        },

        rollup: {
            options: {
                shimMissingExports: true,
            },
            chrome: {
                files: ROLLUP_FILES,
                options: {
                    plugins: ROLLUP_PLUGINS('chrome'),
                },
            },
            edg: {
                files: ROLLUP_FILES,
                options: {
                    plugins: ROLLUP_PLUGINS('edg'),
                },
            },
            firefox: {
                files: ROLLUP_FILES,
                options: {
                    plugins: ROLLUP_PLUGINS('firefox'),
                },
            },
            safari: {
                files: ROLLUP_FILES,
                options: {
                    plugins: ROLLUP_PLUGINS('safari'),
                },
            },
        },

        clean: {
            tmp: ['dist/tmp/'],
            dist: ['dist/_/'],
            chrome: ['dist/C/'],
            edg: ['dist/E/'],
            firefox: ['dist/F/'],
            safari: ['dist/S/'],
        },

        copy: {
            options: {
                noProcess: '**/*.{png,woff}',
            },

            assets: {
                files: COPY_FILES,
            },

            firefox_manifest: {
                files: MANIFEST_FILES,
                options: {
                    process: firefox_manifest,
                },
            },

            chrome_manifest: {
                files: MANIFEST_FILES,
            },
            safari_manifest: {
                files: MANIFEST_FILES,
                options: {
                    process: safari_manifest,
                },
            },
        },

        move: {
            chrome: {
                src: ['dist/_/'],
                dest: 'dist/C',
            },
            edg: {
                src: ['dist/_/'],
                dest: 'dist/E',
            },
            firefox: {
                src: ['dist/_/'],
                dest: 'dist/F',
            },
            safari: {
                src: ['dist/_/'],
                dest: 'dist/S',
            },
        },

        htmlmin: {
            options: {
                collapseBooleanAttributes: true,
                collapseWhitespace: true,
                conservativeCollapse: true,
                removeAttributeQuotes: true,
                minifyCSS: true,
            },

            gen: {
                files: make_filelist(NORMAL_DIR, ['**/*.html']),
            },
        },

        cssmin: {
            options: {
                level: 2,
            },

            gen: {
                files: {
                    'dist/_/generated/injected.css': ['pakkujs/injected/*.css'],
                },
                options: {
                    sourceMap: false,
                },
            },
        },

        terser: {
            options: {
                module: true,
                ecma: 2020,
                keep_classnames: true,
                keep_fnames: true,
            },

            production: {
                files: TERSER_FILES,
            },
        },

        compress: {
            options: {
                level: 9,
            },

            chrome: {
                files: [
                    {
                        expand: true,
                        cwd: 'dist/C/',
                        src: ['**/*'],
                    },
                ],
                options: {
                    archive: 'dist/Chrome-pakku.zip',
                },
            },
            edg: {
                files: [
                    {
                        expand: true,
                        cwd: 'dist/E/',
                        src: ['**/*'],
                    },
                ],
                options: {
                    archive: 'dist/Edg-pakku.zip',
                },
            },
            firefox: {
                files: [
                    {
                        expand: true,
                        cwd: 'dist/F/',
                        src: ['**/*'],
                    },
                ],
                options: {
                    archive: 'dist/Firefox-pakku.zip',
                },
            },
            safari: {
                files: [
                    {
                        expand: true,
                        cwd: 'dist/S/',
                        src: ['**/*'],
                    },
                ],
                options: {
                    archive: 'dist/Safari-pakku.zip',
                },
            },
            src: {
                files: [
                    {
                        expand: true,
                        src: ['Gruntfile.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'pakkujs/**/*'],
                    },
                    {
                        expand: true,
                        src: 'BUILD_FIREFOX.txt',
                        rename: () => 'README.txt',
                    },
                ],
                options: {
                    archive: 'dist/src.zip',
                },
            },
        },
    });

    grunt.registerTask('_common', [
        'clean:tmp',
        'clean:dist',
        'copy:assets',
        'cssmin:gen',
        'htmlmin:gen',
    ])
    grunt.registerTask('dev', [
        '_common',
        'rollup:chrome',
        'copy:chrome_manifest',
    ]);
    grunt.registerTask('chrome', [
        '_common',
        'rollup:chrome',
        'clean:chrome',
        'terser:production',
        'copy:chrome_manifest',

        'move:chrome',
        'compress:chrome',
    ]);
    grunt.registerTask('edg', [
        '_common',
        'rollup:edg',
        'clean:edg',
        'terser:production',
        'copy:chrome_manifest',

        'move:edg',
        'compress:edg',
    ]);
    grunt.registerTask('firefox', [
        '_common',
        'rollup:firefox',
        'clean:firefox',
        'terser:production',
        'copy:firefox_manifest',

        'move:firefox',
        'compress:firefox',
    ]);
    grunt.registerTask('safari', [
        '_common',
        'rollup:safari',
        'clean:safari',
        'terser:production',
        'copy:safari_manifest',

        'move:safari',
        'compress:safari',
    ]);
    grunt.registerTask('src', [
        'compress:src',
    ]);

};