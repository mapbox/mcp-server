// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { MAPBOX_GL_VERSION } from './mapAppHtml.js';

/**
 * HTML for the tileset explorer (`tileset_explorer_tool`): a GL JS map that
 * draws every source layer of a tileset in its own color over a blank
 * background, with a panel to switch layers, read their fields and inspect a
 * clicked feature. Tiles load through `mapbox://` with the public token.
 *
 * While open next to a chat it shares the tileset, the view and the selected
 * feature as model context, and registers WebMCP tools (`load_tileset`,
 * `read_tileset_view`) so the model works on this explorer instead of opening
 * another. Tileset data only goes in through textContent.
 */
export function renderTilesetExplorerHtml(params: {
  publicToken: string;
  glVersion?: string;
}): string {
  const glVersion = params.glVersion ?? MAPBOX_GL_VERSION;
  // Safe inside <script>: no "</script>" can survive the escaping.
  const json = (value: unknown) =>
    JSON.stringify(value).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mapbox Tileset Explorer</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1c1f24; --muted: #6b7280; --line: #e3e5e8; --field: #f4f5f6;
    --accent: #3b6cf6; --error: #b42318; --map-bg: #f3f3f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  :root[data-theme="dark"] {
    --bg: #1f2125; --fg: #eceef1; --muted: #9aa1ac; --line: #34383f; --field: #2a2d33;
    --accent: #7d9dff; --error: #ff8a7a; --map-bg: #101216;
  }
  * { box-sizing: border-box; }
  /* The grid and flex rules below would otherwise show hidden elements. */
  [hidden] { display: none !important; }
  html, body { margin: 0; height: 100%; min-height: 500px; color: var(--fg); background: var(--map-bg); font-size: 13px; }
  #map { position: fixed; inset: 0; }
  #panel {
    position: fixed; top: calc(12px + var(--inset-top, 0px)); left: calc(12px + var(--inset-left, 0px));
    width: 300px; max-height: calc(100% - 24px - var(--inset-top, 0px) - var(--inset-bottom, 0px));
    overflow-y: auto; background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.14); padding: 12px;
  }
  form { display: flex; gap: 6px; }
  input[type="text"] {
    flex: 1; min-width: 0; font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
    color: var(--fg); background: var(--field); border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px;
  }
  button { font: inherit; color: inherit; cursor: pointer; }
  .btn { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 7px 12px; font-weight: 600; }
  .btn:disabled { opacity: 0.6; cursor: default; }
  .link { background: none; border: 0; padding: 0; color: var(--accent); }
  h1 { font-size: 15px; margin: 12px 0 2px; overflow-wrap: anywhere; }
  h2 { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 14px 0 6px; display: flex; justify-content: space-between; align-items: baseline; }
  h2 .link { text-transform: none; letter-spacing: 0; font-size: 12px; margin-left: 8px; }
  .meta { color: var(--muted); }
  .error { color: var(--error); margin-top: 8px; }
  .options { display: flex; gap: 14px; margin-top: 10px; }
  label { display: flex; align-items: center; gap: 6px; cursor: pointer; min-width: 0; }
  .layer { padding: 3px 0; }
  .layer .row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
  .swatch { width: 10px; height: 10px; border-radius: 3px; flex: none; }
  .name { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fields, .props { margin: 4px 0 6px 24px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 12px; }
  .props { margin-left: 0; }
  .fields .k, .props .k { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--fg); overflow-wrap: anywhere; }
  .fields .v, .props .v { color: var(--muted); overflow-wrap: anywhere; }
  #zoom {
    position: fixed; right: calc(12px + var(--inset-right, 0px)); bottom: calc(40px + var(--inset-bottom, 0px));
    background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 4px 8px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  }
  @media (max-width: 560px) {
    #panel { top: auto; bottom: calc(8px + var(--inset-bottom, 0px)); left: 8px; right: 8px; width: auto; max-height: 45%; }
    #zoom { bottom: auto; top: calc(12px + var(--inset-top, 0px)); right: auto; left: 12px; }
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="panel">
  <form id="load-form">
    <input id="tileset-input" type="text" placeholder="username.tileset-id" aria-label="Tileset ID" autocomplete="off" spellcheck="false">
    <button class="btn" type="submit" id="load-button">Load</button>
  </form>
  <div id="error" class="error" hidden></div>
  <h1 id="tileset-name"></h1>
  <div class="meta" id="tileset-meta">Loading the tileset…</div>
  <div class="options">
    <label><input type="checkbox" id="opt-boundaries"> Tile boundaries</label>
    <label><input type="checkbox" id="opt-basemap"> Base map</label>
  </div>
  <div id="layers-section" hidden>
    <h2><span id="layers-title">Source layers</span><span><button class="link" type="button" id="layers-all">All</button><button class="link" type="button" id="layers-none">None</button></span></h2>
    <div id="layers"></div>
  </div>
  <h2><span>Feature</span></h2>
  <div id="feature" class="meta">Click a feature to inspect it.</div>
</div>
<div id="zoom" hidden></div>

<script>
(function() {
  var TOKEN = ${json(params.publicToken)};
  var GL_VERSION = ${json(glVersion)};
  var TOOL_NAME = 'tileset_explorer_tool';
  var SOURCE = 'tileset-explorer';
  var COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0aa5a5',
    '#f032e6', '#9a6324', '#808000', '#e6739f', '#2f7ed8', '#c9a400'];
  var MAX_VALUE_LENGTH = 200;

  var tileset = null;
  var hidden = {};
  var expanded = {};
  var selected = null;
  var map = null;
  var styleReady = false;
  var pendingFrame = false;
  var layerIds = [];
  var popup = null;
  var displayMode = '';
  var $ = function(id) { return document.getElementById(id); };
  var inputEl = $('tileset-input');
  var errorEl = $('error');
  var zoomEl = $('zoom');
  var root = document.documentElement;

  // --- MCP Apps postMessage protocol ---------------------------------------
  var messageId = 0;
  var pending = new Map();
  function request(method, params, timeoutMs) {
    var id = ++messageId;
    return new Promise(function(resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*');
      if (timeoutMs) {
        setTimeout(function() {
          if (!pending.has(id)) return;
          pending.delete(id);
          reject(new Error(method + ' timed out'));
        }, timeoutMs);
      }
    });
  }
  function notify(method, params) {
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.id !== undefined && pending.has(msg.id)) {
      var p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'ui/notifications/tool-result' && msg.params) {
      applyToolResult(msg.params);
    }
    if (msg.method === 'ui/notifications/host-context-changed' && msg.params) {
      applyHostContext(msg.params);
      if ('openai/modelContext' in msg.params) onModelContextChanged(msg.params['openai/modelContext']);
    }
  });

  var hostTheme = false;
  function applyHostContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return;
    if (ctx.theme === 'light' || ctx.theme === 'dark') {
      hostTheme = true;
      root.setAttribute('data-theme', ctx.theme);
    }
    var insets = ctx.safeAreaInsets;
    if (insets) {
      ['top', 'right', 'bottom', 'left'].forEach(function(side) {
        if (typeof insets[side] === 'number') root.style.setProperty('--inset-' + side, insets[side] + 'px');
      });
    }
    if (ctx.displayMode) {
      displayMode = ctx.displayMode;
      if (map) setTimeout(function() { map.resize(); }, 100);
      shareContext();
    }
  }
  var darkQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (darkQuery && darkQuery.matches && !hostTheme) root.setAttribute('data-theme', 'dark');

  var canUpdateModelContext = false;
  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Mapbox Tileset Explorer', version: '1.0.0' }
  }).then(function(result) {
    canUpdateModelContext = !!(result && result.hostCapabilities && result.hostCapabilities.updateModelContext);
    applyHostContext(result && result.hostContext);
    notify('ui/notifications/initialized', {});
    if (displayMode === 'inline') notify('ui/notifications/size-changed', { height: 560 });
    shareContext();
  }, function() { notify('ui/notifications/initialized', {}); });

  // --- Tileset ---------------------------------------------------------------
  function showError(text) {
    errorEl.textContent = text || '';
    errorEl.hidden = !text;
  }

  function resultText(result) {
    var first = result && Array.isArray(result.content) ? result.content[0] : null;
    return first && typeof first.text === 'string' ? first.text : '';
  }

  // Returns whether the result carried a tileset.
  function applyToolResult(result) {
    var sc = result && result.structuredContent;
    if (!sc || sc.tilesetExplorer !== true) {
      if (result && result.isError) showError(resultText(result) || 'The tileset could not be loaded.');
      return false;
    }
    tileset = sc;
    hidden = {};
    expanded = {};
    selected = null;
    dismissedKey = null;
    if (popup) popup.remove();
    showError('');
    inputEl.value = sc.tileset_id;
    renderPanel();
    renderFeature();
    showTileset();
    shareContext();
    return true;
  }

  function loadTileset(id) {
    $('load-button').disabled = true;
    return request('tools/call', { name: TOOL_NAME, arguments: { tileset_id: id } }, 30000).then(function(result) {
      $('load-button').disabled = false;
      if (!applyToolResult(result)) throw new Error(resultText(result) || 'The tileset could not be loaded.');
      return resultText(result);
    }, function(error) {
      $('load-button').disabled = false;
      showError('The tileset could not be loaded: ' + error.message);
      throw error;
    });
  }

  $('load-form').addEventListener('submit', function(event) {
    if (event && event.preventDefault) event.preventDefault();
    var id = String(inputEl.value || '').trim();
    if (id) loadTileset(id).catch(function() {});
  });

  // --- Panel -----------------------------------------------------------------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function colorOf(index) { return COLORS[index % COLORS.length]; }

  function renderPanel() {
    $('tileset-name').textContent = tileset.name || tileset.tileset_id;
    var meta = [tileset.type];
    if (typeof tileset.minzoom === 'number' && typeof tileset.maxzoom === 'number') {
      meta.push('zoom ' + tileset.minzoom + ' to ' + tileset.maxzoom);
    }
    if (tileset.type === 'vector') {
      meta.push(tileset.layers.length + (tileset.layers.length === 1 ? ' layer' : ' layers'));
    }
    $('tileset-meta').textContent = meta.join(' · ');
    $('layers-section').hidden = tileset.layers.length === 0;
    var list = $('layers');
    list.textContent = '';
    tileset.layers.forEach(function(layer, index) {
      var item = el('div', 'layer');
      var row = el('div', 'row');
      var label = el('label');
      var box = el('input');
      box.type = 'checkbox';
      box.checked = !hidden[layer.id];
      box.addEventListener('change', function() {
        hidden[layer.id] = !box.checked;
        applyVisibility();
        shareContext();
      });
      var swatch = el('span', 'swatch');
      swatch.style.background = colorOf(index);
      label.appendChild(box);
      label.appendChild(swatch);
      label.appendChild(el('span', 'name', layer.id));
      row.appendChild(label);
      var names = Object.keys(layer.fields || {});
      if (names.length) {
        var fields = el('div', 'fields');
        fields.hidden = !expanded[layer.id];
        names.forEach(function(name) {
          fields.appendChild(el('span', 'k', name));
          fields.appendChild(el('span', 'v', layer.fields[name]));
        });
        var toggle = el('button', 'link', names.length + (names.length === 1 ? ' field' : ' fields'));
        toggle.type = 'button';
        toggle.addEventListener('click', function() {
          expanded[layer.id] = !expanded[layer.id];
          fields.hidden = !expanded[layer.id];
        });
        row.appendChild(toggle);
        item.appendChild(row);
        item.appendChild(fields);
      } else {
        item.appendChild(row);
      }
      list.appendChild(item);
    });
  }

  function setAll(visible) {
    if (!tileset) return;
    tileset.layers.forEach(function(layer) { hidden[layer.id] = !visible; });
    renderPanel();
    applyVisibility();
    shareContext();
  }
  $('layers-all').addEventListener('click', function() { setAll(true); });
  $('layers-none').addEventListener('click', function() { setAll(false); });

  function clip(value) {
    var text = typeof value === 'string' ? value : JSON.stringify(value);
    if (text === undefined) text = String(value);
    return text.length > MAX_VALUE_LENGTH ? text.slice(0, MAX_VALUE_LENGTH) + '…' : text;
  }

  function renderFeature() {
    var box = $('feature');
    box.textContent = '';
    if (!selected) {
      box.className = 'meta';
      box.textContent = tileset && tileset.type === 'raster'
        ? 'A raster tileset has no features to inspect.'
        : 'Click a feature to inspect it.';
      return;
    }
    box.className = 'props';
    var rows = [['layer', selected.layer], ['geometry', selected.geometry]];
    if (selected.id !== undefined) rows.push(['id', selected.id]);
    Object.keys(selected.properties).forEach(function(name) { rows.push([name, selected.properties[name]]); });
    rows.forEach(function(pair) {
      box.appendChild(el('span', 'k', pair[0]));
      box.appendChild(el('span', 'v', clip(pair[1])));
    });
  }

  // --- Map -------------------------------------------------------------------
  function isDark() { return root.getAttribute('data-theme') === 'dark'; }

  function styleFor(baseMap) {
    if (baseMap) return 'mapbox://styles/mapbox/' + (isDark() ? 'dark-v11' : 'light-v11');
    return {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': isDark() ? '#101216' : '#f3f3f0' } }]
    };
  }

  function loadGl(onReady, onError) {
    if (window.mapboxgl) { onReady(); return; }
    var base = 'https://api.mapbox.com/mapbox-gl-js/v' + GL_VERSION + '/mapbox-gl';
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = base + '.css';
    document.head.appendChild(css);
    var script = document.createElement('script');
    script.src = base + '.js';
    script.onload = onReady;
    script.onerror = onError;
    document.head.appendChild(script);
  }

  function showTileset() {
    pendingFrame = true;
    if (!TOKEN) {
      showError('The preview needs a public token for this account. The layers and fields are listed below.');
      return;
    }
    if (map) { addTilesetLayers(); return; }
    loadGl(function() {
      if (map) return;
      mapboxgl.accessToken = TOKEN;
      map = new mapboxgl.Map({
        container: 'map', style: styleFor($('opt-basemap').checked), center: [0, 20], zoom: 1,
        // Tiles are square in Mercator; the base map styles default to a globe.
        projection: 'mercator', attributionControl: false
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.showTileBoundaries = !!$('opt-boundaries').checked;
      // Also fires after every setStyle, which drops the tileset layers.
      map.on('style.load', function() {
        styleReady = true;
        addTilesetLayers();
      });
      map.on('click', onMapClick);
      map.on('zoom', renderZoom);
      map.on('moveend', scheduleShareContext);
      map.on('error', function(e) {
        var status = e && e.error && e.error.status;
        if (status === 401 || status === 403 || status === 404) {
          showError('The tiles of this tileset could not be loaded with the public token of this account.');
        }
      });
      renderZoom();
    }, function() {
      showError('Mapbox GL JS could not be loaded.');
    });
  }

  function removeTilesetLayers() {
    layerIds.forEach(function(id) { if (map.getLayer(id)) map.removeLayer(id); });
    layerIds = [];
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
  }

  function visibility(layerId) { return hidden[layerId] ? 'none' : 'visible'; }

  function addTilesetLayers() {
    if (!map || !styleReady || !tileset) return;
    removeTilesetLayers();
    var url = 'mapbox://' + tileset.tileset_id;
    if (tileset.type === 'raster') {
      map.addSource(SOURCE, { type: 'raster', url: url, tileSize: 256 });
      map.addLayer({ id: 'tx-raster', type: 'raster', source: SOURCE });
      layerIds.push('tx-raster');
    } else {
      map.addSource(SOURCE, { type: 'vector', url: url });
      tileset.layers.forEach(function(layer, index) {
        var color = colorOf(index);
        var layout = { visibility: visibility(layer.id) };
        var specs = [
          { suffix: 'fill', type: 'fill', filter: ['==', '$type', 'Polygon'],
            paint: { 'fill-color': color, 'fill-opacity': 0.18 } },
          { suffix: 'line', type: 'line', filter: ['in', '$type', 'Polygon', 'LineString'],
            paint: { 'line-color': color, 'line-width': 1 } },
          { suffix: 'circle', type: 'circle', filter: ['==', '$type', 'Point'],
            paint: { 'circle-color': color, 'circle-radius': 3, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.5 } }
        ];
        specs.forEach(function(spec) {
          var id = 'tx-' + index + '-' + spec.suffix;
          map.addLayer({
            id: id, type: spec.type, source: SOURCE, 'source-layer': layer.id,
            filter: spec.filter, layout: layout, paint: spec.paint
          });
          layerIds.push(id);
        });
      });
    }
    if (pendingFrame) {
      pendingFrame = false;
      frame();
    }
    renderZoom();
  }

  function applyVisibility() {
    if (!map || !styleReady || !tileset) return;
    tileset.layers.forEach(function(layer, index) {
      ['fill', 'line', 'circle'].forEach(function(suffix) {
        var id = 'tx-' + index + '-' + suffix;
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility(layer.id));
      });
    });
  }

  // A tileset draws nothing below its minzoom, so never frame it lower.
  function frame() {
    var b = tileset.bounds;
    var minzoom = typeof tileset.minzoom === 'number' ? tileset.minzoom : 0;
    if (!b || b[2] - b[0] >= 359) {
      map.jumpTo({ center: [0, 20], zoom: Math.max(1, minzoom) });
      return;
    }
    var wide = window.innerWidth > 560;
    map.fitBounds([[b[0], Math.max(b[1], -85)], [b[2], Math.min(b[3], 85)]], {
      padding: { top: 40, bottom: 40, right: 40, left: wide ? 340 : 40 },
      maxZoom: 16, animate: false
    });
    if (map.getZoom() < minzoom) map.setZoom(minzoom);
  }

  function renderZoom() {
    if (!map) return;
    var zoom = Math.round(map.getZoom() * 10) / 10;
    var text = 'z ' + zoom.toFixed(1);
    if (tileset && typeof tileset.minzoom === 'number' && zoom < tileset.minzoom) {
      text += ' · zoom in to z ' + tileset.minzoom + ' to see tiles';
    }
    zoomEl.textContent = text;
    zoomEl.hidden = false;
  }

  function onMapClick(e) {
    var ids = layerIds.filter(function(id) { return id !== 'tx-raster' && map.getLayer(id); });
    if (!ids.length) return;
    var box = [[e.point.x - 3, e.point.y - 3], [e.point.x + 3, e.point.y + 3]];
    var feature = map.queryRenderedFeatures(box, { layers: ids })[0];
    if (popup) popup.remove();
    if (!feature) {
      selected = null;
    } else {
      selected = {
        layer: feature.sourceLayer,
        geometry: feature.geometry && feature.geometry.type,
        id: feature.id,
        properties: feature.properties || {},
        longitude: coord(e.lngLat.lng),
        latitude: coord(e.lngLat.lat)
      };
      dismissedKey = null;
      popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })
        .setLngLat(e.lngLat).setText(selected.layer).addTo(map);
    }
    renderFeature();
    shareContext();
  }

  $('opt-boundaries').addEventListener('change', function() {
    if (map) map.showTileBoundaries = !!$('opt-boundaries').checked;
  });
  $('opt-basemap').addEventListener('change', function() {
    if (!map) return;
    styleReady = false;
    layerIds = [];
    map.setStyle(styleFor($('opt-basemap').checked));
  });

  // --- Model context ---------------------------------------------------------
  // The tileset and the view are background context; a selected feature is an
  // item the user can remove from the composer. An inline explorer shares
  // nothing.
  var webMcpTools = false;
  var shareTimer = null;
  var lastShared = '';
  var sharePending = false;
  var ownUpdateId = null;
  var dismissedKey = null;

  function coord(n) { return Math.round(n * 1e5) / 1e5; }

  function view() {
    var center = map.getCenter();
    var bounds = map.getBounds();
    return {
      center: { longitude: coord(center.lng), latitude: coord(center.lat) },
      zoom: Math.round(map.getZoom() * 10) / 10,
      bounds: {
        west: coord(bounds.getWest()), south: coord(bounds.getSouth()),
        east: coord(bounds.getEast()), north: coord(bounds.getNorth())
      }
    };
  }

  function clippedProperties(properties) {
    var out = {};
    Object.keys(properties).slice(0, 40).forEach(function(name) {
      var value = properties[name];
      out[name] = typeof value === 'string' ? clip(value) : value;
    });
    return out;
  }

  function featureKey(f) {
    return f ? f.layer + '#' + f.id + '@' + f.longitude + ',' + f.latitude : null;
  }

  function featureTitle(f) {
    var name = f.properties.name_en || f.properties.name;
    return f.layer + (typeof name === 'string' && name ? ': ' + clip(name).slice(0, 40) : ' feature');
  }

  function modelContext() {
    var content = [];
    if (selected && featureKey(selected) !== dismissedKey) {
      content.push({
        type: 'text',
        text: 'Feature the user selected in tileset ' + tileset.tileset_id + ', source layer ' + selected.layer +
          ' (' + selected.geometry + ') at longitude ' + selected.longitude + ', latitude ' + selected.latitude +
          '. Properties: ' + JSON.stringify(clippedProperties(selected.properties)),
        _meta: { 'openai/title': featureTitle(selected) }
      });
    }
    var structured = {
      note: 'The Mapbox tileset explorer the user has open next to this chat. "This tileset", "these tiles" or "this layer" means what it shows.' +
        (webMcpTools
          ? ' The explorer registers its own app tools (WebMCP): load_tileset to show another tileset in it, and read_tileset_view to read the features in view. Call those instead of tileset_explorer_tool, which would open another explorer.'
          : ''),
      tileset: {
        tileset_id: tileset.tileset_id, name: tileset.name, type: tileset.type,
        minzoom: tileset.minzoom, maxzoom: tileset.maxzoom,
        layers: tileset.layers.map(function(layer) { return layer.id; }),
        hiddenLayers: tileset.layers.filter(function(layer) { return hidden[layer.id]; }).map(function(layer) { return layer.id; })
      }
    };
    if (map && styleReady) structured.view = view();
    return { content: content, structuredContent: structured };
  }

  function shareContext() {
    if (!canUpdateModelContext || !tileset) return;
    var staysOpen = displayMode !== 'inline';
    if (!staysOpen && !lastShared) return;
    var context = staysOpen ? modelContext() : { content: [] };
    var key = JSON.stringify(context);
    if (key === lastShared) return;
    lastShared = key;
    sharePending = true;
    request('ui/update-model-context', context, 10000).then(function(result) {
      sharePending = false;
      var meta = result && result._meta && result._meta['openai/modelContext'];
      ownUpdateId = meta ? meta.updateId : null;
    }, function() { sharePending = false; lastShared = ''; });
  }

  function scheduleShareContext() {
    if (shareTimer) clearTimeout(shareTimer);
    shareTimer = setTimeout(shareContext, 400);
  }

  // Anything but our own last update without the feature in it means the user
  // removed the item.
  function onModelContextChanged(state) {
    if (sharePending) return;
    if (state && state.updateId === ownUpdateId) return;
    if (state && Array.isArray(state.content) && state.content.length > 0) return;
    dismissedKey = featureKey(selected);
    lastShared = '';
  }

  // --- WebMCP ----------------------------------------------------------------
  function readView() {
    if (!tileset) throw new Error('No tileset is loaded yet.');
    if (!map || !styleReady) throw new Error('The map is not ready yet.');
    var ids = layerIds.filter(function(id) { return id !== 'tx-raster' && map.getLayer(id); });
    var byLayer = {};
    var seen = {};
    (ids.length ? map.queryRenderedFeatures({ layers: ids }) : []).forEach(function(f) {
      // A polygon is drawn by a fill and a line layer.
      var key = f.sourceLayer + '#' + (f.id !== undefined ? f.id : JSON.stringify(f.properties));
      if (seen[key]) return;
      seen[key] = true;
      var entry = byLayer[f.sourceLayer] || (byLayer[f.sourceLayer] = { count: 0, samples: [] });
      entry.count += 1;
      if (entry.samples.length < 3) {
        entry.samples.push({ geometry: f.geometry && f.geometry.type, properties: clippedProperties(f.properties || {}) });
      }
    });
    return JSON.stringify({
      tileset_id: tileset.tileset_id,
      type: tileset.type,
      view: view(),
      layers: tileset.layers.map(function(layer) {
        var entry = byLayer[layer.id] || { count: 0, samples: [] };
        return { id: layer.id, visible: !hidden[layer.id], featuresInView: entry.count, samples: entry.samples };
      }),
      selectedFeature: selected
    });
  }

  var TOOLS = [
    {
      name: 'load_tileset',
      description: 'Show another Mapbox tileset in the open tileset explorer. Takes the same tileset_id as tileset_explorer_tool (username.id, several vector tilesets joined with commas) and returns its source layers and fields. Use this instead of tileset_explorer_tool when an explorer is already open.',
      inputSchema: {
        type: 'object',
        properties: { tileset_id: { type: 'string', description: 'For example mapbox.mapbox-terrain-v2.' } },
        required: ['tileset_id'],
        additionalProperties: false
      },
      execute: function(input) {
        var id = input && typeof input.tileset_id === 'string' ? input.tileset_id.trim() : '';
        if (!id) throw new Error('tileset_id is required.');
        return loadTileset(id);
      }
    },
    {
      name: 'read_tileset_view',
      description: 'Read the open tileset explorer: the tileset, the map view (center, zoom, bounds), how many features of each source layer are drawn in view with up to three sample features each, and the feature the user selected.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: readView
    }
  ];
  if (document.modelContext && typeof document.modelContext.registerTool === 'function') {
    TOOLS.forEach(function(tool) {
      try { document.modelContext.registerTool(tool); webMcpTools = true; } catch (_) { /* already registered */ }
    });
  }
})();
</script>
</body>
</html>`;
}
