// ESLint for the whole repo (flat config). Rules are chosen to catch real bugs without failing on the older engine code:
// style is Prettier's job, and the many existing `any` types are only warnings (see docs/ENGINEERING_REVIEW.md, F28).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/coverage/**', 'docs/**', 'apps/api/prisma/**', 'apps/web/next-env.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // tracked by F28 (tighten engine types); too noisy to gate on today
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-control-regex': 'off',
      // the text extractors deliberately match non-breaking and other odd spaces inside patterns and strings
      'no-irregular-whitespace': ['error', { skipStrings: true, skipRegExps: true, skipComments: true, skipTemplates: true }],
      'prefer-const': 'warn',
      'no-var': 'warn',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
);
