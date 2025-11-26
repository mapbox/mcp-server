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
 * Tool output structure from category_search_tool
 */
interface ToolOutput {
  places: Place[];
  center: [number, number];
  description?: string;
  // Support nested structuredContent from MCP tools
  structuredContent?: {
    places?: Place[];
    center?: [number, number];
    description?: string;
  };
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
 * Simple MVP Map Widget for displaying category search results.
 * Renders an interactive Mapbox map with markers and popups.
 */
function MapWidget() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapObj = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [loading, setLoading] = useState(true);

  // Get tool output and metadata from OpenAI globals
  const toolOutput = useOpenAiGlobal('toolOutput') as ToolOutput | null;
  const toolResponseMetadata = useOpenAiGlobal('toolResponseMetadata') as {
    widgetData?: {
      places: Place[];
      center: [number, number];
      description?: string;
    };
  } | null;

  // Widget data comes from _meta.widgetData (MCP tools) or directly from toolOutput
  const widgetData = useMemo(() => {
    // First try _meta.widgetData (from MCP server)
    if (toolResponseMetadata?.widgetData) {
      return toolResponseMetadata.widgetData;
    }
    // Fallback to toolOutput.structuredContent or toolOutput directly
    const structuredData = toolOutput?.structuredContent || toolOutput;
    return structuredData;
  }, [toolResponseMetadata, toolOutput]);

  const places = useMemo(() => {
    return widgetData?.places || [];
  }, [widgetData]);

  const center = useMemo(() => {
    return widgetData?.center || null;
  }, [widgetData]);

  const hasToolData = toolOutput !== null && places.length > 0;

  // Debug logging
  useEffect(() => {
    console.log('[MapWidget] Tool output:', toolOutput);
    console.log('[MapWidget] Places:', places);
    console.log('[MapWidget] Center:', center);
  }, [toolOutput, places, center]);

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
          {places.length} result{places.length !== 1 ? 's' : ''} found
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
