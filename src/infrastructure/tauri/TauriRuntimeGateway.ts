import { invoke } from '@tauri-apps/api/core';
import type {
  RuntimeFieldSetRequest,
  RuntimeFieldSetResult,
  RuntimeInstanceFieldSnapshot,
  RuntimeMethodInvokeRequest,
  RuntimeMethodInvokeResult,
  RuntimeOverlaySnapshot,
} from '../../domain/analysis/contracts';

export async function getRuntimeStaticFields(classStableId: string) {
  return invoke<RuntimeOverlaySnapshot>('get_runtime_static_fields', {
    classStableId,
  });
}

export async function getRuntimeInstanceFields(classStableId: string, instanceAddress: string) {
  return invoke<RuntimeInstanceFieldSnapshot>('get_runtime_instance_fields', {
    classStableId,
    instanceAddress,
  });
}

export async function invokeRuntimeMethod(request: RuntimeMethodInvokeRequest) {
  return invoke<RuntimeMethodInvokeResult>('invoke_runtime_method', { request });
}

export async function setRuntimeFieldValue(request: RuntimeFieldSetRequest) {
  return invoke<RuntimeFieldSetResult>('set_runtime_field_value', { request });
}