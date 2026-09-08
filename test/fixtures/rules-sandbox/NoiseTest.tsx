
      import { useTranslation } from '@/hooks';
      export const Card = () => {
        const { trans } = useTranslation();
        return (
          <div className="rounded-lg p-4">
            {trans('Đăng ký tài khoản')}
          </div>
        );
      };
      