"use client";

import { useMemo } from "react";
import { MapPin, Warehouse } from "lucide-react";
import type { Destination, FulfillmentLine } from "@/lib/types";

type Point = { x: number; y: number };
type Origin = {
  id: number;
  name: string;
  city: string | null;
  lat: number;
  lng: number;
  units: number;
  shipmentGroup: number;
};

/** Equirectangular projection — adequate for a national-scale schematic. */
function project(lat: number, lng: number, box: { minLat: number; maxLat: number; minLng: number; maxLng: number }, w: number, h: number, pad: number): Point {
  const spanLat = Math.max(box.maxLat - box.minLat, 0.5);
  const spanLng = Math.max(box.maxLng - box.minLng, 0.5);
  return {
    x: pad + ((lng - box.minLng) / spanLng) * (w - pad * 2),
    // Latitude grows northward, SVG y grows downward.
    y: pad + ((box.maxLat - lat) / spanLat) * (h - pad * 2),
  };
}

const num = (v?: string | null): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Where each shipment leaves from and where it is going.
 *
 * A schematic, not a street map: the split engine works in stock coverage and
 * shipping cost weight, and geography is not one of its inputs. What this adds
 * is legibility — seeing that an order is being pulled from two cities on
 * opposite sides of the country is the fastest way to understand why the
 * engine proposed two shipments, and the fastest way to notice when a manual
 * override would be sensible.
 *
 * Warehouses without coordinates are simply absent; the shipment cards below
 * remain the complete record.
 */
export function ShipmentMap({
  lines,
  destination,
  className = "",
}: {
  lines: FulfillmentLine[];
  destination: Destination;
  className?: string;
}) {
  const W = 640;
  const H = 300;
  const PAD = 44;

  const { origins, dest, box } = useMemo(() => {
    const byWarehouse = new Map<number, Origin>();
    for (const l of lines) {
      const lat = num(l.warehouse_latitude);
      const lng = num(l.warehouse_longitude);
      if (lat === null || lng === null) continue;

      const existing = byWarehouse.get(l.warehouse_id);
      if (existing) {
        existing.units += l.qty;
        continue;
      }
      byWarehouse.set(l.warehouse_id, {
        id: l.warehouse_id,
        name: l.warehouse_name,
        city: l.warehouse_city ?? null,
        lat,
        lng,
        units: l.qty,
        shipmentGroup: l.shipment_group,
      });
    }

    const dLat = num(destination.latitude);
    const dLng = num(destination.longitude);
    const originList = [...byWarehouse.values()];

    if (originList.length === 0 || dLat === null || dLng === null) {
      return { origins: originList, dest: null, box: null };
    }

    const lats = [...originList.map((o) => o.lat), dLat];
    const lngs = [...originList.map((o) => o.lng), dLng];
    return {
      origins: originList,
      dest: { lat: dLat, lng: dLng },
      box: {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLng: Math.min(...lngs),
        maxLng: Math.max(...lngs),
      },
    };
  }, [lines, destination]);

  // Nothing to plot without both ends of at least one route.
  if (!box || !dest || origins.length === 0) return null;

  const target = project(dest.lat, dest.lng, box, W, H, PAD);
  const plotted = origins.map((o) => ({ ...o, pt: project(o.lat, o.lng, box, W, H, PAD) }));

  return (
    <div className={`rounded-[20px] bg-white p-5 card-shadow ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/6 pb-3">
        <h3 className="text-[14px] font-semibold text-ink">Shipment routes</h3>
        <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] text-mist">
          {plotted.length} origin{plotted.length === 1 ? "" : "s"} &rarr; {destination.city ?? destination.customer_name}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-auto w-full"
        role="img"
        aria-label={`Shipments from ${plotted.map((o) => o.name).join(", ")} to ${destination.customer_name}`}
      >
        <defs>
          <marker id="ship-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-ink)" opacity={0.45} />
          </marker>
        </defs>

        {/* Routes first, so the pins sit above them. */}
        {plotted.map((o) => {
          // A gentle arc reads as a movement rather than a chart gridline, and
          // keeps two routes between the same pair from overlapping exactly.
          const mx = (o.pt.x + target.x) / 2;
          const my = (o.pt.y + target.y) / 2 - Math.abs(target.x - o.pt.x) * 0.16 - 14;
          return (
            <path
              key={o.id}
              d={`M ${o.pt.x} ${o.pt.y} Q ${mx} ${my} ${target.x} ${target.y}`}
              fill="none"
              stroke="var(--color-ink)"
              strokeOpacity={0.3}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              markerEnd="url(#ship-arrow)"
            />
          );
        })}

        {plotted.map((o) => (
          <g key={`pin-${o.id}`}>
            <circle
              cx={o.pt.x}
              cy={o.pt.y}
              r={7}
              fill="var(--color-capsule)"
              stroke="var(--color-ink)"
              strokeOpacity={0.45}
              strokeWidth={1.5}
            />
            <circle cx={o.pt.x} cy={o.pt.y} r={3} fill="var(--color-ink)" opacity={0.75} />
            <text
              x={o.pt.x}
              y={o.pt.y - 13}
              textAnchor="middle"
              fill="var(--color-ink)"
              className="text-[11px] font-semibold"
            >
              {o.city ?? o.name}
            </text>
            <text x={o.pt.x} y={o.pt.y + 20} textAnchor="middle" fill="var(--color-mist)" className="text-[10px]">
              Shipment #{o.shipmentGroup} &middot; {o.units} unit{o.units === 1 ? "" : "s"}
            </text>
          </g>
        ))}

        <g>
          <circle
            cx={target.x}
            cy={target.y}
            r={9}
            fill="var(--color-status-ok-bg)"
            stroke="var(--color-status-ok)"
            strokeWidth={2}
          />
          <circle cx={target.x} cy={target.y} r={3.5} fill="var(--color-status-ok)" />
          <text
            x={target.x}
            y={target.y - 15}
            textAnchor="middle"
            fill="var(--color-ink)"
            className="text-[11px] font-semibold"
          >
            {destination.city ?? destination.customer_name}
          </text>
          <text x={target.x} y={target.y + 22} textAnchor="middle" fill="var(--color-mist)" className="text-[10px]">
            {destination.customer_name}
          </text>
        </g>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-ink/6 pt-3 text-[11.5px] text-mist">
        <span className="flex items-center gap-1.5">
          <Warehouse className="size-3.5" /> Warehouse origin
        </span>
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5 text-ok" /> Delivery destination
        </span>
        <span className="ml-auto">Schematic positions from stored coordinates.</span>
      </div>
    </div>
  );
}
