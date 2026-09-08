
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
      