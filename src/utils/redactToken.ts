// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/** Remove access_token query parameter values from strings before logging or exporting them. */
export function redactToken(s: string): string {
  return s.replace(/access_token=[^&\s#"']+/g, 'access_token=***');
}
