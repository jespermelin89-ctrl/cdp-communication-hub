'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('Processing authentication...');

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');

    if (error) {
      setStatus(`Authentication failed: ${error}`);
      return;
    }

    if (token) {
      api.setToken(token);
      setStatus('Authenticated! Redirecting...');
      setTimeout(() => router.push('/'), 1000);
    } else {
      setStatus('Waiting for authentication response...');
    }
  }, [searchParams, router]);

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
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card max-w-md w-full text-center">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  );
}
