import type { ProcessInfo } from '@/domain/analysis/contracts';

export interface WorkspaceAttachIntentChannel {
  openProcessSelector: () => Promise<void>;
  onAttachIntent: (handler: (process: ProcessInfo) => void | Promise<void>) => Promise<() => void>;
}