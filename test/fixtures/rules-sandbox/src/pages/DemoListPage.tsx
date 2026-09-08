
      export function DemoListPage() {
        const { data } = useGetDemoQuery();
        return (
          <Table
            data={data}
            pagination={{ pageSize: 20, current: 1 }}
          />
        );
      }
      