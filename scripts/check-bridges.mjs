import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const moduleCache = new Map();

function resolveLocalModule(specifier, parentPath) {
  const unresolved = specifier.startsWith("@/")
    ? path.join(projectRoot, specifier.slice(2))
    : path.resolve(path.dirname(parentPath), specifier);
  const candidates = [
    unresolved,
    `${unresolved}.ts`,
    `${unresolved}.tsx`,
    path.join(unresolved, "index.ts"),
    path.join(unresolved, "index.tsx"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function loadTypeScriptModule(filePath, sourceTransform = (source) => source) {
  const cached = moduleCache.get(filePath);
  if (cached) {
    return cached.exports;
  }

  const cjsModule = { exports: {} };
  moduleCache.set(filePath, cjsModule);
  const source = sourceTransform(readFileSync(filePath, "utf8"));
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier.endsWith(".module.css")) {
      return {};
    }

    if (specifier === "three/examples/jsm/controls/OrbitControls.js") {
      return { OrbitControls: class OrbitControls {} };
    }

    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const resolved = resolveLocalModule(specifier, filePath);
      if (!resolved) {
        throw new Error(`Could not resolve ${specifier} from ${filePath}`);
      }
      return loadTypeScriptModule(resolved);
    }

    return require(specifier);
  };

  vm.runInNewContext(compiled, {
    exports: cjsModule.exports,
    module: cjsModule,
    require: localRequire,
    TextEncoder,
  });

  return cjsModule.exports;
}

const bgt = loadTypeScriptModule(path.join(projectRoot, "lib/bgt.ts"));
const bridges = loadTypeScriptModule(path.join(projectRoot, "lib/bridges.ts"));
const ahn = loadTypeScriptModule(path.join(projectRoot, "lib/ahn.ts"));
const bridgeGeometry = loadTypeScriptModule(
  path.join(
    projectRoot,
    "app/_map-editor/print/PrintableModelPreview/bridgeGeometry.ts",
  ),
);
const { deflateSync } = require("node:zlib");
const preview = loadTypeScriptModule(
  path.join(
    projectRoot,
    "app/_map-editor/print/PrintableModelPreview/PrintableModelPreview.tsx",
  ),
  (source) => `${source}\nexport { createModelMetrics, createPrintableModel };\n`,
);
const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);
const THREE = require("three");

function rectangle(minX, minY, maxX, maxY) {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function bridgePart(type, rings, properties = {}) {
  return {
    geometry: { coordinates: rings, type: "Polygon" },
    properties: {
      eind_registratie: null,
      relatieve_hoogteligging: 1,
      status: "bestaand",
      type_overbruggingsdeel: type,
      ...properties,
    },
  };
}

// RD coordinates around center (100, 100); the selection is the local
// square -20..20, i.e. RD 80..120.
const { bridgeDecks, bridgePiers } = bgt.classifyBgtBridges({
  boundary: [
    { x: -20, y: -20 },
    { x: 20, y: -20 },
    { x: 20, y: 20 },
    { x: -20, y: 20 },
  ],
  center: { x: 100, y: 100 },
  parts: [
    bridgePart("dek", [rectangle(90, 95, 100, 105)]),
    bridgePart("dek", [rectangle(100, 95, 110, 105)]),
    bridgePart("dek", [rectangle(115, 60, 125, 70)]),
    bridgePart("dek", [rectangle(110, 110, 119, 119)], {
      eind_registratie: "2019-01-01T00:00:00Z",
    }),
    bridgePart("pijler", [rectangle(99, 96, 101, 104)], {
      relatieve_hoogteligging: 0,
    }),
  ],
});
assert.equal(bridgeDecks.length, 1, "Adjacent deck parts must merge; retired and outside decks are dropped.");
const deckXs = bridgeDecks[0].points.map((point) => point.x);
assert.deepEqual(
  [Math.min(...deckXs), Math.max(...deckXs)],
  [-10, 10],
  "The merged deck must span both parts, in local coordinates.",
);
assert.equal(bridgePiers.length, 1, "Piers must be kept.");

const deck = { kind: "bridge-deck", points: bridgeDecks[0].points };
const kept = bridges.roadsWithoutDeckedBridges(
  [
    { kind: "bridge:residential", points: [{ x: -10, y: 0 }, { x: 10, y: 0 }], widthMeters: 6 },
    { kind: "bridge:footway", points: [{ x: -10, y: 6 }, { x: 10, y: 6 }], widthMeters: 2 },
    { kind: "bridge:residential", points: [{ x: -10, y: 15 }, { x: 10, y: 15 }], widthMeters: 6 },
    { kind: "residential", points: [{ x: -10, y: 0 }, { x: 10, y: 0 }], widthMeters: 6 },
  ],
  [deck],
);
assert.deepEqual(
  kept.map((line) => `${line.kind}@${line.points[0].y}`),
  ["bridge:residential@15", "residential@0"],
  "Bridge roads and sidewalks on a deck must be dropped; others kept.",
);

// A canal across the map (x -5..5) with a deck crossing it and a pier in
// its middle.
function checkBridgeRendering(description, configure) {
  const settings = printModel.createDefaultPrintableModelSettings();
  const layers = { buildings: false, landCover: false, roads: true, water: true };
  configure(settings, layers);
  const input = {
    layers,
    modelData: {
      bridgeDecks: [
        {
          kind: "bridge-deck",
          points: [
            { x: -8, y: -3 },
            { x: 8, y: -3 },
            { x: 8, y: 3 },
            { x: -8, y: 3 },
          ],
        },
      ],
      bridgePiers: [
        {
          kind: "bridge-pier",
          points: [
            { x: -0.5, y: -3 },
            { x: 0.5, y: -3 },
            { x: 0.5, y: 3 },
            { x: -0.5, y: 3 },
          ],
        },
      ],
      buildings: [],
      generatedAt: "2026-10-04T00:00:00.000Z",
      landCover: [],
      radiusMeters: 50,
      roads: [],
      sourceCounts: {
        buildings: 0,
        buildingSurfaces: 0,
        landCover: 0,
        osmElements: 0,
        roads: 0,
        water: 1,
      },
      warnings: [],
      water: [
        {
          kind: "canal",
          points: [
            { x: -5, y: -60 },
            { x: 5, y: -60 },
            { x: 5, y: 60 },
            { x: -5, y: 60 },
          ],
        },
      ],
      waterLines: [],
    },
    modelSettings: settings,
    radiusMeters: 50,
    selection: { latitude: 52.3711258, longitude: 4.8869109, shape: "circle" },
    size: printModel.getPrintableModelSize(50, settings),
  };
  const group = preview.createPrintableModel(input);
  group.updateMatrixWorld(true);
  const metrics = preview.createModelMetrics(input);
  const scale = metrics.horizontalScale;
  const bridgeColor = settings.layers.roads.categories.bridges.color.toLowerCase();
  const waterColor = settings.layers.water.color.toLowerCase();

  function firstHit(x, y, fromY) {
    const [hit] = new THREE.Raycaster(
      new THREE.Vector3(x * scale, fromY, -y * scale),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(group, true);
    return hit
      ? { color: `#${hit.object.material.color.getHexString()}`, y: hit.point.y }
      : null;
  }

  const deckTop = firstHit(-3, 0, 100);
  assert.equal(deckTop?.color, bridgeColor, `${description}: the deck must cover the canal.`);
  const roadSettings = settings.layers.roads;
  const expectedRoadTop =
    metrics.surfaceY +
    roadSettings.verticalOffsetMm +
    0.02 +
    roadSettings.categories.bridges.extrudedHeightMm;
  assert.ok(
    Math.abs(deckTop.y - expectedRoadTop) < 1e-6,
    `${description}: the deck top must be level with the road surface.`,
  );
  const belowDeck = deckTop.y - 0.6 - 0.01;
  assert.equal(
    firstHit(-3, 0, belowDeck)?.color,
    waterColor,
    `${description}: under the deck, between piers, must be open space down to the water.`,
  );
  const [sideHit] = new THREE.Raycaster(
    new THREE.Vector3(-4 * scale, belowDeck, 0),
    new THREE.Vector3(1, 0, 0),
  ).intersectObject(group, true);
  assert.equal(
    sideHit && `#${sideHit.object.material.color.getHexString()}`,
    bridgeColor,
    `${description}: a ray under the deck must cross open space and stop at the pier.`,
  );
  assert.ok(
    Math.abs(sideHit.point.x + 0.5 * scale) < 1e-6,
    `${description}: the pier must stand at its mapped position.`,
  );
}

checkBridgeRendering("Deep water", (settings) => {
  settings.layers.water.sinkDepthMm = 2;
});
// Raised land and a tall bridge extrusion lift the deck; it must stay a thin
// slab on piers instead of a solid block down to the water.
checkBridgeRendering("Tall bridge extrusion", (settings, layers) => {
  layers.landCover = true;
  settings.layers.landCover.landHeightMm = 1;
  settings.layers.roads.categories.bridges.extrudedHeightMm = 3;
});

// AHN GeoTIFFs: float32 strips, deflate, floating-point predictor.
function encodeAhnTiff(width, height, values, origin) {
  const rows = [];
  for (let row = 0; row < height; row += 1) {
    const planes = new Uint8Array(width * 4);
    const sample = new DataView(new ArrayBuffer(4));
    for (let column = 0; column < width; column += 1) {
      sample.setFloat32(0, values[row * width + column], false);
      for (let plane = 0; plane < 4; plane += 1) {
        planes[plane * width + column] = sample.getUint8(plane);
      }
    }
    for (let index = planes.length - 1; index > 0; index -= 1) {
      planes[index] = (planes[index] - planes[index - 1]) & 255;
    }
    rows.push(planes);
  }
  const strip = deflateSync(Buffer.concat(rows));
  const noData = Buffer.from("-9999\0");
  const entries = [
    [256, 3, 1, width],
    [257, 3, 1, height],
    [258, 3, 1, 32],
    [259, 3, 1, 8],
    [273, 4, 1, 0],
    [278, 3, 1, height],
    [279, 4, 1, strip.length],
    [317, 3, 1, 3],
    [339, 3, 1, 3],
    [33550, 12, 3, null],
    [33922, 12, 6, null],
    [42113, 2, noData.length, null],
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  const extraStart = 8 + ifdSize;
  const scale = new Float64Array([0.5, 0.5, 0]);
  const tiepoint = new Float64Array([0, 0, 0, origin.x, origin.y, 0]);
  const stripStart = extraStart + 24 + 48 + noData.length;
  const out = Buffer.alloc(stripStart + strip.length);
  out.write("II", 0);
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(8, 4);
  out.writeUInt16LE(entries.length, 8);
  entries.forEach(([tag, type, count, value], index) => {
    const at = 10 + index * 12;
    out.writeUInt16LE(tag, at);
    out.writeUInt16LE(type, at + 2);
    out.writeUInt32LE(count, at + 4);
    if (tag === 273) out.writeUInt32LE(stripStart, at + 8);
    else if (tag === 33550) out.writeUInt32LE(extraStart, at + 8);
    else if (tag === 33922) out.writeUInt32LE(extraStart + 24, at + 8);
    else if (tag === 42113) out.writeUInt32LE(extraStart + 72, at + 8);
    else if (type === 3) out.writeUInt16LE(value, at + 8);
    else out.writeUInt32LE(value, at + 8);
  });
  Buffer.from(scale.buffer).copy(out, extraStart);
  Buffer.from(tiepoint.buffer).copy(out, extraStart + 24);
  noData.copy(out, extraStart + 72);
  strip.copy(out, stripStart);
  return new Uint8Array(out);
}

// RD 1000..1010 x 2000..2004 at 0.5 m: a deck rising 0.5 m to its middle,
// with one missing cell.
const tiffWidth = 20;
const tiffHeight = 8;
const tiffValues = [];
for (let row = 0; row < tiffHeight; row += 1) {
  for (let column = 0; column < tiffWidth; column += 1) {
    const x = (column + 0.5) * 0.5;
    tiffValues.push(
      row === 3 && column === 4 ? -9999 : 2 + 0.5 * Math.sin((Math.PI * x) / 10),
    );
  }
}
const surface = ahn.readFloat32GeoTiff(
  encodeAhnTiff(tiffWidth, tiffHeight, tiffValues, { x: 1000, y: 2004 }),
);
assert.deepEqual(
  [surface.width, surface.height, surface.minX, surface.maxY, surface.cellSize],
  [20, 8, 1000, 2004, 0.5],
  "The AHN reader must keep the georeference.",
);
assert.ok(Number.isNaN(surface.values[3 * 20 + 4]), "No-data cells must read as NaN.");
assert.ok(
  Math.abs(surface.values[10] - tiffValues[10]) < 1e-6,
  "The floating-point predictor must be undone.",
);

// A 10 x 4 m deck (local -5..5, -2..2 around RD 1005, 2002) with three
// piers across it: the span must run along x.
const spanDeck = {
  kind: "bridge-deck",
  points: [
    { x: -5, y: -2 },
    { x: 5, y: -2 },
    { x: 5, y: 2 },
    { x: -5, y: 2 },
  ],
};
const pier = (x) => ({
  kind: "bridge-pier",
  points: [
    { x: x - 0.4, y: -2 },
    { x: x + 0.4, y: -2 },
    { x: x + 0.4, y: 2 },
    { x: x - 0.4, y: 2 },
  ],
});
const farPier = { kind: "bridge-pier", points: pier(40).points };
const found = bridges.bridgeSpanFromPiers(spanDeck, [pier(-4), farPier, pier(0), pier(4)]);
assert.deepEqual(found.pierIndexes, [0, 2, 3], "Only piers under the deck belong to it.");
assert.ok(Math.abs(Math.abs(found.span.axis.x) - 1) < 1e-9, "The span must cross the piers.");
const supportsAlongX = JSON.parse(
  JSON.stringify(
    found.span.supports
      .map(([from, to]) => [from * found.span.axis.x, to * found.span.axis.x].sort((a, b) => a - b))
      .sort((left, right) => left[0] - right[0]),
  ),
).map((interval) => interval.map((value) => Math.round(value * 1e6) / 1e6));
assert.deepEqual(
  supportsAlongX,
  [[-4.4, -3.6], [-0.4, 0.4], [3.6, 4.4]],
  "Supports must be the piers' extents along the span.",
);
const profile = bridges.deckHeightProfile(spanDeck, found.span, surface, { x: 1005, y: 2002 });
const peak = profile.reduce((best, sample) => (sample.heightMeters > best.heightMeters ? sample : best));
assert.ok(Math.abs(peak.offset) <= 1, "The deck's rise must peak at its middle.");
assert.ok(
  peak.heightMeters > 0.4 && peak.heightMeters <= 0.55,
  "The rise must match the surface heights.",
);
assert.ok(
  Math.min(...profile.map((sample) => sample.heightMeters)) < 0.1,
  "The rise is measured from the deck's lowest point.",
);

// Tree canopy over both quays raises the surface 3 m at the deck ends; the
// rise must still crest in the middle instead of curling up at the ends.
const canopyValues = tiffValues.map((value, index) => {
  const column = index % tiffWidth;
  return column < 3 || column >= tiffWidth - 3 ? value + 3 : value;
});
const canopyProfile = bridges.deckHeightProfile(
  spanDeck,
  found.span,
  ahn.readFloat32GeoTiff(encodeAhnTiff(tiffWidth, tiffHeight, canopyValues, { x: 1000, y: 2004 })),
  { x: 1005, y: 2002 },
);
const canopyPeak = canopyProfile.reduce((best, sample) =>
  sample.heightMeters > best.heightMeters ? sample : best,
);
assert.ok(Math.abs(canopyPeak.offset) <= 1, "Trees at the deck ends must not move its crest.");
assert.ok(
  canopyProfile[0].heightMeters < 0.2 && canopyProfile.at(-1).heightMeters < 0.2,
  "Trees at the deck ends must not lift them.",
);
assert.ok(canopyPeak.heightMeters < 0.7, "Trees must not exaggerate the rise.");

// An arch bridge over the canal: supports at the quay walls (x ±5..5.5),
// abutments on the quays beyond. With deep water there is room for an arch;
// a flat deck over the default 0.25 mm water stays solid instead of rising
// above the road.
checkArchBridge(2, 0.5, true);
checkArchBridge(0.25, 0, false);
// A tall bridge setting must give a tall arch, not a small one at its foot.
checkArchBridge(2, 0.5, true, 8);

function checkArchBridge(sinkDepthMm, riseMeters, expectArch, bridgeHeightMm) {
  const settings = printModel.createDefaultPrintableModelSettings();
  settings.layers.water.sinkDepthMm = sinkDepthMm;
  if (bridgeHeightMm !== undefined) {
    settings.layers.roads.categories.bridges.extrudedHeightMm = bridgeHeightMm;
  }
  const archDeck = {
    kind: "bridge-deck",
    points: [
      { x: -8, y: -3 },
      { x: 8, y: -3 },
      { x: 8, y: 3 },
      { x: -8, y: 3 },
    ],
    span: {
      axis: { x: 1, y: 0 },
      origin: { x: 0, y: 0 },
      profile: [
        { heightMeters: 0, offset: -8 },
        { heightMeters: riseMeters, offset: 0 },
        { heightMeters: 0, offset: 8 },
      ],
      supports: [
        [-5.5, -5],
        [5, 5.5],
      ],
    },
  };
  const archInput = {
    layers: { buildings: false, landCover: false, roads: true, water: true },
    modelData: {
      bridgeDecks: [archDeck],
      bridgePiers: [],
      buildings: [],
      generatedAt: "2026-10-04T00:00:00.000Z",
      landCover: [],
      radiusMeters: 50,
      roads: [],
      sourceCounts: { buildings: 0, buildingSurfaces: 0, landCover: 0, osmElements: 0, roads: 0, water: 1 },
      warnings: [],
      water: [
        {
          kind: "canal",
          points: [
            { x: -5, y: -60 },
            { x: 5, y: -60 },
            { x: 5, y: 60 },
            { x: -5, y: 60 },
          ],
        },
      ],
      waterLines: [],
    },
    modelSettings: settings,
    radiusMeters: 50,
    selection: { latitude: 52.3711258, longitude: 4.8869109, shape: "circle" },
    size: printModel.getPrintableModelSize(50, settings),
  };
  const archGroup = preview.createPrintableModel(archInput);
  archGroup.updateMatrixWorld(true);
  const archMetrics = preview.createModelMetrics(archInput);
  const h = archMetrics.horizontalScale;
  const bridgeColor = settings.layers.roads.categories.bridges.color.toLowerCase();
  const waterColor = settings.layers.water.color.toLowerCase();
  const cast = (origin, direction) => {
    const [hit] = new THREE.Raycaster(origin, direction).intersectObject(archGroup, true);
    return hit && { color: `#${hit.object.material.color.getHexString()}`, point: hit.point };
  };
  const down = new THREE.Vector3(0, -1, 0);
  const roads = settings.layers.roads;
  const roadTop =
    archMetrics.surfaceY + roads.verticalOffsetMm + 0.02 + roads.categories.bridges.extrudedHeightMm;
  const water = settings.layers.water;
  const supportY =
    archMetrics.surfaceY + water.verticalOffsetMm - water.sinkDepthMm + water.extrudedHeightMm;

  const crownTop = cast(new THREE.Vector3(0, 100, 0), down);
  assert.equal(crownTop?.color, bridgeColor, "The arch bridge must cover the canal.");
  assert.ok(
    Math.abs(crownTop.point.y - (roadTop + riseMeters * archMetrics.buildingVerticalScale)) < 0.02,
    "The deck must rise by exactly its measured AHN profile.",
  );
  const endTop = cast(new THREE.Vector3(-7.9 * h, 100, 0), down);
  assert.ok(
    endTop?.color === bridgeColor && Math.abs(endTop.point.y - roadTop) < 0.05,
    "The deck ends must meet the road.",
  );

  const crownUnderside = crownTop.point.y - bridgeGeometry.BRIDGE_DECK_THICKNESS_MM;
  if (expectArch) {
    const underCrown = cast(new THREE.Vector3(0, crownUnderside - 0.01, 0), down);
    assert.equal(underCrown?.color, waterColor, "The arch opening must reach the water.");
    assert.ok(
      crownUnderside - underCrown.point.y >= bridgeGeometry.BRIDGE_MIN_ARCH_HEIGHT_MM - 1e-3,
      "The arch opening must be at least the printable minimum.",
    );
    assert.ok(
      Math.abs(underCrown.point.y - supportY) < 0.02,
      "The arch must rise from the water to just under the deck.",
    );

    // Halfway up the opening a half-ellipse is 0.866 of the half-span wide.
    const halfHeight = supportY + (crownUnderside - supportY) / 2;
    const intrados = cast(new THREE.Vector3(0, halfHeight, 0), new THREE.Vector3(-1, 0, 0));
    assert.equal(intrados?.color, bridgeColor, "The opening must be closed by the arch.");
    assert.ok(
      Math.abs(intrados.point.x / h + 5 * Math.sqrt(0.75)) < 0.3,
      "The opening must follow a half-ellipse between the quay walls.",
    );
    const abutment = cast(new THREE.Vector3(-7 * h, 100, 0), down);
    const belowAbutment = cast(
      new THREE.Vector3(-7 * h, abutment.point.y - bridgeGeometry.BRIDGE_DECK_THICKNESS_MM - 0.05, 0),
      down,
    );
    assert.notEqual(
      belowAbutment?.color,
      waterColor,
      "Past the quay walls the bridge must rest on the quay, not open to water.",
    );
  }

  let bridgeMesh = null;
  archGroup.traverse((object) => {
    if (object.isMesh && `#${object.material.color.getHexString()}` === bridgeColor) {
      bridgeMesh = object;
    }
  });
  const edgeUses = new Map();
  const index = bridgeMesh.geometry.getIndex();
  for (let corner = 0; corner < index.count; corner += 3) {
    const triangle = [index.getX(corner), index.getX(corner + 1), index.getX(corner + 2)];
    for (let side = 0; side < 3; side += 1) {
      const a = triangle[side];
      const b = triangle[(side + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
    }
  }
  assert.ok(
    [...edgeUses.values()].every((uses) => uses === 2),
    "Every slice of the arch bridge must be a closed solid.",
  );
  if (!expectArch) {
    const positions = bridgeMesh.geometry.getAttribute("position");
    for (let vertex = 0; vertex < positions.count; vertex += 1) {
      const y = positions.getY(vertex);
      assert.ok(
        y >= roadTop - 1e-3 || Math.abs(y - supportY) < 1e-3,
        "Without room for a printable arch the bridge must be solid down to the water.",
      );
    }
  }
}

// BGT road surfaces: categories from their function, merged per category;
// surfaces on bridges and retired ones are left out.
function roadPart(functie, rings, properties = {}) {
  return {
    geometry: { coordinates: rings, type: "Polygon" },
    properties: {
      eind_registratie: null,
      functie,
      relatieve_hoogteligging: 0,
      status: "bestaand",
      ...properties,
    },
  };
}
const roadSurfaces = bgt.classifyBgtRoads({
  boundary: [
    { x: -20, y: -20 },
    { x: 20, y: -20 },
    { x: 20, y: 20 },
    { x: -20, y: 20 },
  ],
  center: { x: 100, y: 100 },
  roads: [
    roadPart("rijbaan lokale weg", [rectangle(80, 97, 100, 103)]),
    roadPart("rijbaan lokale weg", [rectangle(100, 97, 120, 103)]),
    roadPart("voetpad", [rectangle(80, 103, 120, 105)]),
    roadPart("fietspad", [rectangle(80, 105, 120, 106)]),
    roadPart("rijbaan lokale weg", [rectangle(90, 80, 92, 90)], { relatieve_hoogteligging: 1 }),
    roadPart("parkeervlak", [rectangle(80, 90, 90, 92)], { eind_registratie: "2018-01-01T00:00:00Z" }),
    roadPart("iets nieuws", [rectangle(110, 85, 112, 87)]),
  ],
});
const surfacesOf = (category) => roadSurfaces.filter((surface) => surface.category === category);
assert.equal(surfacesOf("localStreets").length, 2, "Adjacent carriageway parts merge; unknown functions are local streets.");
assert.ok(
  surfacesOf("localStreets").some((surface) => {
    const xs = surface.points.map((point) => point.x);
    return Math.min(...xs) === -20 && Math.max(...xs) === 20;
  }),
  "The merged carriageway must span both parts.",
);
assert.equal(surfacesOf("sidewalks").length, 1, "Sidewalks keep their own category.");
assert.equal(surfacesOf("pedestrianCycle").length, 1, "Bike paths map to pedestrian & cycle.");
assert.equal(surfacesOf("parkingDriveways").length, 0, "Retired road parts must be ignored.");
const containsPoint = (ring, point) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const before = ring[previous];
    if (
      current.y > point.y !== before.y > point.y &&
      point.x < ((before.x - current.x) * (point.y - current.y)) / (before.y - current.y) + current.x
    ) {
      inside = !inside;
    }
  }
  return inside;
};
assert.ok(
  !roadSurfaces.some((surface) => containsPoint(surface.points, { x: -9, y: -15 })),
  "Road parts on bridges are left to the deck.",
);

// A 6 m street meeting a 6 m bridge deck: same width, same top height.
checkRoadMeetsDeck();

function checkRoadMeetsDeck() {
  const settings = printModel.createDefaultPrintableModelSettings();
  const meetInput = {
    layers: { buildings: false, landCover: false, roads: true, water: true },
    modelData: {
      bridgeDecks: [
        {
          kind: "bridge-deck",
          points: [
            { x: -8, y: -3 },
            { x: 8, y: -3 },
            { x: 8, y: 3 },
            { x: -8, y: 3 },
          ],
        },
      ],
      bridgePiers: [],
      buildings: [],
      generatedAt: "2026-10-04T00:00:00.000Z",
      landCover: [],
      radiusMeters: 50,
      roadSurfaces: [
        {
          category: "localStreets",
          kind: "road:localStreets",
          points: [
            { x: -30, y: -3 },
            { x: -8, y: -3 },
            { x: -8, y: 3 },
            { x: -30, y: 3 },
          ],
        },
      ],
      roads: [],
      sourceCounts: { buildings: 0, buildingSurfaces: 0, landCover: 0, osmElements: 0, roads: 1, water: 1 },
      warnings: [],
      water: [
        {
          kind: "canal",
          points: [
            { x: -5, y: -60 },
            { x: 5, y: -60 },
            { x: 5, y: 60 },
            { x: -5, y: 60 },
          ],
        },
      ],
      waterLines: [],
    },
    modelSettings: settings,
    radiusMeters: 50,
    selection: { latitude: 52.3711258, longitude: 4.8869109, shape: "circle" },
    size: printModel.getPrintableModelSize(50, settings),
  };
  const meetGroup = preview.createPrintableModel(meetInput);
  meetGroup.updateMatrixWorld(true);
  const h = preview.createModelMetrics(meetInput).horizontalScale;
  const top = (x, y) => {
    const [hit] = new THREE.Raycaster(
      new THREE.Vector3(x * h, 100, -y * h),
      new THREE.Vector3(0, -1, 0),
    ).intersectObject(meetGroup, true);
    return hit && { color: `#${hit.object.material.color.getHexString()}`, y: hit.point.y };
  };
  const streetColor = settings.layers.roads.categories.localStreets.color.toLowerCase();
  const bridgeColor = settings.layers.roads.categories.bridges.color.toLowerCase();
  const street = top(-9, 2.8);
  const deck = top(-7, 2.8);
  assert.equal(street?.color, streetColor, "The street must reach its real edge.");
  assert.equal(deck?.color, bridgeColor, "The deck must continue the street at the same width.");
  assert.ok(Math.abs(street.y - deck.y) < 1e-6, "Street and deck must meet at the same height.");
  assert.notEqual(top(-9, 3.4)?.color, streetColor, "The street must not be wider than its surface.");
  let streetBottom = Infinity;
  meetGroup.traverse((object) => {
    if (object.isMesh && `#${object.material.color.getHexString()}` === streetColor) {
      streetBottom = Math.min(streetBottom, new THREE.Box3().setFromObject(object).min.y);
    }
  });
  assert.ok(
    streetBottom <= preview.createModelMetrics(meetInput).surfaceY + 1e-6,
    "Road slabs must reach the land surface instead of hovering on a gap that needs supports.",
  );
}

console.log("Bridge checks passed.");
