'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('');
  const { t } = useI18n();

  useEffect(() => {
    setStatus(t.auth.processing);
    const token = searchParams.get('token');
    const error = searchParams.get('error');
    const addedEmail = searchParams.get('added');
    const reauthedEmail = searchParams.get('reauthed');
    const feature = searchParams.get('feature');
    const returnTo = searchParams.get('return_to');
    const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/settings/accounts';

    if (error) {
      setStatus(t.auth.failed.replace('{error}', error));
      return;
    }

    if (token) {
      api.setToken(token);

      if (addedEmail) {
        setStatus(t.auth.accountLinked.replace('{email}', addedEmail));
        setTimeout(() => router.push('/settings/accounts'), 1000);
      } else if (reauthedEmail) {
        const message = feature === 'calendar'
          ? `Google Calendar aktiverades för ${reauthedEmail}`
          : feature === 'calendar_write'
            ? `Google Calendar skrivåtkomst aktiverades för ${reauthedEmail}`
            : `Kontot ${reauthedEmail} kopplades om`;
        setStatus(message);
        setTimeout(() => router.push(safeReturnTo), 1000);
      } else {
        setStatus(t.auth.authenticated);
        setTimeout(() => router.push('/'), 1000);
      }
    } else {
      setStatus(t.auth.waiting);
    }
  }, [searchParams, router, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card max-w-md w-full text-center">
        <div className="w-12 h-12 bg-brand-500 rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold">C</span>
        </div>
        <p className="text-gray-600">{status}</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  const { t } = useI18n();
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card max-w-md w-full text-center">
          <p className="text-gray-600">{t.auth.loading}</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
