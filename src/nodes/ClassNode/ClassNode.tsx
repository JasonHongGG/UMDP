import { Box } from 'lucide-react';
import type { INodeDefinition, IPort, StudioNodeRuntimeState } from '../../core/studio/types';
import { defineStudioNode } from '../../core/studio/NodeRegistry';
import {
  CLASS_INFO_SCHEMA,
  PARAMETER_DEFINITIONS_SCHEMA,
  createClassInfoEnvelope,
  createFlowPort,
  createJsonPort,
} from '../../core/studio/contracts';
import { reconcileClassInfoSelection } from '../../domain/studio/editor';
import { parseClassNodeDocumentState } from '../../domain/studio/contracts';
import { ClassNodeBindingEditor } from './ClassNodeBindingEditor';
import { ClassNodeCanvas } from './ClassNodeCanvas';
import { ClassNodeSelectionEditor } from './ClassNodeSelectionEditor';
import {
  createClassNodeData,
  createClassNodeDocumentState,
  createEmptyCatalog,
  createInfoPreview,
  fromClassBindingReference,
  fromClassExportSelection,
  hasResolvedExecutionValue,
  parseClassNodeDataFromDocumentState,
  type ClassNodeData,
} from './classNodeModel';

const CLASS_INFO_OUTPUT: IPort = {
  ...createJsonPort('info-out', 'Info', CLASS_INFO_SCHEMA, 'Selected class metadata wrapped in the studio JSON envelope.'),
};

const CLASS_NODE_INPUTS: IPort[] = [
  createFlowPort('flow-in', 'Flow In'),
  createJsonPort('instance-in', 'Instance Ref', PARAMETER_DEFINITIONS_SCHEMA, 'Parameter definitions used to supply instance reference data to this class node.'),
];

const CLASS_NODE_OUTPUTS: IPort[] = [
  createFlowPort('flow-out', 'Flow Out'),
  CLASS_INFO_OUTPUT,
];

const ClassNodeDefinition: INodeDefinition<ClassNodeData> = {
  manifest: {
    type: 'class-ref',
    typeVersion: 1,
    family: 'runtime',
    displayName: 'Class Reference',
    description: 'Resolves a concrete class binding and wraps selected metadata into a fixed info JSON output.',
    category: 'Runtime',
    tags: ['class', 'metadata', 'json', 'unity'],
    inputs: CLASS_NODE_INPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'input',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
    })),
    outputs: CLASS_NODE_OUTPUTS.map((port) => ({
      key: port.id,
      displayName: port.label,
      direction: 'output',
      channel: port.channel,
      cardinality: port.cardinality,
      dataType: port.dataType,
    })),
    parameters: [{
      name: 'instanceSource',
      displayName: 'Instance Address',
      valueType: 'string',
      expressionSupport: 'optional',
      ui: {
        section: 'Binding',
        placeholder: 'literal address or drag expression source here...',
        helperText: 'Accepts literal, input-expression, or static-expression bindings.',
      },
    }],
  },
  icon: Box,
  createInitialData: createClassNodeData,
  resolveDisplayName: (data) => data.nodeName?.trim() || data.binding?.name || undefined,
  hydrateData: (instance, baseData) => parseClassNodeDataFromDocumentState(baseData, instance),
  dehydrateData: (data) => {
    const bindings: StudioNodeRuntimeState['bindings'] = {};
    if (data.instanceSource) {
      bindings.instanceSource = data.instanceSource;
    }

    return {
      displayName: data.nodeName?.trim() || undefined,
      parameters: {},
      bindings,
      documentState: {
        ...createClassNodeDocumentState(data),
      },
    };
  },
  createRuntimeState: (node) => {
    const bindings: StudioNodeRuntimeState['bindings'] = {};
    if (node.data.instanceSource) {
      bindings.instanceSource = node.data.instanceSource;
    }

    return {
      displayName: node.data.nodeName?.trim() || undefined,
      parameters: {},
      bindings,
      documentState: {
        ...createClassNodeDocumentState(node.data),
        availableInfo: node.data.availableInfo,
      },
    };
  },
  executionContract: {
    validate: (context) => {
      const hasIncomingInstance = (context.inputBindings['instance-in']?.length ?? 0) > 0 || (context.resolvedInputs['instance-in']?.length ?? 0) > 0;
      const hasOwnInstanceBinding = hasResolvedExecutionValue(context.resolvedBindings.instanceSource);

      if (!hasIncomingInstance && !hasOwnInstanceBinding) {
        return [{
          severity: 'error',
          code: 'class.instance.required',
          message: 'Class node requires an incoming instance reference or an instance source expression.',
          target: 'instance-in',
        }];
      }

      return [];
    },
    execute: ({ documentState, resolvedBindings }) => {
      const classDocumentState = parseClassNodeDocumentState(documentState);
      const availableInfo = (documentState.availableInfo as ClassNodeData['availableInfo'] | undefined) ?? createEmptyCatalog();

      return {
        state: 'success',
        outputs: {
          'info-out': createClassInfoEnvelope(
            fromClassBindingReference(classDocumentState.classBinding),
            availableInfo,
            reconcileClassInfoSelection(fromClassExportSelection(classDocumentState.exportSelection), availableInfo),
            (resolvedBindings.instanceSource as import('../../core/studio/types').WorkflowJsonValue | undefined) ?? null,
          ),
        },
      };
    },
  },
  getExecutionPreview: (data) => ({
    'info-out': createInfoPreview(data),
  }),
  CanvasComponent: ClassNodeCanvas,
  EditComponent: ClassNodeBindingEditor,
  EditFooterComponent: ClassNodeSelectionEditor,
};

export const ClassNodeDef = defineStudioNode(ClassNodeDefinition);

export default ClassNodeDef;