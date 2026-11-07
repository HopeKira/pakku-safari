// Safari-only build for pakku.
// The upstream project built chrome / edg / firefox / safari from one tree with
// per-channel manifest rewriting. This fork only targets Safari on macOS, so the
// manifest is already in its native form and there is a single build target.

const { createFilter } = require("rollup-pluginutils");

// based on https://github.com/TrySound/rollup-plugin-string
function templating() {
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

module.exports = function(grunt) {
    require('load-grunt-tasks')(grunt);
    const typescript = require('@rollup/plugin-typescript');
    const commonjs = require('@rollup/plugin-commonjs');
    const {nodeResolve} = require('@rollup/plugin-node-resolve');
    const alias = require('@rollup/plugin-alias');
    const replace = require('@rollup/plugin-replace');

    const NORMAL_DIR = ['assets', 'page'];

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

    function ROLLUP_PLUGINS() {
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
            }),
        ];
    }

    grunt.initConfig({
        watch: {
            scripts: {
                files: 'pakkujs/**/*',
                tasks: ['build'],
                options: {
                    interrupt: true,
                },
            },
        },

        rollup: {
            options: {
                shimMissingExports: true,
            },
            build: {
                files: ROLLUP_FILES,
                options: {
                    plugins: ROLLUP_PLUGINS(),
                },
            },
        },

        clean: {
            tmp: ['dist/tmp/'],
            dist: ['dist/_/'],
            safari: ['dist/S/'],
        },

        copy: {
            options: {
                noProcess: '**/*.{png,woff}',
            },
            assets: {
                files: COPY_FILES,
            },
            manifest: {
                files: [{
                    src: ['pakkujs/manifest.json'],
                    dest: 'dist/_/manifest.json',
                }],
            },
        },

        move: {
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
            safari: {
                files: [{
                    expand: true,
                    cwd: 'dist/S/',
                    src: ['**/*'],
                }],
                options: {
                    archive: 'dist/Safari-pakku.zip',
                },
            },
        },
    });

    grunt.registerTask('build', [
        'clean:tmp',
        'clean:dist',
        'copy:assets',
        'cssmin:gen',
        'htmlmin:gen',
        'rollup:build',
        'clean:safari',
        'terser:production',
        'copy:manifest',
        'move:safari',
        'compress:safari',
    ]);
    grunt.registerTask('dev', ['build']);
    grunt.registerTask('default', ['build']);
};
