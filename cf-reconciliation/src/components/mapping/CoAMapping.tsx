'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Account, CoAMapping as CoAMappingType, BSCategory, CFCategory, BS_CATEGORY_LABELS, CF_CATEGORY_LABELS } from '@/types';
import { autoMap } from '@/engines/mapping';
import { formatNumber } from '@/lib/format';
import { WandIcon } from 'lucide-react';

const BS_OPTIONS = Object.entries(BS_CATEGORY_LABELS) as [BSCategory, string][];
const CF_OPTIONS = Object.entries(CF_CATEGORY_LABELS) as [CFCategory, string][];

interface CoAMappingProps {
  accounts: Account[];
  mappings: CoAMappingType[];
  onMappingsChange: (mappings: CoAMappingType[]) => void;
  onComplete: () => void;
}

export function CoAMappingView({ accounts, mappings, onMappingsChange, onComplete }: CoAMappingProps) {
  const [search, setSearch] = useState('');

  const mappingMap = useMemo(() => {
    const m = new Map<string, CoAMappingType>();
    mappings.forEach(mapping => m.set(mapping.accountId, mapping));
    return m;
  }, [mappings]);

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(a =>
      a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)
    );
  }, [accounts, search]);

  const handleAutoMap = () => {
    const mapped = autoMap(accounts);
    onMappingsChange(mapped);
  };

  const handleChange = (accountId: string, field: 'bsCategory' | 'cfCategory', value: string) => {
    const updated = mappings.map(m => {
      if (m.accountId !== accountId) return m;
      return { ...m, [field]: value };
    });
    onMappingsChange(updated);
  };

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    mappings.forEach(m => {
      counts[m.cfCategory] = (counts[m.cfCategory] || 0) + 1;
    });
    return counts;
  }, [mappings]);

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Input
          placeholder="계정 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={handleAutoMap}>
          <WandIcon className="h-3.5 w-3.5 mr-1" />
          자동매핑
        </Button>
        <div className="flex-1" />
        <Button onClick={onComplete} disabled={mappings.length === 0}>
          다음: 정산표
        </Button>
      </div>

      <div className="border rounded-lg overflow-auto flex-1">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium w-16">코드</th>
              <th className="px-2 py-1.5 text-left font-medium">계정명</th>
              <th className="px-2 py-1.5 text-left font-medium w-28">BS 분류</th>
              <th className="px-2 py-1.5 text-left font-medium w-28">CF 분류</th>
              <th className="px-2 py-1.5 text-right font-medium w-24">증감</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(account => {
              const mapping = mappingMap.get(account.id);
              return (
                <tr key={account.id} className="border-t hover:bg-muted/20">
                  <td className="px-2 py-1 font-mono">{account.code}</td>
                  <td className="px-2 py-1">{account.name}</td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded border px-1 py-0.5 text-xs bg-background"
                      value={mapping?.bsCategory ?? 'current-asset'}
                      onChange={e => handleChange(account.id, 'bsCategory', e.target.value)}
                      disabled={mapping?.isLocked}
                    >
                      {BS_OPTIONS.map(([val, lbl]) => (
                        <option key={val} value={val}>{lbl}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1">
                    <select
                      className="w-full rounded border px-1 py-0.5 text-xs bg-background"
                      value={mapping?.cfCategory ?? 'operating'}
                      onChange={e => handleChange(account.id, 'cfCategory', e.target.value)}
                      disabled={mapping?.isLocked}
                    >
                      {CF_OPTIONS.map(([val, lbl]) => (
                        <option key={val} value={val}>{lbl}</option>
                      ))}
                    </select>
                  </td>
                  <td className={`px-2 py-1 text-right font-mono ${account.change < 0 ? 'text-red-600' : ''}`}>
                    {formatNumber(account.change)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
        {CF_OPTIONS.map(([key, label]) => (
          summary[key] ? (
            <span key={key}>{label}: <strong className="text-foreground">{summary[key]}</strong></span>
          ) : null
        ))}
      </div>
    </div>
  );
}
