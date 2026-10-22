import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.artifacts/**', 'qa-report/evidence/**'],
  },
  ...tseslint.configs.recommended,
  { files: ['tests/fixtures/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
