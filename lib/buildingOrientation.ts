import type { ModelPoint3 } from "./printModel";

type FaceEdge = { face: number; forward: boolean };

function pointKey(point: ModelPoint3) {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)},${point.z.toFixed(4)}`;
}

function openRing(surface: ModelPoint3[]) {
  const first = surface[0];
  const last = surface[surface.length - 1];
  return surface.length > 1 && pointKey(first) === pointKey(last)
    ? surface.slice(0, -1)
    : surface;
}

// Six times the signed volume the faces enclose, measured from origin.
function signedVolume(rings: ModelPoint3[][], origin: ModelPoint3) {
  let volume = 0;
  for (const ring of rings) {
    const a = ring[0];
    for (let index = 1; index < ring.length - 1; index += 1) {
      const b = ring[index];
      const c = ring[index + 1];
      const ax = a.x - origin.x;
      const ay = a.y - origin.y;
      const az = a.z - origin.z;
      const bx = b.x - origin.x;
      const by = b.y - origin.y;
      const bz = b.z - origin.z;
      const cx = c.x - origin.x;
      const cy = c.y - origin.y;
      const cz = c.z - origin.z;
      volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    }
  }
  return volume;
}

// Makes a building's surfaces face outward consistently. 3DBAG solids and
// the caps added when clipping them can contain surfaces wound inward;
// slicers read those as holes in the solid and fill the building with
// supports. Neighbouring faces must traverse a shared edge in opposite
// directions, so orientation spreads across edges shared by exactly two
// faces; each connected part is then turned outward by its signed volume.
export function orientBuildingSurfaces(surfaces: ModelPoint3[][]) {
  const rings = surfaces.map(openRing);
  const edges = new Map<string, FaceEdge[]>();
  rings.forEach((ring, face) => {
    for (let index = 0; index < ring.length; index += 1) {
      const from = pointKey(ring[index]);
      const to = pointKey(ring[(index + 1) % ring.length]);
      if (from === to) {
        continue;
      }
      const forward = from < to;
      const key = forward ? `${from}|${to}` : `${to}|${from}`;
      edges.set(key, [...(edges.get(key) ?? []), { face, forward }]);
    }
  });

  const neighbours: Array<Array<{ face: number; sameDirection: boolean }>> = rings.map(() => []);
  for (const uses of edges.values()) {
    if (uses.length !== 2) {
      continue;
    }
    const [first, second] = uses;
    const sameDirection = first.forward === second.forward;
    neighbours[first.face].push({ face: second.face, sameDirection });
    neighbours[second.face].push({ face: first.face, sameDirection });
  }

  const flipped: Array<boolean | null> = rings.map(() => null);
  for (let seed = 0; seed < rings.length; seed += 1) {
    if (flipped[seed] !== null) {
      continue;
    }

    flipped[seed] = false;
    const component = [seed];
    for (let cursor = 0; cursor < component.length; cursor += 1) {
      const face = component[cursor];
      for (const neighbour of neighbours[face]) {
        if (flipped[neighbour.face] === null) {
          flipped[neighbour.face] = (flipped[face] as boolean) !== neighbour.sameDirection;
          component.push(neighbour.face);
        }
      }
    }

    if (component.length < 4) {
      continue;
    }

    const oriented = component.map((face) =>
      flipped[face] ? [...rings[face]].reverse() : rings[face],
    );
    const points = oriented.flat();
    const origin = {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      z: points.reduce((sum, point) => sum + point.z, 0) / points.length,
    };
    if (signedVolume(oriented, origin) < 0) {
      for (const face of component) {
        flipped[face] = !flipped[face];
      }
    }
  }

  return surfaces.map((surface, face) =>
    flipped[face] ? [...surface].reverse() : surface,
  );
}
