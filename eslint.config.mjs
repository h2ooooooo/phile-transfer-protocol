import stylistic from '@stylistic/eslint-plugin';
import parser from '@typescript-eslint/parser';
import typescript from '@typescript-eslint/eslint-plugin';

export default [
    {
        ignores: ['**/node_modules/**', '**/vendor/**', '**/dist/**', '**/coverage/**', '**/tmp/**', 'docs/.vitepress/cache/**', 'ptp-server-old-backup-ignore/**', '.serena/**'],
    },
    {
        files: ['ptp-client/**/*.ts', 'ptp-client-ui/**/*.ts', 'ptp-client-ui/**/*.cjs', 'ptp-wordpress/**/*.js', 'ptp-wordpress/**/*.cjs', 'scripts/**/*.cjs', '*.mjs', 'docs/.vitepress/**/*.ts', 'docs/.vitepress/**/*.mts'],
        languageOptions: {parser},
        plugins: {'@stylistic': stylistic, '@typescript-eslint': typescript},
        rules: {
            curly: ['error', 'all'],
            'no-nested-ternary': 'error',
            '@stylistic/quotes': ['error', 'single', {avoidEscape: true}],
            '@stylistic/brace-style': ['error', '1tbs', {allowSingleLine: false}],
            '@stylistic/indent': ['error', 4, {SwitchCase: 1}],
            '@stylistic/semi': ['error', 'always'],
            '@stylistic/comma-spacing': 'error',
            '@stylistic/key-spacing': 'error',
            '@stylistic/keyword-spacing': 'error',
            '@stylistic/space-infix-ops': 'error',
            '@stylistic/arrow-spacing': 'error',
            '@stylistic/object-curly-spacing': ['error', 'never'],
            '@stylistic/max-statements-per-line': ['error', {max: 1}],
            '@stylistic/no-multiple-empty-lines': ['error', {max: 1, maxEOF: 0}],
            '@stylistic/eol-last': ['error', 'always'],
            '@stylistic/no-trailing-spaces': 'error',
            '@stylistic/linebreak-style': ['error', 'unix'],
            '@stylistic/type-annotation-spacing': 'error',
            '@stylistic/space-before-function-paren': ['error', {anonymous: 'always', named: 'never', asyncArrow: 'always'}],
            '@stylistic/padding-line-between-statements': ['error',
                {blankLine: 'always', prev: '*', next: ['return', 'throw', 'if', 'for', 'while', 'try']},
                {blankLine: 'always', prev: ['const', 'let', 'var', 'block-like'], next: '*'},
                {blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var']},
            ],
        },
    },
    {
        files: ['ptp-client/src/**/*.ts'],
        ignores: ['**/*.d.ts'],
        rules: {'@typescript-eslint/explicit-member-accessibility': ['error', {accessibility: 'explicit'}]},
    },
];
