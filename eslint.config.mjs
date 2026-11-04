import nextVitals from 'eslint-config-next/core-web-vitals';
import tseslint from 'typescript-eslint';

const webOnly = nextVitals.map((config) => ({
  ...config,
  files: ['apps/web/**/*.{ts,tsx}'],
  settings: { ...config.settings, next: { rootDir: 'apps/web/' } },
}));

export default [
  { ignores: ['**/node_modules/**', '**/.next/**', '**/next-env.d.ts', 'apps/web/src/ui/**'] },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['apps/api/**/*.ts', 'packages/**/*.ts', '*.ts'],
  })),
  ...webOnly,
];
