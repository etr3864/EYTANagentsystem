'use client';

import { useEffect, useState } from 'react';
import { paginate } from './pagination';

export function usePagedList<T>(items: T[], resetKey?: string | number) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  return { ...paginate(items, page), setPage };
}
