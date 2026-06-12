import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest
            },
            ecmaVersion: 2022,
            sourceType: 'module'
        },
        rules: {
            'indent': ['error', 4],
            'linebreak-style': ['error', 'windows'],
            'quotes': ['error', 'single'],
            'semi': ['error', 'always'],
            'no-unused-vars': 'warn',
            'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
            'camelcase': ['error', { properties: 'never' }]
        }
    }
];