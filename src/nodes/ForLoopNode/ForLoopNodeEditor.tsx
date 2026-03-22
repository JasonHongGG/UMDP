import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Repeat, Hash, Link2, Info, Activity } from 'lucide-react';
import { useStudioQuery } from '../../core/studio/StudioContext';
import { useExpressionDrag } from '../../core/studio/drag/ExpressionDragContext';
import { createLiteralExpressionSource, getExpressionSourceDisplayValue, readExpressionDragData } from '../../core/studio/expression';
import type { INodeEditProps } from '../../core/studio/types';
import type { ExpressionSource } from '../../domain/studio/contracts';
import { FOR_LOOP_COUNT_INPUT_PORT_ID, type ForLoopNodeData } from './forLoopNodeModel';

/* ─── Constants ────────────────────────────────────────────────── */

const PRESETS = [
  { label: 'x1', value: 1 },
  { label: 'x5', value: 5 },
  { label: 'x10', value: 10 },
  { label: 'x50', value: 50 },
  { label: 'x100', value: 100 },
] as const;

const SLIDER_MAX = 100;
const RING_RADIUS = 70;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_STROKE = 6;

/* ─── Utilities ────────────────────────────────────────────────── */

function sliderToCount(t: number): number {
  const curved = t * t;
  return Math.round(curved * SLIDER_MAX);
}

function countToSlider(count: number): number {
  const clamped = Math.max(0, Math.min(count, SLIDER_MAX));
  return Math.sqrt(clamped / SLIDER_MAX);
}

function parseNumber(raw?: string): number {
  if (!raw) return 1;
  const p = Number(raw);
  if (!Number.isFinite(p) || p < 0) return 1;
  return Math.round(p);
}

function parseStrictLoopCount(raw: string) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: false as const };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return { valid: false as const };
  }

  return { valid: true as const, value: parsed };
}

/* ─── UI Components ────────────────────────────────────────────── */

function LoopRing({ progress, isExpression }: { progress: number; isExpression: boolean }) {
  const dashOffset = isExpression ? 0 : RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <svg
      viewBox="0 0 180 180"
      className="w-[180px] h-[180px] -rotate-90"
      style={{ filter: 'drop-shadow(0 0 12px rgba(34, 211, 238, 0.15))' }}
    >
      <circle cx="90" cy="90" r={RING_RADIUS} fill="none" stroke="rgba(51, 65, 85, 0.3)" strokeWidth={RING_STROKE} strokeLinecap="round" />
      <defs>
        <linearGradient id="loop-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isExpression ? "#8b5cf6" : "#22d3ee"} />
          <stop offset="50%" stopColor={isExpression ? "#c084fc" : "#06b6d4"} />
          <stop offset="100%" stopColor={isExpression ? "#e879f9" : "#0ea5e9"} />
        </linearGradient>
        <filter id="loop-ring-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <motion.circle
        cx="90" cy="90" r={RING_RADIUS} fill="none"
        stroke="url(#loop-ring-gradient)" strokeWidth={RING_STROKE} strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        animate={{ strokeDashoffset: dashOffset }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        filter="url(#loop-ring-glow)"
        style={{ opacity: isExpression ? 0.3 : 1 }}
      />

      {!isExpression && progress > 0.01 && (
        <motion.circle
          cx={90 + RING_RADIUS * Math.cos(2 * Math.PI * progress)}
          cy={90 + RING_RADIUS * Math.sin(2 * Math.PI * progress)}
          r={4.5} fill="#22d3ee"
          animate={{ scale: [1, 1.35, 1], opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          filter="url(#loop-ring-glow)"
        />
      )}

      {PRESETS.map(({ value }) => {
        const angle = (value / SLIDER_MAX) * 2 * Math.PI;
        const innerR = RING_RADIUS - 12;
        const outerR = RING_RADIUS - 8;
        return (
          <line
            key={value}
            x1={90 + innerR * Math.cos(angle)} y1={90 + innerR * Math.sin(angle)}
            x2={90 + outerR * Math.cos(angle)} y2={90 + outerR * Math.sin(angle)}
            stroke="rgba(148, 163, 184, 0.25)" strokeWidth="1.5" strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function AnimatedCountValue({ count, isExpression }: { count: number; isExpression: boolean }) {
  return (
    <div className="flex flex-col items-center select-none pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.span
          key={isExpression ? 'dyn' : count}
          initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 1.1, filter: 'blur(4px)' }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-100 to-cyan-300 leading-none pb-1"
        >
          {isExpression ? '∞' : count}
        </motion.span>
      </AnimatePresence>
      <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-400/60 mt-1">
        Loops
      </span>
    </div>
  );
}

function CountSlider({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const sliderPos = countToSlider(value);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
      const track = trackRef.current;
      if (!track) return;
      const update = (clientX: number) => {
        const rect = track.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        onChange(Math.max(0, sliderToCount(t)));
      };
      update(e.clientX);
      const onMove = (ev: PointerEvent) => update(ev.clientX);
      const onUp = () => {
        setIsDragging(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [disabled, onChange]
  );

  return (
    <div className={`space-y-2 pt-2 transition-opacity duration-300 ${disabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">Iterations</span>
        <span className="text-[10px] font-mono text-slate-400">0 — 100+</span>
      </div>
      <div ref={trackRef} className="relative h-10 flex items-center cursor-pointer group" onPointerDown={handlePointerDown}>
        <div className="absolute inset-x-0 h-[6px] rounded-full bg-slate-800/80 overflow-hidden top-1/2 -translate-y-1/2">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
            animate={{ width: `${Math.min(100, sliderPos * 100)}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>
        {PRESETS.map(({ value: pv }) => {
          const pos = countToSlider(pv) * 100;
          return <div key={pv} className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-full bg-slate-600/50" style={{ left: `${pos}%` }} />;
        })}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          animate={{ left: `${Math.min(100, sliderPos * 100)}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <motion.div
            className="w-5 h-5 rounded-full border-2 border-cyan-400 bg-slate-900 shadow-[0_0_12px_rgba(34,211,238,0.4)] flex items-center justify-center"
            animate={{ scale: isDragging ? 1.3 : 1, boxShadow: isDragging ? '0 0 20px rgba(34,211,238,0.6)' : '0 0 12px rgba(34,211,238,0.3)' }}
            whileHover={{ scale: disabled ? 1 : 1.15 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

function PresetRow({ current, onSelect, disabled }: { current: number; onSelect: (v: number) => void; disabled: boolean }) {
  return (
    <div className={`space-y-2 transition-opacity duration-300 ${disabled ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">Quick Presets</span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const isActive = preset.value === current;
          return (
            <button
              key={preset.value} type="button" onClick={() => onSelect(preset.value)}
              className={`relative px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${isActive ? 'text-cyan-300' : 'text-slate-400 hover:text-cyan-300 bg-slate-900/60 border border-slate-700/50'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="forloop-preset-pill"
                  className="absolute inset-0 rounded-full bg-slate-900/80 border border-cyan-500/60 shadow-[0_0_14px_rgba(34,211,238,0.2)]"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className="relative z-10">{preset.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Main Input / Drop Zone Component ───────────────────────────── */

function DynamicValueInput({
  source, localPrecise, onPreciseChange, onCommitPrecise, onAcceptExpression, isLocked, linkedSourceLabel,
}: {
  source: ExpressionSource | null;
  localPrecise: string;
  onPreciseChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCommitPrecise: () => void;
  onAcceptExpression: (s: ExpressionSource | null) => void;
  isLocked: boolean;
  linkedSourceLabel: string | null;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCustomDragOver, setIsCustomDragOver] = useState(false);
  const { activeExpressionDrag, endExpressionDrag } = useExpressionDrag();
  const isExpression = source?.kind === 'input-expression';
  const isHighlighted = isDragOver || isCustomDragOver;

  const acceptSource = (src: ExpressionSource | null) => {
    if (isLocked) return;
    if (src && src.kind !== 'input-expression') return;
    onAcceptExpression(src);
  };

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">Precise Value</span>
      </div>
      <motion.div
        layout
        animate={{
          borderColor: isHighlighted ? 'rgba(34, 211, 238, 0.5)' : 'rgba(51, 65, 85, 0)',
          backgroundColor: isHighlighted ? 'rgba(8, 145, 178, 0.1)' : 'transparent',
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={`relative rounded-xl border-2 transition-colors duration-300 ${isHighlighted ? 'border-dashed' : 'border-transparent'} -mx-2 -my-2 p-2`}
        onMouseEnter={() => { if (activeExpressionDrag) setIsCustomDragOver(true); }}
        onMouseLeave={() => setIsCustomDragOver(false)}
        onMouseUpCapture={(event) => {
          if (!activeExpressionDrag) return;
          event.preventDefault();
          event.stopPropagation();
          setIsCustomDragOver(false);
          acceptSource(activeExpressionDrag.source);
          endExpressionDrag();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          setIsDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          setIsCustomDragOver(false);
          acceptSource(readExpressionDragData(event.dataTransfer));
        }}
      >
        <AnimatePresence mode="wait">
          {isExpression ? (
            <motion.div
              key="linked-badge"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 w-full group cursor-pointer bg-slate-900/60 border border-slate-700/70 p-1.5 pr-3 rounded-xl shadow-inner relative z-10"
              onClick={() => {
                if (!isLocked) {
                  onAcceptExpression(null);
                }
              }}
            >
              <div className="p-2 rounded-lg flex items-center justify-center transition-all group-hover:scale-105 bg-cyan-500/10 text-cyan-400">
                <Link2 size={16} />
              </div>
              <div className="flex-1 overflow-hidden pointer-events-none">
                <span className="text-[9px] uppercase font-bold text-cyan-500/80 block mb-0.5">{isLocked ? 'Loop Cnt Input' : 'Linked Variable'}</span>
                <span className="text-sm font-semibold text-slate-200 truncate block transition-colors group-hover:text-white">
                  {linkedSourceLabel ?? getExpressionSourceDisplayValue(source)}
                </span>
              </div>
              {isLocked ? (
                <div className="px-2 py-1 rounded bg-cyan-500/10 text-[10px] text-cyan-300 font-medium uppercase tracking-wider">
                  Synced
                </div>
              ) : (
                <div className="px-2 py-1 rounded bg-slate-800/50 text-[10px] text-slate-400 font-medium uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                  Remove
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="literal-input"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative group/input z-10"
            >
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Hash size={14} className="text-slate-500 group-focus-within/input:text-cyan-400 transition-colors" />
              </div>
              <input
                type="number" min="0" step="1"
                value={localPrecise} onChange={onPreciseChange} onBlur={onCommitPrecise}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onCommitPrecise(); } }}
                className="w-full rounded-xl border border-slate-700/70 bg-slate-950/60 pl-9 pr-14 py-2.5 text-sm font-mono text-cyan-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/15 transition-all shadow-inner"
                placeholder={isHighlighted ? 'Drop Expression...' : 'e.g. 24'}
              />
              <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-[11px] text-slate-500 font-medium pointer-events-none">
                times
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/* ─── Main Editor Component ────────────────────────────────────── */

export const ForLoopNodeEditor: React.FC<INodeEditProps<ForLoopNodeData>> = ({
  nodeId, data, updateData,
}) => {
  const query = useStudioQuery();
  const countInputBinding = useMemo(
    () => query.getNodeInputBindingStates(nodeId).find((binding) => binding.port.id === FOR_LOOP_COUNT_INPUT_PORT_ID) ?? null,
    [nodeId, query],
  );
  const countInputSource = countInputBinding?.sources[0] ?? null;
  const isCountInputBound = (countInputBinding?.sources.length ?? 0) > 0;
  const countInputLabel = countInputSource
    ? `${countInputSource.sourceNode?.data.nodeName?.trim() || countInputSource.edge.sourceNodeId}.${countInputSource.sourcePort?.label || countInputSource.edge.sourcePortId}`
    : null;
  const isExpression = data.countSource?.kind === 'input-expression';
  const literalRaw = data.countSource?.kind === 'literal' ? data.countSource.raw : '1';
  const literalCount = parseNumber(literalRaw);
  
  const [localPrecise, setLocalPrecise] = useState<string>(literalRaw);

  const ringProgress = useMemo(() => Math.min(1, literalCount / SLIDER_MAX), [literalCount]);

  const setLiteralCount = useCallback((v: number) => {
      const clamped = Math.max(0, Math.round(v));
      updateData({ countSource: createLiteralExpressionSource(String(clamped), 'number') });
      setLocalPrecise(String(clamped));
    }, [updateData],
  );

  const handlePreciseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalPrecise(e.target.value);
  };

  const commitPrecise = () => {
    const parsed = parseStrictLoopCount(localPrecise);
    if (parsed.valid) {
      setLiteralCount(parsed.value);
    } else {
      setLocalPrecise(String(literalCount));
    }
  };

  const setExpressionSource = (source: ExpressionSource | null) => {
    if (isCountInputBound) {
      return;
    }

    if (source) {
      updateData({ countSource: source });
    } else {
      updateData({ countSource: createLiteralExpressionSource(literalRaw, 'number') });
    }
  };

  useEffect(() => {
    if (!isExpression) {
      setLocalPrecise(literalRaw);
    }
  }, [isExpression, literalRaw]);

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="space-y-6">
      <motion.div layout className="relative rounded-3xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl overflow-hidden group">
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/15 transition-all duration-700" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-blue-500/8 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/15 transition-all duration-700" />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none"
          animate={{ background: ['radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)', 'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)', 'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative z-10 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4">
            <Repeat size={14} className="text-cyan-400/70" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">Loop Counter</span>
          </div>
          <div className="relative flex items-center justify-center">
            <LoopRing progress={ringProgress} isExpression={isExpression} />
            <div className="absolute inset-0 flex items-center justify-center rotate-0">
              <AnimatedCountValue count={literalCount} isExpression={isExpression} />
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div layout className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-5 space-y-5 backdrop-blur-lg relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        <CountSlider value={literalCount} onChange={setLiteralCount} disabled={isExpression} />
        <PresetRow current={literalCount} onSelect={setLiteralCount} disabled={isExpression} />
        <DynamicValueInput
          source={data.countSource} localPrecise={localPrecise}
          onPreciseChange={handlePreciseChange} onCommitPrecise={commitPrecise}
          onAcceptExpression={setExpressionSource}
          isLocked={isCountInputBound}
          linkedSourceLabel={countInputLabel}
        />
        {isCountInputBound ? (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 text-xs text-cyan-100/90 flex items-start gap-2">
            <Activity size={14} className="mt-0.5 shrink-0 text-cyan-300" />
            <span>
              Loop Cnt is currently driven by the connected graph input. Disconnect that edge to restore manual loop-count editing in this panel.
            </span>
          </div>
        ) : null}
      </motion.div>

      <motion.div layout className="rounded-xl border border-slate-800/50 bg-slate-900/20 p-3.5 flex items-start gap-3 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-600/30 to-transparent" />
        <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400/70 shrink-0 mt-0.5"><Info size={14} /></div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-slate-400 leading-relaxed">
            Repeats downstream execution for this exact number of cycles, before finally continuing to the 'Done' output point. Drag and drop any variable into the precise value input, or wire a numeric value into Loop Cnt to keep the panel synchronized with the graph.
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ForLoopNodeEditor;
