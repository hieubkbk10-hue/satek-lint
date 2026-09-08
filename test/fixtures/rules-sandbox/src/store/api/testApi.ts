
      export const testApi = baseApi.injectEndpoints({
        endpoints: (builder) => ({
          getItem: builder.query({
            query: () => '/items',
            transformResponse: (res) => res.filter(d => String(d.id) === '1'), // Normal logic, valid!
            providesTags: (result) => [{ type: 'Item', id: String(result.id) }], // Forbidden in tag!
          }),
        }),
      });
      