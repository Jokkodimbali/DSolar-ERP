import parser from '@typescript-eslint/parser';
import ts from '@typescript-eslint/eslint-plugin';
import prettier from 'eslint-config-prettier';
export default [
  { ignores: ['dist/**', '.angular/**', 'node_modules/**', 'coverage/**', 'out-tsc/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser, parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname } },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...ts.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  prettier,
];
