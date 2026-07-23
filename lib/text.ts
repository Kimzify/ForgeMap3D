export const APP_TEXT = {
  common: {
    buttons: {
      apply: "Apply",
      backToMap: "Back to map",
      backToSelection: "Back to selection",
      export: "Export",
      exporting: "Exporting...",
      resetAll: "Reset All",
      search: "Search",
    },
    emptyValue: "—",
    loadingIndicator: "...",
    loadingMap: "Loading map...",
    renderMode: {
      label: "Render Mode",
      options: {
        extruded: "Extruded",
        surface: "Surface",
      },
    },
    units: {
      metersShort: "m",
      millimetersShort: "mm",
      squareMillimetersShort: "mm²",
    },
  },
  dataSources: {
    openStreetMap: {
      attribution: "Data: © OpenStreetMap contributors",
      contributors: "OpenStreetMap contributors",
      dataPrefix: "Data:",
      name: "OpenStreetMap",
    },
    threeDbag: {
      attribution: "Buildings: © 3DBAG by tudelft3d and 3DGI, CC BY 4.0",
      copyright: "© 3DBAG by tudelft3d and 3DGI",
      creditPrefix: "Buildings:",
      license: "CC BY 4.0",
      name: "3DBAG",
    },
  },
  mapEditor: {
    aria: {
      areaTools: "Area tools",
      dataAttribution: "Data attribution",
      mapEditor: "Map editor",
      sidePanel: "Map options",
    },
    search: {
      failed: "Location search failed",
      failedWithStatus: (status: number) => `Search failed with ${status}`,
      label: "Search location",
      loading: "Searching",
      noResults: "No Netherlands results found",
      placeholder: "Address, postcode, place, lat/lng",
      required: "Enter a location",
    },
    status: {
      areaSelected: "Area selected",
      areaQueryFailure: "Could not query this area",
      buildingPrintModel: "Building 3D map",
      buildingPrintModelDetail:
        "Fetching 3DBAG buildings and OpenStreetMap layers for this area.",
      checkingArea: "Checking area",
      circleDrawReady: "Circle draw ready",
      hexagonDrawReady: "Hexagon draw ready",
      rectangleDrawReady: "Square draw ready",
      configFailedWithStatus: (status: number) =>
        `Config request failed with ${status}`,
      drawingCircle: (radiusMeters: string) =>
        `Drawing circle (${radiusMeters} m)`,
      drawingHexagon: (radiusMeters: string) =>
        `Drawing hexagon (${radiusMeters} m)`,
      drawingRectangle: (sideMeters: string) =>
        `Drawing square (${sideMeters} m)`,
      dragToSetCircleSize: "Drag to set circle size",
      dragToSetHexagonSize: "Drag to set hexagon size",
      dragToSetRectangleSize: "Drag to set square size",
      exportFailure: "Could not export model",
      exportReady: "Model archive exported",
      exportUnavailable:
        "The Netherlands model is not ready yet.",
      loadingCesium: "Loading Cesium",
      loadingMapData: "Loading map data",
      loadingPrintModel: "Loading map data",
      noAreaSelected: "No area selected yet",
      outsideNetherlands: "Outside Netherlands coverage",
      preparingExport: "Preparing export",
      printModelFailure: "Could not generate the model",
      printModelReady: "Map model ready",
      printModelReadyWithWarnings: "Real model ready with data warnings",
      printPreviewReady: "3D printing preview ready",
      requestFailedWithStatus: (status: number) =>
        `Request failed with ${status}`,
      waitingForLayout: "Waiting for map layout",
    },
    title: "Forge Map 3D",
    toolbar: {
      circleRadius: "Circle radius in meters",
      clearArea: "Clear area",
      circle: "Circle",
      drawCircle: "Draw Circle",
      drawHexagon: "Draw Hexagon",
      drawRectangle: "Draw Square",
      generateMap: "Generate 3D Map",
      buildingMap: "Building 3D Map",
      hexagon: "Hex",
      hideSidePanel: "Hide area sidebar",
      rectangle: "Square",
      resetCamera: "Reset camera",
      selectionShape: "Selection shape",
      selectionRadius: "Selection radius in meters",
      selectionSize: "Selection size",
      showSidePanel: "Show area sidebar",
    },
  },
  panels: {
    area: {
      center: "Center",
      crs: "CRS",
    },
    threeDbag: {
      status: {
        available: "Buildings available",
        checking: "Checking building availability",
        empty: "No buildings found in this area",
        pending: "Building availability will appear after selecting an area",
      },
      title: "Buildings",
    },
    technicalDetails: {
      title: "Technical details",
    },
  },
  printPreview: {
    ariaLabel: "3D printing preview",
    errorTitle: "Real data did not load",
    fetchingData:
      "Fetching OpenStreetMap layers and 3DBAG building detail for the Netherlands.",
    finalSize: (diameterMm: number, heightMm: number) =>
      `Final size: ${diameterMm} × ${diameterMm} × ${heightMm} mm`,
    loading: "Loading map data",
    mapSide: (mapSideMm: number) => `Map side: ${mapSideMm} mm`,
    waitingForMapData: "Waiting for map data",
  },
  printSettings: {
    advanced: {
      areaCount: (count: string) => `(${count} areas)`,
      landCoverClose: "Close advanced land cover settings",
      landCoverTitle: "Advanced Land Cover Settings",
      roadClose: "Close advanced road settings",
      roadCount: (count: string) => `(${count} roads)`,
      roadTitle: "Advanced Road Settings",
    },
    categories: {
      landCoverSwitch: (label: string) => `${label} land cover`,
      roadSwitch: (label: string) => `${label} roads`,
      scopedColor: (label: string) => `${label} color`,
      scopedLandCoverColor: (label: string) => `${label} land cover color`,
      scopedLandCoverCarve: (label: string) => `${label} carve into terrain`,
    },
    layers: {
      advancedLandCover: "Advanced Land Cover Settings",
      advancedRoads: "Advanced Road Settings",
      buildings: {
        color: "Buildings Color",
        colorLabel: "Buildings color",
        data: "Building data",
        dataHighDetail: "High-detail (survey data)",
        dataHelp:
          "Real measured Dutch building shapes from 3DBAG. If no 3DBAG mesh is returned, OpenStreetMap building footprints are used with estimated heights inside the Netherlands.",
        dataWarning:
          "For 3D printing: some high-detail buildings are not perfectly watertight and may need a quick repair in your slicer.",
        heightExaggeration: "Height exaggeration",
        highest: "Highest building:",
        lowest: "Lowest building:",
        showEdges: "Show edges",
        showEdgesLabel: "Show building edges",
        title: "Buildings",
      },
      landCover: {
        carveAllHelp:
          "Carves all land cover categories into the terrain, replacing any individual carve settings from advanced settings.",
        carveDepth: "Carve depth",
        carveSingleHelp:
          "Recess the terrain under this layer so it sits inside the surface, like water.",
        carveIntoTerrain: "Carve into terrain",
        carveIntoTerrainLabel: "Carve land cover into terrain",
        categoryHeightHelp:
          "Categories currently use individual heights (tallest shown). Moving this slider applies one height to all categories.",
        color: "Land Cover Color",
        opacity: "Opacity",
        title: "Land Cover",
      },
      roads: {
        color: "Roads Color",
        colorLabel: "Roads color",
        computedWidthsToggle: "Show computed width per road type",
        title: "Roads",
        widthScale: "Width scale",
      },
      shared: {
        color: "Color",
        extrudedHeight: "Extruded height",
        extrudedHeightTitleCase: "Extruded Height",
        opacity: "Opacity",
        verticalOffset: "Vertical offset",
        verticalOffsetHelp:
          "Positive = above ground, negative = below ground.",
        verticalOffsetLayerHelp: (layer: string) =>
          `Positive = above ground, negative = below ground. Default +0.01mm helps prevent z-fighting (flickering) when ${layer} and ground are at the same height.`,
        width: "Width",
      },
      water: {
        color: "Water Color",
        colorLabel: "Water color",
        hideSmall: "Hide small water bodies",
        hideSmallHelp: "Remove water too small to print or render clearly.",
        minimumArea: "Minimum area",
        minimumAreaHelp: "Hides compact water like ponds and pools.",
        minimumWidth: "Minimum width",
        minimumWidthHelp: "Hides narrow water like canals and streams.",
        sinkDepth: "Sink depth",
        sinkHelp:
          "Cuts a recess into the terrain under every water area, so the water sits in a carved-out hollow.",
        sinkIntoTerrain: "Sink water into terrain",
        title: "Water",
      },
    },
    model: {
      baseHeight: "Base Height",
      baseHeightHelp:
        "Height of the inner base before the map begins (in millimeters)",
      dimensionsApplied: (finalSizeText: string) =>
        `Dimensions applied: ${finalSizeText} mm final size`,
      dimensionsTitle: "Dimensions",
      frame: {
        color: "Frame color",
        enable: "Enable frame",
        height: "Frame height",
        heightHelp:
          "Raised outer rim height. The map starts from the base height.",
        rounded: "Rounded",
        square: "Square",
        style: "Frame style",
        title: "Frame",
        width: "Frame width",
      },
      largestSide: "Largest side size",
      largestSideFrameHelp: (mapSideText: string) =>
        `The frame is included inside this size. Current map side: ${mapSideText} mm`,
      largestSideHelp: "Final outside edge-to-edge size",
      lockHeight: "Lock model height to a fixed value",
      lockHeightHelp:
        "Fix the total printed model height to a constant size across different areas",
      resizeDescription:
        "Set custom dimensions instead of real-world scale. Preview actual sizes (roads, buildings) to verify printability.",
      resizeTitle: "Resize model for 3D printing",
      splitTiles: "Split into tiles",
      splitTilesHelp:
        "Cut the model into a grid of smaller pieces so you can print a map larger than your printer bed, then reassemble them.",
    },
    tabs: {
      layers: "Layers",
      model: "Model",
    },
  },
  printableCategories: {
    landCover: {
      farmland: {
        description: "Farmland, orchards, vineyards, and farmyards",
        label: "Farmland",
      },
      forest: {
        description: "Forest, woodland, scrub, and heath areas",
        label: "Forest",
      },
      grass: {
        description: "Grass, meadow, parks, recreation, and green areas",
        label: "Grass",
      },
      ice: {
        description: "Glacier and permanent ice surfaces",
        label: "Ice",
      },
      rock: {
        description: "Rock, bare rock, scree, and quarry surfaces",
        label: "Rock",
      },
      sand: {
        description: "Sand, beach, and dune surfaces",
        label: "Sand",
      },
      urban: {
        description: "Residential, commercial, industrial, and retail land use",
        label: "Urban",
      },
      wetland: {
        description: "Wetlands and marshy natural areas",
        label: "Wetland",
      },
    },
    roads: {
      alleysService: {
        description: "Service lanes and access roads",
        label: "Alleys & Service",
      },
      bridges: {
        description: "Roads tagged as bridges",
        label: "Bridges",
      },
      crosswalks: {
        description: "Footways tagged as crossings",
        label: "Crosswalks",
      },
      ferries: {
        description: "Ferry routes mapped as ways",
        label: "Ferries",
      },
      highways: {
        description: "Motorways, trunk roads, and primary roads",
        label: "Highways",
      },
      localStreets: {
        description: "Residential, living streets, and unclassified roads",
        label: "Local Streets",
      },
      mainStreets: {
        description: "Secondary and tertiary roads",
        label: "Main Streets",
      },
      parkingDriveways: {
        description: "Parking aisles and driveway service roads",
        label: "Parking & driveways",
      },
      pedestrianCycle: {
        description: "Pedestrian streets, paths, footways, and cycleways",
        label: "Pedestrian & Cycle",
      },
      railways: {
        description: "Rail, tram, metro, and light rail corridors",
        label: "Railways",
      },
      sidewalks: {
        description: "Footways tagged as sidewalks",
        label: "Sidewalks",
      },
      tunnels: {
        description: "Roads tagged as tunnels",
        label: "Tunnels",
      },
    },
  },
} as const;
