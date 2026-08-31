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

const previewPath = path.join(
  projectRoot,
  "app/_map-editor/print/PrintableModelPreview/PrintableModelPreview.tsx",
);
const preview = loadTypeScriptModule(previewPath, (source) =>
  `${source}\nexport { addOpenStreetMapLayers, createModelMetrics, createPrintableModel };\n`,
);
const printModel = loadTypeScriptModule(
  path.join(projectRoot, "lib/printModel.ts"),
);
const waterGeometry = loadTypeScriptModule(
  path.join(projectRoot, "lib/printWaterGeometry.ts"),
);
const THREE = require("three");

const settings = printModel.createDefaultPrintableModelSettings();
const input = {
  layers: {
    buildings: false,
    landCover: true,
    roads: true,
    water: true,
  },
  modelData: {
    buildings: [],
    generatedAt: "2026-07-23T00:00:00.000Z",
    landCover: [
      {
        category: "urban",
        kind: "residential",
        points: [
          { x: -40, y: -40 },
          { x: 40, y: -40 },
          { x: 40, y: 40 },
          { x: -40, y: 40 },
          { x: -40, y: -40 },
        ],
      },
    ],
    radiusMeters: 50,
    roads: [],
    sourceCounts: {
      buildings: 0,
      buildingSurfaces: 0,
      landCover: 1,
      osmElements: 2,
      roads: 0,
      water: 2,
    },
    warnings: [],
    water: [
      {
        kind: "canal",
        points: [
          { x: -5, y: -40 },
          { x: 5, y: -40 },
          { x: 5, y: 40 },
          { x: -5, y: 40 },
          { x: -5, y: -40 },
        ],
      },
      {
        kind: "harbor",
        points: [
          { x: -12, y: 45 },
          { x: 12, y: 45 },
          { x: 12, y: 49 },
          { x: -12, y: 49 },
          { x: -12, y: 45 },
        ],
      },
    ],
    waterLines: [
      {
        kind: "canal",
        points: [
          { x: -40, y: 20 },
          { x: 40, y: 20 },
        ],
        widthMeters: 5,
      },
    ],
  },
  modelSettings: settings,
  radiusMeters: 50,
  selection: {
    latitude: 52.3711258,
    longitude: 4.8869109,
    shape: "circle",
  },
  size: {
    baseHeightMm: 2,
    diameterMm: 104,
    frameHeightMm: 1,
    frameWidthMm: 2,
    heightMm: 10,
    mapSideMm: 100,
    terrainHeightMm: 8,
    totalSideMm: 104,
  },
};

function flatTerrain(radiusMeters) {
  return {
    attribution: "Synthetic flat terrain",
    columns: 2,
    elevations: [0, 0, 0, 0],
    maxElevationMeters: 0,
    minElevationMeters: 0,
    minX: -radiusMeters,
    minY: -radiusMeters,
    rows: 2,
    source: "test",
    spacingMeters: radiusMeters * 2,
  };
}

input.modelData.roads.push({
  kind: "residential",
  points: [
    { x: -25, y: 0 },
    { x: 25, y: 0 },
  ],
  widthMeters: 6,
});
const group = preview.createPrintableModel(input);
group.updateMatrixWorld(true);

function colorOfMaterial(material) {
  assert.ok(
    material instanceof THREE.MeshStandardMaterial ||
      material instanceof THREE.MeshBasicMaterial,
    "The sampled layer should use a color material.",
  );

  return `#${material.color.getHexString()}`;
}

function topIntersectionAt(targetGroup, x, z, description) {
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, 100, z),
    new THREE.Vector3(0, -1, 0),
  );
  const intersections = raycaster.intersectObject(targetGroup, true);

  assert.ok(intersections.length > 0, `${description} should hit a surface.`);

  return intersections[0];
}

function assertTopColorAt(targetGroup, x, z, color, description) {
  const top = topIntersectionAt(targetGroup, x, z, description);
  assert.equal(
    colorOfMaterial(top.object.material),
    color.toLowerCase(),
    `${description} should be the top visible layer.`,
  );

  return top;
}

function sideIntersectionsForColor(targetGroup, x, y, color) {
  const meshes = [];
  targetGroup.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      object.material instanceof THREE.MeshStandardMaterial &&
      colorOfMaterial(object.material) === color.toLowerCase()
    ) {
      meshes.push(object);
    }
  });

  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(x, y, -100),
    new THREE.Vector3(0, 0, 1),
  );
  return raycaster.intersectObjects(meshes, false);
}

const waterTop = assertTopColorAt(
  group,
  0,
  -10,
  settings.layers.water.color,
  "a carved polygon canal overlapping land cover",
);
const landTop = assertTopColorAt(
  group,
  6,
  -10,
  settings.layers.landCover.categories.urban.color,
  "land cover beside the carved canal",
);
const roadTop = assertTopColorAt(
  group,
  0,
  0,
  settings.layers.roads.categories.localStreets.color,
  "a road crossing the carved canal",
);

assert.ok(
  waterTop.point.y < landTop.point.y && landTop.point.y < roadTop.point.y,
  "Canal layer height must stack as water below land cover below roads.",
);
assertTopColorAt(
  group,
  20,
  -20,
  settings.layers.water.color,
  "a centerline canal cut into land cover",
);
const narrowLineInput = JSON.parse(JSON.stringify(input));
narrowLineInput.modelData.water = [];
narrowLineInput.modelData.waterLines = [
  {
    kind: "drain",
    points: [
      { x: -40, y: -25 },
      { x: 40, y: -25 },
    ],
    widthMeters: 0.2,
  },
];
const narrowLineGroup = preview.createPrintableModel(narrowLineInput);
narrowLineGroup.updateMatrixWorld(true);
assertTopColorAt(
  narrowLineGroup,
  0,
  25,
  settings.layers.water.color,
  "a sub-minimum-width waterway widened through urban land cover",
);
assertTopColorAt(
  group,
  0,
  -49.5,
  settings.layers.water.color,
  "edge water snapped to the map boundary",
);
assertTopColorAt(
  group,
  30,
  -39,
  settings.layers.landCover.categories.urban.color,
  "dry terrain elsewhere along the map boundary",
);

const reliefInput = JSON.parse(JSON.stringify(input));
reliefInput.layers.terrain = true;
reliefInput.modelData.terrain = flatTerrain(50);
const reliefGroup = preview.createPrintableModel(reliefInput);
reliefGroup.updateMatrixWorld(true);
assertTopColorAt(
  reliefGroup,
  0,
  -10,
  settings.layers.water.color,
  "a carved polygon canal with terrain relief enabled",
);
assertTopColorAt(
  reliefGroup,
  0,
  -49.5,
  settings.layers.water.color,
  "edge water snapped to the terrain-relief boundary",
);

const raisedWaterInput = JSON.parse(JSON.stringify(input));
raisedWaterInput.modelSettings.layers.water.extrudedHeightMm = 1;
raisedWaterInput.modelSettings.layers.landCover.categories.urban.extrudedHeightMm = 1.4;
const raisedWaterGroup = preview.createPrintableModel(raisedWaterInput);
raisedWaterGroup.updateMatrixWorld(true);
const raisedWaterMetrics = preview.createModelMetrics(raisedWaterInput);
const raisedEdgeWater = assertTopColorAt(
  raisedWaterGroup,
  0,
  -49.5,
  settings.layers.water.color,
  "edge water with user-raised water height",
);
const raisedLand = assertTopColorAt(
  raisedWaterGroup,
  6,
  -10,
  settings.layers.landCover.categories.urban.color,
  "land cover higher than user-raised water",
);
assert.ok(
  raisedEdgeWater.point.y > raisedWaterMetrics.surfaceY &&
    raisedEdgeWater.point.y < raisedLand.point.y,
  "Water height 1mm must lift edge water above the earth surface while staying below 1.4mm land.",
);
assert.ok(
  sideIntersectionsForColor(
    raisedWaterGroup,
    0,
    raisedWaterMetrics.surfaceY / 2,
    settings.layers.water.color,
  ).length > 0,
  "Sunk edge water must replace the carved base down to the model bottom instead of leaving a white opening.",
);

const independentLandInput = JSON.parse(JSON.stringify(raisedWaterInput));
independentLandInput.modelData.landCover = [];
independentLandInput.modelSettings.layers.landCover.landHeightMm = 1.3;
const independentLandGroup = preview.createPrintableModel(independentLandInput);
independentLandGroup.updateMatrixWorld(true);
const independentLandWater = assertTopColorAt(
  independentLandGroup,
  0,
  -49.5,
  settings.layers.water.color,
  "edge water beside earth without a mapped land-cover polygon",
);
const independentDryLand = topIntersectionAt(
  independentLandGroup,
  30,
  -39,
  "earth controlled by the independent land height",
);
assert.ok(
  independentDryLand.point.y > independentLandWater.point.y,
  "Land height 1.3mm must place dry earth above water height 1mm even without an urban land-cover polygon.",
);

const urbanWaterCoverData = JSON.parse(
  readFileSync(
    path.join(projectRoot, "scripts/fixtures/amsterdam-urban-water-cover.json"),
    "utf8",
  ),
);
const urbanWaterCoverInput = {
  ...input,
  layers: {
    ...input.layers,
    roads: false,
    terrain: true,
  },
  modelData: {
    ...urbanWaterCoverData,
    terrain: flatTerrain(urbanWaterCoverData.radiusMeters),
  },
  radiusMeters: urbanWaterCoverData.radiusMeters,
  size: printModel.getPrintableModelSize(
    urbanWaterCoverData.radiusMeters,
    settings,
  ),
};
const urbanWaterCoverGroup = preview.createPrintableModel(urbanWaterCoverInput);
const urbanWaterCoverMetrics = preview.createModelMetrics(urbanWaterCoverInput);
urbanWaterCoverGroup.updateMatrixWorld(true);
assertTopColorAt(
  urbanWaterCoverGroup,
  163.31006738523774 * urbanWaterCoverMetrics.horizontalScale,
  434.58439909069745 * urbanWaterCoverMetrics.horizontalScale,
  settings.layers.water.color,
  "Amsterdam water underneath urban land cover with terrain relief enabled",
);

const isolatedMask = waterGeometry.createWaterMask(
  [
    [
      { x: -786, y: 39 },
      { x: -799, y: 35 },
      { x: -800, y: 2.8e-14 },
      { x: -798, y: -52 },
      { x: -800, y: 2.27e-13 },
    ],
    [
      { x: 20, y: -10 },
      { x: 40, y: -10 },
      { x: 40, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: -10 },
    ],
  ],
  [],
  1,
);
assert.equal(
  waterGeometry.planarRegions(isolatedMask).length,
  2,
  "Malformed boundary geometry must not hide disjoint valid water.",
);

const waterWithIsland = waterGeometry.createWaterMask(
  [
    {
      holes: [
        [
          { x: -2, y: -2 },
          { x: 2, y: -2 },
          { x: 2, y: 2 },
          { x: -2, y: 2 },
          { x: -2, y: -2 },
        ],
      ],
      points: [
        { x: -8, y: -8 },
        { x: 8, y: -8 },
        { x: 8, y: 8 },
        { x: -8, y: 8 },
        { x: -8, y: -8 },
      ],
    },
  ],
  [],
  1,
);
const [islandRegion] = waterGeometry.planarRegions(waterWithIsland);
assert.equal(islandRegion?.holes.length, 1, "Water islands must remain holes.");

const liveModelPath = process.argv[2];
if (liveModelPath) {
  const liveModelData = JSON.parse(readFileSync(liveModelPath, "utf8"));
  const liveRadiusMeters = liveModelData.radiusMeters;
  const liveInput = {
    ...input,
    layers: {
      ...input.layers,
      roads: false,
      terrain: true,
    },
    modelData: liveModelData,
    radiusMeters: liveRadiusMeters,
    size: printModel.getPrintableModelSize(liveRadiusMeters, settings),
  };
  const liveGroup = new THREE.Group();
  const liveMetrics = preview.createModelMetrics(liveInput);
  preview.addOpenStreetMapLayers(liveGroup, liveInput, liveMetrics);
  liveGroup.updateMatrixWorld(true);

  const waterColor = settings.layers.water.color.toLowerCase();
  const requestedSample = process.argv[3]?.split(",").map(Number);
  if (
    requestedSample?.length === 2 &&
    requestedSample.every((value) => Number.isFinite(value))
  ) {
    const [localX, localY] = requestedSample;
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(
        localX * liveMetrics.horizontalScale,
        100,
        -localY * liveMetrics.horizontalScale,
      ),
      new THREE.Vector3(0, -1, 0),
    );
    const [topIntersection] = raycaster.intersectObject(liveGroup, true);
    const material = topIntersection?.object.material;

    assert.ok(
      material instanceof THREE.MeshStandardMaterial &&
        `#${material.color.getHexString()}` === waterColor,
      `The selected model point (${localX}, ${localY}) must render as water.`,
    );
    console.log("Selected model point renders as water.");
    process.exit(0);
  }

  const waterMeshes = liveGroup.children.filter((child) => {
    const material = child.material;
    return (
      material instanceof THREE.MeshStandardMaterial &&
      `#${material.color.getHexString()}` === waterColor
    );
  });
  const samplePoints = [];

  for (const mesh of waterMeshes) {
    const positions = mesh.geometry.getAttribute("position");
    const index = mesh.geometry.getIndex();
    const triangleCount = index
      ? index.count / 3
      : Math.floor(positions.count / 3);

    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const vertexIndices = index
        ? [
            index.getX(triangle * 3),
            index.getX(triangle * 3 + 1),
            index.getX(triangle * 3 + 2),
          ]
        : [triangle * 3, triangle * 3 + 1, triangle * 3 + 2];
      const vertices = vertexIndices.map((vertexIndex) =>
        new THREE.Vector3()
          .fromBufferAttribute(positions, vertexIndex)
          .applyMatrix4(mesh.matrixWorld),
      );
      const minY = Math.min(...vertices.map((vertex) => vertex.y));
      const maxY = Math.max(...vertices.map((vertex) => vertex.y));

      if (
        maxY - minY > 0.0001 ||
        maxY <= liveMetrics.surfaceY + settings.layers.water.extrudedHeightMm / 2
      ) {
        continue;
      }

      samplePoints.push(
        vertices
          .reduce(
            (centroid, vertex) => centroid.add(vertex),
            new THREE.Vector3(),
          )
          .multiplyScalar(1 / 3),
      );
    }
  }

  assert.ok(
    samplePoints.length >= 20,
    "The Amsterdam payload should provide enough water surface samples.",
  );

  const sampleStride = Math.max(1, Math.floor(samplePoints.length / 200));
  for (const point of samplePoints.filter(
    (_point, index) => index % sampleStride === 0,
  )) {
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(point.x, 100, point.z),
      new THREE.Vector3(0, -1, 0),
    );
    const [topIntersection] = raycaster.intersectObject(liveGroup, true);
    const material = topIntersection?.object.material;

    assert.ok(
      material instanceof THREE.MeshStandardMaterial &&
        `#${material.color.getHexString()}` === waterColor,
      "Every sampled Amsterdam water surface must remain visible above overlapping land.",
    );
  }
}
