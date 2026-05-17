'use client';

import { useMemo, useState } from 'react';
import { sankey, sankeyLeft, sankeyLinkHorizontal, type SankeyExtraProperties } from 'd3-sankey';

export type NodeColor =
  | 'pink'
  | 'pinkD'
  | 'pinkXD'
  | 'peach'
  | 'coral'
  | 'mint'
  | 'lilac'
  | 'butter'
  | 'sand'
  | 'cream';

export interface SankeyNode {
  id: string;
  label: string;
  color: NodeColor;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

interface SankeyProps {
  data: SankeyData;
  width?: number;
  height?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  nodeWidth?: number;
  nodePadding?: number;
  hoverable?: boolean;
  showValues?: boolean;
}

const COLOR: Record<NodeColor, string> = {
  pink: 'var(--yume-pink-300)',
  pinkD: 'var(--yume-pink-400)',
  pinkXD: 'var(--yume-pink-600)',
  peach: 'var(--yume-peach)',
  coral: 'var(--yume-coral)',
  mint: 'var(--yume-mint)',
  lilac: 'var(--yume-lilac)',
  butter: 'var(--yume-butter)',
  sand: 'var(--yume-sand)',
  cream: 'var(--yume-cream)',
};

type LayoutNode = SankeyExtraProperties &
  SankeyNode & {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
    depth: number;
    value: number;
  };

type LayoutLink = SankeyExtraProperties &
  SankeyLink & {
    width: number;
    sourceId: string;
    targetId: string;
    d: string;
    colorVar: string;
  };

export function Sankey({
  data,
  width = 940,
  height = 460,
  padding = { top: 24, right: 190, bottom: 24, left: 140 },
  nodeWidth = 12,
  nodePadding = 18,
  hoverable = true,
  showValues = true,
}: SankeyProps) {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const nodes = data.nodes.map((n) => ({ ...n }));
    const links = data.links.map((l) => ({ ...l }));

    const sankeyFn = sankey<SankeyNode, SankeyLink>()
      .nodeId((d) => d.id)
      .nodeWidth(nodeWidth)
      .nodePadding(nodePadding)
      .nodeAlign(sankeyLeft)
      .extent([
        [padding.left, padding.top],
        [width - padding.right, height - padding.bottom],
      ]);

    const graph = sankeyFn({ nodes, links });
    const linkPath = sankeyLinkHorizontal<SankeyNode, SankeyLink>();

    const builtLinks = graph.links.map((l) => {
      const source = l.source as unknown as SankeyNode;
      const target = l.target as unknown as SankeyNode;
      return {
        ...(l as unknown as SankeyLink),
        width: (l as unknown as { width: number }).width,
        sourceId: source.id,
        targetId: target.id,
        d: linkPath(l) ?? '',
        colorVar: COLOR[source.color] ?? COLOR.pink,
      } satisfies LayoutLink;
    });

    return {
      nodes: graph.nodes as unknown as LayoutNode[],
      links: builtLinks,
    };
  }, [data, width, height, padding.left, padding.right, padding.top, padding.bottom, nodeWidth, nodePadding]);

  const minCol = Math.min(...layout.nodes.map((n) => n.depth ?? 0));

  const isLinkActive = (l: LayoutLink) => !hover || l.sourceId === hover || l.targetId === hover;
  const isNodeActive = (n: LayoutNode) => {
    if (!hover) return true;
    if (hover === n.id) return true;
    return data.links.some(
      (l) =>
        (l.source === hover && l.target === n.id) || (l.target === hover && l.source === n.id),
    );
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
    >
      <defs>
        {layout.links.map((l) => (
          <linearGradient
            key={`${l.sourceId}-${l.targetId}`}
            id={`ygrad-${l.sourceId}-${l.targetId}`}
            x1="0%"
            x2="100%"
          >
            <stop offset="0%" stopColor={l.colorVar} stopOpacity="0.78" />
            <stop offset="100%" stopColor={l.colorVar} stopOpacity="0.42" />
          </linearGradient>
        ))}
      </defs>

      {layout.links.map((l) => (
        <path
          key={`${l.sourceId}-${l.targetId}`}
          d={l.d}
          fill="none"
          stroke={`url(#ygrad-${l.sourceId}-${l.targetId})`}
          strokeWidth={Math.max(1, l.width)}
          opacity={isLinkActive(l) ? 1 : 0.15}
          style={{ transition: 'opacity 220ms' }}
          onMouseEnter={hoverable ? () => setHover(l.sourceId) : undefined}
          onMouseLeave={hoverable ? () => setHover(null) : undefined}
        />
      ))}

      {layout.nodes.map((n) => {
        const active = isNodeActive(n);
        const nodeH = Math.max(2, n.y1 - n.y0);
        const cy = (n.y0 + n.y1) / 2;
        const isFirstCol = n.depth === minCol;
        const labelX = isFirstCol ? n.x0 - 14 : n.x1 + 14;
        const anchor = isFirstCol ? ('end' as const) : ('start' as const);
        const smallNode = nodeH < 18;
        const color = COLOR[n.color] ?? COLOR.pink;
        return (
          <g
            key={n.id}
            onMouseEnter={hoverable ? () => setHover(n.id) : undefined}
            onMouseLeave={hoverable ? () => setHover(null) : undefined}
            style={{ cursor: hoverable ? 'pointer' : 'default' }}
          >
            <rect
              x={n.x0}
              y={n.y0}
              width={Math.max(2, n.x1 - n.x0)}
              height={nodeH}
              rx={3}
              ry={3}
              fill={color}
              opacity={active ? 1 : 0.35}
              style={{ transition: 'opacity 220ms' }}
            />
            <text
              x={labelX}
              y={cy - (smallNode ? 8 : 2)}
              textAnchor={anchor}
              dominantBaseline="middle"
              opacity={active ? 1 : 0.4}
              className="font-sans"
              style={{
                fontSize: smallNode ? 12 : 13,
                fontWeight: 600,
                fill: 'var(--yume-ink)',
                letterSpacing: '-0.005em',
                transition: 'opacity 220ms',
              }}
            >
              {n.label}
            </text>
            {showValues && (
              <text
                x={labelX}
                y={cy + (smallNode ? 8 : 14)}
                textAnchor={anchor}
                dominantBaseline="middle"
                opacity={active ? 1 : 0.4}
                className="serif"
                style={{
                  fontSize: smallNode ? 14 : 18,
                  letterSpacing: '-0.02em',
                  fill: n.color === 'sand' ? 'var(--yume-ink-soft)' : color,
                  transition: 'opacity 220ms',
                }}
              >
                {n.value}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
