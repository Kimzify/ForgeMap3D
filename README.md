# Forge Map 3D

Forge Map 3D turns a real place into a customizable model for 3D printing.
It supports locations in the Netherlands, using OpenStreetMap for roads, water,
land cover, and fallback building footprints, plus detailed 3DBAG building
geometry where available.

Public home: [forgemap3d.com](https://forgemap3d.com)

> Forge Map 3D is pre-release software. Check generated geometry in your
> slicer before printing.

## What It Does

- Select a circular, square, or hexagonal area.
- Build roads, water, land cover, and buildings from real map data.
- Adjust model dimensions, colors, layer visibility, and printable heights.
- Preview the result interactively in 3D.
- Export a printable STL and a color OBJ/MTL archive.
- Use 3DBAG LoD2.2 building meshes for enhanced Dutch building detail.
- Use OpenStreetMap inside the Netherlands for roads, water, land cover, and
  fallback building footprints when 3DBAG meshes are unavailable.

## Preview

Screenshots and a short workflow GIF will live in [`docs/assets`](docs/assets).
They are intentionally left out until the public interface is stable.

<!-- TODO: Add docs/assets/editor-overview.png -->
<!-- TODO: Add docs/assets/forge-map-3d-workflow.gif -->

## Requirements

- Node.js 22 or newer
- npm
- Internet access while using the editor, because map geometry and imagery are
  fetched from public upstream services

No API keys or environment variables are currently required.

## Local Development

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Forge Map 3D currently accepts addresses, postcodes, place names, and
coordinates inside the Netherlands. Coordinates outside the Netherlands are not
supported.

## Docker

Build and run the production app with Docker Compose:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

To stop it:

```bash
docker compose down
```

## Checks

Run the complete offline release gate:

```bash
npm run check
```

This runs TypeScript checking, ESLint, geometry regression checks, and a
production build. The regression checks use local fixtures and do not call live
map services.

Individual commands are also available:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Data Sources

- [OpenStreetMap](https://www.openstreetmap.org/copyright) provides roads,
  waterways, land cover, map imagery, and fallback building footprints used
  inside the Netherlands. Data is © OpenStreetMap contributors and available
  under the ODbL.
- [3DBAG](https://docs.3dbag.nl/en/) provides enhanced Dutch building geometry
  by tudelft3d and 3DGI under CC BY 4.0.
- [PDOK Locatieserver](https://api.pdok.nl/bzk/locatieserver/search/v3_1/ui/)
  provides Dutch place-name search.
- Public Overpass API instances provide OpenStreetMap geometry used for model
  generation.

Running a public instance does not transfer responsibility for upstream usage
policies. Review the
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
and the policies of every configured Overpass endpoint before launch. Keep
attribution visible in the application and with redistributed output where
required by the source licenses.

## Current Scope and Limitations

- Forge Map 3D currently supports locations in the Netherlands only.
- When 3DBAG building meshes are unavailable inside the Netherlands, building
  heights are estimates derived from OpenStreetMap tags and defaults.
- Public data can be incomplete, outdated, or geometrically invalid.
- Upstream services can time out or rate-limit requests. Water fetch failures
  intentionally block export rather than silently producing an incorrect map.
- Detailed meshes may need repair in a slicer before printing.
- Place-name search uses the Dutch PDOK location service.
- Large areas can produce slow previews and large exports.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before
opening a pull request, and follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

Security issues should be reported privately as described in
[SECURITY.md](SECURITY.md).

## License

Forge Map 3D is licensed under the
[GNU Affero General Public License v3.0 only](LICENSE).

If you modify the software and make that modified version available for people
to use over a network, the AGPL requires you to offer those users the
corresponding source code. This summary is not legal advice; the license text is
authoritative.
