// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Browser JavaScript for the MVT viewer page: a Mapbox Vector Tile decoder
 * (https://github.com/mapbox/vector-tile-spec/tree/master/2.1) and a converter
 * to GeoJSON. Kept as source text, like the rest of the page script, so the
 * page embeds exactly what the tests run.
 *
 * Defines:
 * - `decodeMvt(bytes)` → `{ layers: [{ name, version, extent, features:
 *   [{ id, type, properties, parts }] }] }`, `type` 1 point, 2 line, 3 polygon,
 *   `parts` in tile coordinates.
 * - `mvtLayerToGeoJson(layer, tile)` → GeoJSON features. With a tile
 *   `{ z, x, y }` coordinates are longitude and latitude; with `null` the tile
 *   is placed as 0/0/0, which keeps its shapes but not its location.
 */
export const MVT_DECODER_JS = String.raw`
function decodeMvt(bytes) {
  var pos = 0;
  var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  var utf8 = new TextDecoder();

  function varint() {
    var result = 0, shift = 1, b;
    do {
      if (pos >= bytes.length) throw new Error('Truncated varint');
      if (shift > 18446744073709551616) throw new Error('Varint too long');
      b = bytes[pos++];
      result += (b & 0x7f) * shift;
      shift *= 128;
    } while (b >= 0x80);
    return result;
  }
  // A negative int64 is a 10-byte two's complement varint, beyond what a
  // double holds exactly, so read it as low and high 32 bits.
  function int64() {
    var lo = 0, hi = 0, b, i;
    for (i = 0; i < 10; i++) {
      if (pos >= bytes.length) throw new Error('Truncated varint');
      b = bytes[pos++];
      if (i < 4) lo |= (b & 0x7f) << (7 * i);
      else if (i === 4) { lo |= (b & 0x0f) << 28; hi |= (b & 0x7f) >> 4; }
      else hi |= (b & 0x7f) << (7 * i - 32);
      if (b < 0x80) break;
    }
    if (b >= 0x80) throw new Error('Varint too long');
    if (hi & 0x80000000) return -((~hi >>> 0) * 4294967296 + (~lo >>> 0) + 1);
    return (hi >>> 0) * 4294967296 + (lo >>> 0);
  }
  function zigzag(n) { return n % 2 === 1 ? -(n + 1) / 2 : n / 2; }
  function skip(wireType) {
    if (wireType === 0) varint();
    else if (wireType === 1) pos += 8;
    else if (wireType === 2) pos += varint();
    else if (wireType === 5) pos += 4;
    else throw new Error('Unsupported wire type ' + wireType);
  }
  function fields(end, onField) {
    if (end > bytes.length) throw new Error('Truncated message');
    while (pos < end) {
      var key = varint();
      onField(Math.floor(key / 8), key % 8);
    }
    if (pos !== end) throw new Error('Malformed message');
  }
  function text() {
    var length = varint();
    if (pos + length > bytes.length) throw new Error('Truncated string');
    var value = utf8.decode(bytes.subarray(pos, pos + length));
    pos += length;
    return value;
  }
  function packed() {
    var end = varint() + pos;
    var out = [];
    while (pos < end) out.push(varint());
    if (pos !== end) throw new Error('Malformed packed field');
    return out;
  }
  function value(end) {
    var result = '';
    fields(end, function(field, wireType) {
      if (field === 1 && wireType === 2) result = text();
      else if (field === 2 && wireType === 5) { result = view.getFloat32(pos, true); pos += 4; }
      else if (field === 3 && wireType === 1) { result = view.getFloat64(pos, true); pos += 8; }
      else if (field === 4 && wireType === 0) result = int64();
      else if (field === 5 && wireType === 0) result = varint();
      else if (field === 6 && wireType === 0) result = zigzag(varint());
      else if (field === 7 && wireType === 0) result = varint() !== 0;
      else skip(wireType);
    });
    return result;
  }
  function geometry(commands) {
    var parts = [], part = null, x = 0, y = 0, i = 0;
    while (i < commands.length) {
      var command = commands[i] & 7;
      var count = Math.floor(commands[i] / 8);
      i++;
      if (command === 7) {
        if (part && part.length) part.push([part[0][0], part[0][1]]);
        continue;
      }
      if (command !== 1 && command !== 2) throw new Error('Unknown geometry command ' + command);
      for (var k = 0; k < count; k++) {
        if (i + 1 >= commands.length) throw new Error('Truncated geometry');
        x += zigzag(commands[i++]);
        y += zigzag(commands[i++]);
        if (command === 1) { part = []; parts.push(part); }
        if (part) part.push([x, y]);
      }
    }
    return parts;
  }
  function layer(end) {
    var out = { name: '', version: 1, extent: 4096, features: [] };
    var keys = [], values = [], raw = [];
    fields(end, function(field, wireType) {
      if (field === 15 && wireType === 0) out.version = varint();
      else if (field === 1 && wireType === 2) out.name = text();
      else if (field === 5 && wireType === 0) out.extent = varint() || 4096;
      else if (field === 3 && wireType === 2) keys.push(text());
      else if (field === 4 && wireType === 2) values.push(value(varint() + pos));
      else if (field === 2 && wireType === 2) {
        var feature = { id: undefined, type: 0, tags: [], geometry: [] };
        fields(varint() + pos, function(f, w) {
          if (f === 1 && w === 0) feature.id = varint();
          else if (f === 2 && w === 2) feature.tags = packed();
          else if (f === 3 && w === 0) feature.type = varint();
          else if (f === 4 && w === 2) feature.geometry = packed();
          else skip(w);
        });
        raw.push(feature);
      }
      else skip(wireType);
    });
    out.features = raw.map(function(f) {
      var properties = {};
      for (var i = 0; i + 1 < f.tags.length; i += 2) {
        var key = keys[f.tags[i]];
        if (key !== undefined && f.tags[i + 1] < values.length) properties[key] = values[f.tags[i + 1]];
      }
      return { id: f.id, type: f.type, properties: properties, parts: geometry(f.geometry) };
    });
    return out;
  }

  var layers = [];
  fields(bytes.length, function(field, wireType) {
    if (field === 3 && wireType === 2) layers.push(layer(varint() + pos));
    else skip(wireType);
  });
  return { layers: layers };
}

function mvtLayerToGeoJson(layer, tile) {
  var z = tile ? tile.z : 0, x0 = tile ? tile.x : 0, y0 = tile ? tile.y : 0;
  var size = layer.extent * Math.pow(2, z);
  function project(p) {
    var lon = ((x0 * layer.extent + p[0]) / size) * 360 - 180;
    var n = Math.PI * (1 - (2 * (y0 * layer.extent + p[1])) / size);
    var lat = Math.atan((Math.exp(n) - Math.exp(-n)) / 2) * 180 / Math.PI;
    return [Math.round(lon * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
  }
  function ringArea(ring) {
    var sum = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      sum += (ring[i][0] - ring[j][0]) * (ring[i][1] + ring[j][1]);
    }
    return sum;
  }
  function one(type, list) {
    return list.length === 1 ? { type: type, coordinates: list[0] } : { type: 'Multi' + type, coordinates: list };
  }
  var out = [];
  layer.features.forEach(function(f) {
    var geometry = null;
    if (f.type === 1) {
      var points = [];
      f.parts.forEach(function(part) { part.forEach(function(p) { points.push(project(p)); }); });
      if (points.length) geometry = one('Point', points);
    } else if (f.type === 2) {
      var lines = f.parts.filter(function(p) { return p.length > 1; }).map(function(p) { return p.map(project); });
      if (lines.length) geometry = one('LineString', lines);
    } else if (f.type === 3) {
      // A ring wound like the first one starts a new polygon; the others are its holes.
      var polygons = [], outerSign = 0;
      f.parts.forEach(function(ring) {
        var area = ringArea(ring);
        if (!area || ring.length < 4) return;
        if (!outerSign) outerSign = Math.sign(area);
        if (Math.sign(area) === outerSign) polygons.push([ring.map(project)]);
        else polygons[polygons.length - 1].push(ring.map(project));
      });
      if (polygons.length) geometry = one('Polygon', polygons);
    }
    if (geometry) out.push({ type: 'Feature', id: f.id, properties: f.properties, geometry: geometry });
  });
  return out;
}
`;
