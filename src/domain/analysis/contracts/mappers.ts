import {
  createClassStableId,
  createFieldStableId,
  createImageStableId,
  createMethodStableId,
  type StableId,
} from '../../contracts/shared-identity';
import type {
  AnalysisSnapshot,
  ClassDescriptor,
  FieldDescriptor,
  ImageDescriptor,
  ProcessSession,
  RuntimeClassOverlayDescriptor,
  RuntimeFlavor,
  RuntimeOverlaySnapshot,
  StaticFieldDescriptor,
} from './canonical';
import type { AttachResponse, ClassInfo, DumpAllResponse, RuntimeClassOverlayResponse } from './external';

function normalizeRuntimeFlavor(runtime: string): RuntimeFlavor {
  const normalized = runtime.trim().toLowerCase();
  if (normalized === 'mono') {
    return 'mono';
  }
  if (normalized === 'il2cpp') {
    return 'il2cpp';
  }
  return 'unknown';
}

function mapFieldDescriptor(classStableId: StableId, field: ClassInfo['fields'][number]): FieldDescriptor {
  return {
    stableId: createFieldStableId({
      classStableId,
      fieldName: field.name,
      fieldType: field.field_type,
      fieldKind: 'instance',
    }),
    legacyFieldName: field.name,
    name: field.name,
    fieldType: field.field_type,
    offset: field.offset,
  };
}

function mapStaticFieldDescriptor(classStableId: StableId, field: ClassInfo['static_fields'][number]): StaticFieldDescriptor {
  return {
    stableId: createFieldStableId({
      classStableId,
      fieldName: field.name,
      fieldType: field.field_type,
      fieldKind: 'static',
    }),
    legacyFieldName: field.name,
    name: field.name,
    fieldType: field.field_type,
    offset: null,
    address: field.address,
    value: field.value,
  };
}

function mapClassDescriptor(image: ImageDescriptor, classInfo: ClassInfo): ClassDescriptor {
  const classStableId = createClassStableId({
    imageStableId: image.stableId,
    namespace: classInfo.namespace,
    className: classInfo.name,
    legacyClassId: classInfo.id,
  });

  return {
    stableId: classStableId,
    legacyClassId: classInfo.id,
    legacyImageId: image.legacyImageId,
    imageStableId: image.stableId,
    name: classInfo.name,
    namespace: classInfo.namespace,
    fullName: classInfo.full_name,
    inheritance: classInfo.inheritance.map((node) => ({ name: node.name })),
    fields: classInfo.fields.map((field) => mapFieldDescriptor(classStableId, field)),
    staticFields: classInfo.static_fields.map((field) => mapStaticFieldDescriptor(classStableId, field)),
    methods: classInfo.methods.map((method) => ({
      stableId: createMethodStableId({
        classStableId,
        methodName: method.name,
        signature: method.signature,
      }),
      name: method.name,
      signature: method.signature,
      tags: method.tags ?? [],
    })),
  };
}

export function mapAttachResponseToProcessSession(response: AttachResponse): ProcessSession {
  return {
    pid: response.process_id,
    processName: response.process_name,
    exePath: response.exe_path,
    dataDir: response.data_dir,
    managedDir: response.managed_dir,
    runtime: normalizeRuntimeFlavor(response.runtime),
  };
}

export function mapDumpAllResponseToAnalysisSnapshot(response: DumpAllResponse, process: ProcessSession | null = null): AnalysisSnapshot {
  const images = response.images.map<ImageDescriptor>((image) => ({
    stableId: createImageStableId({ imageName: image.name, imagePath: image.path }),
    legacyImageId: image.id,
    name: image.name,
    path: image.path,
  }));

  const imagesByLegacyId = Object.fromEntries(images.map((image) => [image.legacyImageId, image]));
  const classes = {} as AnalysisSnapshot['classes'];
  const imageClassIndex = {} as AnalysisSnapshot['imageClassIndex'];

  for (const [legacyKey, classInfo] of Object.entries(response.classDetails)) {
    const [legacyImageId] = legacyKey.split('::');
    const image = imagesByLegacyId[legacyImageId];
    if (!image) {
      continue;
    }

    const descriptor = mapClassDescriptor(image, classInfo);
    classes[descriptor.stableId] = descriptor;
    if (!imageClassIndex[image.stableId]) {
      imageClassIndex[image.stableId] = [];
    }
    imageClassIndex[image.stableId].push(descriptor.stableId);
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    process,
    images,
    classes,
    imageClassIndex,
  };
}

export function mapRuntimeOverlayResponseToSnapshot(
  classStableId: StableId,
  response: RuntimeClassOverlayResponse,
): RuntimeOverlaySnapshot {
  const overlay: RuntimeClassOverlayDescriptor = {
    classStableId,
    fields: response.fields.map((field) => ({
      stableId: createFieldStableId({
        classStableId,
        fieldName: field.name,
        fieldType: field.field_type,
        fieldKind: 'instance',
      }),
      legacyFieldName: field.name,
      name: field.name,
      fieldType: field.field_type,
      offset: field.offset,
    })),
    staticFields: response.static_fields.map((field) => ({
      stableId: createFieldStableId({
        classStableId,
        fieldName: field.name,
        fieldType: field.field_type,
        fieldKind: 'static',
      }),
      legacyFieldName: field.name,
      name: field.name,
      fieldType: field.field_type,
      offset: null,
      address: field.address,
      value: field.value,
    })),
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    classes: {
      [classStableId]: overlay,
    },
  };
}