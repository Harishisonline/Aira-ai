'use client';

import { useState } from 'react';
import styles from './page.module.css';

export interface MapMarker {
  id: string;
  name: string;
  aqi: number;
  x: number;
  y: number;
  color: string;
}

export function MapCanvas({ markers }: { markers: MapMarker[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = markers.find((m) => m.id === activeId) ?? null;

  return (
    <div className={styles.mapPlaceholder} onClick={() => setActiveId(null)}>
      <div className={styles.mapWater} />
      <div className={styles.mapBlob} />
      <span className={styles.mapLabel}>MAHARASHTRA</span>
      <span className={styles.mapSea}>ARABIAN SEA</span>
      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          className={styles.marker}
          style={{ left: m.x, top: m.y, background: m.color }}
          aria-label={`${m.name}, AQI ${m.aqi}`}
          onClick={(e) => {
            e.stopPropagation();
            setActiveId((cur) => (cur === m.id ? null : m.id));
          }}
        >
          {m.aqi}
        </button>
      ))}
      {active && (
        <div className={styles.tooltip} style={{ left: active.x, top: active.y }}>
          <strong>{active.name}</strong>
          <span>AQI {active.aqi}</span>
        </div>
      )}
    </div>
  );
}
