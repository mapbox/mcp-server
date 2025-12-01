import React, { useEffect, useRef, useMemo, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { createRoot } from 'react-dom/client';
import { useOpenAiGlobal } from '../common/use-openai-global';

// Set Mapbox access token from environment variable at build time
mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'YOUR_MAPBOX_TOKEN_HERE';

/**
 * Place data structure from category_search_tool
 */
interface Place {
  id: string;
  name: string;
  coords: [number, number];
  description?: string;
  category?: string;
}

/**
 * GeoJSON types for different tool outputs
 */
interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
    coordinates: number[] | number[][] | number[][][] | number[][][][];
  };
  properties?: Record<string, unknown>;
}

interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

/**
 * Route waypoint from directions_tool
 */
interface RouteWaypoint {
  name: string;
  snap_location?: [number, number];
  location?: [number, number];
}

/**
 * Widget data structure - supports multiple display modes
 */
interface WidgetData {
  // Points mode (category_search, search_and_geocode)
  places?: Place[];
  center?: [number, number];
  description?: string;

  // GeoJSON mode (directions, isochrone)
  geojson?: GeoJSONFeatureCollection;

  // Route mode (directions_tool)
  route?: {
    geometry: string | { type: 'LineString'; coordinates: number[][] };
    waypoints?: RouteWaypoint[];
    duration?: number;
    distance?: number;
  };

  // Isochrone mode (isochrone_tool)
  isochrone?: GeoJSONFeatureCollection;

  // Display mode hint
  displayMode?: 'points' | 'route' | 'isochrone';
}

/**
 * Tool output structure - handles multiple tool types
 */
interface ToolOutput {
  // Search tools
  places?: Place[];
  center?: [number, number];
  description?: string;

  // Directions tool
  routes?: Array<{
    geometry?: string | { type: 'LineString'; coordinates: number[][] };
    duration?: number;
    distance?: number;
  }>;
  waypoints?: RouteWaypoint[];

  // Isochrone tool (returns GeoJSON FeatureCollection directly)
  type?: 'FeatureCollection';
  features?: GeoJSONFeature[];

  // Nested structuredContent
  structuredContent?: ToolOutput;
}

/**
 * Fit map bounds to show all marker coordinates
 */
function fitMapToMarkers(map: mapboxgl.Map, coords: [number, number][]): void {
  if (!map || !coords.length) return;

  try {
    // Cancel any pending animations
    if (map.isMoving()) {
      map.stop();
    }

    if (coords.length === 1) {
      map.flyTo({
        center: coords[0],
        zoom: 14,
        essential: true,
        duration: 1000
      });
      return;
    }

    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    );

    map.fitBounds(bounds, {
      padding: 60,
      animate: true,
      duration: 1000,
      essential: true
    });
  } catch (error) {
    console.error('[MapWidget] Error fitting map bounds:', error);
  }
}

/**
 * Decode polyline6 encoded string to coordinates
 */
function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([lng / 1e6, lat / 1e6]);
  }

  return coords;
}

/**
 * Detect display mode from widget data
 */
function detectDisplayMode(
  widgetData: WidgetData | null,
  toolOutput: ToolOutput | null
): 'points' | 'route' | 'isochrone' {
  // Check explicit displayMode hint
  if (widgetData?.displayMode) {
    return widgetData.displayMode;
  }

  // Check for route data
  if (widgetData?.route || toolOutput?.routes?.length) {
    return 'route';
  }

  // Check for isochrone data
  if (
    widgetData?.isochrone ||
    (toolOutput?.type === 'FeatureCollection' &&
      toolOutput?.features?.some(
        (f) =>
          f.geometry?.type === 'Polygon' || f.geometry?.type === 'LineString'
      ))
  ) {
    return 'isochrone';
  }

  // Default to points
  return 'points';
}

/**
 * Flexible Map Widget for displaying various geo data types.
 * Supports Points (markers), LineStrings (routes), and Polygons (isochrones).
 */
function MapWidget() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapObj = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loading, setLoading] = useState(true);

  // Get tool output and metadata from OpenAI globals
  const toolOutput = useOpenAiGlobal('toolOutput') as ToolOutput | null;
  const toolResponseMetadata = useOpenAiGlobal('toolResponseMetadata') as {
    widgetData?: WidgetData;
  } | null;

  // Widget data comes from _meta.widgetData (MCP tools) or directly from toolOutput
  const widgetData = useMemo((): WidgetData | null => {
    // First try _meta.widgetData (from MCP server)
    if (toolResponseMetadata?.widgetData) {
      return toolResponseMetadata.widgetData;
    }
    // Fallback to toolOutput.structuredContent or toolOutput directly
    const structuredData = toolOutput?.structuredContent || toolOutput;
    return structuredData as WidgetData | null;
  }, [toolResponseMetadata, toolOutput]);

  // Detect display mode
  const displayMode = useMemo(() => {
    return detectDisplayMode(widgetData, toolOutput);
  }, [widgetData, toolOutput]);

  const places = useMemo(() => {
    return widgetData?.places || [];
  }, [widgetData]);

  const center = useMemo(() => {
    return widgetData?.center || null;
  }, [widgetData]);

  // Check if we have any data to display
  const hasToolData = useMemo(() => {
    if (!toolOutput) return false;
    if (places.length > 0) return true;
    if (toolOutput.routes?.length) return true;
    if (toolOutput.type === 'FeatureCollection' && toolOutput.features?.length)
      return true;
    if (widgetData?.route || widgetData?.isochrone) return true;
    return false;
  }, [toolOutput, places, widgetData]);

  // Debug logging
  useEffect(() => {
    console.log('[MapWidget] Tool output:', toolOutput);
    console.log('[MapWidget] Display mode:', displayMode);
    console.log('[MapWidget] Places:', places);
    console.log('[MapWidget] Center:', center);
  }, [toolOutput, displayMode, places, center]);

  // Initialize map
  useEffect(() => {
    if (mapObj.current || !mapContainer.current) return;

    try {
      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: center || [0, 0],
        zoom: center ? 12 : 2,
        attributionControl: false
      });

      mapObj.current = map;

      map.once('load', () => {
        requestAnimationFrame(() => {
          if (map.getContainer()) {
            map.resize();
          }
          setLoading(false);
        });
      });

      // Handle window resize
      const resizeHandler = () => {
        if (map.getContainer() && map.loaded()) {
          map.resize();
        }
      };

      window.addEventListener('resize', resizeHandler);

      return () => {
        window.removeEventListener('resize', resizeHandler);
        map.remove();
        mapObj.current = null;
      };
    } catch (error) {
      console.error('[MapWidget] Failed to initialize map:', error);
      setLoading(false);
    }
  }, []);

  // Update markers when places change
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !map.loaded()) {
      // If map not ready, wait for load event
      if (map && !map.loaded()) {
        map.once('load', () => {
          if (places.length > 0) {
            addMarkers(places);
          }
        });
      }
      return;
    }

    addMarkers(places);
  }, [places]);

  // Render route when in route mode
  useEffect(() => {
    if (displayMode !== 'route') return;

    const map = mapObj.current;
    if (!map) return;

    const renderRoute = () => {
      // Get route geometry
      const routeData = widgetData?.route || toolOutput?.routes?.[0];
      if (!routeData?.geometry) {
        console.log('[MapWidget] No route geometry found');
        return;
      }

      // Decode geometry if it's an encoded string
      let coordinates: number[][];
      if (typeof routeData.geometry === 'string') {
        coordinates = decodePolyline(routeData.geometry);
      } else {
        coordinates = routeData.geometry.coordinates;
      }

      console.log(
        `[MapWidget] Rendering route with ${coordinates.length} points`
      );

      // Remove existing route layer/source if present
      if (map.getLayer('route-line')) {
        map.removeLayer('route-line');
      }
      if (map.getSource('route')) {
        map.removeSource('route');
      }

      // Add route source and layer
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates
          }
        }
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 5,
          'line-opacity': 0.8
        }
      });

      // Add waypoint markers
      const waypoints =
        widgetData?.route?.waypoints || toolOutput?.waypoints || [];
      waypoints.forEach((wp, index) => {
        const location = wp.snap_location || wp.location;
        if (!location) return;

        const isStart = index === 0;
        const isEnd = index === waypoints.length - 1;

        const marker = new mapboxgl.Marker({
          color: isStart ? '#22c55e' : isEnd ? '#ef4444' : '#F46C21'
        })
          .setLngLat(location)
          .setPopup(
            new mapboxgl.Popup({ offset: 25 }).setHTML(
              `<div style="font-size: 14px; font-weight: 600;">${wp.name || (isStart ? 'Start' : isEnd ? 'End' : `Waypoint ${index}`)}</div>`
            )
          )
          .addTo(map);

        markersRef.current.push(marker);
      });

      // Fit bounds to route
      if (coordinates.length > 0) {
        const bounds = coordinates.reduce(
          (b, c) => b.extend(c as [number, number]),
          new mapboxgl.LngLatBounds(
            coordinates[0] as [number, number],
            coordinates[0] as [number, number]
          )
        );
        map.fitBounds(bounds, { padding: 60, animate: true, duration: 1000 });
      }
    };

    if (map.loaded()) {
      renderRoute();
    } else {
      map.once('load', renderRoute);
    }
  }, [displayMode, widgetData, toolOutput]);

  // Render isochrone when in isochrone mode
  useEffect(() => {
    if (displayMode !== 'isochrone') return;

    const map = mapObj.current;
    if (!map) return;

    const renderIsochrone = () => {
      // Get isochrone features
      const features =
        widgetData?.isochrone?.features ||
        (toolOutput?.type === 'FeatureCollection' ? toolOutput.features : null);

      if (!features?.length) {
        console.log('[MapWidget] No isochrone features found');
        return;
      }

      console.log(
        `[MapWidget] Rendering ${features.length} isochrone contours`
      );

      // Remove existing isochrone layers/sources
      features.forEach((_, i) => {
        if (map.getLayer(`isochrone-fill-${i}`)) {
          map.removeLayer(`isochrone-fill-${i}`);
        }
        if (map.getLayer(`isochrone-line-${i}`)) {
          map.removeLayer(`isochrone-line-${i}`);
        }
        if (map.getSource(`isochrone-${i}`)) {
          map.removeSource(`isochrone-${i}`);
        }
      });

      // Colors for different contours (from outer to inner)
      const colors = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];

      // Add each feature as a separate layer
      features.forEach((feature, i) => {
        const color =
          (feature.properties?.fill as string) ||
          (feature.properties?.fillColor as string) ||
          colors[i % colors.length];
        const opacity =
          (feature.properties?.['fill-opacity'] as number) ||
          (feature.properties?.fillOpacity as number) ||
          0.3;

        map.addSource(`isochrone-${i}`, {
          type: 'geojson',
          data: feature as GeoJSON.Feature
        });

        if (
          feature.geometry.type === 'Polygon' ||
          feature.geometry.type === 'MultiPolygon'
        ) {
          map.addLayer({
            id: `isochrone-fill-${i}`,
            type: 'fill',
            source: `isochrone-${i}`,
            paint: {
              'fill-color': color,
              'fill-opacity': opacity
            }
          });
        }

        map.addLayer({
          id: `isochrone-line-${i}`,
          type: 'line',
          source: `isochrone-${i}`,
          paint: {
            'line-color': color,
            'line-width': 2,
            'line-opacity': 0.8
          }
        });
      });

      // Fit bounds to all features
      const allCoords: [number, number][] = [];
      features.forEach((feature) => {
        const extractCoords = (coords: unknown): void => {
          if (Array.isArray(coords)) {
            if (typeof coords[0] === 'number') {
              allCoords.push(coords as [number, number]);
            } else {
              coords.forEach(extractCoords);
            }
          }
        };
        extractCoords(feature.geometry.coordinates);
      });

      if (allCoords.length > 0) {
        const bounds = allCoords.reduce(
          (b, c) => b.extend(c),
          new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
        );
        map.fitBounds(bounds, { padding: 60, animate: true, duration: 1000 });
      }
    };

    if (map.loaded()) {
      renderIsochrone();
    } else {
      map.once('load', renderIsochrone);
    }
  }, [displayMode, widgetData, toolOutput]);

  /**
   * Add markers to the map for all places
   */
  function addMarkers(placesList: Place[]) {
    const map = mapObj.current;
    if (!map) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => {
      try {
        marker.remove();
      } catch (e) {
        console.warn('[MapWidget] Error removing marker:', e);
      }
    });
    markersRef.current = [];

    if (placesList.length === 0) return;

    console.log(`[MapWidget] Adding ${placesList.length} markers`);

    // Add markers for each place
    placesList.forEach((place, index) => {
      if (
        !place.coords ||
        !Array.isArray(place.coords) ||
        place.coords.length !== 2
      ) {
        console.warn('[MapWidget] Invalid coordinates for place:', place);
        return;
      }

      try {
        // Create popup content
        const popupHtml = `
          <div style="max-width: 200px;">
            <h3 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600;">${place.name}</h3>
            ${place.description ? `<p style="margin: 0; font-size: 12px; color: #666;">${place.description}</p>` : ''}
            ${place.category ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #888;">${place.category}</p>` : ''}
          </div>
        `;

        const popup = new mapboxgl.Popup({
          offset: 25,
          closeButton: true,
          closeOnClick: false
        }).setHTML(popupHtml);

        const marker = new mapboxgl.Marker({
          color: '#F46C21' // Mapbox orange
        })
          .setLngLat(place.coords)
          .setPopup(popup)
          .addTo(map);

        // Make marker clickable
        const el = marker.getElement();
        if (el) {
          el.style.cursor = 'pointer';
        }

        markersRef.current.push(marker);
        console.log(
          `[MapWidget] Added marker ${index + 1}: ${place.name} at`,
          place.coords
        );
      } catch (e) {
        console.error('[MapWidget] Error adding marker for place:', place, e);
      }
    });

    // Fit map to show all markers
    const coords = placesList
      .map((p) => p.coords)
      .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2);

    if (coords.length > 0) {
      setTimeout(() => {
        if (mapObj.current) {
          fitMapToMarkers(mapObj.current, coords);
        }
      }, 100);
    }
  }

  return (
    <div className="w-full h-full min-h-[400px] relative">
      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-black/80 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent" />
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {!hasToolData ? 'Waiting for data...' : 'Loading map...'}
            </p>
          </div>
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainer} className="w-full h-full absolute inset-0" />

      {/* Results count badge */}
      {hasToolData && !loading && (
        <div className="absolute top-4 left-4 z-10 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full shadow-lg text-sm font-medium">
          {displayMode === 'points' &&
            `${places.length} result${places.length !== 1 ? 's' : ''} found`}
          {displayMode === 'route' && 'Route'}
          {displayMode === 'isochrone' && 'Reachable area'}
        </div>
      )}
    </div>
  );
}

// Mount the widget
const rootElement = document.getElementById('map-widget-root');
if (rootElement) {
  createRoot(rootElement).render(<MapWidget />);
}

export default MapWidget;
