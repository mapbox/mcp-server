// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * GeoJSON interfaces based on RFC 7946
 * https://tools.ietf.org/html/rfc7946
 */

export type GeoJSONGeometryType =
  | 'Point'
  | 'LineString'
  | 'Polygon'
  | 'MultiPoint'
  | 'MultiLineString'
  | 'MultiPolygon'
  | 'GeometryCollection';

export type GeoJSONFeatureType = 'Feature';

export type GeoJSONFeatureCollectionType = 'FeatureCollection';

export type GeoJSONType =
  | GeoJSONGeometryType
  | GeoJSONFeatureType
  | GeoJSONFeatureCollectionType;

/**
 * Position array [longitude, latitude] or [longitude, latitude, elevation]
 */
export type Position = [number, number] | [number, number, number];

/**
 * Base interface for all GeoJSON objects
 */
export interface GeoJSONBase {
  type: GeoJSONType;
  bbox?:
    | [number, number, number, number]
    | [number, number, number, number, number, number];
}

/**
 * Point geometry
 */
export interface Point extends GeoJSONBase {
  type: 'Point';
  coordinates: Position;
}

/**
 * LineString geometry
 */
export interface LineString extends GeoJSONBase {
  type: 'LineString';
  coordinates: Position[];
}

/**
 * Polygon geometry
 */
export interface Polygon extends GeoJSONBase {
  type: 'Polygon';
  coordinates: Position[][];
}

/**
 * MultiPoint geometry
 */
export interface MultiPoint extends GeoJSONBase {
  type: 'MultiPoint';
  coordinates: Position[];
}

/**
 * MultiLineString geometry
 */
export interface MultiLineString extends GeoJSONBase {
  type: 'MultiLineString';
  coordinates: Position[][];
}

/**
 * MultiPolygon geometry
 */
export interface MultiPolygon extends GeoJSONBase {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

/**
 * GeometryCollection
 */
export interface GeometryCollection extends GeoJSONBase {
  type: 'GeometryCollection';
  geometries: Geometry[];
}

/**
 * Union of all geometry types
 */
export type Geometry =
  | Point
  | LineString
  | Polygon
  | MultiPoint
  | MultiLineString
  | MultiPolygon
  | GeometryCollection;

/**
 * GeoJSON Feature with properties
 */
export interface Feature<
  P = Record<string, unknown>,
  G extends Geometry = Geometry
> extends GeoJSONBase {
  type: 'Feature';
  geometry: G | null;
  properties: P | null;
  id?: string | number;
}

/**
 * GeoJSON FeatureCollection
 */
export interface FeatureCollection<
  P = Record<string, unknown>,
  G extends Geometry = Geometry
> extends GeoJSONBase {
  type: 'FeatureCollection';
  features: Feature<P, G>[];
}

/**
 * Union of all GeoJSON objects
 */
export type GeoJSON = Geometry | Feature | FeatureCollection;

/**
 * Mapbox-specific properties commonly found in Mapbox API responses
 */
export interface MapboxFeatureProperties extends Record<string, unknown> {
  name?: string;
  name_preferred?: string;
  full_address?: string;
  place_formatted?: string;
  feature_type?: string;
  poi_category?: string | string[];
  category?: string;
  mapbox_id?: string;
  address?: string;
}

/**
 * Mapbox Feature with common properties
 */
export type MapboxFeature = Feature<MapboxFeatureProperties>;

/**
 * Mapbox FeatureCollection with common properties
 */
export type MapboxFeatureCollection =
  FeatureCollection<MapboxFeatureProperties>;
