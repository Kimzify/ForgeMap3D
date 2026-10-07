import { inflateSync } from "node:zlib";
import type { RdBbox } from "./bgt";

const AHN_WCS_URL = "https://service.pdok.nl/rws/ahn/wcs/v1_0";
export const AHN_CELL_METERS = 0.5;

// A north-up elevation grid in RD coordinates; NaN marks cells without data
// (water and gaps in the laser scan).
export type ElevationRaster = {
  cellSize: number;
  height: number;
  maxY: number;
  minX: number;
  values: Float32Array;
  width: number;
};

const TAG = {
  bitsPerSample: 258,
  compression: 259,
  gdalNoData: 42113,
  height: 257,
  modelPixelScale: 33550,
  modelTiepoint: 33922,
  predictor: 317,
  rowsPerStrip: 278,
  sampleFormat: 339,
  stripByteCounts: 279,
  stripOffsets: 273,
  width: 256,
} as const;

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8, 16: 8 };

function readTagValues(view: DataView, entry: number, littleEndian: boolean) {
  const type = view.getUint16(entry + 2, littleEndian);
  const count = view.getUint32(entry + 4, littleEndian);
  const size = TYPE_SIZES[type] ?? 1;
  const offset =
    count * size <= 4 ? entry + 8 : view.getUint32(entry + 8, littleEndian);
  const values: number[] = [];
  let text = "";

  for (let index = 0; index < count; index += 1) {
    const at = offset + index * size;
    switch (type) {
      case 2:
        text += String.fromCharCode(view.getUint8(at));
        break;
      case 3:
        values.push(view.getUint16(at, littleEndian));
        break;
      case 4:
        values.push(view.getUint32(at, littleEndian));
        break;
      case 11:
        values.push(view.getFloat32(at, littleEndian));
        break;
      case 12:
        values.push(view.getFloat64(at, littleEndian));
        break;
      default:
        values.push(view.getUint8(at));
    }
  }

  return { text: text.replace(/\0+$/, ""), values };
}

// Reads the single-band float32 GeoTIFFs the AHN WCS returns: strips,
// uncompressed or deflate, with no, horizontal or floating-point predictor.
export function readFloat32GeoTiff(buffer: Uint8Array): ElevationRaster {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const byteOrder = String.fromCharCode(buffer[0], buffer[1]);
  if (byteOrder !== "II" && byteOrder !== "MM") {
    throw new Error("AHN returned data that is not a TIFF.");
  }

  const littleEndian = byteOrder === "II";
  const ifd = view.getUint32(4, littleEndian);
  const tags = new Map<number, ReturnType<typeof readTagValues>>();
  const entries = view.getUint16(ifd, littleEndian);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12;
    tags.set(view.getUint16(entry, littleEndian), readTagValues(view, entry, littleEndian));
  }

  const value = (tag: number, fallback?: number) => {
    const found = tags.get(tag)?.values[0];
    if (found === undefined && fallback === undefined) {
      throw new Error(`AHN TIFF is missing tag ${tag}.`);
    }
    return found ?? (fallback as number);
  };
  const width = value(TAG.width);
  const height = value(TAG.height);
  const compression = value(TAG.compression, 1);
  const predictor = value(TAG.predictor, 1);
  if (value(TAG.bitsPerSample) !== 32 || value(TAG.sampleFormat, 1) !== 3) {
    throw new Error("AHN TIFF is not 32-bit float.");
  }
  if (compression !== 1 && compression !== 8 && compression !== 32946) {
    throw new Error(`AHN TIFF uses unsupported compression ${compression}.`);
  }

  const rowsPerStrip = value(TAG.rowsPerStrip, height);
  const offsets = tags.get(TAG.stripOffsets)?.values ?? [];
  const byteCounts = tags.get(TAG.stripByteCounts)?.values ?? [];
  const rowBytes = width * 4;
  const values = new Float32Array(width * height);
  const noDataText = tags.get(TAG.gdalNoData)?.text;
  const noData = noDataText ? Number(noDataText) : NaN;

  offsets.forEach((offset, strip) => {
    const raw = buffer.subarray(offset, offset + byteCounts[strip]);
    const bytes = compression === 1 ? raw : inflateSync(raw);
    const firstRow = strip * rowsPerStrip;
    const rows = Math.min(rowsPerStrip, height - firstRow);

    for (let row = 0; row < rows; row += 1) {
      const rowData = Uint8Array.from(bytes.subarray(row * rowBytes, (row + 1) * rowBytes));
      const rowView = new DataView(rowData.buffer);
      const target = (firstRow + row) * width;

      if (predictor === 3) {
        // Floating-point predictor: bytes are differenced across the row,
        // then stored as big-endian byte planes.
        for (let index = 1; index < rowBytes; index += 1) {
          rowData[index] = (rowData[index] + rowData[index - 1]) & 255;
        }
        const sample = new DataView(new ArrayBuffer(4));
        for (let column = 0; column < width; column += 1) {
          for (let plane = 0; plane < 4; plane += 1) {
            sample.setUint8(plane, rowData[plane * width + column]);
          }
          values[target + column] = sample.getFloat32(0, false);
        }
      } else {
        for (let column = 0; column < width; column += 1) {
          values[target + column] = rowView.getFloat32(column * 4, littleEndian);
        }
      }
    }
  });

  for (let index = 0; index < values.length; index += 1) {
    const sample = values[index];
    if (!Number.isFinite(sample) || sample === noData || Math.abs(sample) > 1e6) {
      values[index] = NaN;
    }
  }

  const scale = tags.get(TAG.modelPixelScale)?.values;
  const tiepoint = tags.get(TAG.modelTiepoint)?.values;
  if (!scale || !tiepoint) {
    throw new Error("AHN TIFF has no georeference.");
  }

  return {
    cellSize: scale[0],
    height,
    maxY: tiepoint[4] + tiepoint[1] * scale[1],
    minX: tiepoint[3] - tiepoint[0] * scale[0],
    values,
    width,
  };
}

// AHN surface heights (NAP metres, including bridges) for an RD bbox.
export async function fetchAhnSurface(bbox: RdBbox, signal: AbortSignal) {
  const snap = (value: number, round: (value: number) => number) =>
    round(value / AHN_CELL_METERS) * AHN_CELL_METERS;
  const params = new URLSearchParams({
    coverageId: "dsm_05m",
    format: "image/tiff",
    request: "GetCoverage",
    service: "WCS",
    version: "2.0.1",
  });
  params.append("subset", `x(${snap(bbox[0], Math.floor)},${snap(bbox[2], Math.ceil)})`);
  params.append("subset", `y(${snap(bbox[1], Math.floor)},${snap(bbox[3], Math.ceil)})`);
  const response = await fetch(`${AHN_WCS_URL}?${params}`, { signal });
  if (!response.ok) {
    throw new Error(`AHN returned HTTP ${response.status}.`);
  }

  return readFloat32GeoTiff(new Uint8Array(await response.arrayBuffer()));
}
