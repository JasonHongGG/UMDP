import { useEffect, useState } from 'react';
import type { SystemContractVersions } from '@/shared/contracts';
import type { AnalysisRepository } from '../repository/AnalysisRepository';

export function useAnalysisContractVersions(repository: AnalysisRepository) {
  const [contractVersions, setContractVersions] = useState<SystemContractVersions | null>(null);

  useEffect(() => {
    let disposed = false;

    repository
      .getContractVersions()
      .then((versions) => {
        if (!disposed) {
          setContractVersions(versions);
        }
      })
      .catch((error) => {
        if (!disposed) {
          console.error('Failed to load contract versions', error);
        }
      });

    return () => {
      disposed = true;
    };
  }, [repository]);

  return contractVersions;
}