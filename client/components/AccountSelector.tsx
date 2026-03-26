'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Account } from '@/lib/types';

interface Props {
  value?: string;
  onChange: (accountId: string) => void;
  className?: string;
}

export default function AccountSelector({ value, onChange, className = '' }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);

  useEffect(() => {
    api.getAccounts().then((res) => {
      setAccounts(res.accounts);
      // Auto-select default if nothing chosen
      if (!value && res.accounts.length > 0) {
        const defaultAcc = res.accounts.find((a: Account) => a.isDefault) || res.accounts[0];
        onChange(defaultAcc.id);
      }
    });
  }, []);

  if (accounts.length <= 1) return null; // No selector needed for single account

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">Send from</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
      >
        {accounts.map((acc) => (
          <option key={acc.id} value={acc.id}>
            {acc.label ? `${acc.label} — ` : ''}
            {acc.emailAddress}
            {acc.isDefault ? ' (default)' : ''}
            {!acc.isActive ? ' [disabled]' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
