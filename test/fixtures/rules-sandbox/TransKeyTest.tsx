
      import { useTranslation } from '@/hooks';
      export function ActionBtn() {
        const { trans } = useTranslation();
        return <button>{trans('Tạo tài khoản')}</button>;
      }
      