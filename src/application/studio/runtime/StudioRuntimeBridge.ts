import type {
  RuntimeFieldSetRequest,
  RuntimeFieldSetResult,
  RuntimeInstanceFieldSnapshot,
  RuntimeMethodInvokeRequest,
  RuntimeMethodInvokeResult,
  RuntimeOverlaySnapshot,
} from '../../../domain/analysis/contracts';
import { createTauriAnalysisRepository } from '../../../infrastructure/tauri/TauriAnalysisRepository';
import { invokeRuntimeMethod, setRuntimeFieldValue } from '../../../infrastructure/tauri/TauriRuntimeGateway';

const analysisRepository = createTauriAnalysisRepository();

export function getStudioRuntimeStaticFields(classStableId: string): Promise<RuntimeOverlaySnapshot> {
  return analysisRepository.getRuntimeStaticFields(classStableId);
}

export function getStudioRuntimeInstanceFields(classStableId: string, instanceAddress: string): Promise<RuntimeInstanceFieldSnapshot> {
  return analysisRepository.getRuntimeInstanceFields({ classStableId, instanceAddress });
}

export function invokeStudioRuntimeMethod(request: RuntimeMethodInvokeRequest): Promise<RuntimeMethodInvokeResult> {
  return invokeRuntimeMethod(request);
}

export function setStudioRuntimeFieldValue(request: RuntimeFieldSetRequest): Promise<RuntimeFieldSetResult> {
  return setRuntimeFieldValue(request);
}