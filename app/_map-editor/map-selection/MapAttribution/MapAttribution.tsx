"use client";

import { useEffect, useRef, useState } from "react";
import { APP_TEXT } from "@/lib/text";
import styles from "./MapAttribution.module.css";
import type { MapAttributionProps } from "./MapAttribution.types";

const DATA_SOURCE_TEXT = APP_TEXT.dataSources;
const MAP_TEXT = APP_TEXT.mapEditor;

export default function MapAttribution({
  attribution,
}: MapAttributionProps) {
  const attributionRef = useRef<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const element = attributionRef.current;
    if (!element) {
      return;
    }

    const updateOverflow = () => {
      setHasOverflow(element.scrollWidth > element.clientWidth + 1);
    };

    updateOverflow();
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [attribution]);

  return (
    <div
      ref={attributionRef}
      className={[
        styles.attribution,
        hasOverflow ? styles.attributionOverflow : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={MAP_TEXT.aria.dataAttribution}
    >
      <span>
        {DATA_SOURCE_TEXT.openStreetMap.dataPrefix} ©{" "}
        <a href={attribution.osm.copyrightUrl} rel="noreferrer" target="_blank">
          {DATA_SOURCE_TEXT.openStreetMap.name}
        </a>
      </span>
      {attribution.showOvertureMaps ? (
        <span>
          {DATA_SOURCE_TEXT.overtureMaps.creditPrefix} ©{" "}
          <a
            href={attribution.overtureMaps.attributionUrl}
            rel="noreferrer"
            target="_blank"
          >
            {DATA_SOURCE_TEXT.overtureMaps.contributors}
          </a>
        </span>
      ) : null}
      {attribution.showOpenTopoData ? (
        <span>
          {DATA_SOURCE_TEXT.openTopoData.creditPrefix}{" "}
          <a
            href={attribution.openTopoData.attributionUrl}
            rel="noreferrer"
            target="_blank"
          >
            {DATA_SOURCE_TEXT.openTopoData.dataName}
          </a>
          ,{" "}
          <a
            href={attribution.openTopoData.licenseUrl}
            rel="noreferrer"
            target="_blank"
          >
            {DATA_SOURCE_TEXT.openTopoData.license}
          </a>
        </span>
      ) : null}
      {attribution.showThreeDbag ? (
        <span>
          {DATA_SOURCE_TEXT.threeDbag.creditPrefix}{" "}
          <a
            href={attribution.threeDbag.copyrightUrl}
            rel="noreferrer"
            target="_blank"
          >
            {DATA_SOURCE_TEXT.threeDbag.copyright}
          </a>
          ,{" "}
          <a
            href={attribution.threeDbag.licenseUrl}
            rel="noreferrer"
            target="_blank"
          >
            {DATA_SOURCE_TEXT.threeDbag.license}
          </a>
        </span>
      ) : null}
    </div>
  );
}
