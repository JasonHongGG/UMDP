import type {
  RuntimeFieldSetRequest,
  RuntimeFieldSetResult,
  RuntimeInstanceFieldSnapshot,
  RuntimeMethodInvokeRequest,
  RuntimeMethodInvokeResult,
  RuntimeOverlaySnapshot,
} from '@/domain/analysis/contracts';
import { createTauriIpcClient } from './TauriIpcClient';

const client = createTauriIpcClient();

export async function getRuntimeStaticFields(classStableId: string) {
  return client.invoke<RuntimeOverlaySnapshot>({ label: 'get_runtime_static_fields', command: 'get_runtime_static_fields', args: {
    classStableId,
  } });
}

export async function getRuntimeInstanceFields(classStableId: string, instanceAddress: string) {
  return client.invoke<RuntimeInstanceFieldSnapshot>({ label: 'get_runtime_instance_fields', command: 'get_runtime_instance_fields', args: {
    classStableId,
    instanceAddress,
  } });
}

export async function invokeRuntimeMethod(request: RuntimeMethodInvokeRequest) {
  return client.invoke<RuntimeMethodInvokeResult>({ label: 'invoke_runtime_method', command: 'invoke_runtime_method', args: { request } });
}

export async function setRuntimeFieldValue(request: RuntimeFieldSetRequest) {
  return client.invoke<RuntimeFieldSetResult>({ label: 'set_runtime_field_value', command: 'set_runtime_field_value', args: { request } });
}