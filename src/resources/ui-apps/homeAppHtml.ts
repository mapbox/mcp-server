// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { MAPBOX_GL_VERSION } from './mapAppHtml.js';

/**
 * The plugin's name in ChatGPT, mentioned at the start of every starter draft
 * so the new chat routes to this server's tools. ChatGPT doesn't tell the
 * server or the page this name, and ui/message can't insert a real composer
 * mention, so it's configured (`MAPBOX_CHATGPT_PLUGIN_NAME`) and sent as text.
 */
export const DEFAULT_CHATGPT_PLUGIN_NAME = 'Mapbox';

/**
 * Starter tasks on the home page. Each opens a new chat with an editable
 * draft, so the model and this server's tools do the work rather than the
 * page. Each ends with a colon so the user can type the places right after.
 */
export const HOME_STARTERS: ReadonlyArray<{
  title: string;
  description: string;
  prompt: string;
  icon: 'route' | 'place' | 'reach' | 'stops';
}> = [
  {
    title: 'Plan a route',
    icon: 'route',
    description: 'Directions and travel time, drawn on a map',
    prompt:
      'Plan a driving route between these two places and show it on a map: '
  },
  {
    title: 'Find places nearby',
    icon: 'place',
    description: 'Search for places around a location',
    prompt:
      'Find places near this address and show them on a map. What to look for and where: '
  },
  {
    title: 'How far can I go?',
    icon: 'reach',
    description: 'Areas reachable within a travel time',
    prompt:
      'Show the area I can reach within 15 minutes walking from this address on a map: '
  },
  {
    title: 'Plan a multi-stop trip',
    icon: 'stops',
    description: 'The best order to visit several places',
    prompt:
      'Find the best order to visit these places, starting with the first one: '
  }
];

/**
 * HTML for the Mapbox home sidebar app (`mapbox_home_tool`). A launchpad
 * into the chat (starter drafts, styles attached as context) with the
 * account's styles, tilesets and public tokens one level down. Pages:
 * `/`, `/styles`, `/styles/{owner}/{id}` (interactive preview), `/tilesets`
 * and `/tokens`, also reachable by deep link. GL JS loads only when a
 * preview opens.
 * All account data goes in through textContent; innerHTML only takes the
 * static cover icon.
 */
export function renderHomeAppHtml(params: {
  publicToken: string;
  apiEndpoint?: string;
  glVersion?: string;
  pluginName?: string;
}): string {
  const apiEndpoint = params.apiEndpoint ?? 'https://api.mapbox.com/';
  const glVersion = params.glVersion ?? MAPBOX_GL_VERSION;
  const mention = `@${params.pluginName || DEFAULT_CHATGPT_PLUGIN_NAME} `;
  // Safe inside <script>: no "</script>" can survive the escaping.
  const json = (value: unknown) =>
    JSON.stringify(value).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mapbox</title>
<style>
  /* Layout: one centered column. Greeting and account strip on top, task tiles,
     then three shelves: styles as picture cards, tilesets and tokens as ledgers.
     System font and colors per ChatGPT's app guidelines; Mapbox blue only on
     actions. Neutrals lean slightly blue so they sit with the accent. */
  :root {
    --bg: #ffffff; --surface: #f5f6f9; --surface-2: #eceef4; --line: #e2e5ec;
    --fg: #11141b; --muted: #5b6272; --faint: #8b91a0;
    --accent: #4264fb; --accent-soft: rgba(66, 100, 251, 0.1); --on-accent: #ffffff;
    --error: #c0362c; --shadow: 0 1px 2px rgba(17, 20, 27, 0.06), 0 4px 16px rgba(17, 20, 27, 0.08);
    --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --r-sm: 8px; --r-md: 12px;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #1c1e23; --surface: #25282f; --surface-2: #2d3139; --line: #343843;
      --fg: #eceef3; --muted: #a4aab7; --faint: #7c8291;
      --accent: #7b96ff; --accent-soft: rgba(123, 150, 255, 0.16); --on-accent: #0d1020;
      --error: #ff8f86; --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 6px 20px rgba(0, 0, 0, 0.35);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #1c1e23; --surface: #25282f; --surface-2: #2d3139; --line: #343843;
    --fg: #eceef3; --muted: #a4aab7; --faint: #7c8291;
    --accent: #7b96ff; --accent-soft: rgba(123, 150, 255, 0.16); --on-accent: #0d1020;
    --error: #ff8f86; --shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 6px 20px rgba(0, 0, 0, 0.35);
    color-scheme: dark;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--fg); font: 14px/1.5 var(--font); -webkit-font-smoothing: antialiased; }
  [hidden] { display: none !important; }
  /* Bottom room for ChatGPT's composer, which floats over fullscreen apps. */
  .wrap {
    max-width: 1000px; margin: 0 auto; padding-block: 32px 176px;
    padding-left: max(20px, env(safe-area-inset-left, 0px)); padding-right: max(20px, env(safe-area-inset-right, 0px));
    display: flex; flex-direction: column;
  }
  h1 { font-size: 24px; line-height: 1.25; font-weight: 650; letter-spacing: -0.01em; text-wrap: balance; }
  h2 { font-size: 15px; font-weight: 600; display: flex; align-items: baseline; gap: 8px; }
  .count { color: var(--faint); font-weight: 500; font-variant-numeric: tabular-nums; }
  .sub { color: var(--muted); font-size: 13px; }
  .mono { font-family: var(--mono); font-size: 12px; }

  /* Controls */
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; text-align: inherit; }
  button:disabled { opacity: 0.55; cursor: default; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
  .btn {
    font-size: 13px; font-weight: 500; padding: 6px 12px; border-radius: var(--r-sm);
    border: 1px solid var(--line); background: var(--bg); white-space: nowrap;
    transition: background-color 120ms, border-color 120ms;
  }
  .btn:hover:not(:disabled) { background: var(--surface); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
  .btn.primary:hover:not(:disabled) { background: var(--accent); filter: brightness(1.08); }
  .btn.tint { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
  .btn.tint:hover:not(:disabled) { background: var(--accent-soft); border-color: var(--accent); }
  .link { color: var(--accent); font-size: 13px; font-weight: 500; padding: 2px 0; white-space: nowrap; }
  .link:hover { text-decoration: underline; text-underline-offset: 3px; }
  .link.out::after { content: " \\2197"; }
  .link.more::after { content: " \\2192"; }
  .link.back::before { content: "\\2190  "; }

  /* Page structure */
  .page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
  .page-head .sub { margin-top: 4px; }
  section { margin-top: 36px; display: flex; flex-direction: column; gap: 12px; }
  .section-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .links { display: flex; gap: 16px; align-items: center; }

  /* Task tiles */
  .starters { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
  .starter {
    display: flex; flex-direction: column; gap: 4px; padding: 14px 16px 16px; border-radius: var(--r-md);
    background: var(--surface); border: 1px solid transparent; transition: background-color 120ms, border-color 120ms;
  }
  .starter:hover { background: var(--accent-soft); border-color: var(--accent); }
  .starter-icon { display: flex; color: var(--accent); margin-bottom: 8px; }
  .starter-icon svg { width: 22px; height: 22px; }
  .starter-title { font-weight: 600; }
  .starter-desc { color: var(--muted); font-size: 13px; }

  /* Account strip: one object, three counts */
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; }
  .stat { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; border-left: 1px solid var(--line); transition: background-color 120ms; }
  .stat:first-child { border-left: 0; }
  .stat:hover { background: var(--surface); }
  .stat-count { font-size: 22px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
  .stat-label { color: var(--muted); font-size: 13px; }
  .stat-label::after { content: " \\2192"; color: var(--faint); }

  /* Style cards */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
  .card { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; background: var(--bg); transition: border-color 120ms, box-shadow 120ms; }
  .card:hover { border-color: var(--surface-2); box-shadow: var(--shadow); }
  .thumb {
    position: relative; aspect-ratio: 16 / 9; max-width: 100%; width: 100%; background: var(--surface); color: var(--faint);
    display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--line);
  }
  button.thumb { cursor: pointer; border-radius: 0; }
  .thumb svg { width: 32px; height: 32px; }
  .thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .thumb-hint {
    position: absolute; left: 10px; bottom: 10px; padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: 500;
    background: var(--bg); color: var(--fg); box-shadow: var(--shadow); opacity: 0; transition: opacity 120ms;
  }
  button.thumb:hover .thumb-hint, button.thumb:focus-visible .thumb-hint { opacity: 1; }
  @media (hover: none) { .thumb-hint { opacity: 1; } }
  .card-body { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px 14px; flex: 1; min-width: 0; }
  .name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: auto; padding-top: 10px; }
  .card .actions .icon-btn { margin-left: auto; }
  .icon-btn {
    flex: none; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;
    border: 1px solid var(--line); border-radius: var(--r-sm); color: var(--muted); transition: background-color 120ms, color 120ms;
  }
  .icon-btn:hover { background: var(--surface); color: var(--fg); }
  .icon-btn svg { width: 16px; height: 16px; }

  /* Visibility and type marks: shape and text, not color alone */
  .vis { display: inline-flex; align-items: center; gap: 4px; }
  .vis::before { content: ""; width: 12px; height: 12px; background: currentColor; -webkit-mask: var(--icon) center / contain no-repeat; mask: var(--icon) center / contain no-repeat; }
  .vis.private { --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='11' width='14' height='10' rx='2'/%3E%3Cpath d='M8 11V8a4 4 0 0 1 8 0v3'/%3E%3C/svg%3E"); }
  .vis.public { --icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round'%3E%3Ccircle cx='12' cy='12' r='9'/%3E%3Cpath d='M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z'/%3E%3C/svg%3E"); }
  .chip { font-size: 11px; font-weight: 500; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--muted); }
  .chip.accent { background: var(--accent-soft); color: var(--accent); }

  /* Ledgers: tilesets and tokens */
  .rows { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--r-md); overflow: hidden; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 6px 16px; padding: 12px 16px; border-top: 1px solid var(--line); transition: background-color 120ms; }
  .row:first-child { border-top: 0; }
  .row:hover { background: var(--surface); }
  .row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .row-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .row-title .name { min-width: 0; }
  .row .mono { color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-actions { display: flex; align-items: center; gap: 14px; }
  .row .meta .mono { display: inline-block; max-width: 100%; vertical-align: bottom; }

  /* List pages */
  .toolbar { display: flex; gap: 12px; align-items: center; margin: 20px 0 16px; }
  #filter {
    flex: 1; min-width: 0; font: inherit; color: var(--fg); background: var(--surface);
    border: 1px solid transparent; border-radius: var(--r-sm); padding: 8px 12px; outline: none;
  }
  #filter::placeholder { color: var(--faint); }
  #filter:focus { border-color: var(--accent); background: var(--bg); }
  #list-content { display: flex; flex-direction: column; gap: 12px; }
  .notice { color: var(--muted); font-size: 13px; }
  .notice .link { font-size: inherit; }
  .error { color: var(--error); font-size: 13px; }
  .empty { color: var(--muted); padding: 28px 16px; text-align: center; border: 1px dashed var(--line); border-radius: var(--r-md); }
  .skeleton { height: 120px; border-radius: var(--r-md); background: var(--surface); }
  @media (prefers-reduced-motion: no-preference) {
    .skeleton { animation: pulse 1.4s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: 0.55; } }
  }

  /* Style preview: the map fills the app; the composer floats over the
     bottom, so the panel and every map control sit at the top. */
  #detail-view { position: fixed; inset: 0; z-index: 1; }
  #detail-map { position: absolute; inset: 0; background: var(--surface); }
  .detail-panel {
    position: absolute; top: calc(12px + var(--inset-top, 0px)); left: calc(12px + var(--inset-left, 0px));
    width: min(360px, calc(100% - 24px - var(--inset-left, 0px) - var(--inset-right, 0px)));
    display: flex; flex-direction: column; gap: 6px; padding: 14px 16px 16px;
    background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--shadow);
  }
  .detail-panel h1 { font-size: 17px; margin-top: 4px; }
  .detail-panel #detail-back { align-self: flex-start; }
  .detail-panel .mono { color: var(--faint); overflow-wrap: anywhere; }
  .detail-panel .actions { padding-top: 8px; }
  #detail-view .mapboxgl-ctrl-top-right { top: var(--inset-top, 0px); right: var(--inset-right, 0px); }

  #toast {
    position: fixed; left: 50%; bottom: 128px; transform: translateX(-50%); z-index: 2; max-width: calc(100% - 32px);
    background: var(--fg); color: var(--bg); border-radius: var(--r-sm); padding: 8px 14px; font-size: 13px; box-shadow: var(--shadow);
  }
  @media (max-width: 560px) {
    h1 { font-size: 21px; }
    .stats { grid-template-columns: 1fr; }
    .stat { border-left: 0; border-top: 1px solid var(--line); }
    .stat:first-child { border-top: 0; }
    .row { grid-template-columns: minmax(0, 1fr); }
  }
</style>
</head>
<body>
<div class="wrap">
  <div id="home-view">
    <header class="page-head">
      <div>
        <h1 id="greeting">Mapbox</h1>
        <div class="sub">Maps, places and routes in ChatGPT</div>
      </div>
    </header>
    <section aria-labelledby="starters-title">
      <div class="section-head">
        <h2 id="starters-title">Start with ChatGPT</h2>
        <span class="sub">Each opens a new chat</span>
      </div>
      <div class="starters" id="starters"></div>
    </section>
    <section aria-labelledby="account-title">
      <div class="section-head">
        <h2 id="account-title">Your account</h2>
        <button class="link out" type="button" id="open-studio">Mapbox Studio</button>
      </div>
      <div class="stats" id="summary"></div>
    </section>
    <section aria-labelledby="styles-title">
      <div class="section-head">
        <h2 id="styles-title">Your styles<span class="count" id="count-styles"></span></h2>
        <div class="links">
          <button class="link out" type="button" id="studio-styles"></button>
          <button class="link more" type="button" id="see-all-styles">See all</button>
        </div>
      </div>
      <div id="styles-preview"><div class="skeleton"></div></div>
    </section>
    <section aria-labelledby="tilesets-title">
      <div class="section-head">
        <h2 id="tilesets-title">Your tilesets<span class="count" id="count-tilesets"></span></h2>
        <div class="links">
          <button class="link out" type="button" id="studio-tilesets"></button>
          <button class="link more" type="button" id="see-all-tilesets">See all</button>
        </div>
      </div>
      <div id="tilesets-preview"><div class="skeleton"></div></div>
    </section>
    <section aria-labelledby="tokens-title">
      <div class="section-head">
        <h2 id="tokens-title">Your public tokens<span class="count" id="count-tokens"></span></h2>
        <div class="links">
          <button class="link out" type="button" id="studio-tokens"></button>
          <button class="link more" type="button" id="see-all-tokens">See all</button>
        </div>
      </div>
      <div id="tokens-preview"><div class="skeleton"></div></div>
    </section>
  </div>

  <div id="list-view" hidden>
    <header class="page-head">
      <div>
        <button class="link back" type="button" id="back">Home</button>
        <h1 id="list-title"></h1>
      </div>
      <div class="links">
        <button class="btn" type="button" id="refresh">Refresh</button>
        <button class="btn" type="button" id="list-studio"></button>
      </div>
    </header>
    <div class="toolbar">
      <input id="filter" type="search" placeholder="Filter by name or ID" aria-label="Filter" autocomplete="off">
    </div>
    <main id="list-content"></main>
  </div>

  <div id="detail-view" hidden>
    <div id="detail-map"></div>
    <div class="detail-panel">
      <button class="link back" type="button" id="detail-back">Styles</button>
      <h1 id="detail-name"></h1>
      <div class="meta" id="detail-meta"></div>
      <div class="mono" id="detail-url"></div>
      <div id="detail-error" class="error" hidden></div>
      <div class="actions" id="detail-actions"></div>
    </div>
  </div>
</div>
<div id="toast" role="status" hidden></div>

<script>
(function() {
  var TOKEN = ${JSON.stringify(params.publicToken)};
  var API_ENDPOINT = ${JSON.stringify(apiEndpoint)};
  var TOOL_NAME = 'mapbox_home_tool';
  var STARTERS = ${json(HOME_STARTERS)};
  var MENTION = ${json(mention)};
  // Tokens are managed in the Console, the rest in Studio.
  var PAGES = {
    styles: { title: 'Styles', noun: 'styles', site: 'Open in Studio', url: 'https://studio.mapbox.com/' },
    tilesets: { title: 'Tilesets', noun: 'tilesets', site: 'Open in Studio', url: 'https://studio.mapbox.com/tilesets/' },
    tokens: { title: 'Public tokens', noun: 'public tokens', site: 'Open in Console', url: 'https://console.mapbox.com/account/access-tokens/' }
  };
  var SECTIONS = ['styles', 'tilesets', 'tokens'];
  var EXTERNAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>';
  // Outlined, single-color icons for the task tiles.
  var ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONS = {
    route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
    place: '<path d="M12 21s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.3"/>',
    reach: '<circle cx="12" cy="12" r="1.6"/><path d="M12 7c3.3 0 5.4 2.1 5.2 5.1-.2 2.9-2.3 5-5.4 4.9-3-.1-5-2.3-4.8-5.2C7.2 8.9 9 7 12 7Z"/><path d="M12 3c5.4 0 9.2 3.7 9 9-.2 5.1-4 9-9.2 9C6.6 21 2.9 17.2 3 12 3.1 6.8 6.8 3 12 3Z"/>',
    stops: '<circle cx="5" cy="18" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19" cy="16" r="2"/><path d="m6.1 16.2 4.8-8.4M13.2 7.7l4.6 6.6"/>'
  };
  var PREVIEW_COUNT = 4;
  // Default cover, shown until a thumbnail loads or when there isn't one.
  var COVER_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/></svg>';

  var GL_VERSION = ${JSON.stringify(glVersion)};

  var data = null;
  var page = '';
  var detail = null; // { owner, id } on a style preview
  var map = null;
  var mapStyleUrl = '';
  var $ = function(id) { return document.getElementById(id); };
  var homeView = $('home-view');
  var listView = $('list-view');
  var detailView = $('detail-view');
  var filterEl = $('filter');
  var refreshEl = $('refresh');
  var toastEl = $('toast');
  var toastTimer = null;

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
      applyHostContext(msg.params);
    }
  });

  request('ui/initialize', {
    protocolVersion: '2026-01-26',
    appCapabilities: {},
    appInfo: { name: 'Mapbox', version: '1.0.0' }
  }).then(function(result) {
    applyHostContext((result && result.hostContext) || {});
  }, function() {}).then(function() { notify('ui/notifications/initialized', {}); });

  function applyHostContext(ctx) {
    if (ctx.theme === 'light' || ctx.theme === 'dark') document.documentElement.setAttribute('data-theme', ctx.theme);
    var insets = ctx.safeAreaInsets;
    if (insets) {
      ['top', 'right', 'bottom', 'left'].forEach(function(side) {
        if (typeof insets[side] === 'number') document.documentElement.style.setProperty('--inset-' + side, insets[side] + 'px');
      });
    }
    var link = ctx['openai/deepLink'];
    if (link && typeof link.url === 'string') navigate(link.url);
  }

  function openLink(url) {
    request('ui/open-link', { url: url }).catch(function() { window.open(url, '_blank', 'noopener'); });
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function() { toastEl.hidden = true; }, 2500);
  }

  // A new chat with an editable draft; nothing is sent until the user does.
  // The mention is its own part: once ChatGPT turns it into a chip, text in
  // the same part after it is dropped.
  function startChat(prompt) {
    request('ui/message', {
      role: 'user',
      content: [{ type: 'text', text: MENTION }, { type: 'text', text: prompt }],
      _meta: { 'openai/message': { target: 'new', send: false } }
    }).catch(function() { toast("Couldn't open a new chat."); });
  }

  // Attaches an item to the composer. Each call replaces the previous one.
  // A new chat with the item as a titled, removable chip after the mention.
  function attach(title, text, thumbnail) {
    var meta = { 'openai/title': title };
    if (thumbnail) meta['openai/thumbnail'] = { src: thumbnail };
    request('ui/message', {
      role: 'user',
      content: [{ type: 'text', text: MENTION }, { type: 'text', text: text, _meta: meta }],
      _meta: { 'openai/message': { target: 'new', send: false } }
    }).catch(function() { toast("Couldn't open a new chat."); });
  }

  // --- Navigation --------------------------------------------------------------
  // Deep link paths: "/", "/styles", "/styles/{owner}/{id}", "/tilesets",
  // "/tokens". Anything unknown opens the home page.
  function navigate(path) {
    var parts = String(path).split(/[?#]/)[0].replace(/^\\/+/, '').split('/').map(function(p) {
      try { return decodeURIComponent(p); } catch (e) { return ''; }
    });
    var name = parts[0];
    page = Object.prototype.hasOwnProperty.call(PAGES, name) ? name : '';
    detail = page === 'styles' && parts[1] && parts[2] ? { owner: parts[1], id: parts[2] } : null;
    homeView.hidden = page !== '';
    listView.hidden = page === '' || detail !== null;
    detailView.hidden = detail === null;
    if (page && !detail) {
      $('list-title').textContent = PAGES[page].title;
      $('list-studio').textContent = PAGES[page].site;
      filterEl.value = '';
    }
    render();
  }

  function previewPath(s) {
    return '/styles/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.id);
  }

  $('back').addEventListener('click', function() { navigate('/'); });
  $('detail-back').addEventListener('click', function() { navigate('/styles'); });
  SECTIONS.forEach(function(key) {
    $('see-all-' + key).addEventListener('click', function() { navigate('/' + key); });
    var site = $('studio-' + key);
    site.textContent = PAGES[key].site;
    site.addEventListener('click', function() { openLink(PAGES[key].url); });
  });
  $('list-studio').addEventListener('click', function() { if (page) openLink(PAGES[page].url); });
  $('open-studio').addEventListener('click', function() { openLink('https://studio.mapbox.com/'); });
  filterEl.addEventListener('input', render);

  refreshEl.addEventListener('click', function() {
    refreshEl.disabled = true;
    refreshEl.textContent = 'Refreshing…';
    request('tools/call', { name: TOOL_NAME, arguments: {} }).then(function(result) {
      if (result && result.structuredContent) setData(result.structuredContent);
      else toast('Refresh failed.');
    }, function(err) {
      toast('Refresh failed: ' + (err && err.message ? err.message : err));
    }).then(function() {
      refreshEl.disabled = false;
      refreshEl.textContent = 'Refresh';
    });
  });

  // --- Rendering -------------------------------------------------------------
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function button(label, className, onClick) {
    var b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function setData(sc) {
    if (!sc || sc.home !== true) return;
    data = sc;
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

  function countLabel(section) {
    return String(section.items.length) + (section.truncated ? '+' : '');
  }

  function thumbnailUrl(style) {
    if (!TOKEN) return '';
    var c = style.center || [0, 20];
    var zoom = typeof style.zoom === 'number' ? Math.max(0, Math.min(style.zoom, 16)) : 0.5;
    return API_ENDPOINT + 'styles/v1/' + encodeURIComponent(style.owner) + '/' + encodeURIComponent(style.id) +
      '/static/' + c[0] + ',' + c[1] + ',' + zoom + '/480x270@2x?attribution=false&logo=false&access_token=' +
      encodeURIComponent(TOKEN);
  }

  // view: the preview map's current camera, when one is open.
  function attachStyle(s, view) {
    var lines = ['Mapbox style "' + s.name + '"', 'URL: mapbox://styles/' + s.owner + '/' + s.id];
    if (s.visibility) lines.push('Visibility: ' + s.visibility);
    if (s.center) lines.push('Default center: ' + s.center[0] + ', ' + s.center[1] + (typeof s.zoom === 'number' ? ' at zoom ' + s.zoom : ''));
    if (view) lines.push('Currently viewing: ' + view.lng.toFixed(5) + ', ' + view.lat.toFixed(5) + ' at zoom ' + view.zoom.toFixed(2));
    if (s.modified) lines.push('Last modified: ' + s.modified);
    attach(s.name, lines.join('\\n'), thumbnailUrl(s));
  }

  function attachTileset(t) {
    var lines = ['Mapbox tileset "' + t.name + '"', 'ID: ' + t.id];
    if (t.type) lines.push('Type: ' + t.type);
    if (t.visibility) lines.push('Visibility: ' + t.visibility);
    if (t.modified) lines.push('Last modified: ' + t.modified);
    attach(t.name, lines.join('\\n'));
  }

  function styleCard(s) {
    var card = el('div', 'card');
    var thumb = button('', 'thumb', function() { navigate(previewPath(s)); });
    thumb.setAttribute('aria-label', 'Preview ' + s.name);
    thumb.innerHTML = COVER_SVG;
    var src = thumbnailUrl(s);
    if (src) {
      var img = el('img');
      img.loading = 'lazy';
      img.alt = 'Preview of ' + s.name;
      img.src = src;
      img.addEventListener('error', function() { thumb.removeChild(img); });
      thumb.appendChild(img);
    }
    thumb.appendChild(el('span', 'thumb-hint', 'Preview'));
    card.appendChild(thumb);
    var body = el('div', 'card-body');
    var name = el('div', 'name', s.name);
    name.title = s.name;
    body.appendChild(name);
    body.appendChild(metaLine(s));
    var actions = el('div', 'actions');
    actions.appendChild(button('Ask about it', 'btn tint', function() { attachStyle(s); }));
    actions.appendChild(studioButton(studioUrl(s)));
    body.appendChild(actions);
    card.appendChild(body);
    return card;
  }

  // Icon-only, so it sits on the same row as the main action.
  function studioButton(url) {
    var b = button('', 'icon-btn', function() { openLink(url); });
    b.setAttribute('aria-label', 'Open in Studio');
    b.title = 'Open in Studio';
    b.innerHTML = EXTERNAL_SVG;
    return b;
  }

  function visibilityMark(value) {
    if (value !== 'public' && value !== 'private') return null;
    return el('span', 'vis ' + value, value === 'public' ? 'Public' : 'Private');
  }

  // Fills into, or a new meta row.
  function metaLine(item, extra, into) {
    var meta = into || el('div', 'meta');
    var vis = visibilityMark(item.visibility);
    if (vis) meta.appendChild(vis);
    (extra || []).forEach(function(node) { if (node) meta.appendChild(node); });
    if (item.modified) meta.appendChild(el('span', '', 'Updated ' + formatDate(item.modified)));
    return meta;
  }

  function byModifiedDesc(a, b) {
    return String(b.modified || '').localeCompare(String(a.modified || ''));
  }

  // --- Home page ---------------------------------------------------------------
  function renderStarters() {
    var box = $('starters');
    if (box.children.length) return;
    STARTERS.forEach(function(s) {
      var b = button('', 'starter', function() { startChat(s.prompt); });
      var icon = el('span', 'starter-icon');
      icon.innerHTML = ICON_OPEN + (ICONS[s.icon] || '') + '</svg>';
      b.appendChild(icon);
      b.appendChild(el('span', 'starter-title', s.title));
      b.appendChild(el('span', 'starter-desc', s.description));
      box.appendChild(b);
    });
  }

  function renderHome() {
    renderStarters();
    if (!data) return;
    $('greeting').textContent = data.username ? 'Hi, ' + data.username : 'Mapbox';

    SECTIONS.forEach(function(key) {
      var section = data[key];
      var preview = $(key + '-preview');
      preview.textContent = '';
      $('see-all-' + key).hidden = section.items.length === 0;
      $('count-' + key).textContent = section.error ? '' : countLabel(section);
      if (section.error) preview.appendChild(el('div', 'error', section.error));
      var list = RENDERERS[key](PREVIEW_ORDER[key](section.items).slice(0, PREVIEW_COUNT), '');
      if (list.children.length) preview.appendChild(list);
      else if (!section.error) preview.appendChild(el('div', 'empty', 'No ' + PAGES[key].noun + ' yet.'));
    });

    var summary = $('summary');
    summary.textContent = '';
    SECTIONS.forEach(function(key) {
      var section = data[key];
      var b = button('', 'stat', function() { navigate('/' + key); });
      b.appendChild(el('span', 'stat-count', section.error ? '–' : countLabel(section)));
      b.appendChild(el('span', 'stat-label', PAGES[key].title));
      summary.appendChild(b);
    });
  }

  // --- List pages --------------------------------------------------------------
  function renderStyleList(items, query) {
    var grid = el('div', 'grid');
    items.filter(function(s) { return matches(query, [s.name, s.id]); }).forEach(function(s) { grid.appendChild(styleCard(s)); });
    return grid;
  }

  function renderTilesetList(items, query) {
    var rows = el('div', 'rows');
    items.filter(function(t) { return matches(query, [t.name, t.id]); }).forEach(function(t) {
      var row = el('div', 'row');
      var main = el('div', 'row-main');
      var title = el('div', 'row-title');
      var name = el('span', 'name', t.name);
      name.title = t.name;
      title.appendChild(name);
      if (t.type) title.appendChild(el('span', 'chip', t.type));
      main.appendChild(title);
      var meta = el('div', 'meta');
      meta.appendChild(el('span', 'mono', t.id));
      main.appendChild(metaLine(t, [typeof t.filesize === 'number' ? el('span', '', formatSize(t.filesize)) : null], meta));
      row.appendChild(main);
      var actions = el('div', 'row-actions');
      actions.appendChild(button('Ask about it', 'link', function() { attachTileset(t); }));
      actions.appendChild(studioButton('https://studio.mapbox.com/tilesets/' + encodeURIComponent(t.id) + '/'));
      row.appendChild(actions);
      rows.appendChild(row);
    });
    return rows;
  }

  function copyButton(text, label) {
    label = label || 'Copy';
    var b = button(label, 'btn', function() {
      var done = function(state) { b.textContent = state; setTimeout(function() { b.textContent = label; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() { done('Copied'); }, function() { done('Copy blocked'); });
      } else {
        done('Copy blocked');
      }
    });
    return b;
  }

  function renderTokenList(items, query) {
    var rows = el('div', 'rows');
    items.filter(function(t) { return matches(query, [t.note, t.token]); }).forEach(function(t) {
      var row = el('div', 'row');
      var main = el('div', 'row-main');
      var title = el('div', 'row-title');
      title.appendChild(el('span', 'name', t.note || 'Unnamed token'));
      if (t.default) title.appendChild(el('span', 'chip accent', 'Default'));
      main.appendChild(title);
      var token = el('div', 'mono', t.token);
      token.title = t.token;
      main.appendChild(token);
      var meta = el('div', 'meta');
      var urls = el('span', '', t.allowedUrls.length > 0
        ? 'Restricted to ' + t.allowedUrls.length + (t.allowedUrls.length === 1 ? ' URL' : ' URLs')
        : 'Any URL');
      if (t.allowedUrls.length) urls.title = t.allowedUrls.join('\\n');
      meta.appendChild(urls);
      if (t.scopes.length > 0) {
        var scopes = el('span', '', t.scopes.length + (t.scopes.length === 1 ? ' scope' : ' scopes'));
        scopes.title = t.scopes.join('\\n');
        meta.appendChild(scopes);
      }
      main.appendChild(meta);
      row.appendChild(main);
      var actions = el('div', 'row-actions');
      actions.appendChild(copyButton(t.token));
      row.appendChild(actions);
      rows.appendChild(row);
    });
    return rows;
  }

  var RENDERERS = { styles: renderStyleList, tilesets: renderTilesetList, tokens: renderTokenList };
  // Home previews: most recently modified first; the default token leads.
  var PREVIEW_ORDER = {
    styles: function(items) { return items.slice().sort(byModifiedDesc); },
    tilesets: function(items) { return items.slice().sort(byModifiedDesc); },
    tokens: function(items) {
      return items.slice().sort(function(a, b) { return (b.default ? 1 : 0) - (a.default ? 1 : 0) || byModifiedDesc(a, b); });
    }
  };

  function renderList() {
    var content = $('list-content');
    content.textContent = '';
    if (!data) { content.appendChild(el('div', 'skeleton')); return; }
    var section = data[page] || { items: [] };
    var query = filterEl.value.trim().toLowerCase();
    if (section.error) content.appendChild(el('div', 'error', section.error));
    if (page === 'tokens') {
      var note = el('div', 'notice', 'Public (pk.) tokens only. Manage all tokens in the ');
      note.appendChild(button('Mapbox Console', 'link out', function() {
        openLink('https://console.mapbox.com/account/access-tokens/');
      }));
      note.appendChild(document.createTextNode('.'));
      content.appendChild(note);
    }
    if (section.truncated) content.appendChild(el('div', 'notice', 'Showing the first ' + section.items.length + ' ' + PAGES[page].noun + '.'));
    var list = RENDERERS[page](section.items || [], query);
    if (list.children.length === 0) {
      if (!section.error) content.appendChild(el('div', 'empty', query ? 'No matches.' : 'No ' + PAGES[page].noun + ' yet.'));
    } else {
      content.appendChild(list);
    }
  }

  // --- Style preview -------------------------------------------------------
  function studioUrl(s) {
    return 'https://studio.mapbox.com/styles/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.id) + '/edit/';
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

  function showDetailError(text) {
    var box = $('detail-error');
    box.textContent = text;
    box.hidden = false;
  }

  function showPreviewMap(s) {
    var url = 'mapbox://styles/' + s.owner + '/' + s.id;
    if (url === mapStyleUrl) { if (map) map.resize(); return; }
    mapStyleUrl = url;
    var camera = { center: s.center || [0, 20], zoom: typeof s.zoom === 'number' ? s.zoom : 1 };
    if (map) {
      map.setStyle(url);
      map.jumpTo(camera);
      return;
    }
    loadGl(function() {
      mapboxgl.accessToken = TOKEN;
      map = new mapboxgl.Map({
        container: 'detail-map', style: mapStyleUrl, center: camera.center, zoom: camera.zoom,
        attributionControl: false, logoPosition: 'top-right'
      });
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'top-right');
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.on('error', function(e) {
        var status = e && e.error && e.error.status;
        showDetailError(status === 401 || status === 403 || status === 404
          ? "Couldn't load this style with the account's public token."
          : "Couldn't load part of the map.");
      });
    }, function() {
      mapStyleUrl = '';
      showDetailError("Couldn't load Mapbox GL JS.");
    });
  }

  function renderDetail() {
    $('detail-error').hidden = true;
    var url = 'mapbox://styles/' + detail.owner + '/' + detail.id;
    var s = data && data.styles.items.filter(function(x) { return x.owner === detail.owner && x.id === detail.id; })[0];
    // A deep link can name a style outside the first page of the list.
    if (!s) s = { owner: detail.owner, id: detail.id, name: detail.id };
    $('detail-name').textContent = s.name;
    $('detail-url').textContent = url;
    var meta = $('detail-meta');
    meta.textContent = '';
    metaLine(s, null, meta);
    var actions = $('detail-actions');
    actions.textContent = '';
    actions.appendChild(button('Ask about this view', 'btn primary', function() {
      var view = null;
      if (map) {
        var c = map.getCenter();
        view = { lng: c.lng, lat: c.lat, zoom: map.getZoom() };
      }
      attachStyle(s, view);
    }));
    actions.appendChild(copyButton(url, 'Copy style URL'));
    actions.appendChild(button('Open in Studio', 'btn', function() { openLink(studioUrl(s)); }));
    if (!TOKEN) {
      showDetailError('The preview needs a public token for this account.');
      return;
    }
    showPreviewMap(s);
  }

  function render() {
    if (detail) renderDetail(); else if (page) renderList(); else renderHome();
  }

  render();
})();
</script>
</body>
</html>`;
}
