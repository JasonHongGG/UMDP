import { useEffect, useState } from 'react';
import type { SystemContractVersions } from '@/shared/contracts';
import { createDiagnosticsLogger } from '@/shared/diagnostics';
import type { AnalysisRepository } from '../repository/AnalysisRepository';

const contractVersionDiagnostics = createDiagnosticsLogger({
  channel: 'analysis',
  origin: 'useAnalysisContractVersions',
});

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
          contractVersionDiagnostics.error('Contract versions load failed.', {
            error,
          });
        }
      });

    return () => {
      disposed = true;
    };
  }, [repository]);

  return contractVersions;
}