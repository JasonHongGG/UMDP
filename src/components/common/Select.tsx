import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  label: React.ReactNode;
  value: string | number;
  disabled?: boolean;
}

export interface SelectProps {
  value: string | number;
  onChange: (value: string | number) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Select({ value, onChange, options, placeholder = 'Select...', className = '', disabled = false }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({ x: rect.left, y: rect.bottom + 6, width: rect.width });
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (triggerRef.current && !triggerRef.current.contains(target) && !target.closest('.mndp-select-portal')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const toggleOpen = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
  };

  const handleSelect = (option: SelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors 
          ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500' : 'cursor-pointer hover:border-slate-600'} 
          ${isOpen ? 'border-cyan-500 bg-[#071018]' : 'border-slate-700 bg-slate-950'} 
          ${className}`}
      >
        <span className={`block truncate text-left w-full ${selectedOption ? 'text-slate-200' : 'text-slate-500'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 text-slate-500 ${isOpen ? 'rotate-180 text-cyan-500' : ''}`} />
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scaleY: 0.95 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              exit={{ opacity: 0, y: -4, scaleY: 0.95 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                left: coords.x,
                top: coords.y,
                width: coords.width,
                zIndex: 99999,
                transformOrigin: 'top center'
              }}
              className="mndp-select-portal overflow-hidden rounded-xl border border-slate-700/80 bg-[#0c1520]/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] flex flex-col max-h-[280px]"
            >
              <div className="overflow-y-auto p-1.5 flex flex-col gap-0.5 custom-scrollbar">
                {options.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-slate-500 text-center">No options available</div>
                ) : (
                  options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                      <button
                        key={String(option.value)}
                        type="button"
                        onClick={() => handleSelect(option)}
                        disabled={option.disabled}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg text-left transition-colors
                          ${option.disabled ? 'opacity-50 cursor-not-allowed text-slate-500' : 'cursor-pointer hover:bg-cyan-500/15'}
                          ${isSelected ? 'bg-cyan-500/10 text-cyan-300 font-medium' : 'text-slate-300'}
                        `}
                      >
                        <span className="truncate pr-4">{option.label}</span>
                        {isSelected && <Check size={14} className="shrink-0 text-cyan-400" />}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
