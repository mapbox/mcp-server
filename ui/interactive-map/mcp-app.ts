// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.
//
// The map initializes ONCE on connect at a neutral world view.
// Tool input (ontoolinput) adds markers and flies to the location.

import { App } from '@modelcontextprotocol/ext-apps';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = '__MAPBOX_ACCESS_TOKEN__';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarkerInput {
  longitude: number;
  latitude: number;
  label?: string;
  color?: string;
}

interface ToolInput {
  center: { longitude: number; latitude: number };
  zoom?: number;
  style?: string;
  markers?: MarkerInput[];
}

// ---------------------------------------------------------------------------
// Animation styles
// ---------------------------------------------------------------------------
const styleEl = document.createElement('style');
styleEl.textContent = `
  @keyframes marker-drop {
    0%   { opacity: 0; transform: translateY(-30px) scale(0.6); }
    60%  { opacity: 1; transform: translateY(4px) scale(1.05); }
    80%  { transform: translateY(-2px) scale(0.98); }
    100% { opacity: 1; transform: translateY(0) scale(1); }
  }
  .marker-animate {
    animation: marker-drop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
`;
document.head.appendChild(styleEl);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = new App(
  { name: 'Mapbox Interactive Map', version: '1.0.0' },
  {},
  { autoResize: false }
);

let map: mapboxgl.Map | null = null;
let mapLoaded = false;
let pendingInput: ToolInput | null = null;
let currentDisplayMode: 'inline' | 'fullscreen' | 'pip' = 'inline';
const markers: mapboxgl.Marker[] = [];

const fullscreenBtn = document.getElementById('fullscreen-btn')!;
const expandIcon = document.getElementById('expand-icon')!;
const compressIcon = document.getElementById('compress-icon')!;

function hideLoading(): void {
  const el = document.getElementById('loading');
  if (el) el.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

function clearMarkers(): void {
  markers.forEach((m) => m.remove());
  markers.length = 0;
}

function addAnimatedMarker(
  m: MarkerInput,
  mapInstance: mapboxgl.Map,
  index: number
): void {
  const marker = new mapboxgl.Marker({ color: m.color || '#3FB1CE' }).setLngLat(
    [m.longitude, m.latitude]
  );

  if (m.label) {
    marker.setPopup(new mapboxgl.Popup({ offset: 25 }).setText(m.label));
  }

  marker.addTo(mapInstance);
  const el = marker.getElement();
  el.classList.add('marker-animate');
  el.style.animationDelay = `${index * 80}ms`;
  markers.push(marker);
}

function applyMarkers(items: MarkerInput[], zoom?: number): void {
  if (!map) return;
  clearMarkers();

  if (items.length === 0) return;

  const bounds = new mapboxgl.LngLatBounds();
  for (let i = 0; i < items.length; i++) {
    addAnimatedMarker(items[i], map, i);
    bounds.extend([items[i].longitude, items[i].latitude]);
  }

  if (items.length > 1) {
    map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 1000 });
  } else {
    map.flyTo({
      center: [items[0].longitude, items[0].latitude],
      zoom: zoom ?? 14,
      duration: 1000
    });
  }
}

function applyToolInput(args: ToolInput): void {
  if (args.markers && args.markers.length > 0) {
    applyMarkers(args.markers, args.zoom);
  } else {
    clearMarkers();
    map?.flyTo({
      center: [args.center.longitude, args.center.latitude],
      zoom: args.zoom ?? 12,
      duration: 1000
    });
  }
}

// ---------------------------------------------------------------------------
// Tool input handler
// ---------------------------------------------------------------------------

app.ontoolinput = async (params) => {
  const args = params.arguments as ToolInput | undefined;
  if (!args) return;

  if (mapLoaded) {
    applyToolInput(args);
  } else {
    pendingInput = args;
  }
};

app.onteardown = async () => {
  clearMarkers();
  if (map) {
    map.remove();
    map = null;
    mapLoaded = false;
  }
  return {};
};

// ---------------------------------------------------------------------------
// Fullscreen toggle
// ---------------------------------------------------------------------------

function updateFullscreenButton(): void {
  const ctx = app.getHostContext();
  const available = ctx?.availableDisplayModes as string[] | undefined;
  fullscreenBtn.style.display =
    available && available.includes('fullscreen') ? 'flex' : 'none';
  expandIcon.style.display =
    currentDisplayMode === 'fullscreen' ? 'none' : 'block';
  compressIcon.style.display =
    currentDisplayMode === 'fullscreen' ? 'block' : 'none';
}

fullscreenBtn.addEventListener('click', async () => {
  const target = currentDisplayMode === 'fullscreen' ? 'inline' : 'fullscreen';
  try {
    await app.requestDisplayMode({ mode: target });
  } catch {
    /* ignore */
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && currentDisplayMode === 'fullscreen')
    app.requestDisplayMode({ mode: 'inline' }).catch(() => {
      /* ignore */
    });
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter')
    app
      .requestDisplayMode({
        mode: currentDisplayMode === 'fullscreen' ? 'inline' : 'fullscreen'
      })
      .catch(() => {
        /* ignore */
      });
});

app.onhostcontextchanged = (params) => {
  if (params.displayMode) {
    currentDisplayMode = params.displayMode as typeof currentDisplayMode;
    updateFullscreenButton();
  }
  if (map) setTimeout(() => map?.resize(), 100);
};

// ---------------------------------------------------------------------------
// BOOT — connect, size, create map immediately
// ---------------------------------------------------------------------------

await app.connect();

const context = app.getHostContext();
if (context?.displayMode)
  currentDisplayMode = context.displayMode as typeof currentDisplayMode;

app.sendSizeChanged({ height: 600 });
updateFullscreenButton();

map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [0, 20],
  zoom: 1.8
});

map.on('load', () => {
  mapLoaded = true;
  hideLoading();
  if (pendingInput) {
    const args = pendingInput;
    pendingInput = null;
    applyToolInput(args);
  }
});
