import { useEffect, useMemo, useRef, useState } from 'react';
import { getNodePortsByDirection } from '@/features/studio/core/NodeRegistry';
import { getStudioNodePresentationDefinition, type BaseNodeData } from '@/features/studio/core/types';
import type { CallFunctionClassInfoQueryState } from '@/domain/studio/contracts';
import { useStudioEditNodeModalState } from './useStudioEditNodeModalState';
import { useStudioExpressionDragState } from './useStudioExpressionDragState';

export function useStudioEditNodeModalViewState() {
  const { catalog, nodes, updateNodeData, isEditModalOpen, closeEditModal, editingNodeId, query } = useStudioEditNodeModalState();
  const expressionDrag = useStudioExpressionDragState();
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftNodeName, setDraftNodeName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const node = useMemo(() => nodes.find((candidate) => candidate.id === editingNodeId), [nodes, editingNodeId]);
  const nodeDef = useMemo(() => (node ? catalog.get(node.type) : null), [catalog, node]);
  const resolvedNodeName = useMemo(() => {
    if (!node || !nodeDef) {
      return '';
    }

    return (node.data.nodeName && node.data.nodeName.trim())
      || nodeDef.resolveDisplayName?.(node.data)
      || nodeDef.manifest.displayName;
  }, [node, nodeDef]);

  const inputBindingStates = useMemo(() => (node ? query.getNodeInputBindingStates(node.id) : []), [node, query]);
  const callFunctionInputState = useMemo(
    () => node?.type === 'call-function'
      ? query.getNodeQueryState<CallFunctionClassInfoQueryState>(node.id)
      : null,
    [node, query],
  );
  const liveQuerySnapshot = useMemo(() => (node ? query.getNodeSnapshot(node.id) : null), [node, query]);
  const liveOutputPreview = useMemo(() => (node ? query.getNodeOutputPreview(node.id) : null), [node, query]);

  const snapshotOriginLabel = useMemo(() => {
    if (!liveQuerySnapshot) {
      return null;
    }

    return liveQuerySnapshot.originKind === 'runtime' ? 'runtime' : 'preview';
  }, [liveQuerySnapshot]);

  const snapshotPhaseLabel = useMemo(() => {
    if (!liveQuerySnapshot) {
      return null;
    }

    switch (liveQuerySnapshot.phase) {
      case 'running':
        return 'running';
      case 'execute':
        return 'executed';
      case 'materialize':
      default:
        return 'materialized';
    }
  }, [liveQuerySnapshot]);

  const presentation = nodeDef ? getStudioNodePresentationDefinition(nodeDef) : null;
  const EditComponent = presentation?.EditComponent;
  const EditFooterComponent = presentation?.EditFooterComponent;
  const hasParameterSchema = (nodeDef?.manifest.parameters.length ?? 0) > 0;
  const nodeOutputs = useMemo(() => (nodeDef ? getNodePortsByDirection(nodeDef, 'output') : []), [nodeDef]);

  const handleUpdateData = (newData: Partial<BaseNodeData>) => {
    if (!node) {
      return;
    }

    updateNodeData(node.id, newData);
  };

  const commitNodeName = () => {
    if (!node || !nodeDef) {
      return;
    }

    const trimmedName = draftNodeName.trim();
    const fallbackName = presentation?.resolveDisplayName?.(node.data) || nodeDef.manifest.displayName;

    updateNodeData(node.id, {
      nodeName: trimmedName && trimmedName !== fallbackName ? trimmedName : undefined,
    });
    setIsEditingName(false);
  };

  useEffect(() => {
    setDraftNodeName(resolvedNodeName);
    setIsEditingName(false);
  }, [resolvedNodeName, node?.id]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  return {
    catalog,
    expressionDrag,
    isEditModalOpen,
    closeEditModal,
    node,
    nodeDef,
    presentation,
    EditComponent,
    EditFooterComponent,
    hasParameterSchema,
    nodeOutputs,
    resolvedNodeName,
    inputBindingStates,
    callFunctionInputState,
    liveQuerySnapshot,
    liveOutputPreview,
    snapshotOriginLabel,
    snapshotPhaseLabel,
    isEditingName,
    setIsEditingName,
    draftNodeName,
    setDraftNodeName,
    nameInputRef,
    handleUpdateData,
    commitNodeName,
  };
}