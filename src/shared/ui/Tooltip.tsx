import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

type TooltipTone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const TOOLTIP_TONE_CLASSES: Record<TooltipTone, { dot: string; label: string; detail: string }> = {
  default: {
    dot: 'bg-slate-300/80',
    label: 'text-slate-100',
    detail: 'text-slate-500',
  },
  accent: {
    dot: 'bg-cyan-300 shadow-[0_0_8px_rgba(103,232,249,0.65)]',
    label: 'text-cyan-100',
    detail: 'text-cyan-300/75',
  },
  success: {
    dot: 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.65)]',
    label: 'text-emerald-100',
    detail: 'text-emerald-300/75',
  },
  warning: {
    dot: 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.65)]',
    label: 'text-amber-100',
    detail: 'text-amber-300/75',
  },
  danger: {
    dot: 'bg-rose-300 shadow-[0_0_8px_rgba(253,164,175,0.65)]',
    label: 'text-rose-100',
    detail: 'text-rose-300/80',
  },
  muted: {
    dot: 'bg-slate-500/90',
    label: 'text-slate-200',
    detail: 'text-slate-500',
  },
};

type TooltipTriggerElement = HTMLElement;

type TooltipTriggerProps = {
  onMouseEnter?: React.MouseEventHandler<TooltipTriggerElement>;
  onMouseLeave?: React.MouseEventHandler<TooltipTriggerElement>;
  onFocus?: React.FocusEventHandler<TooltipTriggerElement>;
  onBlur?: React.FocusEventHandler<TooltipTriggerElement>;
};

type TooltipTriggerChild = React.ReactElement<TooltipTriggerProps & React.RefAttributes<TooltipTriggerElement>>;

export interface TooltipProps {
  children: TooltipTriggerChild;
  content: React.ReactNode;
  delay?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  offset?: number;
}

export interface TooltipPanelProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  detail?: React.ReactNode;
  shortcut?: React.ReactNode;
  tone?: TooltipTone;
}

export function TooltipPanel({
  label,
  description,
  detail,
  shortcut,
  tone = 'default',
}: TooltipPanelProps) {
  const toneClasses = TOOLTIP_TONE_CLASSES[tone];

  return (
    <div className="min-w-[11rem] max-w-[18rem] text-left">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${toneClasses.dot}`} />
        <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.16em] ${toneClasses.label}`}>
          {label}
        </span>
        {shortcut ? (
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            {shortcut}
          </span>
        ) : null}
      </div>
      {description ? (
        <div className="mt-1.5 text-[11px] leading-relaxed text-slate-300">
          {description}
        </div>
      ) : null}
      {detail ? (
        <div className={`mt-2 text-[10px] leading-relaxed ${toneClasses.detail}`}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function Tooltip({ children, content, delay = 300, position = 'bottom', className = '', offset = 8 }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<TooltipTriggerElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const childProps = children.props;

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      updatePosition();
      setIsVisible(true);
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    
    let x = rect.left + rect.width / 2;
    let y = rect.top + rect.height / 2;

    switch (position) {
      case 'top':
        y = rect.top - offset;
        break;
      case 'bottom':
        y = rect.bottom + offset;
        break;
      case 'left':
        x = rect.left - offset;
        break;
      case 'right':
        x = rect.right + offset;
        break;
    }

    setCoords({ x, y });
  };

  useEffect(() => {
    if (isVisible) {
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const getTransform = () => {
    switch (position) {
      case 'top': return 'translate(-50%, -100%)';
      case 'bottom': return 'translate(-50%, 0)';
      case 'left': return 'translate(-100%, -50%)';
      case 'right': return 'translate(0, -50%)';
    }
  };

  const getInitialAnimation = () => {
    switch (position) {
      case 'top': return { opacity: 0, y: 4, scale: 0.95 };
      case 'bottom': return { opacity: 0, y: -4, scale: 0.95 };
      case 'left': return { opacity: 0, x: 4, scale: 0.95 };
      case 'right': return { opacity: 0, x: -4, scale: 0.95 };
    }
  };

  return (
    <>
      {React.cloneElement(children, {
        ref: triggerRef,
        onMouseEnter: (e: React.MouseEvent) => {
          showTooltip();
          childProps.onMouseEnter?.(e as React.MouseEvent<TooltipTriggerElement>);
        },
        onMouseLeave: (e: React.MouseEvent) => {
          hideTooltip();
          childProps.onMouseLeave?.(e as React.MouseEvent<TooltipTriggerElement>);
        },
        onFocus: (e: React.FocusEvent) => {
          showTooltip();
          childProps.onFocus?.(e as React.FocusEvent<TooltipTriggerElement>);
        },
        onBlur: (e: React.FocusEvent) => {
          hideTooltip();
          childProps.onBlur?.(e as React.FocusEvent<TooltipTriggerElement>);
        },
      })}
      
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={getInitialAnimation()}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={getInitialAnimation()}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                left: coords.x,
                top: coords.y,
                transform: getTransform(),
                zIndex: 99999,
                pointerEvents: 'none'
              }}
              role="tooltip"
              className={`max-w-[18rem] rounded-xl border border-[#213246] bg-[#07111b]/96 px-3 py-2.5 text-left text-[11px] font-medium tracking-wide text-slate-300 shadow-[0_10px_32px_rgba(0,0,0,0.58)] backdrop-blur-xl whitespace-pre-wrap leading-[1.6] ${className}`}
            >
              {content}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
