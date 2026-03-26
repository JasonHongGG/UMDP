import React, { useCallback, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { Clock3, Timer, Zap, Sparkles, Info } from 'lucide-react';
import type { INodeEditProps } from '@/features/studio/core/types';
import type { WaitNodeData } from './waitNodeModel';
import { clampWaitDelaySeconds } from './waitNodeModel';

/* ─── Constants ────────────────────────────────────────────────── */

const PRESETS = [
  { label: '0.5s', value: 0.5 },
  { label: '1s', value: 1 },
  { label: '2s', value: 2 },
  { label: '5s', value: 5 },
  { label: '10s', value: 10 },
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
] as const;

const SLIDER_MIN = 0;
const SLIDER_MAX = 300; // 5 minutes
const RING_RADIUS = 70;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const RING_STROKE = 6;

/* ─── Utilities ────────────────────────────────────────────────── */

function formatDisplayTime(seconds: number): { main: string; unit: string } {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (s === 0) return { main: `${m}`, unit: 'min' };
    return { main: `${m}:${s.toFixed(0).padStart(2, '0')}`, unit: 'min' };
  }
  if (seconds >= 10) return { main: seconds.toFixed(0), unit: 'sec' };
  return { main: seconds.toFixed(1), unit: 'sec' };
}

/** Map a linear 0–1 slider position into a non-linear seconds value
 *  so the lower range (0–10s) gets more resolution. */
function sliderToSeconds(t: number): number {
  // Quadratic curve: small values get more slider space
  const curved = t * t;
  return curved * SLIDER_MAX;
}

function secondsToSlider(sec: number): number {
  const clamped = Math.max(0, Math.min(sec, SLIDER_MAX));
  return Math.sqrt(clamped / SLIDER_MAX);
}

/* ─── Animated Number Display ──────────────────────────────────── */

function AnimatedTimerValue({ seconds }: { seconds: number }) {
  const display = formatDisplayTime(seconds);
  return (
    <div className="flex flex-col items-center select-none pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.span
          key={display.main}
          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-100 to-cyan-300 leading-none"
        >
          {display.main}
        </motion.span>
      </AnimatePresence>
      <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-cyan-400/60 mt-1">
        {display.unit}
      </span>
    </div>
  );
}

/* ─── SVG Ring ─────────────────────────────────────────────────── */

function TimerRing({ progress }: { progress: number }) {
  const dashOffset = RING_CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <svg
      viewBox="0 0 180 180"
      className="w-[180px] h-[180px] -rotate-90"
      style={{ filter: 'drop-shadow(0 0 12px rgba(34, 211, 238, 0.15))' }}
    >
      {/* Track */}
      <circle
        cx="90"
        cy="90"
        r={RING_RADIUS}
        fill="none"
        stroke="rgba(51, 65, 85, 0.3)"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
      />

      {/* Subtle gradient defs */}
      <defs>
        <linearGradient id="wait-ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <filter id="wait-ring-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Active arc */}
      <motion.circle
        cx="90"
        cy="90"
        r={RING_RADIUS}
        fill="none"
        stroke="url(#wait-ring-gradient)"
        strokeWidth={RING_STROKE}
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        animate={{ strokeDashoffset: dashOffset }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        filter="url(#wait-ring-glow)"
      />

      {/* Glowing dot at the end of the arc */}
      {progress > 0.01 && (
        <motion.circle
          cx={90 + RING_RADIUS * Math.cos(2 * Math.PI * progress)}
          cy={90 + RING_RADIUS * Math.sin(2 * Math.PI * progress)}
          r={4.5}
          fill="#22d3ee"
          animate={{
            scale: [1, 1.35, 1],
            opacity: [0.9, 1, 0.9],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          filter="url(#wait-ring-glow)"
        />
      )}

      {/* Tick marks at preset positions */}
      {PRESETS.map(({ value }) => {
        const angle = (value / SLIDER_MAX) * 2 * Math.PI;
        const innerR = RING_RADIUS - 12;
        const outerR = RING_RADIUS - 8;
        return (
          <line
            key={value}
            x1={90 + innerR * Math.cos(angle)}
            y1={90 + innerR * Math.sin(angle)}
            x2={90 + outerR * Math.cos(angle)}
            y2={90 + outerR * Math.sin(angle)}
            stroke="rgba(148, 163, 184, 0.25)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

/* ─── Custom Slider ────────────────────────────────────────────── */

function DelaySlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const sliderPos = secondsToSlider(value);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const track = trackRef.current;
      if (!track) return;

      const update = (clientX: number) => {
        const rect = track.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const raw = sliderToSeconds(t);
        onChange(Math.round(raw * 10) / 10);
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
    [onChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">
          Duration
        </span>
        <span className="text-[10px] font-mono text-slate-400">
          0s — 5m
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-10 flex items-center cursor-pointer group"
        onPointerDown={handlePointerDown}
      >
        {/* Track background */}
        <div className="absolute inset-x-0 h-[6px] rounded-full bg-slate-800/80 overflow-hidden top-1/2 -translate-y-1/2">
          {/* Filled portion */}
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
            animate={{ width: `${sliderPos * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>

        {/* Tick marks */}
        {PRESETS.map(({ value: pv }) => {
          const pos = secondsToSlider(pv) * 100;
          return (
            <div
              key={pv}
              className="absolute top-1/2 -translate-y-1/2 w-[2px] h-3 rounded-full bg-slate-600/50"
              style={{ left: `${pos}%` }}
            />
          );
        })}

        {/* Thumb */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          animate={{ left: `${sliderPos * 100}%` }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        >
          <motion.div
            className="w-5 h-5 rounded-full border-2 border-cyan-400 bg-slate-900 shadow-[0_0_12px_rgba(34,211,238,0.4)] flex items-center justify-center"
            animate={{
              scale: isDragging ? 1.3 : 1,
              boxShadow: isDragging
                ? '0 0 20px rgba(34,211,238,0.6)'
                : '0 0 12px rgba(34,211,238,0.3)',
            }}
            whileHover={{ scale: 1.15 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─── Preset Buttons ───────────────────────────────────────────── */

function PresetRow({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">
        Quick Presets
      </span>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => {
          const isActive = preset.value === current;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onSelect(preset.value)}
              className={`relative px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                isActive
                  ? 'text-cyan-300'
                  : 'text-slate-400 hover:text-cyan-300 bg-slate-900/60 border border-slate-700/50 hover:border-cyan-500/40 hover:shadow-[0_0_10px_rgba(34,211,238,0.1)]'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="wait-preset-pill"
                  className="absolute inset-0 rounded-full bg-slate-900/80 border border-cyan-500/60 shadow-[0_0_14px_rgba(34,211,238,0.2),inset_0_0_12px_rgba(34,211,238,0.05)]"
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

/* ─── Main Editor Component ────────────────────────────────────── */

export const WaitNodeEditor: React.FC<INodeEditProps<WaitNodeData>> = ({
  nodeId,
  data,
  updateData,
}) => {
  const delaySeconds = clampWaitDelaySeconds(data.delaySeconds);
  const [localPrecise, setLocalPrecise] = useState<string>(String(delaySeconds));

  const setDelay = useCallback(
    (v: number) => {
      const clamped = clampWaitDelaySeconds(v);
      updateData({ delaySeconds: clamped });
      setLocalPrecise(String(clamped));
    },
    [updateData],
  );

  const ringProgress = useMemo(
    () => Math.min(1, delaySeconds / SLIDER_MAX),
    [delaySeconds],
  );

  const handlePreciseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalPrecise(e.target.value);
  };

  const commitPrecise = () => {
    const parsed = parseFloat(localPrecise);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setDelay(parsed);
    } else {
      setLocalPrecise(String(delaySeconds));
    }
  };

  // Keep localPrecise in sync when delaySeconds changes externally
  React.useEffect(() => {
    setLocalPrecise(String(delaySeconds));
  }, [delaySeconds]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="space-y-6"
    >
      {/* ── Hero Card: Ring + Value ─────────────────────────────── */}
      <motion.div
        layout
        className="relative rounded-3xl border border-slate-700/60 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-xl overflow-hidden group"
      >
        {/* Decorative background orbs */}
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-cyan-500/8 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/15 transition-all duration-700" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-blue-500/8 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-500/15 transition-all duration-700" />

        {/* Pulsing ambient glow behind the ring */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full pointer-events-none"
          animate={{
            background: [
              'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
              'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)',
              'radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)',
            ],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative z-10 flex flex-col items-center">
          {/* Section label */}
          <div className="flex items-center gap-2 mb-4">
            <Timer size={14} className="text-cyan-400/70" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">
              Delay Timer
            </span>
          </div>

          {/* Ring + center content */}
          <div className="relative flex items-center justify-center">
            <TimerRing progress={ringProgress} />

            {/* Center: animated time value */}
            <div className="absolute inset-0 flex items-center justify-center rotate-0">
              <AnimatedTimerValue seconds={delaySeconds} />
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Controls Card ──────────────────────────────────────── */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
        className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-5 space-y-5 backdrop-blur-lg relative overflow-hidden"
      >
        {/* Top decorative line */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />

        {/* Slider */}
        <DelaySlider value={delaySeconds} onChange={setDelay} />

        {/* Preset buttons */}
        <PresetRow current={delaySeconds} onSelect={setDelay} />

        {/* Fine-tune input */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500/80">
            Precise Value
          </span>
          <div className="relative group/input">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Zap
                size={14}
                className="text-slate-500 group-focus-within/input:text-cyan-400 transition-colors"
              />
            </div>
            <input
              type="number"
              min="0"
              step="0.1"
              value={localPrecise}
              onChange={handlePreciseChange}
              onBlur={commitPrecise}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitPrecise();
                }
              }}
              className="w-full rounded-xl border border-slate-700/70 bg-slate-950/60 pl-9 pr-14 py-2.5 text-sm font-mono text-cyan-200 outline-none placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/15 transition-all shadow-inner"
              placeholder="e.g. 2.5"
            />
            <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-[11px] text-slate-500 font-medium pointer-events-none">
              seconds
            </span>
          </div>
        </div>
      </motion.div>

      {/* ── Info Footer ────────────────────────────────────────── */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.2, ease: 'easeOut' }}
        className="rounded-xl border border-slate-800/50 bg-slate-900/20 p-3.5 flex items-start gap-3 relative overflow-hidden"
      >
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-slate-600/30 to-transparent" />
        <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400/70 shrink-0 mt-0.5">
          <Info size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-slate-400 leading-relaxed">
            Pauses the workflow for the specified duration before continuing to the next node. 
            Useful for rate-limiting, polling intervals, or orchestrating timed sequences.
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default WaitNodeEditor;
