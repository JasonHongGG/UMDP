import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

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
              className={`px-3 py-2 bg-[#0c1520]/95 backdrop-blur-md border border-slate-700/60 shadow-[0_8px_30px_rgba(0,0,0,0.6)] rounded-lg text-[11px] font-medium text-slate-300 tracking-wide text-center whitespace-pre-wrap leading-[1.6] ${className}`}
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
