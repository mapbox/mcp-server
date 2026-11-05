// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * HTML for the Mapbox home sidebar app (`mapbox_home_tool`). Renders
 * the tool's structuredContent: styles, tilesets and public tokens. All
 * account data goes in through textContent, never innerHTML.
 */
export function renderHomeAppHtml(params: {
  publicToken: string;
  apiEndpoint?: string;
}): string {
  const apiEndpoint = params.apiEndpoint ?? 'https://api.mapbox.com/';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mapbox</title>
<style>
  :root {
    --bg: #ffffff; --surface: #f7f7f8; --border: #e5e5e7; --text: #0d0d0d;
    --muted: #6b6b70; --accent: #4264fb; --accent-soft: rgba(66,100,251,0.1);
    --error-bg: #fdecec; --error-text: #b42318;
  }
  :root[data-theme="dark"] {
    --bg: #212121; --surface: #2a2a2a; --border: #3a3a3a; --text: #ececec;
    --muted: #a0a0a5; --accent: #7b96ff; --accent-soft: rgba(123,150,255,0.15);
    --error-bg: #3a1f1f; --error-text: #ff9b91;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #212121; --surface: #2a2a2a; --border: #3a3a3a; --text: #ececec;
      --muted: #a0a0a5; --accent: #7b96ff; --accent-soft: rgba(123,150,255,0.15);
      --error-bg: #3a1f1f; --error-text: #ff9b91;
    }
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg); color: var(--text);
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { font-size: 20px; font-weight: 600; }
  #account { color: var(--muted); font-size: 13px; margin-top: 2px; }
  button, .link {
    font: inherit; font-size: 13px; color: var(--text); background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer;
  }
  button:hover, .link:hover { border-color: var(--accent); }
  button:disabled { opacity: 0.6; cursor: default; }
  .toolbar { display: flex; gap: 12px; align-items: center; margin: 20px 0 16px; flex-wrap: wrap; }
  .tabs { display: flex; gap: 4px; background: var(--surface); border-radius: 10px; padding: 3px; }
  .tab { border: none; background: transparent; padding: 6px 14px; border-radius: 8px; }
  .tab[aria-selected="true"] { background: var(--bg); box-shadow: 0 1px 2px rgba(0,0,0,0.12); font-weight: 600; }
  .count { color: var(--muted); font-weight: 400; margin-left: 4px; }
  #filter {
    flex: 1; min-width: 160px; font: inherit; color: var(--text); background: var(--bg);
    border: 1px solid var(--border); border-radius: 8px; padding: 7px 12px; outline: none;
  }
  #filter:focus { border-color: var(--accent); }
  .notice { color: var(--muted); font-size: 13px; margin-bottom: 12px; }
  .error { background: var(--error-bg); color: var(--error-text); border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  .card { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg); display: flex; flex-direction: column; }
  .thumb { aspect-ratio: 16 / 9; background: var(--surface); display: block; width: 100%; object-fit: cover; }
  .card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { color: var(--muted); font-size: 12px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; }
  a { color: var(--accent); }
  .title-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pill { font-size: 11px; padding: 1px 7px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); color: var(--muted); }
  .pill.accent { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
  .actions { display: flex; gap: 6px; margin-top: auto; padding-top: 8px; flex-wrap: wrap; }
  .rows { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .row { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-top: 1px solid var(--border); }
  .row:first-child { border-top: none; }
  .row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .empty { color: var(--muted); padding: 32px 0; text-align: center; }
  @media (max-width: 520px) { .row { flex-direction: column; align-items: stretch; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>Mapbox</h1>
      <div id="account"></div>
    </div>
    <button id="refresh" type="button">Refresh</button>
  </header>
  <div class="toolbar">
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="styles" aria-selected="true">Styles<span class="count"></span></button>
      <button class="tab" role="tab" data-tab="tilesets" aria-selected="false">Tilesets<span class="count"></span></button>
      <button class="tab" role="tab" data-tab="tokens" aria-selected="false">Tokens<span class="count"></span></button>
    </div>
    <input id="filter" type="search" placeholder="Filter by name or ID" aria-label="Filter" autocomplete="off">
  </div>
  <main id="content"><div class="empty">Loading…</div></main>
</div>

<script>
(function() {
  var TOKEN = ${JSON.stringify(params.publicToken)};
  var API_ENDPOINT = ${JSON.stringify(apiEndpoint)};
  var TOOL_NAME = 'mapbox_home_tool';

  var data = null;
  var activeTab = 'styles';
  var contentEl = document.getElementById('content');
  var accountEl = document.getElementById('account');
  var filterEl = document.getElementById('filter');
  var refreshEl = document.getElementById('refresh');
  var tabEls = Array.prototype.slice.call(document.querySelectorAll('.tab'));

  // --- MCP Apps postMessage protocol ---------------------------------------
  var messageId = 0;
  var pending = new Map();
  function request(method, params) {
    var id = ++messageId;
    window.parent.postMessage({ jsonrpc: '2.0', id: id, method: method, params: params || {} }, '*');
    return new Promise(function(resolve, reject) { pending.set(id, { resolve: resolve, reject: reject }); });
  }
  function notify(method, params) {
    window.parent.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
  }

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.id !== undefined && pending.has(msg.id)) {
      var p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      return;
    }
    if (msg.method === 'ui/notifications/tool-result' && msg.params) {
      setData(msg.params.structuredContent);
    }
    if (msg.method === 'ui/notifications/host-context-changed' && msg.params) {
      applyTheme(msg.params.theme);
    }
  });

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Mapbox', version: '1.0.0' }
  }).then(function(result) {
    applyTheme(result && result.hostContext && result.hostContext.theme);
  }, function() {}).then(function() { notify('ui/notifications/initialized', {}); });

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  }

  function openLink(url) {
    request('ui/open-link', { url: url }).catch(function() { window.open(url, '_blank', 'noopener'); });
  }

  refreshEl.addEventListener('click', function() {
    refreshEl.disabled = true;
    refreshEl.textContent = 'Refreshing…';
    request('tools/call', { name: TOOL_NAME, arguments: {} }).then(function(result) {
      if (result && result.structuredContent) setData(result.structuredContent);
      else showMessage('Refresh failed.');
    }, function(err) {
      showMessage('Refresh failed: ' + (err && err.message ? err.message : err));
    }).then(function() {
      refreshEl.disabled = false;
      refreshEl.textContent = 'Refresh';
    });
  });

  tabEls.forEach(function(tab) {
    tab.addEventListener('click', function() {
      activeTab = tab.getAttribute('data-tab');
      tabEls.forEach(function(t) { t.setAttribute('aria-selected', String(t === tab)); });
      render();
    });
  });
  filterEl.addEventListener('input', render);

  // --- Rendering -------------------------------------------------------------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function showMessage(text) {
    contentEl.textContent = '';
    contentEl.appendChild(el('div', 'error', text));
  }

  function setData(sc) {
    if (!sc || sc.home !== true) return;
    data = sc;
    accountEl.textContent = sc.username ? 'Account: ' + sc.username : '';
    tabEls.forEach(function(tab) {
      var section = sc[tab.getAttribute('data-tab')];
      var count = tab.querySelector('.count');
      count.textContent = section && !section.error
        ? String(section.items.length) + (section.truncated ? '+' : '')
        : '';
    });
    render();
  }

  function formatDate(value) {
    if (!value) return '';
    var d = new Date(value);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatSize(bytes) {
    if (typeof bytes !== 'number') return '';
    var units = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return (i === 0 ? bytes : bytes.toFixed(1)) + ' ' + units[i];
  }

  function matches(query, fields) {
    if (!query) return true;
    return fields.some(function(f) { return f && String(f).toLowerCase().indexOf(query) !== -1; });
  }

  function linkButton(label, url) {
    var b = el('button', 'link', label);
    b.type = 'button';
    b.addEventListener('click', function() { openLink(url); });
    return b;
  }

  function thumbnailUrl(style) {
    var c = style.center || [0, 20];
    var zoom = typeof style.zoom === 'number' ? Math.max(0, Math.min(style.zoom, 16)) : 0.5;
    return API_ENDPOINT + 'styles/v1/' + encodeURIComponent(style.owner) + '/' + encodeURIComponent(style.id) +
      '/static/' + c[0] + ',' + c[1] + ',' + zoom + '/480x270@2x?attribution=false&logo=false&access_token=' +
      encodeURIComponent(TOKEN);
  }

  function renderStyles(items, query) {
    var grid = el('div', 'grid');
    items.filter(function(s) { return matches(query, [s.name, s.id]); }).forEach(function(s) {
      var card = el('div', 'card');
      if (TOKEN) {
        var img = el('img', 'thumb');
        img.loading = 'lazy';
        img.alt = '';
        img.src = thumbnailUrl(s);
        img.addEventListener('error', function() { img.style.visibility = 'hidden'; });
        card.appendChild(img);
      } else {
        card.appendChild(el('div', 'thumb'));
      }
      var body = el('div', 'card-body');
      body.appendChild(el('div', 'name', s.name));
      var meta = el('div', 'meta');
      if (s.visibility) meta.appendChild(el('span', 'pill' + (s.visibility === 'public' ? ' accent' : ''), s.visibility));
      if (s.modified) meta.appendChild(el('span', '', 'Updated ' + formatDate(s.modified)));
      body.appendChild(meta);
      body.appendChild(el('div', 'mono meta', 'mapbox://styles/' + s.owner + '/' + s.id));
      var actions = el('div', 'actions');
      actions.appendChild(linkButton('Open in Studio',
        'https://studio.mapbox.com/styles/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.id) + '/edit/'));
      body.appendChild(actions);
      card.appendChild(body);
      grid.appendChild(card);
    });
    return grid;
  }

  function renderTilesets(items, query) {
    var rows = el('div', 'rows');
    items.filter(function(t) { return matches(query, [t.name, t.id]); }).forEach(function(t) {
      var row = el('div', 'row');
      var main = el('div', 'row-main');
      main.appendChild(el('div', 'name', t.name));
      main.appendChild(el('div', 'mono meta', t.id));
      var meta = el('div', 'meta');
      if (t.type) meta.appendChild(el('span', 'pill', t.type));
      if (t.visibility) meta.appendChild(el('span', 'pill' + (t.visibility === 'public' ? ' accent' : ''), t.visibility));
      if (typeof t.filesize === 'number') meta.appendChild(el('span', '', formatSize(t.filesize)));
      if (t.modified) meta.appendChild(el('span', '', 'Updated ' + formatDate(t.modified)));
      main.appendChild(meta);
      row.appendChild(main);
      row.appendChild(linkButton('Open in Studio', 'https://studio.mapbox.com/tilesets/' + encodeURIComponent(t.id) + '/'));
      rows.appendChild(row);
    });
    return rows;
  }

  function copyButton(text) {
    var b = el('button', 'link', 'Copy');
    b.type = 'button';
    b.addEventListener('click', function() {
      var done = function(label) { b.textContent = label; setTimeout(function() { b.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() { done('Copied'); }, function() { done('Copy blocked'); });
      } else {
        done('Copy blocked');
      }
    });
    return b;
  }

  function renderTokens(items, query) {
    var rows = el('div', 'rows');
    items.filter(function(t) { return matches(query, [t.note, t.token]); }).forEach(function(t) {
      var row = el('div', 'row');
      var main = el('div', 'row-main');
      var title = el('div', 'title-row');
      title.appendChild(el('span', 'name', t.note || 'Unnamed token'));
      if (t.default) title.appendChild(el('span', 'pill accent', 'Default'));
      main.appendChild(title);
      main.appendChild(el('div', 'mono', t.token));
      main.appendChild(el('div', 'meta', t.allowedUrls.length > 0
        ? 'URL restrictions: ' + t.allowedUrls.join(', ')
        : 'No URL restrictions'));
      if (t.scopes.length > 0) main.appendChild(el('div', 'meta', 'Scopes: ' + t.scopes.join(', ')));
      row.appendChild(main);
      row.appendChild(copyButton(t.token));
      rows.appendChild(row);
    });
    return rows;
  }

  var RENDERERS = { styles: renderStyles, tilesets: renderTilesets, tokens: renderTokens };
  var NOUNS = { styles: 'styles', tilesets: 'tilesets', tokens: 'public tokens' };

  function render() {
    if (!data) return;
    var section = data[activeTab] || { items: [] };
    var query = filterEl.value.trim().toLowerCase();
    contentEl.textContent = '';
    if (section.error) contentEl.appendChild(el('div', 'error', section.error));
    if (activeTab === 'tokens') {
      var note = el('div', 'notice', 'Public (pk.) tokens only. Manage all tokens in the ');
      var a = el('a', '', 'Mapbox Console');
      a.href = '#';
      a.addEventListener('click', function(e) { e.preventDefault(); openLink('https://console.mapbox.com/account/access-tokens/'); });
      note.appendChild(a);
      note.appendChild(document.createTextNode('.'));
      contentEl.appendChild(note);
    }
    if (section.truncated) contentEl.appendChild(el('div', 'notice', 'Showing the first ' + section.items.length + ' ' + NOUNS[activeTab] + '.'));
    var list = RENDERERS[activeTab](section.items || [], query);
    if (list.children.length === 0) {
      if (!section.error) contentEl.appendChild(el('div', 'empty', query ? 'No matches.' : 'No ' + NOUNS[activeTab] + ' yet.'));
    } else {
      contentEl.appendChild(list);
    }
  }
})();
</script>
</body>
</html>`;
}
