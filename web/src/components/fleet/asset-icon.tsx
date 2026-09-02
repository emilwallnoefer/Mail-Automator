import type { FleetAssetCategory } from "./types";

/**
 * Line icons for each kind of fleet material.
 *
 * Drawn rather than sourced: the dashboard's existing icons are 24-unit,
 * 1.5-weight, round-capped strokes on `currentColor`, so bitmaps of the real
 * products would sit in the UI as foreign objects — wrong weight, wrong colour
 * in dark mode, blurry at 14px, and heavy to ship. These inherit colour and
 * stay crisp at any size.
 *
 * Each shape is chosen for silhouette, because at 14px that is all that reads:
 *
 *   drone        the Elios caged sphere — the cage IS the product's signature
 *   dummy drone  the same cage, dashed: same shape, not a real aircraft
 *   lidar        a lens throwing widening scan arcs
 *   RAD payload  the radiation trefoil
 *   UT payload   a probe on a surface with an echo returning
 *   LEL payload  a sensor with gas rising off it
 *   tether       a spool paying out a cable
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function CagedDrone({ dashed = false }: { dashed?: boolean }) {
  const dash = dashed ? { strokeDasharray: "2.2 2" } : {};
  return (
    <>
      {/* Protective cage: outer sphere plus two meridians. */}
      <circle cx="12" cy="12" r="8.4" {...dash} />
      <ellipse cx="12" cy="12" rx="3.4" ry="8.4" {...dash} />
      <path d="M3.6 12h16.8" {...dash} />
      {/* The airframe inside it. */}
      <circle cx="12" cy="12" r="2.1" />
    </>
  );
}

function Lidar() {
  return (
    <>
      <rect x="3.2" y="8.4" width="7.2" height="7.2" rx="1.6" />
      <circle cx="6.8" cy="12" r="1.5" />
      {/* Widening scan arcs. */}
      <path d="M13.4 8.6a5 5 0 010 6.8" />
      <path d="M16.4 6.6a9 9 0 010 10.8" />
      <path d="M19.4 4.8a13 13 0 010 14.4" />
    </>
  );
}

function RadPayload() {
  return (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <circle cx="12" cy="12" r="1.7" />
      {/* Trefoil blades. */}
      <path d="M12 10.3V4.4M12 10.3a1.7 1.7 0 00-1.47.85M10.53 13.15l-2.95 5.11M12 10.3a1.7 1.7 0 011.47.85M13.47 13.15l2.95 5.11" />
    </>
  );
}

function UtPayload() {
  return (
    <>
      {/* Probe body on a test surface. */}
      <path d="M9 3.6h6v5.2l-3 3.2-3-3.2z" />
      <path d="M4.5 20.4h15" />
      {/* Echo returning through the material. */}
      <path d="M12 12v4.6" />
      <path d="M8.6 16.8a4.6 4.6 0 016.8 0" />
    </>
  );
}

function LelPayload() {
  return (
    <>
      <rect x="5.6" y="12.6" width="12.8" height="7.4" rx="1.8" />
      <path d="M9.2 16.3h5.6" />
      {/* Gas drifting off the sensor. */}
      <path d="M9.4 9.6c0-1.7 1.9-1.9 1.9-3.6 0-1-.6-1.7-1.2-2.2" />
      <path d="M14.6 9.6c0-1.7 1.9-1.9 1.9-3.6 0-1-.6-1.7-1.2-2.2" />
    </>
  );
}

function Tether() {
  return (
    <>
      {/* Spool. */}
      <circle cx="8" cy="8.2" r="4.4" />
      <circle cx="8" cy="8.2" r="1.3" />
      {/* Cable paying out and coiling. */}
      <path d="M11.9 10.3c2.6 1.4 3.2 3.3 2.2 5.1-.9 1.7-.3 3.3 1.6 4.2" />
      <path d="M17.2 19.9h2.9" />
    </>
  );
}

function Accessory() {
  return (
    <>
      <rect x="3.6" y="6.6" width="16.8" height="11.4" rx="2" />
      <path d="M8.6 6.6V5.1a1.5 1.5 0 011.5-1.5h3.8a1.5 1.5 0 011.5 1.5v1.5" />
      <path d="M3.6 12h16.8" />
    </>
  );
}

const ICONS: Record<FleetAssetCategory, () => React.ReactElement> = {
  drone: () => <CagedDrone />,
  dummy_drone: () => <CagedDrone dashed />,
  lidar: Lidar,
  rad_payload: RadPayload,
  ut_payload: UtPayload,
  lel_payload: LelPayload,
  tether: Tether,
  range_extender: Lidar,
  gcs: Accessory,
  accessory: Accessory,
  other: Accessory,
};

export function AssetIcon({
  category,
  className = "h-4 w-4",
}: {
  category: FleetAssetCategory;
  className?: string;
}) {
  const Shape = ICONS[category] ?? Accessory;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      <Shape />
    </svg>
  );
}
