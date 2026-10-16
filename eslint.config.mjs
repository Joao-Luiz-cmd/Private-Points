import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.expo/**', 'supabase/functions/**', 'coverage/**', 'tools/**'] },
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error', // spec 68: any só com justificativa (eslint-disable + comentário)
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Regra de arquitetura: o domínio é puro (sem React, Supabase ou módulos nativos).
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-native*', 'expo*', '@supabase/*', '@/services/*', '@/supabase/*'] }],
    },
  },
);
