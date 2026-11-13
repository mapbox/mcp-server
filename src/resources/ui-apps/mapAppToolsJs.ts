// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Part of the map page's script: The tools an open map registers for the model (WebMCP): read_map, redraw_map, search_map, add_places, move_map.
 * renderMapAppHtml splices it into the page's single <script>, so it shares
 * that scope and uses the page's state and helpers (map, sendRequest,
 * stageRender, ...) directly.
 */
export const MAP_APP_TOOLS_JS = `
  // --- WebMCP tools ----------------------------------------------------------
  // ChatGPT Desktop lets the model call tools an open app registers, so a
  // request like "show coffee shops on it" draws on this map instead of
  // opening another one.
  // https://github.com/openai/mcp-extensions/blob/main/docs/spec.md#webmcp
  var webMcpTools = false;

  function readMap() {
    return JSON.stringify({
      view: mapView(),
      places: placesOnMap,
      selectedPlace: selectedPlace()
    });
  }

  function requireMap() {
    if (!map || !mapLoaded) throw new Error('The map is not ready yet.');
  }

  function clearMap() {
    errorEl.style.display = 'none';
    stageRender({ layers: [], markers: [] });
  }

  function isLngLat(lng, lat) {
    return typeof lng === 'number' && typeof lat === 'number' &&
      lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
  }

  var MAP_TOOLS = [
    {
      name: 'read_map',
      description: 'Read the open Mapbox map: its view (center, zoom, bounds), the places drawn on it and the place the user selected.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: function() {
        requireMap();
        return readMap();
      }
    },
    {
      name: 'redraw_map',
      description: 'Redraw the open Mapbox map with anything render_map_tool can draw: routes, isochrones, search results, GeoJSON layers, markers. Takes exactly the same arguments as render_map_tool (payload_refs from other Mapbox tools, inline layers and markers, summary, baseStyle, baseMapConfig, showTraffic) and draws on this map instead of opening another. Like render_map_tool it replaces what is on the map, so pass again whatever should stay (for example the route ref together with new markers).',
      inputSchema: {
        type: 'object',
        properties: {
          payload_refs: { type: 'array', items: { type: 'string' }, description: 'mapboxRender.ref values from other Mapbox tools.' },
          layers: { type: 'array', items: { type: 'object' } },
          markers: { type: 'array', items: { type: 'object' } },
          summary: { type: 'string' }
        },
        additionalProperties: true
      },
      execute: function(input) {
        requireMap();
        var args = input && typeof input === 'object' ? input : {};
        if (Object.keys(args).length === 0) {
          throw new Error('Pass payload_refs or inline layers/markers, as for render_map_tool.');
        }
        // The server resolves refs and validates, exactly as for a call
        // from the model; only where the result is drawn differs.
        return sendRequest('tools/call', { name: 'render_map_tool', arguments: args }, 30000)
          .then(function(result) {
            var first = result && Array.isArray(result.content) ? result.content[0] : null;
            var text = first && typeof first.text === 'string' ? first.text : '';
            if (!result || result.isError) throw new Error(text || 'render_map_tool failed.');
            errorEl.style.display = 'none';
            handleToolResult(result);
            return text + ' Drawn on the open map.';
          });
      }
    },
    {
      name: 'search_map',
      description: 'Search for places (a name, address or kind of place, such as "coffee") near the center of the open Mapbox map and draw the results on it. Use this instead of opening a new map when the user asks to show places on the map they already have open.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for.' },
          clear: { type: 'boolean', description: 'Remove what is on the map first. Default false.' }
        },
        required: ['query'],
        additionalProperties: false
      },
      execute: function(input) {
        requireMap();
        var q = input && typeof input.query === 'string' ? input.query.trim() : '';
        if (!q) throw new Error('query is required.');
        if (input.clear === true) clearMap();
        var center = map.getCenter();
        return selfFetchSearch({
          q: q,
          proximity: { longitude: center.lng, latitude: center.lat }
        }).then(function(found) {
          if (!found) throw new Error('No results for "' + q + '" near the map center.');
          return readMap();
        });
      }
    },
    {
      name: 'add_places',
      description: 'Draw pins on the open Mapbox map at known coordinates and fit the view to them. Use this instead of opening a new map when the user asks to mark places on the map they already have open.',
      inputSchema: {
        type: 'object',
        properties: {
          places: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                longitude: { type: 'number' },
                latitude: { type: 'number' }
              },
              required: ['name', 'longitude', 'latitude'],
              additionalProperties: false
            }
          },
          clear: { type: 'boolean', description: 'Remove what is on the map first. Default false.' }
        },
        required: ['places'],
        additionalProperties: false
      },
      execute: function(input) {
        requireMap();
        var places = input && Array.isArray(input.places) ? input.places.slice(0, 50) : [];
        var markers = places.map(function(p) {
          if (!p || !isLngLat(p.longitude, p.latitude)) {
            throw new Error('Each place needs a longitude (-180 to 180) and a latitude (-90 to 90).');
          }
          var name = typeof p.name === 'string' ? p.name : '';
          return { coordinates: [p.longitude, p.latitude], name: name, popup: name };
        });
        if (markers.length === 0) throw new Error('places is required.');
        if (input.clear === true) clearMap();
        mergeAdditionalPayload({ layers: [], markers: markers });
        return readMap();
      }
    },
    {
      name: 'move_map',
      description: 'Move the open Mapbox map to a location.',
      inputSchema: {
        type: 'object',
        properties: {
          longitude: { type: 'number' },
          latitude: { type: 'number' },
          zoom: { type: 'number', minimum: 0, maximum: 22, description: 'Default 12.' }
        },
        required: ['longitude', 'latitude'],
        additionalProperties: false
      },
      execute: function(input) {
        requireMap();
        if (!input || !isLngLat(input.longitude, input.latitude)) {
          throw new Error('longitude (-180 to 180) and latitude (-90 to 90) are required.');
        }
        var zoom = typeof input.zoom === 'number' ? Math.max(0, Math.min(22, input.zoom)) : 12;
        map.flyTo({ center: [input.longitude, input.latitude], zoom: zoom, duration: 600 });
        return JSON.stringify({
          center: { longitude: input.longitude, latitude: input.latitude },
          zoom: zoom
        });
      }
    }
  ];

  if (document.modelContext && typeof document.modelContext.registerTool === 'function') {
    webMcpTools = true;
    MAP_TOOLS.forEach(function(tool) {
      var run = tool.execute;
      // A promise either way, so a thrown error reaches the model as a rejection.
      tool.execute = function(input) {
        return Promise.resolve(input).then(run);
      };
      try { document.modelContext.registerTool(tool); } catch (_) { /* already registered */ }
    });
  }
`;
