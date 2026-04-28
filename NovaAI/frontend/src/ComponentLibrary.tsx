import React, { useState } from 'react';
import { Search, X, Cpu, Zap, ToggleLeft, CircleDot } from 'lucide-react';

// ??$$$ All wokwi-elements available for dropping onto the canvas
export interface LibraryItem {
  type:         string;
  label:        string;
  description:  string;
  defaultAttrs: Record<string, unknown>;
  icon:         React.ReactNode;
}

export interface LibraryCategory {
  label: string;
  icon:  React.ReactNode;
  items: LibraryItem[];
}

export const COMPONENT_LIBRARY: LibraryCategory[] = [
  {
    label: 'Microcontrollers',
    icon:  <Cpu className="h-3.5 w-3.5" />,
    items: [
      {
        type: 'wokwi-arduino-uno',
        label: 'Arduino Uno',
        description: 'ATmega328P @ 16 MHz',
        defaultAttrs: {},
        icon: <Cpu className="h-4 w-4 text-indigo-400" />,
      },
    ],
  },
  {
    label: 'Outputs',
    icon:  <Zap className="h-3.5 w-3.5" />,
    items: [
      {
        type: 'wokwi-led',
        label: 'LED (Red)',
        description: 'Light-emitting diode',
        defaultAttrs: { color: 'red' },
        icon: <CircleDot className="h-4 w-4 text-red-400" />,
      },
      {
        type: 'wokwi-led',
        label: 'LED (Blue)',
        description: 'Light-emitting diode',
        defaultAttrs: { color: 'blue' },
        icon: <CircleDot className="h-4 w-4 text-blue-400" />,
      },
      {
        type: 'wokwi-led',
        label: 'LED (Green)',
        description: 'Light-emitting diode',
        defaultAttrs: { color: 'green' },
        icon: <CircleDot className="h-4 w-4 text-green-400" />,
      },
      {
        type: 'wokwi-7segment',
        label: '7-Segment',
        description: 'Single-digit display',
        defaultAttrs: {},
        icon: <span className="text-[10px] font-mono font-bold text-amber-400">7SEG</span>,
      },
    ],
  },
  {
    label: 'Inputs',
    icon:  <ToggleLeft className="h-3.5 w-3.5" />,
    items: [
      {
        type: 'wokwi-pushbutton',
        label: 'Push Button',
        description: 'Momentary tactile switch',
        defaultAttrs: { color: 'green' },
        icon: <ToggleLeft className="h-4 w-4 text-green-400" />,
      },
      {
        type: 'wokwi-slide-switch',
        label: 'Slide Switch',
        description: 'SPDT slide switch',
        defaultAttrs: {},
        icon: <ToggleLeft className="h-4 w-4 text-sky-400" />,
      },
    ],
  },
];

// ──────────────────────────────────────────────────────────────
// Component Library Panel
// ──────────────────────────────────────────────────────────────
interface Props {
  isOpen:  boolean;
  onClose: () => void;
  onAdd:   (type: string, attrs: Record<string, unknown>) => void;
}

export default function ComponentLibrary({ isOpen, onClose, onAdd }: Props) {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filtered = COMPONENT_LIBRARY.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(cat => cat.items.length > 0);

  return (
    <>
      {/* Backdrop (click away to close) */}
      <div
        className="absolute inset-0 z-20"
        onClick={onClose}
        style={{ background: 'transparent' }}
      />

      {/* Panel */}
      <div className="absolute top-16 left-5 z-30 w-72 rounded-2xl border border-neutral-800 bg-neutral-900/97 backdrop-blur-xl shadow-2xl overflow-hidden"
           style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05), 0 24px 60px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-neutral-800">
          <span className="text-sm font-semibold text-white tracking-tight">Component Library</span>
          <button onClick={onClose} className="flex items-center justify-center h-6 w-6 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 bg-neutral-800/60 rounded-lg px-3 py-2 ring-1 ring-transparent focus-within:ring-indigo-500/40 transition-all">
            <Search className="h-3.5 w-3.5 text-neutral-500 shrink-0" />
            <input
              type="text"
              placeholder="Search components..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="flex-1 bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
            />
          </div>
        </div>

        {/* Component list */}
        <div className="overflow-y-auto max-h-[420px] py-2 scrollbar-thin">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-neutral-500 text-sm">No components found</div>
          )}
          {filtered.map(cat => (
            <div key={cat.label}>
              {/* Category header */}
              <div className="flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-widest text-neutral-500 font-semibold">
                {cat.icon}
                {cat.label}
              </div>

              {/* Items */}
              {cat.items.map((item, idx) => (
                <button
                  key={item.type + idx}
                  onClick={() => { onAdd(item.type, item.defaultAttrs); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 active:bg-white/10 transition-colors text-left group"
                >
                  {/* Icon box */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-700/60 bg-neutral-800/80">
                    {item.icon}
                  </div>

                  {/* Text */}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-200 group-hover:text-white leading-none mb-0.5 transition-colors">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-neutral-500 leading-none">{item.description}</div>
                  </div>

                  {/* Add badge */}
                  <div className="ml-auto shrink-0 rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-400 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    + Add
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2.5 border-t border-neutral-800 text-[10px] text-neutral-600">
          Click any component to drop it onto the canvas
        </div>
      </div>
    </>
  );
}
