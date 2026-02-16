// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Manager for temporary resources created from large tool responses.
 * Resources are stored in-memory with configurable TTL.
 */

export interface TemporaryResource {
  id: string;
  uri: string;
  data: unknown;
  created: number;
  ttl: number;
  metadata?: {
    toolName?: string;
    size?: number;
  };
}

export class TemporaryResourceManager {
  private resources = new Map<string, TemporaryResource>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private defaultTTL: number = 30 * 60 * 1000 // 30 minutes
  ) {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create a temporary resource
   */
  create(
    id: string,
    uri: string,
    data: unknown,
    metadata?: TemporaryResource['metadata'],
    ttl?: number
  ): TemporaryResource {
    const resource: TemporaryResource = {
      id,
      uri,
      data,
      created: Date.now(),
      ttl: ttl ?? this.defaultTTL,
      metadata
    };

    this.resources.set(uri, resource);
    return resource;
  }

  /**
   * Get a resource by URI
   */
  get(uri: string): TemporaryResource | undefined {
    const resource = this.resources.get(uri);

    if (!resource) {
      return undefined;
    }

    // Check if expired
    if (Date.now() - resource.created > resource.ttl) {
      this.resources.delete(uri);
      return undefined;
    }

    return resource;
  }

  /**
   * Delete a resource
   */
  delete(uri: string): boolean {
    return this.resources.delete(uri);
  }

  /**
   * Clean up expired resources
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [uri, resource] of this.resources.entries()) {
      if (now - resource.created > resource.ttl) {
        this.resources.delete(uri);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get count of active resources
   */
  count(): number {
    return this.resources.size;
  }

  /**
   * Clear all resources
   */
  clear(): void {
    this.resources.clear();
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }
}

// Singleton instance
export const temporaryResourceManager = new TemporaryResourceManager();
