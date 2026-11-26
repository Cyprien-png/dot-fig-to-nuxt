import js from '@eslint/js'
import globals from 'globals'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'projects/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The Figma schema is embedded in each file, so raw nodes are untyped by nature.
    files: ['packages/core/src/fig/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
)
