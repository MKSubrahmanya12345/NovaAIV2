import { useEffect, useRef, useState } from 'react';
import { X, Trash2, Terminal, WifiOff } from 'lucide-react';

export interface SerialLine {
  text:      string;
  timestamp: string;
  idx:       number;
}

interface Props {
  isOpen:   boolean;
  onClose:  () => void;
  lines:    SerialLine[];
  onClear:  () => void;
  running:  boolean;
  baudRate: number;
}

export default function SerialMonitor({ isOpen, onClose, lines, onClear, running, baudRate }: Props) {
  const bottomRef  = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom whenever new lines arrive
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoScroll]);

  if (!isOpen) return null;

  return (
    <div
      className="absolute bottom-0 inset-x-0 z-30 flex flex-col border-t border-neutral-800"
      style={{
        height: '240px',
        background: 'rgba(5,5,5,0.97)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800/80 shrink-0">
        <div className="flex items-center gap-3">
          <Terminal className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-white tracking-tight">Serial Monitor</span>

          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium border"
               style={running
                 ? { background: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)', color: '#4ade80' }
                 : { background: 'rgba(100,100,100,0.08)', borderColor: 'rgba(100,100,100,0.2)', color: '#6b7280' }
               }
          >
            {running
              ? <><div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />Connected</>
              : <><WifiOff className="h-2.5 w-2.5" />Disconnected</>
            }
          </div>

          <span className="text-[10px] text-neutral-600">{baudRate} baud</span>
          <span className="text-[10px] text-neutral-600">{lines.length} lines</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(p => !p)}
            className="text-[10px] px-2 py-0.5 rounded-md border transition-all"
            style={autoScroll
              ? { background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.3)', color: '#818cf8' }
              : { background: 'transparent', borderColor: 'rgba(75,75,75,0.5)', color: '#6b7280' }
            }
          >
            Auto-scroll
          </button>

          {/* Clear */}
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-neutral-700/50 text-neutral-500 hover:text-white hover:border-neutral-600 transition-all"
          >
            <Trash2 className="h-2.5 w-2.5" />
            Clear
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex items-center justify-center h-5 w-5 rounded-md text-neutral-600 hover:text-white hover:bg-neutral-800 transition-all"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Output area ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-6 scrollbar-thin">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-700">
            <Terminal className="h-6 w-6" />
            <span className="text-xs">No output yet — Deploy and run your sketch to see Serial data</span>
          </div>
        ) : (
          <>
            {lines.map(line => (
              <div key={line.idx} className="flex items-start gap-3 hover:bg-white/[0.02] px-1 rounded group">
                {/* Timestamp */}
                <span className="text-neutral-700 shrink-0 text-[10px] mt-0.5 select-none w-20 text-right">
                  {line.timestamp}
                </span>
                {/* Separator */}
                <span className="text-neutral-800 select-none shrink-0">│</span>
                {/* Content */}
                <span className="text-emerald-300 break-all">{line.text}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  );
}
