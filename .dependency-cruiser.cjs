const API = '^apps/api/src';
const WEB = '^apps/web/src';

const forbid = (name, from, to) => ({
  name,
  severity: 'error',
  // Tests may import test doubles from adapters/ and set up data directly.
  from: { path: from, pathNot: '\\.test\\.ts$' },
  to: { path: to },
});

module.exports = {
  forbidden: [
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    // An import that cannot be resolved would slip past every path rule below.
    { name: 'no-unresolvable', severity: 'error', from: {}, to: { couldNotResolve: true } },

    forbid('web-not-import-api', '^apps/web', '^apps/api'),
    forbid('api-not-import-web', '^apps/api', '^apps/web'),
    forbid('contract-not-import-apps', '^packages/contract', '^apps/'),

    {
      name: 'domain-imports-nothing',
      severity: 'error',
      from: { path: `${API}/domain/`, pathNot: '\\.test\\.ts$' },
      to: { pathNot: `${API}/domain/` },
    },
    forbid('http-layer', `${API}/http/`, `${API}/(db|ports|adapters|main)`),
    forbid('services-layer', `${API}/services/`, `${API}/(http|adapters|main)`),
    forbid('db-layer', `${API}/db/`, `${API}/(http|services|ports|adapters|main)`),
    forbid('ports-layer', `${API}/ports/`, `${API}/(http|services|db|adapters|main)`),
    forbid('adapters-layer', `${API}/adapters/`, `${API}/(http|services|db|main)`),

    {
      name: 'features-not-import-each-other',
      severity: 'error',
      from: { path: `${WEB}/features/([^/]+)/` },
      to: { path: `${WEB}/features/`, pathNot: `${WEB}/features/$1/` },
    },
    forbid('app-layer', `${WEB}/app/`, `${WEB}/api/`),
    forbid('features-layer', `${WEB}/features/`, `${WEB}/app/`),
    forbid('api-layer', `${WEB}/api/`, `${WEB}/(app|features|ui)/`),
    forbid('ui-layer', `${WEB}/ui/`, `${WEB}/(app|features|api)/`),
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)\\.next/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'apps/web/tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
