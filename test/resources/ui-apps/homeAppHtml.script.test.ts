// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import * as vm from 'node:vm';
import {
  renderHomeAppHtml,
  HOME_STARTERS
} from '../../../src/resources/ui-apps/homeAppHtml.js';

type FakeElement = {
  id: string;
  hidden: boolean;
  className: string;
  children: FakeElement[];
  style: Record<string, string>;
  textContent: string;
  appendChild: (child: FakeElement) => FakeElement;
  addEventListener: (type: string, fn: () => void) => void;
  click: () => void;
  [key: string]: unknown;
};

function fakeElement(id = ''): FakeElement {
  const listeners: Record<string, Array<() => void>> = {};
  let text = '';
  const el: FakeElement = {
    id,
    hidden: false,
    className: '',
    children: [],
    style: {},
    get textContent() {
      return text + el.children.map((c) => c.textContent).join('');
    },
    set textContent(value: string) {
      text = value;
      el.children = [];
    },
    appendChild: (child) => {
      el.children.push(child);
      return child;
    },
    addEventListener: (type, fn) => {
      (listeners[type] ??= []).push(fn);
    },
    click: () => listeners.click?.forEach((fn) => fn()),
    setAttribute: (name: string, value: string) => {
      el[name] = value;
    }
  };
  return el;
}

/** Depth-first search by class name and/or text. */
function find(
  root: FakeElement,
  predicate: (el: FakeElement) => boolean
): FakeElement[] {
  const out: FakeElement[] = [];
  const walk = (el: FakeElement) => {
    if (predicate(el)) out.push(el);
    el.children.forEach(walk);
  };
  walk(root);
  return out;
}

const STATIC_IDS = [
  'home-view',
  'list-view',
  'greeting',
  'starters',
  'see-all-styles',
  'see-all-tilesets',
  'see-all-tokens',
  'open-studio',
  'count-styles',
  'count-tilesets',
  'count-tokens',
  'studio-styles',
  'studio-tilesets',
  'studio-tokens',
  'tilesets-preview',
  'tokens-preview',
  'list-studio',
  'styles-preview',
  'summary',
  'back',
  'list-title',
  'refresh',
  'filter',
  'list-content',
  'toast',
  'detail-view',
  'detail-back',
  'detail-name',
  'detail-map',
  'detail-error',
  'detail-meta',
  'detail-url',
  'detail-actions'
];

function loadHomeApp(
  hostContext: Record<string, unknown> = {},
  pluginName?: string
) {
  const html = renderHomeAppHtml({ publicToken: 'pk.test', pluginName });
  const source = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
  if (!source) throw new Error('No inline <script> in the home app HTML');

  const byId: Record<string, FakeElement> = {};
  for (const id of STATIC_IDS) byId[id] = fakeElement(id);
  byId['list-view'].hidden = true;
  byId['detail-view'].hidden = true;
  const head = fakeElement('head');

  const sent: Array<Record<string, unknown>> = [];
  let onMessage: (event: { data: unknown }) => void = () => {};

  const context = vm.createContext({
    window: {
      parent: { postMessage: (msg: Record<string, unknown>) => sent.push(msg) },
      addEventListener: (_: string, fn: typeof onMessage) => (onMessage = fn),
      open: () => {}
    },
    document: {
      getElementById: (id: string) => byId[id],
      createElement: () => fakeElement(),
      createTextNode: (text: string) => {
        const node = fakeElement();
        node.textContent = text;
        return node;
      },
      documentElement: { setAttribute: () => {} },
      head
    },
    navigator: {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    Map,
    Promise,
    Object,
    String,
    Math,
    Date,
    isNaN,
    encodeURIComponent
  });
  vm.runInContext(source, context);

  const deliver = (data: unknown) => onMessage({ data });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  // Answer ui/initialize the way a host would.
  const init = sent.find((m) => m.method === 'ui/initialize')!;
  deliver({ jsonrpc: '2.0', id: init.id, result: { hostContext } });

  return { byId, head, sent, deliver, flush };
}

const homeData = {
  home: true,
  username: 'mofei',
  styles: {
    items: ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
      id,
      owner: 'mofei',
      name: `Style ${id}`,
      modified: `2026-0${i + 1}-01T00:00:00Z`,
      center: [1, 2],
      zoom: 3
    }))
  },
  tilesets: { items: [{ id: 'mofei.t1', name: 'Trails' }] },
  tokens: { items: [], error: 'Missing tokens:read' }
};

describe('homeAppHtml', () => {
  it('opens a new chat with an unsent draft from a starter', () => {
    const { byId, sent } = loadHomeApp();
    const starters = byId.starters.children;
    expect(starters).toHaveLength(HOME_STARTERS.length);

    for (const s of HOME_STARTERS) {
      expect(s.prompt).toMatch(/: $/);
      expect(s.prompt).not.toContain('___');
    }

    starters[0].click();
    const message = sent.find((m) => m.method === 'ui/message');
    expect(message?.params).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '@Mapbox ' },
        { type: 'text', text: HOME_STARTERS[0].prompt }
      ],
      _meta: { 'openai/message': { target: 'new', send: false } }
    });
  });

  it('mentions the configured plugin name in starter drafts', () => {
    const { byId, sent } = loadHomeApp({}, 'MCP-dev');
    byId.starters.children[1].click();
    const message = sent.find((m) => m.method === 'ui/message');
    expect(
      (message?.params as { content: Array<{ text: string }> }).content[0].text
    ).toBe('@MCP-dev ');
  });

  it('previews the most recently modified styles and asks about one in a new chat', () => {
    const { byId, sent, deliver } = loadHomeApp();
    deliver({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { structuredContent: homeData }
    });

    expect(byId.greeting.textContent).toBe('Hi, mofei');
    find(
      byId['styles-preview'],
      (el) => el['aria-label'] === 'Open in Studio'
    )[0].click();
    expect(sent.at(-1)).toMatchObject({
      method: 'ui/open-link',
      params: { url: 'https://studio.mapbox.com/styles/mofei/e/edit/' }
    });
    const names = find(byId['styles-preview'], (el) => el.className === 'name');
    expect(names.map((n) => n.textContent)).toEqual([
      'Style e',
      'Style d',
      'Style c',
      'Style b'
    ]);
    expect(byId.summary.textContent).toContain('5Styles');
    expect(byId.summary.textContent).toContain('–Public tokens');

    find(
      byId['styles-preview'],
      (el) => el.className === 'btn tint' && el.textContent === 'Ask about it'
    )[0].click();
    const message = sent.find((m) => m.method === 'ui/message');
    const params = message?.params as {
      content: Array<Record<string, unknown>>;
      _meta: unknown;
    };
    expect(params._meta).toEqual({
      'openai/message': { target: 'new', send: false }
    });
    expect(params.content[0]).toEqual({ type: 'text', text: '@Mapbox ' });
    const block = params.content[1];
    expect(block.text).toContain('mapbox://styles/mofei/e');
    expect(block._meta).toMatchObject({
      'openai/title': 'Style e',
      'openai/thumbnail': {
        src: expect.stringContaining('/styles/v1/mofei/e/static/1,2,3/')
      }
    });
  });

  it('opens the page a deep link points to', async () => {
    const { byId, deliver, flush } = loadHomeApp({
      'openai/deepLink': { url: '/tilesets' }
    });
    await flush();
    expect(byId['list-view'].hidden).toBe(false);
    expect(byId['home-view'].hidden).toBe(true);
    expect(byId['list-title'].textContent).toBe('Tilesets');

    deliver({
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: { 'openai/deepLink': { url: '/styles/abc?x=1' } }
    });
    expect(byId['list-title'].textContent).toBe('Styles');

    deliver({
      jsonrpc: '2.0',
      method: 'ui/notifications/host-context-changed',
      params: { 'openai/deepLink': { url: '/nope' } }
    });
    expect(byId['home-view'].hidden).toBe(false);
  });

  it('opens an interactive preview of a style, loading GL JS only then', () => {
    const { byId, head, deliver } = loadHomeApp();
    deliver({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { structuredContent: homeData }
    });
    expect(head.children).toHaveLength(0);

    find(
      byId['styles-preview'],
      (el) => el['aria-label'] === 'Preview Style e'
    )[0].click();
    expect(byId['detail-view'].hidden).toBe(false);
    expect(byId['home-view'].hidden).toBe(true);
    expect(byId['list-view'].hidden).toBe(true);
    expect(byId['detail-name'].textContent).toBe('Style e');
    expect(byId['detail-url'].textContent).toBe('mapbox://styles/mofei/e');
    expect(head.children.map((c) => c.src ?? c.href)).toEqual([
      expect.stringMatching(/mapbox-gl-js\/v[\d.]+\/mapbox-gl\.css$/),
      expect.stringMatching(/mapbox-gl-js\/v[\d.]+\/mapbox-gl\.js$/)
    ]);

    byId['detail-back'].click();
    expect(byId['detail-view'].hidden).toBe(true);
    expect(byId['list-title'].textContent).toBe('Styles');
  });

  it('previews a deep-linked style that is not in the loaded list', async () => {
    const { byId, flush } = loadHomeApp({
      'openai/deepLink': { url: '/styles/someone/abc123' }
    });
    await flush();
    expect(byId['detail-view'].hidden).toBe(false);
    expect(byId['detail-name'].textContent).toBe('abc123');
    expect(byId['detail-url'].textContent).toBe(
      'mapbox://styles/someone/abc123'
    );
  });

  it('shows a preview, a full list and a Studio or Console link for each section', () => {
    const { byId, sent, deliver } = loadHomeApp();
    deliver({
      jsonrpc: '2.0',
      method: 'ui/notifications/tool-result',
      params: { structuredContent: homeData }
    });

    expect(byId['tilesets-preview'].textContent).toContain('Trails');
    expect(byId['see-all-tilesets'].hidden).toBe(false);
    // The tokens list failed: its error shows and there is no list to open.
    expect(byId['tokens-preview'].textContent).toContain('Missing tokens:read');
    expect(byId['see-all-tokens'].hidden).toBe(true);

    expect(byId['studio-tokens'].textContent).toBe('Open in Console');
    byId['studio-tilesets'].click();
    expect(sent.at(-1)).toMatchObject({
      method: 'ui/open-link',
      params: { url: 'https://studio.mapbox.com/tilesets/' }
    });

    byId['see-all-tilesets'].click();
    expect(byId['list-title'].textContent).toBe('Tilesets');
    expect(byId['list-studio'].textContent).toBe('Open in Studio');
  });
});
