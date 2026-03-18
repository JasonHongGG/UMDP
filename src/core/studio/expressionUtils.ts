import {
  type ExpressionReferenceDragPayload,
  type ExpressionSource,
  type InputExpressionSource,
  type LiteralSource,
  type StaticExpressionSource,
} from '../../domain/studio/contracts';
import type { StableId } from '../../domain/contracts/shared-identity';

export const STUDIO_EXPRESSION_DRAG_MIME = 'application/x-umdp-expression-source';

export function createLiteralExpressionSource(raw: string, valueType: LiteralSource['valueType'] = 'string'): LiteralSource {
  return {
    kind: 'literal',
    valueType,
    raw,
  };
}

export function createInputExpressionSource(sourceNodeId: string, sourcePortId: string, path: string[], displayText: string): InputExpressionSource {
  const pathExpression = path.length > 0 ? `.${path.join('.')}` : '';
  return {
    kind: 'input-expression',
    expression: `={{ $node["${sourceNodeId}"].json["${sourcePortId}"]${pathExpression} }}`,
    bindingSlot: sourcePortId,
    sourceNodeId,
    sourcePath: path,
    displayText,
  };
}

export function createStaticExpressionSource(classStableId: StableId, memberStableId: StableId, displayText: string): StaticExpressionSource {
  return {
    kind: 'static-expression',
    expression: `={{ $class["${classStableId}"].static["${memberStableId}"] }}`,
    classStableId,
    memberStableId,
    displayText,
  };
}

export function getExpressionSourceDisplayValue(source: ExpressionSource | null | undefined) {
  if (!source) {
    return '';
  }

  if (source.kind === 'literal') {
    return source.raw;
  }

  return source.displayText || source.expression;
}

export function hasExpressionSourceValue(source: ExpressionSource | null | undefined) {
  if (!source) {
    return false;
  }

  if (source.kind === 'literal') {
    return source.raw.trim().length > 0;
  }

  return source.expression.trim().length > 0;
}

export function createDragPayload(source: InputExpressionSource | StaticExpressionSource, origin: ExpressionReferenceDragPayload['origin']): ExpressionReferenceDragPayload {
  return {
    version: 1,
    source,
    origin,
  };
}

export function writeExpressionDragData(dataTransfer: DataTransfer, payload: ExpressionReferenceDragPayload) {
  dataTransfer.setData(STUDIO_EXPRESSION_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData('text/plain', payload.source.expression);
  dataTransfer.effectAllowed = 'copy';
}

export function readExpressionDragData(dataTransfer: DataTransfer): ExpressionSource | null {
  const rawPayload = dataTransfer.getData(STUDIO_EXPRESSION_DRAG_MIME);
  if (rawPayload) {
    try {
      const parsed = JSON.parse(rawPayload) as ExpressionReferenceDragPayload;
      if (parsed?.version === 1 && parsed.source) {
        return parsed.source;
      }
    } catch {
      return null;
    }
  }

  const textPayload = dataTransfer.getData('text/plain');
  if (!textPayload) {
    return null;
  }

  return createLiteralExpressionSource(textPayload, 'address');
}