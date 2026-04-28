import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { TransformWrapper, TransformComponent, useTransformEffect } from 'react-zoom-pan-pinch';
import { CPU, avrInstruction, AVRIOPort, portBConfig, AVRTimer, timer0Config, AVRUSART, usart0Config } from 'avr8js';
import { Play, Square, Loader2, Code2, Cpu, Wifi, Move, Plus, Trash2, Braces, Terminal } from 'lucide-react';
import '@wokwi/elements';
import ComponentLibrary from './ComponentLibrary';
import DiagramViewer from './DiagramViewer';
import SerialMonitor from './SerialMonitor';
import type { SerialLine } from './SerialMonitor';

// ??$$$ Browser-safe Intel HEX parser
function parseIntelHex(hexString: string): Uint8Array {
  const mem = new Uint8Array(32768);
  for (const line of hexString.split('\n')) {
    const l = line.trim();
    if (!l.startsWith(':')) continue;
    const byteCount = parseInt(l.substring(1, 3), 16);
    const address   = parseInt(l.substring(3, 7), 16);
    const recType   = parseInt(l.substring(7, 9), 16);
    if (recType === 0) {
      for (let i = 0; i < byteCount; i++) {
        mem[address + i] = parseInt(l.substring(9 + i * 2, 11 + i * 2), 16);
      }
    }
  }
  return mem;
}

const DEFAULT_CODE = [
  'void setup() {',
  '  pinMode(13, OUTPUT);',
  '}',
  '',
  'void loop() {',
  '  digitalWrite(13, HIGH);',
  '  delay(500);',
  '  digitalWrite(13, LOW);',
  '  delay(500);',
  '}',
].join('\n');

// ──────────────────────────────────────────────────────────────
// ??$$$ Types
// ──────────────────────────────────────────────────────────────
interface DiagramPart {
  type:  string;
  id:    string;
  top:   number;
  left:  number;
  attrs: Record<string, unknown>;
}

interface DiagramJson {
  version:     number;
  parts:       DiagramPart[];
  connections: [string, string, string, unknown[]][];
}

// ──────────────────────────────────────────────────────────────
// ??$$$ PIN MAP — pixel offsets from component CENTER (canvas-space)
// Sourced from @wokwi/elements pinInfo
// ──────────────────────────────────────────────────────────────
const UNO_HW = 137;   // half-width of wokwi-arduino-uno (274/2)
const UNO_HH = 100.5; // half-height (201/2)
const LED_HW = 20;    // half-width of wokwi-led (~40/2)
const LED_HH = 32.5;  // half-height (~65/2)

interface PinOffset { dx: number; dy: number; }

const PIN_MAP: Record<string, Record<string, PinOffset>> = {
  'wokwi-arduino-uno': {
    '13':    { dx: 125   - UNO_HW, dy: 9     - UNO_HH },
    '12':    { dx: 134.5 - UNO_HW, dy: 9     - UNO_HH },
    '11':    { dx: 144   - UNO_HW, dy: 9     - UNO_HH },
    '10':    { dx: 153.5 - UNO_HW, dy: 9     - UNO_HH },
    '9':     { dx: 163   - UNO_HW, dy: 9     - UNO_HH },
    '8':     { dx: 173   - UNO_HW, dy: 9     - UNO_HH },
    'GND.1': { dx: 115.5 - UNO_HW, dy: 9     - UNO_HH },
    'AREF':  { dx: 106   - UNO_HW, dy: 9     - UNO_HH },
    '5V':    { dx: 160   - UNO_HW, dy: 191.5 - UNO_HH },
    'GND.2': { dx: 169.5 - UNO_HW, dy: 191.5 - UNO_HH },
    'GND.3': { dx: 179   - UNO_HW, dy: 191.5 - UNO_HH },
    'A0':    { dx: 208   - UNO_HW, dy: 191.5 - UNO_HH },
    'A1':    { dx: 217.5 - UNO_HW, dy: 191.5 - UNO_HH },
  },
  'wokwi-led': {
    'A': { dx: 25 - LED_HW, dy: 42 - LED_HH },
    'C': { dx: 15 - LED_HW, dy: 42 - LED_HH },
  },
};

// ??$$$ PIN_LOCAL — local pixel position within the component div (from top-left)
// = pinInfo.x, pinInfo.y from @wokwi/elements source directly
const PIN_LOCAL: Record<string, Record<string, { x: number; y: number }>> = {
  'wokwi-arduino-uno': {
    '13':    { x: 125,   y: 9     },
    '12':    { x: 134.5, y: 9     },
    '11':    { x: 144,   y: 9     },
    '10':    { x: 153.5, y: 9     },
    '9':     { x: 163,   y: 9     },
    '8':     { x: 173,   y: 9     },
    'GND.1': { x: 115.5, y: 9     },
    'AREF':  { x: 106,   y: 9     },
    '5V':    { x: 160,   y: 191.5 },
    'GND.2': { x: 169.5, y: 191.5 },
    'GND.3': { x: 179,   y: 191.5 },
    'A0':    { x: 208,   y: 191.5 },
    'A1':    { x: 217.5, y: 191.5 },
  },
  'wokwi-led': {
    'A': { x: 25, y: 42 },
    'C': { x: 15, y: 42 },
  },
};

// Half-sizes per component type for screen-space coordinate conversion
const COMPONENT_HW: Record<string, number> = { 'wokwi-arduino-uno': UNO_HW, 'wokwi-led': LED_HW };
const COMPONENT_HH: Record<string, number> = { 'wokwi-arduino-uno': UNO_HH, 'wokwi-led': LED_HH };

const WIRE_COLORS = ['#22c55e','#3b82f6','#f59e0b','#ec4899','#a855f7','#06b6d4','#f97316'];

function getPinXY(parts: DiagramPart[], partId: string, pinName: string): { x: number; y: number } | null {
  const part = parts.find(p => p.id === partId);
  if (!part) return null;
  const offset = PIN_MAP[part.type]?.[pinName];
  if (!offset) return null;
  return { x: part.left + offset.dx, y: part.top + offset.dy };
}

// ──────────────────────────────────────────────────────────────
// Diagram state helpers
// ──────────────────────────────────────────────────────────────
const DEFAULT_DIAGRAM: DiagramJson = {
  version: 1,
  parts: [
    { type: 'wokwi-arduino-uno', id: 'uno',  top: 0,    left: 0,   attrs: {} },
    { type: 'wokwi-led',         id: 'led1', top: -110, left: 260, attrs: { color: 'blue' } },
    { type: 'wokwi-led',         id: 'led2', top: 90,   left: 260, attrs: { color: 'red'  } },
  ],
  connections: [
    ['uno:13',    'led1:A', '#22c55e', []],
    ['uno:GND.1', 'led1:C', '#6b7280', []],
    ['uno:12',    'led2:A', '#3b82f6', []],
    ['uno:GND.1', 'led2:C', '#6b7280', []],
  ],
};

const STORAGE_KEY = 'nova-diagram-v1';
function loadDiagram(): DiagramJson {
  try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s); } catch { /* */ }
  return DEFAULT_DIAGRAM;
}
function saveDiagram(d: DiagramJson) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }

// ──────────────────────────────────────────────────────────────
// ??$$$ Wire Overlay SVG — draws bezier wires in canvas-space
// ──────────────────────────────────────────────────────────────
function WireOverlay({ diagram }: { diagram: DiagramJson }) {
  return (
    <svg
      style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '6000px', height: '6000px',
        overflow: 'visible', pointerEvents: 'none', zIndex: 0,
      }}
      viewBox="-3000 -3000 6000 6000"
    >
      {diagram.connections.map((conn, i) => {
        const [fromRef, toRef, color] = conn;
        const [fromId, fromPin] = fromRef.split(':');
        const [toId,   toPin]   = toRef.split(':');
        const p1 = getPinXY(diagram.parts, fromId, fromPin);
        const p2 = getPinXY(diagram.parts, toId,   toPin);
        if (!p1 || !p2) return null;
        const mx = (p1.x + p2.x) / 2;
        const d  = ['M', p1.x, p1.y, 'C', mx, p1.y, mx, p2.y, p2.x, p2.y].join(' ');
        return (
          <g key={i}>
            <path d={d} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round" opacity={0.12} />
            <path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" opacity={0.9} />
            <circle cx={p1.x} cy={p1.y} r={3} fill={color} opacity={0.8} />
            <circle cx={p2.x} cy={p2.y} r={3} fill={color} opacity={0.8} />
          </g>
        );
      })}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────
// ??$$$ Wire Preview — live screen-space SVG shown during wiring
// ──────────────────────────────────────────────────────────────
interface WirePreviewProps {
  fromX: number; fromY: number;
  toX: number;   toY: number;
  color: string;
}
function WirePreview({ fromX, fromY, toX, toY, color }: WirePreviewProps) {
  const mx = (fromX + toX) / 2;
  const d = ['M', fromX, fromY, 'C', mx, fromY, mx, toY, toX, toY].join(' ');
  return (
    <svg style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 999 }}>
      <path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeDasharray="7 4" opacity={0.85} />
      <circle cx={fromX} cy={fromY} r={4} fill={color} opacity={0.9} />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────
// ??$$$ Draggable Part — drag + pin dots for wiring
// ──────────────────────────────────────────────────────────────
interface WiringFrom { partId: string; pin: string; screenX: number; screenY: number; }

interface DraggablePartProps {
  part:           DiagramPart;
  live:           Record<string, unknown>;
  wiringFrom:     WiringFrom | null;
  onDragEnd:      (id: string, top: number, left: number) => void;
  onDelete:       (id: string) => void;
  onPinClick:     (partId: string, pin: string, screenX: number, screenY: number) => void;
}

function DraggablePart({ part, live, wiringFrom, onDragEnd, onDelete, onPinClick }: DraggablePartProps) {
  const scaleRef = useRef(1);
  useTransformEffect(({ state }) => { scaleRef.current = state.scale; });

  const dragging   = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const startPos   = useRef({ top: 0, left: 0 });
  const [pos, setPos]               = useState({ top: part.top, left: part.left });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { setPos({ top: part.top, left: part.left }); }, [part.top, part.left]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current   = true;
    startMouse.current = { x: e.clientX, y: e.clientY };
    startPos.current   = { top: pos.top, left: pos.left };
    setIsDragging(true);

    const onMouseMove = (me: MouseEvent) => {
      if (!dragging.current) return;
      const s = scaleRef.current;
      setPos({ top: startPos.current.top + (me.clientY - startMouse.current.y) / s, left: startPos.current.left + (me.clientX - startMouse.current.x) / s });
    };
    const onMouseUp = (me: MouseEvent) => {
      dragging.current = false;
      setIsDragging(false);
      const s = scaleRef.current;
      const finalTop  = startPos.current.top  + (me.clientY - startMouse.current.y) / s;
      const finalLeft = startPos.current.left + (me.clientX - startMouse.current.x) / s;
      setPos({ top: finalTop, left: finalLeft });
      onDragEnd(part.id, finalTop, finalLeft);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [pos, part.id, onDragEnd]);

  const localPins  = PIN_LOCAL[part.type] ?? {};
  const isLedOn    = part.type === 'wokwi-led' && live.value;
  const glowColor  = part.attrs.color === 'red' ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.4)';
  const showPinDots = Object.keys(localPins).length > 0;
  const isWiring   = wiringFrom !== null;

  const wrapStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%', left: '50%',
    transform: 'translate(calc(-50% + ' + pos.left + 'px), calc(-50% + ' + pos.top + 'px))',
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none',
    transition: isDragging ? 'none' : 'transform 0.05s ease-out',
    zIndex: isDragging ? 100 : 2,
  };

  return (
    <div style={wrapStyle} className="drop-shadow-2xl group" onMouseDown={onMouseDown}>
      {/* Label + delete hover badge */}
      <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-50 hidden group-hover:flex items-center gap-1.5 rounded-full bg-neutral-800/95 border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400 whitespace-nowrap backdrop-blur-sm pointer-events-none select-none">
        <Move className="h-2.5 w-2.5" />
        {part.id}
      </div>
      {/* Delete button */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(part.id); }}
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute -top-2 -right-2 z-50 hidden group-hover:flex items-center justify-center h-5 w-5 rounded-full bg-red-500/90 hover:bg-red-500 border border-red-400/30 text-white transition-all shadow-lg"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </button>

      {/* Wokwi component */}
      {React.createElement(part.type, { ...part.attrs, ...live })}

      {/* LED glow */}
      {isLedOn && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full blur-xl animate-pulse pointer-events-none" style={{ backgroundColor: glowColor }} />
      )}

      {/* Drag outline */}
      {isDragging && <div className="absolute inset-0 rounded-lg ring-2 ring-indigo-500/60 pointer-events-none" />}

      {/* ??$$$ Pin dots — visible on hover or during wiring mode */}
      {showPinDots && (
        <div className={isWiring ? 'block' : 'hidden group-hover:block'}>
          {Object.entries(localPins).map(([pinName, pos]) => {
            const isSource = wiringFrom?.partId === part.id && wiringFrom?.pin === pinName;
            const dotStyle: React.CSSProperties = {
              position: 'absolute',
              left: pos.x - 5,
              top:  pos.y - 5,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: isSource ? '#a78bfa' : '#6366f1',
              border: '2px solid rgba(255,255,255,0.6)',
              cursor: 'crosshair',
              zIndex: 60,
              boxShadow: isSource ? '0 0 8px #a78bfa' : '0 0 4px rgba(99,102,241,0.6)',
            };
            return (
              <div
                key={pinName}
                style={dotStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  onPinClick(part.id, pinName, rect.left + rect.width / 2, rect.top + rect.height / 2);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title={part.id + ':' + pinName}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// SimCanvas
// ──────────────────────────────────────────────────────────────
interface SimCanvasProps {
  diagram:    DiagramJson;
  partStates: Record<string, Record<string, unknown>>;
  wiringFrom: WiringFrom | null;
  onDragEnd:  (id: string, top: number, left: number) => void;
  onDelete:   (id: string) => void;
  onPinClick: (partId: string, pin: string, x: number, y: number) => void;
}
function SimCanvas({ diagram, partStates, wiringFrom, onDragEnd, onDelete, onPinClick }: SimCanvasProps) {
  return (
    <div className="relative w-full h-full">
      <WireOverlay diagram={diagram} />
      {diagram.parts.map(part => (
        <DraggablePart
          key={part.id}
          part={part}
          live={partStates[part.id] ?? {}}
          wiringFrom={wiringFrom}
          onDragEnd={onDragEnd}
          onDelete={onDelete}
          onPinClick={onPinClick}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main App
// ──────────────────────────────────────────────────────────────
export default function App() {
  const [code,        setCode]       = useState(DEFAULT_CODE);
  const [isCompiling, setCompiling]  = useState(false);
  const [isRunning,   setRunning]    = useState(false);
  const [log,         setLog]        = useState('Ready. Hover a part to see its pins.');
  const [partStates,  setPartStates] = useState<Record<string, Record<string, unknown>>>({});
  const [diagram,     setDiagram]    = useState<DiagramJson>(loadDiagram);
  const [libOpen,     setLibOpen]    = useState(false);
  const [jsonOpen,    setJsonOpen]   = useState(false);
  const [serialOpen,  setSerialOpen] = useState(false);
  // ??$$$ Serial Monitor state
  const [serialLines, setSerialLines] = useState<SerialLine[]>([]);
  const serialBuf  = useRef('');        // character accumulation buffer
  const serialIdx  = useRef(0);        // monotonic line index for React keys
  const BAUD_RATE  = 9600;
  const [wiringFrom,  setWiringFrom] = useState<WiringFrom | null>(null);
  const [mousePos,    setMousePos]   = useState({ x: 0, y: 0 });

  const rafRef = useRef<number | null>(null);

  const stopSim = () => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setRunning(false);
    setPartStates({});
    serialBuf.current = '';     // flush partial line
    setLog('Simulation stopped.');
  };
  useEffect(() => () => stopSim(), []);

  // Track mouse position for live wire preview
  useEffect(() => {
    if (!wiringFrom) return;
    const handler = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [wiringFrom]);

  // Cancel wiring on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setWiringFrom(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ??$$$ Pin click handler — starts or completes a wire
  const handlePinClick = useCallback((partId: string, pin: string, screenX: number, screenY: number) => {
    if (!wiringFrom) {
      setWiringFrom({ partId, pin, screenX, screenY });
      setLog('Wiring ' + partId + ':' + pin + ' — click another pin to connect. Esc to cancel.');
    } else {
      // Don't wire to same part or same pin
      if (wiringFrom.partId === partId && wiringFrom.pin === pin) { setWiringFrom(null); return; }
      const color = WIRE_COLORS[diagram.connections.length % WIRE_COLORS.length];
      const conn: [string, string, string, unknown[]] = [
        wiringFrom.partId + ':' + wiringFrom.pin,
        partId + ':' + pin,
        color,
        [],
      ];
      setDiagram(prev => {
        const next = { ...prev, connections: [...prev.connections, conn] };
        saveDiagram(next);
        return next;
      });
      setWiringFrom(null);
      setLog('Wire added: ' + conn[0] + ' → ' + conn[1]);
    }
  }, [wiringFrom, diagram.connections.length]);

  const handleDragEnd = useCallback((id: string, top: number, left: number) => {
    setDiagram(prev => {
      const next = { ...prev, parts: prev.parts.map(p => p.id === id ? { ...p, top, left } : p) };
      saveDiagram(next);
      return next;
    });
  }, []);

  const addPart = useCallback((type: string, attrs: Record<string, unknown>) => {
    setDiagram(prev => {
      const count  = prev.parts.filter(p => p.type === type).length;
      const baseId = type.replace('wokwi-', '').replace(/-/g, '');
      const id     = baseId + (count + 1);
      const spread = count * 40;
      const next   = { ...prev, parts: [...prev.parts, { type, id, top: spread, left: spread, attrs }] };
      saveDiagram(next);
      return next;
    });
  }, []);

  const deletePart = useCallback((id: string) => {
    setDiagram(prev => {
      const next: DiagramJson = {
        ...prev,
        parts:       prev.parts.filter(p => p.id !== id),
        connections: prev.connections.filter(c => !c[0].startsWith(id + ':') && !c[1].startsWith(id + ':')),
      };
      saveDiagram(next);
      return next;
    });
  }, []);

  const resetLayout = () => { localStorage.removeItem(STORAGE_KEY); setDiagram(DEFAULT_DIAGRAM); };

  // ??$$$ Called by the DiagramViewer Monaco editor on every valid JSON edit
  const handleDiagramEdit = useCallback((raw: object) => {
    const d = raw as DiagramJson;
    if (!Array.isArray(d.parts) || !Array.isArray(d.connections)) return;
    saveDiagram(d);
    setDiagram(d);
  }, []);

  const runSim = async () => {
    stopSim();
    setCompiling(true);
    setLog('Compiling...');
    try {
      const res  = await fetch('http://localhost:4001/compile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const data = await res.json();
      if (!res.ok || data.error) { setLog('Backend error: ' + (data.error ?? '')); setCompiling(false); return; }
      if (!data.hex)             { setLog('Compile failed: ' + (data.stderr || 'Unknown')); setCompiling(false); return; }
      setLog('Compile OK — loading into AVR8js...');
      const bytes   = parseIntelHex(data.hex);
      const program = new Uint16Array(16384);
      for (let i = 0; i < bytes.length; i += 2) program[i >> 1] = bytes[i] | (bytes[i + 1] << 8);
      const cpu   = new CPU(program);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const timer = new AVRTimer(cpu, timer0Config);
      const portB = new AVRIOPort(cpu, portBConfig);

      // ??$$$ USART0 — captures Serial.print() output from sketch
      const usart = new AVRUSART(cpu, usart0Config, 16e6);
      usart.onByteTransmit = (byte: number) => {
        const ch = String.fromCharCode(byte);
        if (ch === '\n') {
          // complete line — push to state
          const line = serialBuf.current;
          serialBuf.current = '';
          const now = new Date();
          const ts  = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0');
          setSerialLines(prev => [...prev, { text: line, timestamp: ts, idx: serialIdx.current++ }]);
        } else if (ch !== '\r') {
          serialBuf.current += ch;
        }
      };
      portB.addListener(() => {
        const pb5 = portB.pinState(5) === 1;
        const pb4 = portB.pinState(4) === 1;
        setPartStates({ led1: { value: pb5 }, led2: { value: pb4 } });
      });
      setCompiling(false);
      setRunning(true);
      setLog('Running at 16 MHz...');
      const tick = () => { for (let i = 0; i < 50000; i++) { avrInstruction(cpu); cpu.tick(); } if (rafRef.current !== null) rafRef.current = requestAnimationFrame(tick); };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: unknown) {
      setLog('Error: ' + (e instanceof Error ? e.message : String(e)));
      setCompiling(false);
    }
  };

  const btnClass = isRunning
    ? 'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer'
    : 'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_18px_rgba(99,102,241,0.4)] hover:shadow-[0_0_24px_rgba(99,102,241,0.6)] transition-all cursor-pointer';

  const dotClass = isRunning
    ? 'h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
    : 'h-2 w-2 rounded-full bg-neutral-600';

  return (
    <div className="flex h-screen w-full bg-neutral-950 text-neutral-100 font-sans overflow-hidden">

      {/* Live wire preview overlay */}
      {wiringFrom && (
        <WirePreview
          fromX={wiringFrom.screenX}
          fromY={wiringFrom.screenY}
          toX={mousePos.x}
          toY={mousePos.y}
          color={WIRE_COLORS[diagram.connections.length % WIRE_COLORS.length]}
        />
      )}

      {/* ── LEFT: Code Editor ─── */}
      <div className="flex w-[420px] shrink-0 flex-col border-r border-neutral-800 bg-neutral-900/60 backdrop-blur-xl z-20 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
              <Cpu className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white leading-none">Nova Simulator</h1>
              <p className="text-[11px] text-neutral-500 mt-0.5">AVR8js · Wire Mode</p>
            </div>
          </div>
          <button onClick={isRunning ? stopSim : runSim} disabled={isCompiling} className={btnClass}>
            {isCompiling ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : isRunning ? <Square className="h-3.5 w-3.5" fill="currentColor" />
              : <Play className="h-3.5 w-3.5 ml-0.5" fill="currentColor" />}
            {isCompiling ? 'Compiling…' : isRunning ? 'Stop' : 'Deploy'}
          </button>
        </div>

        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-neutral-800 bg-neutral-900/80">
          <Code2 className="h-3.5 w-3.5 text-neutral-500" />
          <span className="text-[11px] font-medium text-neutral-400">sketch.ino</span>
        </div>

        <div className="flex-1 relative">
          <Editor
            height="100%"
            language="cpp"
            theme="vs-dark"
            value={code}
            onChange={(v) => setCode(v ?? '')}
            options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace", padding: { top: 20 }, scrollBeyondLastLine: false }}
          />
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 border-t border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-2 min-w-0">
            <Wifi className="h-3 w-3 text-neutral-600 shrink-0" />
            <span className="text-[11px] text-neutral-500 truncate">{log}</span>
          </div>
          <button onClick={resetLayout} className="ml-3 shrink-0 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors">Reset</button>
        </div>
      </div>

      {/* ── RIGHT: Canvas ─── */}
      <div className="relative flex-1 overflow-hidden bg-neutral-950">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle, #555 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

        {/* ??$$$ Wiring mode banner */}
        {wiringFrom && (
          <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-center gap-3 bg-indigo-600/90 backdrop-blur-sm py-2 text-xs text-white font-medium">
            <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
            Wiring {wiringFrom.partId}:{wiringFrom.pin} — click a destination pin
            <button onClick={() => setWiringFrom(null)} className="ml-2 underline opacity-70 hover:opacity-100">Cancel (Esc)</button>
          </div>
        )}

        {/* Status + toolbar */}
        <div className="absolute top-5 left-5 z-20 flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/80 px-3.5 py-1.5 text-xs backdrop-blur-md shadow-xl">
            <div className={dotClass} />
            <span className="text-neutral-300 font-medium">{isRunning ? 'Running' : 'Idle'}</span>
          </div>
          <button
            onClick={() => setLibOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-full border border-neutral-700/60 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:border-indigo-500/40 hover:bg-neutral-800/80 backdrop-blur-md shadow-xl transition-all"
          >
            <Plus className="h-3 w-3" />
            Add Part
          </button>
          <button
            onClick={() => setJsonOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-full border border-neutral-700/60 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:border-indigo-500/40 hover:bg-neutral-800/80 backdrop-blur-md shadow-xl transition-all"
          >
            <Braces className="h-3 w-3" />
            JSON
          </button>
          <button
            onClick={() => setSerialOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-full border border-neutral-700/60 bg-neutral-900/80 px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:border-emerald-500/30 hover:bg-neutral-800/80 backdrop-blur-md shadow-xl transition-all"
          >
            <Terminal className="h-3 w-3" />
            Serial
            {serialLines.length > 0 && (
              <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] px-1.5">
                {serialLines.length}
              </span>
            )}
          </button>
        </div>

        {/* Hint */}
        <div className="absolute top-5 right-5 z-20 flex items-center gap-2 rounded-full border border-neutral-800/50 bg-neutral-900/60 px-3 py-1.5 text-[10px] text-neutral-500 backdrop-blur-md">
          <Move className="h-3 w-3" />
          Drag · Zoom · Hover to wire
        </div>

        {/* Panels */}
        <ComponentLibrary isOpen={libOpen} onClose={() => setLibOpen(false)} onAdd={addPart} />
        <DiagramViewer isOpen={jsonOpen} onClose={() => setJsonOpen(false)} diagram={diagram} onDiagramChange={handleDiagramEdit} />
        <SerialMonitor
          isOpen={serialOpen}
          onClose={() => setSerialOpen(false)}
          lines={serialLines}
          onClear={() => setSerialLines([])}
          running={isRunning}
          baudRate={BAUD_RATE}
        />

        <TransformWrapper initialScale={0.8} minScale={0.1} maxScale={5} centerOnInit panning={{ activationKeys: [] }}>
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%', cursor: 'default' }}
            contentStyle={{ width: '100%', height: '100%' }}
          >
            <SimCanvas
              diagram={diagram}
              partStates={partStates}
              wiringFrom={wiringFrom}
              onDragEnd={handleDragEnd}
              onDelete={deletePart}
              onPinClick={handlePinClick}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
    </div>
  );
}
