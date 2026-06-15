'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import {
  BUCKETS,
  BUCKET_KEYS,
  CATEGORIES,
  type BucketKey,
  type Category,
  type SignalEvent,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Flow types (type aliases — implicit index signatures satisfy Record)
// ---------------------------------------------------------------------------

type StoryNodeData = { event: SignalEvent; isNew: boolean; dim: boolean };
type EntityNodeData = { label: string; dim: boolean };
type ZoneNodeData = { label: string; icon: string; color: string; width: number; height: number; count: number };

type StoryFlowNode = Node<StoryNodeData, 'story'>;
type EntityFlowNode = Node<EntityNodeData, 'entity'>;
type ZoneFlowNode = Node<ZoneNodeData, 'zone'>;
type FlowNode = StoryFlowNode | EntityFlowNode | ZoneFlowNode;

type ThreadEdgeData = {
  color: string;
  strength: number;
  relationship: string;
  dim: boolean;
  onOpen: () => void;
};
type ThreadFlowEdge = Edge<ThreadEdgeData, 'thread'>;

/** A clicked connection, handed up to the dashboard for the insight popup. */
export interface EdgePair {
  a: SignalEvent;
  b: SignalEvent;
  relationship: string;
  strength: number;
  /** The agent's own explanation of why these stories are linked ('' if not given). */
  reason: string;
}

// ---------------------------------------------------------------------------
// Custom node renderers
// ---------------------------------------------------------------------------

function StoryNode({ data, selected }: NodeProps<StoryFlowNode>) {
  const ev = data.event;
  const color = CATEGORIES[ev.category].color;
  const width = 180 + Math.min(10, Math.max(0, ev.viewer_interest_score)) * 7;
  const risky = ev.risk_score >= 7 || ev.confidence === 'low';
  const verifyCount = ev.verification_needed.length + ev.claims_to_verify.length;
  const confColor =
    ev.confidence === 'high' ? '#34d399' : ev.confidence === 'medium' ? '#fbbf24' : '#fb7185';

  return (
    <div
      className={`node-card rounded-xl border px-3 py-2.5 ${data.isNew ? 'animate-node-pop animate-glow-pulse' : ''}`}
      style={
        {
          width,
          opacity: data.dim ? 0.13 : 1,
          background: 'rgba(11, 17, 36, 0.92)',
          borderColor: selected ? '#22d3ee' : risky ? 'rgba(251,113,133,0.55)' : `${color}55`,
          borderStyle: risky ? 'dashed' : 'solid',
          boxShadow: selected
            ? '0 0 0 2px rgba(34,211,238,0.5), 0 0 24px rgba(34,211,238,0.35)'
            : `0 0 ${8 + ev.viewer_interest_score * 2}px ${color}${risky ? '30' : '40'}`,
          '--glow': `${color}66`,
        } as React.CSSProperties
      }
    >
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>
          {BUCKETS[ev.bucket].icon} {CATEGORIES[ev.category].label}
        </span>
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: confColor, boxShadow: `0 0 6px ${confColor}` }}
          title={`${ev.confidence} confidence`}
        />
      </div>
      <div
        className="text-[11px] font-semibold leading-snug text-slate-100"
        style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >
        {ev.title}
      </div>
      {(risky || verifyCount > 0 || ev.status === 'draft') && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {ev.status === 'draft' && (
            <span className="rounded bg-slate-500/20 px-1 py-px text-[8px] font-bold uppercase text-slate-300">draft</span>
          )}
          {risky && (
            <span className="rounded bg-rose-500/20 px-1 py-px text-[8px] font-bold uppercase text-rose-300">⚠ caution</span>
          )}
          {verifyCount > 0 && (
            <span className="rounded bg-amber-400/20 px-1 py-px text-[8px] font-bold uppercase text-amber-300">
              ⚑ verify ×{verifyCount}
            </span>
          )}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}

function EntityNode({ data, selected }: NodeProps<EntityFlowNode>) {
  return (
    <div
      className="rounded-full border border-slate-600/50 bg-slate-800/80 px-2.5 py-1 text-[10px] font-medium text-slate-300"
      style={{
        opacity: data.dim ? 0.1 : 0.92,
        boxShadow: selected ? '0 0 0 2px rgba(34,211,238,0.5)' : '0 0 10px rgba(148,163,184,0.15)',
      }}
    >
      <Handle type="target" position={Position.Top} className="!h-1 !w-1 !border-0 !bg-transparent" />
      ◇ {data.label}
      <Handle type="source" position={Position.Bottom} className="!h-1 !w-1 !border-0 !bg-transparent" />
    </div>
  );
}

/** Sector territory rendered behind the nodes it contains. */
function ZoneNode({ data }: NodeProps<ZoneFlowNode>) {
  return (
    <div
      className="relative rounded-[40px] border-2 border-dashed"
      style={{
        width: data.width,
        height: data.height,
        borderColor: `${data.color}4d`,
        background: `radial-gradient(ellipse at 18% 0%, ${data.color}14, transparent 62%)`,
        boxShadow: `inset 0 0 70px ${data.color}0a, 0 0 30px ${data.color}14`,
      }}
    >
      <div
        className="absolute left-6 top-[-14px] flex items-center gap-2 rounded-full border px-3 py-1"
        style={{ color: data.color, borderColor: `${data.color}55`, background: 'rgba(6, 10, 22, 0.95)' }}
      >
        <span className="text-lg leading-none">{data.icon}</span>
        <span className="text-[13px] font-bold uppercase tracking-[0.3em]">{data.label}</span>
        <span className="rounded-full px-2 text-[12px] font-bold" style={{ background: `${data.color}24` }}>
          {data.count}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom edge: glowing thread with traveling data packets, clickable label
// ---------------------------------------------------------------------------

function ThreadEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<ThreadFlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const strength = data?.strength ?? 5;
  const dur = Math.max(1.8, 5.6 - strength * 0.35);
  const color = data?.color ?? '#a78bfa';
  const dim = data?.dim ?? false;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={18} />
      {!dim && (
        <>
          <circle r={2.4} fill={color} opacity={0.95}>
            <animateMotion dur={`${dur}s`} repeatCount="indefinite" path={path} />
          </circle>
          <circle r={1.3} fill="#ffffff" opacity={0.55}>
            <animateMotion dur={`${dur}s`} begin={`${dur / 2}s`} repeatCount="indefinite" path={path} />
          </circle>
        </>
      )}
      <EdgeLabelRenderer>
        <button
          onClick={(e) => {
            e.stopPropagation();
            data?.onOpen();
          }}
          className="nodrag nopan pointer-events-auto absolute cursor-pointer rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider transition hover:scale-110"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            color,
            borderColor: `${color}50`,
            background: 'rgba(9, 14, 30, 0.92)',
            opacity: dim ? 0.1 : 1,
            boxShadow: `0 0 10px ${color}30`,
          }}
          title="Click for connection insight"
        >
          {data?.relationship}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { story: StoryNode, entity: EntityNode, zone: ZoneNode };
const edgeTypes = { thread: ThreadEdge };

// ---------------------------------------------------------------------------
// Layout: bucket territories on an ellipse, golden-spiral inside each
// ---------------------------------------------------------------------------

const GOLDEN = 2.399963;
const NODE_W = 250;
const NODE_H = 100;
const ZONE_PAD = 75;

function hashAngle(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 360) * Math.PI) / 180;
}

function bucketAnchor(bucket: BucketKey): { x: number; y: number } {
  const i = BUCKET_KEYS.indexOf(bucket);
  const angle = (i / BUCKET_KEYS.length) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * 760, y: Math.sin(angle) * 480 };
}

function storyPosition(bucket: BucketKey, indexInBucket: number): { x: number; y: number } {
  const anchor = bucketAnchor(bucket);
  if (indexInBucket === 0) return anchor;
  const a = indexInBucket * GOLDEN;
  const r = 130 + 85 * Math.sqrt(indexInBucket);
  return { x: anchor.x + Math.cos(a) * r, y: anchor.y + Math.sin(a) * r };
}

function relationColor(relationship: string): string {
  const r = relationship.toLowerCase();
  if (r.includes('compet')) return '#f472b6';
  if (r.includes('verif')) return '#fbbf24';
  if (r.includes('risk')) return '#fb7185';
  if (r.includes('support')) return '#34d399';
  if (r.includes('trend')) return '#22d3ee';
  if (r.includes('infrastructure')) return '#2dd4bf';
  return '#a78bfa';
}

/** Territory hulls recomputed from current story positions (drag-aware). */
function computeZones(stories: StoryFlowNode[]): ZoneFlowNode[] {
  const byBucket = new Map<BucketKey, StoryFlowNode[]>();
  for (const n of stories) {
    const bucket = n.data.event.bucket;
    const group = byBucket.get(bucket) ?? [];
    group.push(n);
    byBucket.set(bucket, group);
  }
  const zones: ZoneFlowNode[] = [];
  for (const [bucket, group] of byBucket) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of group) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_W);
      maxY = Math.max(maxY, n.position.y + NODE_H);
    }
    const meta = BUCKETS[bucket];
    zones.push({
      id: `zone:${bucket}`,
      type: 'zone',
      position: { x: minX - ZONE_PAD, y: minY - ZONE_PAD - 18 },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -10,
      style: { pointerEvents: 'none' },
      data: {
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        width: maxX - minX + ZONE_PAD * 2,
        height: maxY - minY + ZONE_PAD * 2 + 18,
        count: group.length,
      },
    });
  }
  return zones;
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export interface GraphCanvasProps {
  events: SignalEvent[];
  filters: Category[];
  search: string;
  newIds: Set<string>;
  selectedIds: string[];
  showEntities: boolean;
  layoutVersion: number;
  onSelectionChange: (ids: string[]) => void;
  onInspect: (event: SignalEvent) => void;
  onEdgeInspect: (pair: EdgePair) => void;
}

function matchesSearch(e: SignalEvent, q: string): boolean {
  if (!q) return true;
  const hay = `${e.title} ${e.summary} ${e.source_name} ${CATEGORIES[e.category].label} ${e.related_entities.join(' ')}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function InnerCanvas(props: GraphCanvasProps) {
  const {
    events, filters, search, newIds, selectedIds, showEntities,
    layoutVersion, onSelectionChange, onInspect, onEdgeInspect,
  } = props;

  const { fitView } = useReactFlow();
  const positionsRef = useRef(new Map<string, { x: number; y: number }>());
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const lastSelectionRef = useRef('');
  const prevCountRef = useRef(0);

  const visibleEvents = useMemo(
    () => (filters.length === 0 ? events : events.filter((e) => filters.includes(e.category))),
    [events, filters],
  );

  const byId = useMemo(() => new Map(visibleEvents.map((e) => [e.id, e])), [visibleEvents]);

  // Reset stored positions when the user clicks "Reset Layout".
  useEffect(() => {
    if (layoutVersion > 0) {
      positionsRef.current.clear();
      window.setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion]);

  // Rebuild nodes whenever inputs change, preserving dragged positions.
  useEffect(() => {
    const selected = new Set(selectedIds);
    const stories: StoryFlowNode[] = [];
    const entities: EntityFlowNode[] = [];
    const bucketCounters = new Map<BucketKey, number>();
    const entityHomes = new Map<string, { x: number; y: number }>();

    for (const ev of visibleEvents) {
      const idx = bucketCounters.get(ev.bucket) ?? 0;
      bucketCounters.set(ev.bucket, idx + 1);
      const pos = positionsRef.current.get(ev.id) ?? storyPosition(ev.bucket, idx);
      positionsRef.current.set(ev.id, pos);

      stories.push({
        id: ev.id,
        type: 'story',
        position: pos,
        selected: selected.has(ev.id),
        data: { event: ev, isNew: newIds.has(ev.id), dim: !matchesSearch(ev, search) },
      });

      if (showEntities) {
        for (const name of ev.related_entities) {
          const key = `ent:${name.toLowerCase()}`;
          if (!entityHomes.has(key)) {
            const a = hashAngle(name);
            entityHomes.set(key, { x: pos.x + Math.cos(a) * 185, y: pos.y + Math.sin(a) * 140 + 60 });
          }
        }
      }
    }

    if (showEntities) {
      for (const [key, home] of entityHomes) {
        const label = key.slice(4);
        const pos = positionsRef.current.get(key) ?? home;
        positionsRef.current.set(key, pos);
        entities.push({
          id: key,
          type: 'entity',
          position: pos,
          selected: selected.has(key),
          data: { label, dim: search ? !label.includes(search.toLowerCase()) : false },
        });
      }
    }

    setNodes([...computeZones(stories), ...stories, ...entities]);
  }, [visibleEvents, search, newIds, selectedIds, showEntities, layoutVersion]);

  // Fit the view when the story count changes.
  useEffect(() => {
    if (visibleEvents.length !== prevCountRef.current) {
      prevCountRef.current = visibleEvents.length;
      const t = window.setTimeout(() => fitView({ padding: 0.18, duration: 650 }), 120);
      return () => window.clearTimeout(t);
    }
  }, [visibleEvents.length, fitView]);

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = [];
    for (const ev of visibleEvents) {
      const evDim = !matchesSearch(ev, search);
      ev.connections.forEach((c, i) => {
        if (!c.resolved_target_id) return;
        const target = byId.get(c.resolved_target_id);
        if (!target) return;
        const color = relationColor(c.relationship);
        const dim = Boolean(search) && evDim && !matchesSearch(target, search);
        list.push({
          id: `c-${ev.id}-${i}`,
          type: 'thread',
          source: ev.id,
          target: c.resolved_target_id,
          animated: false,
          style: {
            stroke: color,
            strokeWidth: 1 + (Math.min(10, c.strength) / 10) * 2.4,
            opacity: dim ? 0.08 : 0.8,
            filter: `drop-shadow(0 0 3px ${color})`,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
          data: {
            color,
            strength: c.strength,
            relationship: c.relationship,
            dim,
            onOpen: () =>
              onEdgeInspect({
                a: ev,
                b: target,
                relationship: c.relationship,
                strength: c.strength,
                reason: c.reason ?? '',
              }),
          },
        } satisfies ThreadFlowEdge);
      });

      if (showEntities) {
        for (const name of ev.related_entities) {
          list.push({
            id: `e-${ev.id}-${name.toLowerCase()}`,
            source: ev.id,
            target: `ent:${name.toLowerCase()}`,
            animated: false,
            style: { stroke: 'rgba(148,163,184,0.22)', strokeWidth: 1, strokeDasharray: '4 4' },
          });
        }
      }
    }
    return list;
  }, [visibleEvents, byId, search, showEntities, onEdgeInspect]);

  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      const stories = updated.filter((n): n is StoryFlowNode => n.type === 'story');
      // Zones follow their nodes live while dragging.
      return [...computeZones(stories), ...updated.filter((n) => n.type !== 'zone')];
    });
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) positionsRef.current.set(ch.id, ch.position);
    }
  }, []);

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: Node[] }) => {
      const ids = selectedNodes.map((n) => n.id).sort();
      const key = ids.join('|');
      if (key !== lastSelectionRef.current) {
        lastSelectionRef.current = key;
        onSelectionChange(ids);
      }
    },
    [onSelectionChange],
  );

  // Sector legend — click to fly the camera to that territory.
  const bucketCounts = useMemo(() => {
    const counts = new Map<BucketKey, number>();
    for (const ev of visibleEvents) counts.set(ev.bucket, (counts.get(ev.bucket) ?? 0) + 1);
    return counts;
  }, [visibleEvents]);

  const flyToBucket = useCallback(
    (bucket: BucketKey | null) => {
      if (bucket === null) {
        fitView({ padding: 0.18, duration: 750 });
        return;
      }
      const ids = visibleEvents.filter((e) => e.bucket === bucket).map((e) => ({ id: e.id }));
      if (ids.length > 0) fitView({ nodes: ids, padding: 0.45, duration: 750 });
    },
    [visibleEvents, fitView],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onSelectionChange={handleSelectionChange}
      onNodeClick={(_, node) => {
        if (node.type === 'story') onInspect((node as StoryFlowNode).data.event);
      }}
      onEdgeClick={(_, edge) => {
        if (edge.type === 'thread') (edge as ThreadFlowEdge).data?.onOpen();
      }}
      fitView
      minZoom={0.1}
      maxZoom={2}
      selectionKeyCode="Shift"
      multiSelectionKeyCode={['Meta', 'Control']}
      nodesConnectable={false}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: false }}
    >
      {/* layered chart-paper: fine dots under a wide survey grid */}
      <Background id="dots" variant={BackgroundVariant.Dots} gap={26} size={1.1} color="rgba(120,140,190,0.16)" />
      <Background id="grid" variant={BackgroundVariant.Lines} gap={156} lineWidth={1} color="rgba(94,118,169,0.09)" />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        position="bottom-right"
        pannable
        zoomable
        nodeColor={(n) =>
          n.type === 'story'
            ? CATEGORIES[(n as StoryFlowNode).data.event.category].color
            : n.type === 'zone'
              ? 'transparent'
              : 'rgba(148,163,184,0.5)'
        }
      />

      {/* Sector legend / camera shortcuts */}
      {visibleEvents.length > 0 && (
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 px-2">
          {BUCKET_KEYS.filter((b) => (bucketCounts.get(b) ?? 0) > 0).map((b) => (
            <button
              key={b}
              onClick={() => flyToBucket(b)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md transition hover:scale-105"
              style={{
                color: BUCKETS[b].color,
                borderColor: `${BUCKETS[b].color}45`,
                background: 'rgba(9, 14, 30, 0.75)',
              }}
              title={`Fly to ${BUCKETS[b].label}`}
            >
              <span>{BUCKETS[b].icon}</span>
              {BUCKETS[b].label}
              <span className="opacity-60">{bucketCounts.get(b)}</span>
            </button>
          ))}
          <button
            onClick={() => flyToBucket(null)}
            className="rounded-full border border-slate-600/50 bg-slate-900/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 backdrop-blur-md transition hover:scale-105"
            title="Fit the whole map"
          >
            ⌖ All
          </button>
        </div>
      )}
    </ReactFlow>
  );
}

export default function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerCanvas {...props} />
    </ReactFlowProvider>
  );
}
