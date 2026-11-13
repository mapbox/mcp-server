// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Part of the map page's script: Sharing the view and the selected place with the model (ui/update-model-context).
 * renderMapAppHtml splices it into the page's single <script>, so it shares
 * that scope and uses the page's state and helpers (map, sendRequest,
 * stageRender, ...) directly.
 */
export const MAP_APP_MODEL_CONTEXT_JS = `
  // --- Model context ---------------------------------------------------------
  // A map that stays open next to a chat (an empty map opened from the
  // thread entrypoint, or any map expanded into a tab) tells the model what
  // the user is looking at, so "what's around here?" works without naming
  // the place. The view is background context (structuredContent); a
  // selected place is a chip the user can remove from the composer
  // (content). An inline map shares nothing.
  var explorerMode = false;
  var canUpdateModelContext = false;
  var shareTimer = null;
  var lastSharedContext = '';
  var sharePending = false;
  var ownContextUpdateId = null;
  // A place whose chip left the composer, until the user selects another.
  var dismissedPlaceKey = null;

  function mapView() {
    var center = map.getCenter();
    var bounds = map.getBounds();
    return {
      center: { longitude: coord(center.lng), latitude: coord(center.lat) },
      zoom: Math.round(map.getZoom() * 10) / 10,
      bounds: {
        west: coord(bounds.getWest()),
        south: coord(bounds.getSouth()),
        east: coord(bounds.getEast()),
        north: coord(bounds.getNorth())
      }
    };
  }

  function mapContext() {
    var content = [];
    var place = selectedPlace();
    if (place && placeKey(place) === dismissedPlaceKey) place = null;
    if (place) {
      content.push({
        type: 'text',
        text: 'Place the user selected on the map: ' + place.name +
          (place.category ? ', ' + place.category : '') +
          ' (longitude ' + place.longitude + ', latitude ' + place.latitude + ')' +
          (place.mapbox_id ? ', mapbox_id ' + place.mapbox_id : '') + '.',
        _meta: { 'openai/title': place.name }
      });
    }
    return {
      content: content,
      structuredContent: {
        note: 'The Mapbox map the user has open next to this chat. "Here", "this area" or "the map" means this view.' +
          (webMcpTools
            ? ' This map provides these tools: redraw_map (same arguments as render_map_tool), search_map, add_places, move_map, read_map. Use them to change this map: render_map_tool would open another map and leave this one unchanged.'
            : ''),
        view: mapView()
      }
    };
  }

  // Each call replaces what this map shared before.
  function shareMapContext() {
    if (!canUpdateModelContext || !map || !mapLoaded) return;
    var staysOpen = explorerMode || currentDisplayMode === 'fullscreen';
    // Back inline: take back what this map shared.
    if (!staysOpen && !lastSharedContext) return;
    var context = staysOpen ? mapContext() : { content: [] };
    var key = JSON.stringify(context);
    if (key === lastSharedContext) return;
    lastSharedContext = key;
    sharePending = true;
    sendRequest('ui/update-model-context', context, 10000).then(
      function(result) {
        sharePending = false;
        var meta = result && result._meta && result._meta['openai/modelContext'];
        ownContextUpdateId = meta ? meta.updateId : null;
      },
      function() { sharePending = false; lastSharedContext = ''; }
    );
  }

  function scheduleShareMapContext() {
    if (shareTimer) clearTimeout(shareTimer);
    shareTimer = setTimeout(shareMapContext, 400);
  }

  // The host reports what is attached now. Anything but our own last update
  // without the place in it means the place left the composer: the user
  // removed it, or a sent message used it up.
  function onModelContextChanged(state) {
    if (sharePending) return;
    if (state && state.updateId === ownContextUpdateId) return;
    if (state && Array.isArray(state.content) && state.content.length > 0) return;
    // ChatGPT sends the same null when the user removes the item and when
    // a sent message uses it up, so the map keeps its selection either way.
    dismissedPlaceKey = placeKey(selectedPlace());
    lastSharedContext = '';
  }
`;
