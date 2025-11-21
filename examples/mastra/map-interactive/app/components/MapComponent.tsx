'use client';

import { useEffect, useRef, useState } from 'react';
import type { MapCommand } from '../page';
import type mapboxglTypes from 'mapbox-gl';

// Import mapbox-gl CSS
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapComponentProps {
  mapCommands: MapCommand[];
}

export default function MapComponent({ mapCommands }: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxglTypes.Map | null>(null);
  const markers = useRef<mapboxglTypes.Marker[]>([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapboxgl, setMapboxgl] = useState<typeof mapboxglTypes | null>(null);

  // Load mapbox-gl dynamically
  useEffect(() => {
    import('mapbox-gl').then((mapboxModule) => {
      setMapboxgl(mapboxModule.default);
    });
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapboxgl || map.current || !mapContainer.current) return;

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.error('NEXT_PUBLIC_MAPBOX_TOKEN is not set');
      console.error(
        'Available env vars:',
        Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC'))
      );
      return;
    }

    console.log('Initializing map with token:', token.substring(0, 10) + '...');
    console.log(
      'Container dimensions:',
      mapContainer.current.offsetWidth,
      'x',
      mapContainer.current.offsetHeight
    );
    mapboxgl.accessToken = token;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [21.0122, 52.2297], // Warsaw center
        zoom: 12,
        pitch: 45,
        bearing: 0
      });

      console.log('Map instance created:', map.current);

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add scale
      map.current.addControl(
        new mapboxgl.ScaleControl({ unit: 'metric' }),
        'bottom-right'
      );

      map.current.on('load', () => {
        console.log('Map loaded successfully');
        setMapLoaded(true);
      });

      map.current.on('error', (e) => {
        console.error('Map error:', e);
      });
    } catch (error) {
      console.error('Failed to create map:', error);
    }

    return () => {
      map.current?.remove();
    };
  }, [mapboxgl]);

  // Handle map commands from the agent
  useEffect(() => {
    if (!mapboxgl || !map.current || !mapLoaded || mapCommands.length === 0)
      return;

    mapCommands.forEach((command) => {
      switch (command.type) {
        case 'flyTo':
          if (command.data.center) {
            map.current?.flyTo({
              center: [command.data.center.lng, command.data.center.lat],
              zoom: command.data.zoom || 15,
              pitch: command.data.pitch || 45,
              bearing: command.data.bearing || 0,
              duration: 2500,
              essential: true
            });
          }
          break;

        case 'addMarker':
          if (command.data.location && mapboxgl) {
            const marker = new mapboxgl.Marker({
              color: command.data.color || '#ff0000'
            })
              .setLngLat([command.data.location.lng, command.data.location.lat])
              .setPopup(
                command.data.popup
                  ? new mapboxgl.Popup().setHTML(command.data.popup)
                  : undefined
              )
              .addTo(map.current!);

            markers.current.push(marker);

            // Open popup if provided
            if (command.data.popup) {
              marker.togglePopup();
            }
          }
          break;

        case 'clearMarkers':
          markers.current.forEach((marker) => marker.remove());
          markers.current = [];
          break;

        case 'drawRoute':
          if (command.data.coordinates && map.current) {
            const mapInstance = map.current;

            // Remove existing route if it exists
            if (mapInstance.getSource('route')) {
              mapInstance.removeLayer('route');
              mapInstance.removeSource('route');
            }

            // Add route as a line
            mapInstance.addSource('route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: command.data.coordinates
                }
              }
            });

            mapInstance.addLayer({
              id: 'route',
              type: 'line',
              source: 'route',
              layout: {
                'line-join': 'round',
                'line-cap': 'round'
              },
              paint: {
                'line-color': command.data.color || '#007bff',
                'line-width': 5,
                'line-opacity': 0.75
              }
            });

            // Fit bounds to show entire route
            if (mapboxgl) {
              const bounds = command.data.coordinates.reduce(
                (
                  bounds: mapboxglTypes.LngLatBounds,
                  coord: [number, number]
                ) => {
                  return bounds.extend(coord);
                },
                new mapboxgl.LngLatBounds(
                  command.data.coordinates[0],
                  command.data.coordinates[0]
                )
              );

              mapInstance.fitBounds(bounds, {
                padding: 50,
                duration: 2000
              });
            }
          }
          break;
      }
    });
  }, [mapCommands, mapLoaded, mapboxgl]);

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  return (
    <>
      {!token && (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f5f5f5',
            flexDirection: 'column',
            padding: '40px'
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '30px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              maxWidth: '500px',
              textAlign: 'center'
            }}
          >
            <h2 style={{ color: '#d32f2f', marginTop: 0 }}>
              ⚠️ Mapbox Token Missing
            </h2>
            <p style={{ color: '#666' }}>
              The map cannot be displayed because{' '}
              <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> is not set.
            </p>
            <div
              style={{
                backgroundColor: '#f5f5f5',
                padding: '15px',
                borderRadius: '4px',
                marginTop: '15px',
                textAlign: 'left'
              }}
            >
              <p style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                <strong>To fix this:</strong>
              </p>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                <li>
                  Create a <code>.env.local</code> file
                </li>
                <li>
                  Add: <code>NEXT_PUBLIC_MAPBOX_TOKEN=your_token_here</code>
                </li>
                <li>Restart the dev server</li>
              </ol>
            </div>
          </div>
        </div>
      )}
      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '100%',
          display: token ? 'block' : 'none',
          backgroundColor: '#f0f0f0'
        }}
      />
      {token && (
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1,
            maxWidth: '300px'
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              margin: '0 0 4px 0'
            }}
          >
            Warsaw, Poland
          </h2>
          <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
            Use the chat panel to explore landmarks and navigate the city
          </p>
        </div>
      )}
    </>
  );
}
