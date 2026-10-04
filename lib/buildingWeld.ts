import type { ModelPoint3 } from "./printModel";

// 3DBAG meshes contain vertices a few millimetres apart. The sliver edges and
// faces between them make slicers drop layers across the whole model, which
// leaves roofs floating over empty space. One centimetre is far below print
// resolution at any supported scale.
const WELD_DISTANCE_METERS = 0.01;

// Merges vertices closer than the weld distance within one building and drops
// the surfaces that collapse, keeping shared edges shared.
export function weldBuildingSurfaces(
  surfaces: ModelPoint3[][],
  weldDistance = WELD_DISTANCE_METERS,
) {
  const cells = new Map<string, ModelPoint3[]>();
  const cellOf = (value: number) => Math.floor(value / weldDistance);
  const representative = (point: ModelPoint3) => {
    const [x, y, z] = [cellOf(point.x), cellOf(point.y), cellOf(point.z)];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const match = cells
            .get(`${x + dx},${y + dy},${z + dz}`)
            ?.find(
              (other) =>
                Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z) <
                weldDistance,
            );
          if (match) {
            return match;
          }
        }
      }
    }

    const key = `${x},${y},${z}`;
    cells.set(key, [...(cells.get(key) ?? []), point]);
    return point;
  };

  return surfaces.flatMap((surface) => {
    const ring: ModelPoint3[] = [];
    for (const point of surface) {
      const welded = representative(point);
      if (ring[ring.length - 1] !== welded) {
        ring.push(welded);
      }
    }
    while (ring.length > 1 && ring[0] === ring[ring.length - 1]) {
      ring.pop();
    }

    return new Set(ring).size >= 3 ? [ring] : [];
  });
}
