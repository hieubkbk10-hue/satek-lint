import { describe, it } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { runLintEngine } from '../../src/engine/linter.js';

describe('Rule Fixture & Regression Tests', () => {
  const fixtureDir = path.resolve('test/fixtures/rules-sandbox');
  fs.mkdirSync(fixtureDir, { recursive: true });

  it('RULE-IMPORT-004: should detect ../../ imports and allow ../', async () => {
    const violationFile = path.join(fixtureDir, 'ViolationImport.ts');
    fs.writeFileSync(violationFile, "import { something } from '../../components/something';", 'utf8');

    const cleanFile = path.join(fixtureDir, 'CleanImport.ts');
    fs.writeFileSync(cleanFile, "import { something } from '../shared/something';", 'utf8');

    const res = await runLintEngine({ path: fixtureDir, cwd: process.cwd() });
    const import4Violations = res.findings.filter((f) => f.ruleCode === 'RULE-IMPORT-004');

    assert.ok(import4Violations.length >= 1, 'Should detect RULE-IMPORT-004 violation');
    assert.ok(import4Violations.some((f) => f.location.path.includes('ViolationImport.ts')));
    assert.ok(!import4Violations.some((f) => f.location.path.includes('CleanImport.ts')));
  });

  it('RULE-CLEAN-EXPRESSION: should detect {false && <Component />} in JSX', async () => {
    const jsxFile = path.join(fixtureDir, 'StaticJsx.tsx');
    fs.writeFileSync(
      jsxFile,
      'export function Test() { return <div>{false && <span>Hidden</span>}</div>; }',
      'utf8'
    );

    const res = await runLintEngine({ path: jsxFile, cwd: process.cwd() });
    const cleanExprViolations = res.findings.filter((f) => f.ruleCode === 'RULE-CLEAN-EXPRESSION');
    assert.ok(cleanExprViolations.length >= 1, 'Should catch static boolean in JSX');
  });

  it('RULE-MEMO-001: should detect useMemo on query response property read', async () => {
    const memoFile = path.join(fixtureDir, 'MemoTest.tsx');
    fs.writeFileSync(
      memoFile,
      'export function Test(data: any) { const items = useMemo(() => data?.data ?? [], [data]); return null; }',
      'utf8'
    );

    const res = await runLintEngine({ path: memoFile, cwd: process.cwd() });
    const memoViolations = res.findings.filter((f) => f.ruleCode === 'RULE-MEMO-001');
    assert.ok(memoViolations.length >= 1, 'Should catch useless property memo');
  });

  it('RULE-QUERY-006: should detect invalid searchFields operator', async () => {
    const queryFile = path.join(fixtureDir, 'QueryOperator.ts');
    fs.writeFileSync(
      queryFile,
      "export const params = { searchFields: 'name:contains;age:>=' };",
      'utf8'
    );

    const res = await runLintEngine({ path: queryFile, cwd: process.cwd() });
    const opViolations = res.findings.filter((f) => f.ruleCode === 'RULE-QUERY-006');
    assert.ok(opViolations.length >= 1, 'Should detect invalid operator "contains"');
    assert.ok(opViolations.some((f) => f.evidence.includes('contains')));
    assert.ok(!opViolations.some((f) => f.evidence.includes('age:>=')));
  });

  it('RULE-RTK-003: should only flag String(id) inside cache tags, not in normal logic', async () => {
    const apiFile = path.join(fixtureDir, 'StoreApiTest.ts');
    fs.writeFileSync(
      apiFile,
      `
      export const testApi = baseApi.injectEndpoints({
        endpoints: (builder) => ({
          getItem: builder.query({
            query: () => '/items',
            transformResponse: (res) => res.filter(d => String(d.id) === '1'), // Normal logic, valid!
            providesTags: (result) => [{ type: 'Item', id: String(result.id) }], // Forbidden in tag!
          }),
        }),
      });
      `,
      'utf8'
    );

    // Needs to look like store/api
    const storeApiDir = path.join(fixtureDir, 'src/store/api');
    fs.mkdirSync(storeApiDir, { recursive: true });
    const targetPath = path.join(storeApiDir, 'testApi.ts');
    fs.copyFileSync(apiFile, targetPath);

    const res = await runLintEngine({ path: targetPath, cwd: process.cwd() });
    const rtk3Violations = res.findings.filter((f) => f.ruleCode === 'RULE-RTK-003');
    assert.strictEqual(rtk3Violations.length, 1, 'Should flag exactly 1 violation for providesTags String(id)');
  });

  it('RULE-RADIX-001: should allow text-only trigger and flag interactive child missing asChild', async () => {
    const radixFile = path.join(fixtureDir, 'RadixTest.tsx');
    fs.writeFileSync(
      radixFile,
      `
      export function GoodTrigger() {
        return <DropdownMenuTrigger>Text Only</DropdownMenuTrigger>;
      }
      export function IconTrigger() {
        return <DropdownMenuTrigger><ChevronDown /></DropdownMenuTrigger>;
      }
      export function BadTrigger() {
        return (
          <DropdownMenuTrigger>
            <button>Click</button>
          </DropdownMenuTrigger>
        );
      }
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: radixFile, cwd: process.cwd() });
    const radixViolations = res.findings.filter((f) => f.ruleCode === 'RULE-RADIX-001');
    assert.strictEqual(radixViolations.length, 1, 'Should only flag trigger with interactive button child');
  });

  it('RULE-I18N-001: should catch single-accent Vietnamese phrases when component uses i18n', async () => {
    const i18nFile = path.join(fixtureDir, 'I18nTest.tsx');
    fs.writeFileSync(
      i18nFile,
      `
      import { useTranslation } from '@/hooks';
      export function Welcome() {
        const { trans } = useTranslation();
        return <div>Xin chào các bạn</div>;
      }
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: i18nFile, all: true, cwd: process.cwd() });
    const i18nViolations = res.findings.filter((f) => f.ruleCode === 'RULE-I18N-001');
    assert.ok(i18nViolations.length >= 1, 'Should catch "Xin chào các bạn"');
  });

  it('RULE-TYPE-003: should accept .dto.ts and .types.ts, and flag uppercase or non-standard naming', async () => {
    const typesDir = path.join(fixtureDir, 'src/types');
    fs.mkdirSync(typesDir, { recursive: true });

    const dtoFile = path.join(typesDir, 'domain.dto.ts');
    fs.writeFileSync(dtoFile, 'export interface ApiDomain { id: string; }', 'utf8');

    const typesFile = path.join(typesDir, 'domain.types.ts');
    fs.writeFileSync(typesFile, 'export interface DomainItem { id: string; }', 'utf8');

    const upperFile = path.join(typesDir, 'User.types.ts');
    fs.writeFileSync(upperFile, 'export interface User { id: string; }', 'utf8');

    const invalidExtFile = path.join(typesDir, 'customer.ts');
    fs.writeFileSync(invalidExtFile, 'export interface Customer { id: string; }', 'utf8');

    const res = await runLintEngine({ path: typesDir, cwd: process.cwd() });
    const typeViolations = res.findings.filter((f) => f.ruleCode === 'RULE-TYPE-003');

    assert.ok(!typeViolations.some((f) => f.location.path.includes('domain.dto.ts')), 'domain.dto.ts must be valid');
    assert.ok(!typeViolations.some((f) => f.location.path.includes('domain.types.ts')), 'domain.types.ts must be valid');
    assert.ok(typeViolations.some((f) => f.location.path.includes('User.types.ts')), 'User.types.ts should be flagged for uppercase');
    assert.ok(typeViolations.some((f) => f.location.path.includes('customer.ts')), 'customer.ts should be flagged for missing .types.ts or .dto.ts');
  });

  it('RULE-QUERY-004 & RULE-QUERY-007: should allow dynamic template date and static status, flag unhandled status=all', async () => {
    const queryApiDir = path.join(fixtureDir, 'src/store/api');
    fs.mkdirSync(queryApiDir, { recursive: true });
    const apiFile = path.join(queryApiDir, 'queryCheckApi.ts');
    fs.writeFileSync(
      apiFile,
      `
      export const queryCheckApi = baseApi.injectEndpoints({
        endpoints: (builder) => ({
          // Valid dynamic searchDate via template literal from guides
          getExpiring: builder.query({
            query: () => ({
              url: '/items',
              params: {
                status: 'active', // static status: valid, should not trigger RULE-QUERY-004
                searchDate: \`\${today},\${in30Days}|expiration_date\`, // valid dynamic date
              },
            }),
            providesTags: [{ type: 'Item', id: 'LIST' }],
          }),
          // Invalid dynamic status forwarded from params without status !== 'all'
          getWithAll: builder.query({
            query: (params) => {
              const queryParams = { page: 1, limit: DEFAULT_LIMIT };
              if (params?.status) {
                queryParams.status = params.status; // violation: status could be 'all'
              }
              return { url: '/items', params: queryParams };
            },
            providesTags: [{ type: 'Item', id: 'LIST' }],
          }),
        }),
      });
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: apiFile, cwd: process.cwd() });
    const dateViolations = res.findings.filter((f) => f.ruleCode === 'RULE-QUERY-007');
    const statusAllViolations = res.findings.filter((f) => f.ruleCode === 'RULE-QUERY-004');

    assert.strictEqual(dateViolations.length, 0, 'Dynamic template literal searchDate should be valid');
    assert.strictEqual(statusAllViolations.length, 1, 'Should flag exactly the dynamic status without filter');
  });

  it('RULE-LIST-006: should allow module-level tabs after helper function and flag tabs inside component', async () => {
    const pagesDir = path.join(fixtureDir, 'src/components/feature/pages');
    fs.mkdirSync(pagesDir, { recursive: true });
    const goodPage = path.join(pagesDir, 'GoodListPage.tsx');
    fs.writeFileSync(
      goodPage,
      `
      export function formatLabel(s: string) { return s.toUpperCase(); }
      const FILTER_TAB_CONFIG = [{ key: 'all', label: 'All' }];
      export function GoodListPage() {
        const { data } = useGetListQuery();
        return <Table data={data} />;
      }
      `,
      'utf8'
    );

    const badPage = path.join(pagesDir, 'BadListPage.tsx');
    fs.writeFileSync(
      badPage,
      `
      export function BadListPage() {
        const { data } = useGetListQuery();
        const tabs = [{ key: 'all', label: 'All' }];
        return <Table data={data} />;
      }
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: pagesDir, cwd: process.cwd() });
    const tabViolations = res.findings.filter((f) => f.ruleCode === 'RULE-LIST-006');

    assert.ok(!tabViolations.some((f) => f.location.path.includes('GoodListPage.tsx')), 'Module-level tabs must be allowed');
    assert.ok(tabViolations.some((f) => f.location.path.includes('BadListPage.tsx')), 'Tabs inside component must be flagged');
  });

  it('RULE-LIST-005: should detect inline pagination={{ ... }} on Table', async () => {
    const listDir = path.join(fixtureDir, 'src/pages');
    fs.mkdirSync(listDir, { recursive: true });
    const listFile = path.join(listDir, 'DemoListPage.tsx');
    fs.writeFileSync(
      listFile,
      `
      export function DemoListPage() {
        const { data } = useGetDemoQuery();
        return (
          <Table
            data={data}
            pagination={{ pageSize: 20, current: 1 }}
          />
        );
      }
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: listFile, cwd: process.cwd() });
    const paginationViolations = res.findings.filter((f) => f.ruleCode === 'RULE-LIST-005');
    assert.ok(paginationViolations.length >= 1, 'Should catch inline pagination object on Table');
  });

  it('RULE-STATE-001: should detect destructured useState with non-standard boolean names', async () => {
    const stateFile = path.join(fixtureDir, 'StateDestructureTest.tsx');
    fs.writeFileSync(
      stateFile,
      `
      export function FilterBar() {
        const [showFilter, setShowFilter] = useState(false); // Violation
        const [isModalOpen, setIsModalOpen] = useState(false); // Clean
        return <div />;
      }
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: stateFile, cwd: process.cwd() });
    const stateViolations = res.findings.filter((f) => f.ruleCode === 'RULE-STATE-001');
    assert.strictEqual(stateViolations.length, 1, 'Should flag showFilter and allow isModalOpen');
    assert.ok(stateViolations[0].evidence.includes('showFilter'));
  });

  it('RULE-COMPONENT-001: should detect nested arrow function component inside parent component', async () => {
    const nestedFile = path.join(fixtureDir, 'NestedArrowComponent.tsx');
    fs.writeFileSync(
      nestedFile,
      `
      export function ParentCard() {
        const SubItem = () => <div>Item</div>; // Violation: nested component
        return <div><SubItem /></div>;
      }
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: nestedFile, cwd: process.cwd() });
    const nestedViolations = res.findings.filter((f) => f.ruleCode === 'RULE-COMPONENT-001');
    assert.strictEqual(nestedViolations.length, 1, 'Should flag nested arrow function component SubItem');
    assert.ok(nestedViolations[0].evidence.includes('SubItem'));
  });

  it('RULE-I18N-001: should flag Vietnamese translation keys in trans() calls per i18n.md', async () => {
    const transFile = path.join(fixtureDir, 'TransKeyTest.tsx');
    fs.writeFileSync(
      transFile,
      `
      import { useTranslation } from '@/hooks';
      export function ActionBtn() {
        const { trans } = useTranslation();
        return <button>{trans('Tạo tài khoản')}</button>;
      }
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: transFile, all: true, cwd: process.cwd() });
    const i18nKeyViolations = res.findings.filter((f) => f.ruleCode === 'RULE-I18N-001' && f.subcheck === 'vietnamese-as-translation-key');
    assert.strictEqual(i18nKeyViolations.length, 1, 'Should flag Vietnamese string used as key in trans()');
    assert.ok(i18nKeyViolations[0].evidence.includes('Tạo tài khoản'));
  });

  it('RULE-QUERY-008: should not flag CSS filter styles but flag invalid query delimiters', async () => {
    const cssFile = path.join(fixtureDir, 'CssFilterTest.tsx');
    fs.writeFileSync(
      cssFile,
      `
      export function ImageCard() {
        return <div style={{ filter: 'blur(5px), drop-shadow(0 0 10px rgba(0,0,0,0.5))' }} />;
      }
      `,
      'utf8'
    );

    const resCss = await runLintEngine({ path: cssFile, cwd: process.cwd() });
    const cssViolations = resCss.findings.filter((f) => f.ruleCode === 'RULE-QUERY-008');
    assert.strictEqual(cssViolations.length, 0, 'CSS filter must not trigger RULE-QUERY-008');

    const queryFile = path.join(fixtureDir, 'QueryDelimiterTest.ts');
    fs.writeFileSync(
      queryFile,
      `
      export const query = {
        params: {
          include: 'user;roles', // Violation: should use comma
        },
      };
      `,
      'utf8'
    );

    const resQuery = await runLintEngine({ path: queryFile, cwd: process.cwd() });
    const queryViolations = resQuery.findings.filter((f) => f.ruleCode === 'RULE-QUERY-008');
    assert.strictEqual(queryViolations.length, 1, 'Query include with semicolon must trigger RULE-QUERY-008');
  });

  it('RULE-BARREL-001: should accept index.tsx as a valid barrel file', async () => {
    const featureDir = path.join(fixtureDir, 'src/components/barrelTestFeature');
    const pagesDir = path.join(featureDir, 'pages');
    const sharedDir = path.join(featureDir, 'shared');
    fs.mkdirSync(pagesDir, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });

    // Use index.tsx instead of index.ts
    fs.writeFileSync(path.join(featureDir, 'index.tsx'), 'export * from "./pages";', 'utf8');
    fs.writeFileSync(path.join(pagesDir, 'index.tsx'), 'export const DemoPage = () => null;', 'utf8');
    fs.writeFileSync(path.join(sharedDir, 'index.tsx'), 'export const DemoModal = () => null;', 'utf8');

    const res = await runLintEngine({ path: featureDir, cwd: process.cwd() });
    const barrelViolations = res.findings.filter((f) => f.ruleCode === 'RULE-BARREL-001');
    assert.strictEqual(barrelViolations.length, 0, 'index.tsx should satisfy RULE-BARREL-001 without violation');
  });

  it('RULE-COMPONENT-001: should allow top-level arrow function components without false positive', async () => {
    const topLevelCompFile = path.join(fixtureDir, 'TopLevelArrowComponent.tsx');
    fs.writeFileSync(
      topLevelCompFile,
      `
      export const RootComponent = () => {
        return <div>Top Level Component</div>;
      };
      export const AuthenticatedRouteComponent = () => {
        return <div>Route Content</div>;
      };
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: topLevelCompFile, cwd: process.cwd() });
    const nestedViolations = res.findings.filter((f) => f.ruleCode === 'RULE-COMPONENT-001');
    assert.strictEqual(nestedViolations.length, 0, 'Top-level arrow components must not be flagged as nested inside themselves');
  });

  it('RULE-QUERY-003: should not flag detail/lookup endpoints for missing pagination', async () => {
    const detailApiFile = path.join(fixtureDir, 'detailApi.ts');
    fs.writeFileSync(
      detailApiFile,
      `
      import { baseApi } from './baseApi';
      export const domainApi = baseApi.injectEndpoints({
        endpoints: (builder) => ({
          getDomainDetail: builder.query<any, string>({
            query: (id) => ({
              url: '/domains',
              params: { search: id, limit: 10 },
            }),
            providesTags: ['Domain'],
          }),
        }),
      });
      `,
      'utf8'
    );

    const res = await runLintEngine({ path: detailApiFile, cwd: process.cwd() });
    const query3 = res.findings.filter((f) => f.ruleCode === 'RULE-QUERY-003');
    assert.strictEqual(query3.length, 0, 'Detail endpoint with limit should not be flagged as missing pagination');
  });

  it('Noise reduction: should exclude radius and i18n rules by default and include with all: true', async () => {
    const noiseFile = path.join(fixtureDir, 'NoiseTest.tsx');
    fs.writeFileSync(
      noiseFile,
      `
      import { useTranslation } from '@/hooks';
      export const Card = () => {
        const { trans } = useTranslation();
        return (
          <div className="rounded-lg p-4">
            {trans('Đăng ký tài khoản')}
          </div>
        );
      };
      `,
      'utf8'
    );

    // Default scan (without all: true)
    const resDefault = await runLintEngine({ path: noiseFile, cwd: process.cwd() });
    const defaultViolations = resDefault.findings.filter(
      (f) => f.ruleCode === 'RULE-RADIUS-001' || f.ruleCode.startsWith('RULE-I18N-')
    );
    assert.strictEqual(defaultViolations.length, 0, 'Default scan should skip noisy radius and i18n rules');

    // Scan with all: true
    const resAll = await runLintEngine({ path: noiseFile, all: true, cwd: process.cwd() });
    const allViolations = resAll.findings.filter(
      (f) => f.ruleCode === 'RULE-RADIUS-001' || f.ruleCode.startsWith('RULE-I18N-')
    );
    assert.strictEqual(allViolations.length, 2, 'Scan with all: true should report radius and i18n rules');
  });

  it('RULE-FORM-001 & RULE-FORM-002 & RULE-FORM-003: Formik + Yup rules and RECOMMEND priority', async () => {
    // 1. RULE-FORM-001: Modal with fragmented useState
    const formModalFile = path.join(fixtureDir, 'CreateItemModal.tsx');
    fs.writeFileSync(
      formModalFile,
      `
      import { useState } from 'react';
      export function CreateItemModal() {
        const [name, setName] = useState('');
        const [email, setEmail] = useState('');
        const [phone, setPhone] = useState('');
        return <div><input value={name} /></div>;
      }
      `,
      'utf8'
    );

    const resForm1 = await runLintEngine({ path: formModalFile, cwd: process.cwd() });
    const form1Violations = resForm1.findings.filter((f) => f.ruleCode === 'RULE-FORM-001');
    assert.strictEqual(form1Violations.length, 1, 'Should flag modal with 3+ fragmented useState');
    assert.strictEqual(form1Violations[0].priority, 'RECOMMEND', 'RULE-FORM-001 should have RECOMMEND priority');
    assert.strictEqual(resForm1.summary.byPriority.RECOMMEND, 1, 'Summary should count RECOMMEND priority');

    // 2. RULE-FORM-002: Pure Yup schema with trans()
    const yupSchemaFile = path.join(fixtureDir, 'itemSchema.ts');
    fs.writeFileSync(
      yupSchemaFile,
      `
      import * as Yup from 'yup';
      export const itemSchema = Yup.object().shape({
        name: Yup.string().required(trans('Name is required')),
      });
      `,
      'utf8'
    );

    const resForm2 = await runLintEngine({ path: yupSchemaFile, cwd: process.cwd() });
    const form2Violations = resForm2.findings.filter((f) => f.ruleCode === 'RULE-FORM-002');
    assert.strictEqual(form2Violations.length, 1, 'Should flag trans() inside Yup schema');

    // 3. RULE-FORM-003: setFieldTouched missing false third argument
    const raceSelectFile = path.join(fixtureDir, 'RaceModal.tsx');
    fs.writeFileSync(
      raceSelectFile,
      `
      export function RaceModal({ formik }) {
        return (
          <Select
            onChange={(val) => {
              formik.setFieldTouched('members', true);
              formik.setFieldValue('members', val);
            }}
          />
        );
      }
      `,
      'utf8'
    );

    const resForm3 = await runLintEngine({ path: raceSelectFile, cwd: process.cwd() });
    const form3Violations = resForm3.findings.filter((f) => f.ruleCode === 'RULE-FORM-003');
    assert.strictEqual(form3Violations.length, 1, 'Should flag setFieldTouched with shouldValidate=true');
  });
});
