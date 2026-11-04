// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * MCP App page for static_map_image_tool: shows the map image from the tool
 * result at full width, inline in the chat.
 *
 * Hosts show a plain image result as a small thumbnail, and a model can't put
 * that image in its own reply. This page gets the whole tool result from the
 * host (ui/notifications/tool-result) and draws the image item as a data:
 * URL, so it needs no token and makes no request. When the image went to a
 * temporary resource instead, it falls back to the public-token URL in the
 * result's text, and only for the Mapbox API origin.
 *
 * Kept free of backslashes: this script lives in a template literal.
 */
export function renderStaticMapViewerHtml(params: {
  apiEndpoint: string;
}): string {
  let apiOrigin = 'https://api.mapbox.com';
  try {
    apiOrigin = new URL(params.apiEndpoint).origin;
  } catch {
    // Keep the default; an invalid endpoint can't serve images anyway.
  }
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Static map</title>
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  #map { display: none; width: 100%; height: auto; border-radius: 8px; }
  #message {
    display: none; padding: 12px;
    font: 14px system-ui, -apple-system, sans-serif; color: #64748b;
  }
</style>
</head>
<body>
<img id="map" alt="Static map">
<div id="message"></div>
<script>
(function() {
  var API_ORIGIN = ${JSON.stringify(apiOrigin)};
  var MARKDOWN_IMAGE = '![Static map](';
  var IMAGE_TYPES = ['image/png', 'image/jpeg'];
  var img = document.getElementById('map');
  var messageEl = document.getElementById('message');

  var messageId = 0;
  var pending = {};
  function send(message) {
    try { window.parent.postMessage(message, '*'); } catch (_) {}
  }
  function request(method, params) {
    var id = ++messageId;
    send({ jsonrpc: '2.0', id: id, method: method, params: params || {} });
    return new Promise(function(resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
    });
  }
  function notify(method, params) {
    send({ jsonrpc: '2.0', method: method, params: params || {} });
  }
  function reportSize() {
    var height = img.style.display === 'block'
      ? img.offsetHeight
      : messageEl.offsetHeight;
    if (height > 0) notify('ui/notifications/size-changed', { height: height });
  }

  function showMessage(text) {
    img.style.display = 'none';
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    reportSize();
  }
  function showImage(src, alt) {
    messageEl.style.display = 'none';
    img.alt = alt || 'Static map';
    img.onload = reportSize;
    img.onerror = function() { showMessage("The map image couldn't be loaded."); };
    img.src = src;
    img.style.display = 'block';
  }

  // The tool's text starts "Static map image (WxH, style) ..." when the image
  // is attached; use that as the alt text.
  function altFrom(texts) {
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      if (t.indexOf('Static map image (') === 0) {
        return t.slice(0, t.indexOf(')') + 1);
      }
    }
    return 'Static map';
  }

  // The public-token URL from the text's ![Static map](...) line, only when
  // it points at the Mapbox API and carries a public token.
  function urlFrom(texts) {
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      var start = t.indexOf(MARKDOWN_IMAGE);
      if (start === -1) continue;
      var url = t.slice(start + MARKDOWN_IMAGE.length);
      var end = url.indexOf(')');
      if (end === -1) continue;
      url = url.slice(0, end);
      if (url.indexOf(API_ORIGIN + '/') === 0 &&
          url.indexOf('access_token=pk.') !== -1) {
        return url;
      }
    }
    return null;
  }

  function handleToolResult(result) {
    var content = (result && Array.isArray(result.content)) ? result.content : [];
    var texts = [];
    var image = null;
    for (var i = 0; i < content.length; i++) {
      var c = content[i];
      if (!c) continue;
      if (c.type === 'text' && typeof c.text === 'string') texts.push(c.text);
      if (c.type === 'image' && typeof c.data === 'string' &&
          IMAGE_TYPES.indexOf(c.mimeType) !== -1 && !image) {
        image = c;
      }
    }
    if (result && result.isError) {
      showMessage(texts.join(' ') || 'The static map could not be made.');
      return;
    }
    if (image) {
      showImage('data:' + image.mimeType + ';base64,' + image.data, altFrom(texts));
      return;
    }
    var url = urlFrom(texts);
    if (url) {
      showImage(url, 'Static map');
      return;
    }
    showMessage("The map image isn't available here.");
  }
  window.__handleToolResult = handleToolResult;

  window.addEventListener('message', function(event) {
    var message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.id !== undefined && pending[message.id]) {
      var handlers = pending[message.id];
      delete pending[message.id];
      if (message.error) handlers.reject(new Error(message.error.message));
      else handlers.resolve(message.result);
      return;
    }
    if (message.method === 'ui/notifications/tool-result' && message.params) {
      handleToolResult(message.params);
    }
  });
  window.addEventListener('resize', reportSize);

  function initialized() { notify('ui/notifications/initialized', {}); }
  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Mapbox Static Map', version: '1.0.0' }
  }).then(initialized, initialized);
})();
</script>
</body>
</html>`;
}
