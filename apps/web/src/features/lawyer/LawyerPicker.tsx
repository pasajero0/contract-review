'use client';

import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LawyersResponse } from '@lex-poc/contract/lawyers';
import { apiGet } from '@/api/client';
import { getCurrentLawyerId, setCurrentLawyerId, subscribeToLawyerId } from '@/api/lawyer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';

export function LawyerPicker() {
  const { data } = useQuery({ queryKey: ['lawyers'], queryFn: () => apiGet('/lawyers', LawyersResponse) });
  // The server snapshot is null, so the server and the first browser render agree.
  const selected = useSyncExternalStore(subscribeToLawyerId, getCurrentLawyerId, () => null) ?? '';

  return (
    <Select value={selected} onValueChange={setCurrentLawyerId}>
      <SelectTrigger aria-label="Who are you?">
        <SelectValue placeholder="Who are you?" />
      </SelectTrigger>
      <SelectContent>
        {(data?.lawyers ?? []).map((lawyer) => (
          <SelectItem key={lawyer.id} value={lawyer.id}>
            {lawyer.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
