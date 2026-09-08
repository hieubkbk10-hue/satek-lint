
      export const queryCheckApi = baseApi.injectEndpoints({
        endpoints: (builder) => ({
          // Valid dynamic searchDate via template literal from guides
          getExpiring: builder.query({
            query: () => ({
              url: '/items',
              params: {
                status: 'active', // static status: valid, should not trigger RULE-QUERY-004
                searchDate: `${today},${in30Days}|expiration_date`, // valid dynamic date
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
      