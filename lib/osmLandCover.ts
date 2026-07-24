type WgsBbox = {
  east: number;
  north: number;
  south: number;
  west: number;
};

export function osmLandCoverKind(tags: Record<string, string>) {
  return (
    tags.landuse ??
    tags.natural ??
    tags.leisure ??
    tags.landcover ??
    null
  );
}

export function osmLandCoverQuery(
  bbox: WgsBbox,
  timeoutSeconds: number,
) {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;

  return `[out:json][timeout:${timeoutSeconds}];
(
  way["landuse"~"grass|forest|meadow|recreation_ground|park|cemetery|allotments|farmland|farmyard|orchard|vineyard|residential|commercial|industrial|retail|construction|brownfield|greenfield|quarry"](${box});
  way["natural"~"wood|grassland|scrub|heath|wetland|sand|beach|dune|bare_rock|rock|scree|glacier"](${box});
  way["leisure"~"park|garden|nature_reserve"](${box});
  way["landcover"~"trees|forest|grass|scrub"](${box});
);
out geom(${box}) 500;`;
}
