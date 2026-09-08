
      export function BadListPage() {
        const { data } = useGetListQuery();
        const tabs = [{ key: 'all', label: 'All' }];
        return <Table data={data} />;
      }
      