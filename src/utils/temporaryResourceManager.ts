// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Manager for temporary resources created from large tool responses.
 * Resources are stored in-memory with configurable TTL and a total byte cap
 * to prevent unbounded memory growth. When the cap is exceeded, the oldest
 * entries are evicted first.
 */

export interface TemporaryResource {
  id: string;
  uri: string;
  data: unknown;
  mimeType?: string;
  byteSize: number;
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
  private totalBytes = 0;

  constructor(
    private defaultTTL: number = 30 * 60 * 1000, // 30 minutes
    private maxBytes: number = 50 * 1024 * 1024 // 50MB
  ) {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create a temporary resource. Evicts oldest entries if the byte cap would
   * be exceeded.
   */
  create(
    id: string,
    uri: string,
    data: unknown,
    metadata?: TemporaryResource['metadata'],
    ttl?: number,
    mimeType?: string
  ): TemporaryResource {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data);
    const byteSize = Buffer.byteLength(dataStr, 'utf8');

    // Evict oldest entries until we have room
    while (
      this.totalBytes + byteSize > this.maxBytes &&
      this.resources.size > 0
    ) {
      const oldestUri = this.resources.keys().next().value as string;
      const oldest = this.resources.get(oldestUri)!;
      this.resources.delete(oldestUri);
      this.totalBytes -= oldest.byteSize;
    }

    const resource: TemporaryResource = {
      id,
      uri,
      data,
      mimeType,
      byteSize,
      created: Date.now(),
      ttl: ttl ?? this.defaultTTL,
      metadata
    };

    this.resources.set(uri, resource);
    this.totalBytes += byteSize;
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
      this.totalBytes -= resource.byteSize;
      return undefined;
    }

    return resource;
  }

  /**
   * Delete a resource
   */
  delete(uri: string): boolean {
    const resource = this.resources.get(uri);
    if (resource) {
      this.totalBytes -= resource.byteSize;
    }
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
        this.totalBytes -= resource.byteSize;
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
   * Get total bytes currently stored
   */
  totalBytesStored(): number {
    return this.totalBytes;
  }

  /**
   * Clear all resources
   */
  clear(): void {
    this.resources.clear();
    this.totalBytes = 0;
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
