
      export function formatLabel(s: string) { return s.toUpperCase(); }
      const FILTER_TAB_CONFIG = [{ key: 'all', label: 'All' }];
      export function GoodListPage() {
        const { data } = useGetListQuery();
        return <Table data={data} />;
      }
      