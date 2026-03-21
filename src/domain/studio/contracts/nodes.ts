import type { StableId } from '../../contracts/shared-identity';
import type { ExpressionSource } from './expression';
import type { ClassBinding, ClassInfoCatalog } from '../editor';

export type NodeFamily = 'control' | 'runtime' | 'data';
export type ExpressionSupportMode = 'disabled' | 'optional' | 'required';
export type ParameterValueType = 'string' | 'number' | 'boolean' | 'json' | 'class-binding' | 'selection' | 'collection';
export type ConnectionChannel = 'control' | 'data';
export type ConnectionDirection = 'input' | 'output';

export interface ParameterOption {
  label: string;
  value: string;
}

export interface ParameterUiOptions {
  multiline?: boolean;
  rows?: number;
  placeholder?: string;
  tooltip?: string;
  helperText?: string;
  section?: string;
  readOnly?: boolean;
  autoSequencePrefix?: string;
  collection?: {
    minItems?: number;
    addLabel?: string;
    itemLabel?: string;
    identityKey?: string;
    fields: ParameterDefinition[];
  };
}

export interface ParameterDefinition {
  name: string;
  displayName: string;
  valueType: ParameterValueType;
  required?: boolean;
  expressionSupport: ExpressionSupportMode;
  defaultValue?: unknown;
  options?: ParameterOption[];
  ui?: ParameterUiOptions;
}

export interface ConnectionDefinition {
  key: string;
  displayName: string;
  direction: ConnectionDirection;
  channel: ConnectionChannel;
  required?: boolean;
  cardinality: 'single' | 'multiple';
  dataType?: string;
}

export interface NodeManifest {
  type: string;
  typeVersion: number;
  family: NodeFamily;
  displayName: string;
  description: string;
  category: string;
  tags?: string[];
  inputs: ConnectionDefinition[];
  outputs: ConnectionDefinition[];
  parameters: ParameterDefinition[];
  isTrigger?: boolean;
  isOutputNode?: boolean;
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  target?: string;
}

export interface NodeExecutionContext {
  documentId: string;
  nodeId: string;
  nodeType: string;
  parameters: Record<string, unknown>;
  bindings: Record<string, ExpressionSource | ExpressionSource[]>;
  resolvedBindings: Record<string, unknown | unknown[]>;
  documentState: Record<string, unknown>;
  inputBindings: Record<string, ExpressionSource[]>;
  resolvedInputs: Record<string, unknown[]>;
  controlInputs: string[];
  getClassInfoCatalogByBinding: (binding: ClassBinding | null | undefined) => ClassInfoCatalog | null;
}

export interface NodeExecutionResult {
  state: 'success' | 'error';
  outputs?: Record<string, unknown>;
  issues?: ValidationIssue[];
  nextControlPorts?: string[];
}

export interface NodeExecutionContract {
  validate(context: NodeExecutionContext): ValidationIssue[];
  execute(context: NodeExecutionContext): Promise<NodeExecutionResult> | NodeExecutionResult;
}

export interface ClassBindingReference {
  classStableId: StableId;
  imageStableId: StableId;
  fullName: string;
  name: string;
  namespace: string;
  imageName: string;
}

export interface ClassExportSelection {
  memberStableIds: StableId[];
  staticStableIds: StableId[];
  methodStableIds: StableId[];
}

export interface TriggerNodeDocumentState {
  mode: 'manual';
}

export interface ClassNodeDocumentState {
  classBinding: ClassBindingReference | null;
  exportSelection: ClassExportSelection;
}

export interface ParameterSymbolDefinition {
  stableId: StableId;
  name: string;
  valueSource: ExpressionSource;
}

export interface CallFunctionArgumentBinding {
  stableId: StableId;
  name: string;
  valueSource: ExpressionSource;
}

export interface CallFunctionNodeDocumentState {
  selectedMethodStableId: StableId | null;
  arguments: CallFunctionArgumentBinding[];
}

export interface ParameterNodeDocumentState {
  symbols: ParameterSymbolDefinition[];
}

export interface DisplayNodeDocumentState {
  expandedByDefault: boolean;
  truncateAt: number;
  showSchema: boolean;
  showMeta: boolean;
}

export type IfOperator = 'is' | 'is-not' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'starts-with' | 'ends-with';
export type IfScalarKind = 'boolean' | 'number' | 'string' | 'address' | 'unsupported';
export type IfOperandMode = 'literal' | 'expression';

export interface IfNodeDocumentState {
  leftSource: ExpressionSource | null;
  operator: IfOperator;
  rightMode: IfOperandMode;
  rightSource: ExpressionSource | null;
}

export interface EditorTargetDocumentItem {
  targetId: StableId;
  memberStableId: StableId;
  memberName: string;
  memberTypeName: string;
  isStatic: boolean;
  valueSource: ExpressionSource;
}

export interface EditorNodeDocumentState {
  targets: EditorTargetDocumentItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isExpressionSourceLike(value: unknown): value is ExpressionSource {
  return isRecord(value) && typeof value.kind === 'string';
}

function isInputExpressionSourceLike(value: unknown): value is ExpressionSource {
  return isExpressionSourceLike(value) && value.kind === 'input-expression';
}

function isAllowedIfRightSource(value: unknown): value is ExpressionSource {
  return isExpressionSourceLike(value) && (value.kind === 'literal' || value.kind === 'input-expression');
}

function isIfOperator(value: unknown): value is IfOperator {
  return value === 'is'
    || value === 'is-not'
    || value === 'eq'
    || value === 'ne'
    || value === 'gt'
    || value === 'gte'
    || value === 'lt'
    || value === 'lte'
    || value === 'contains'
    || value === 'starts-with'
    || value === 'ends-with';
}

function isClassBindingReference(value: unknown): value is ClassBindingReference {
  return isRecord(value)
    && typeof value.classStableId === 'string'
    && typeof value.imageStableId === 'string'
    && typeof value.fullName === 'string'
    && typeof value.name === 'string'
    && typeof value.namespace === 'string'
    && typeof value.imageName === 'string';
}

function isClassExportSelection(value: unknown): value is ClassExportSelection {
  return isRecord(value)
    && Array.isArray(value.memberStableIds)
    && Array.isArray(value.staticStableIds)
    && Array.isArray(value.methodStableIds)
    && value.memberStableIds.every((item) => typeof item === 'string')
    && value.staticStableIds.every((item) => typeof item === 'string')
    && value.methodStableIds.every((item) => typeof item === 'string');
}

export function parseTriggerNodeDocumentState(value: unknown): TriggerNodeDocumentState {
  return isRecord(value) && value.mode === 'manual'
    ? { mode: 'manual' }
    : { mode: 'manual' };
}

export function parseClassNodeDocumentState(value: unknown): ClassNodeDocumentState {
  const documentState = isRecord(value) ? value : {};
  const exportSelection = isClassExportSelection(documentState.exportSelection)
    ? documentState.exportSelection
    : { memberStableIds: [], staticStableIds: [], methodStableIds: [] };

  return {
    classBinding: isClassBindingReference(documentState.classBinding) ? documentState.classBinding : null,
    exportSelection,
  };
}

export function parseParameterNodeDocumentState(value: unknown): ParameterNodeDocumentState {
  const documentState = isRecord(value) ? value : {};
  const symbols = Array.isArray(documentState.symbols)
    ? documentState.symbols.flatMap((entry) => {
      if (!isRecord(entry)) {
        return [];
      }

      if (typeof entry.stableId !== 'string' || typeof entry.name !== 'string' || !isExpressionSourceLike(entry.valueSource)) {
        return [];
      }

      return [{
        stableId: entry.stableId as StableId,
        name: entry.name,
        valueSource: entry.valueSource,
      }];
    })
    : [];

  return { symbols };
}

function isCallFunctionArgumentBinding(value: unknown): value is CallFunctionArgumentBinding {
  return isRecord(value)
    && typeof value.stableId === 'string'
    && typeof value.name === 'string'
    && isExpressionSourceLike(value.valueSource);
}

function isEditorTargetDocumentItem(value: unknown): value is EditorTargetDocumentItem {
  return isRecord(value)
    && typeof value.targetId === 'string'
    && typeof value.memberStableId === 'string'
    && typeof value.memberName === 'string'
    && typeof value.memberTypeName === 'string'
    && typeof value.isStatic === 'boolean'
    && isExpressionSourceLike(value.valueSource);
}

export function parseCallFunctionNodeDocumentState(value: unknown): CallFunctionNodeDocumentState {
  const documentState = isRecord(value) ? value : {};
  const argumentsList = Array.isArray(documentState.arguments)
    ? documentState.arguments.flatMap((entry) => isCallFunctionArgumentBinding(entry) ? [entry] : [])
    : [];

  return {
    selectedMethodStableId: typeof documentState.selectedMethodStableId === 'string'
      ? documentState.selectedMethodStableId as StableId
      : null,
    arguments: argumentsList,
  };
}

export function parseDisplayNodeDocumentState(value: unknown): DisplayNodeDocumentState {
  const documentState = isRecord(value) ? value : {};

  return {
    expandedByDefault: typeof documentState.expandedByDefault === 'boolean' ? documentState.expandedByDefault : false,
    truncateAt: typeof documentState.truncateAt === 'number' && Number.isFinite(documentState.truncateAt)
      ? Math.max(80, Math.min(800, Math.round(documentState.truncateAt)))
      : 180,
    showSchema: typeof documentState.showSchema === 'boolean' ? documentState.showSchema : true,
    showMeta: typeof documentState.showMeta === 'boolean' ? documentState.showMeta : true,
  };
}

export function parseIfNodeDocumentState(value: unknown): IfNodeDocumentState {
  const documentState = isRecord(value) ? value : {};
  const leftSource = isInputExpressionSourceLike(documentState.leftSource) ? documentState.leftSource : null;
  const rightSource = isAllowedIfRightSource(documentState.rightSource) ? documentState.rightSource : null;
  const inferredRightMode: IfOperandMode = rightSource?.kind === 'input-expression' ? 'expression' : 'literal';
  const rightMode = documentState.rightMode === 'expression' || documentState.rightMode === 'literal'
    ? documentState.rightMode
    : inferredRightMode;

  return {
    leftSource,
    operator: isIfOperator(documentState.operator) ? documentState.operator : 'eq',
    rightMode: rightSource ? inferredRightMode : rightMode,
    rightSource: rightMode === 'expression'
      ? (rightSource?.kind === 'input-expression' ? rightSource : null)
      : (rightSource?.kind === 'literal' ? rightSource : null),
  };
}

export function parseEditorNodeDocumentState(value: unknown): EditorNodeDocumentState {
  const documentState = isRecord(value) ? value : {};

  return {
    targets: Array.isArray(documentState.targets)
      ? documentState.targets.flatMap((entry) => isEditorTargetDocumentItem(entry) ? [entry] : [])
      : [],
  };
}