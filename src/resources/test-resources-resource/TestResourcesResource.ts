import * as fs from 'fs';
import { BaseResource } from '../BaseResource.js';
import { FileMetadataManager } from './FileMetadataManager.js';

export class TestResourcesResource extends BaseResource {
  readonly name = 'Test Resources Files';
  readonly uri = 'resource://test-resources/**';
  readonly description =
    'List and access generated test data files from /tmp/test-resources/ directory. Use resource://test-resources for file list or resource://test-resources/<fileid> for specific file content';
  readonly mimeType = 'application/json';

  private metadataManager: FileMetadataManager | null = null;

  protected async readCallback(uri: URL, _extra: any) {
    try {
      const testResourcesDir = '/tmp/test-resources';
      // Resolve the real path to handle symlinks
      const resolvedDir = fs.existsSync(testResourcesDir)
        ? fs.realpathSync(testResourcesDir)
        : testResourcesDir;

      // Log URI for debugging
      console.log(`[TestResourcesResource] Processing URI: ${uri.href}`);
      console.log(`[TestResourcesResource] Pathname: ${uri.pathname}`);
      console.log(`[TestResourcesResource] Using directory: ${resolvedDir}`);

      // Create metadata manager with resolved path
      if (!this.metadataManager) {
        this.metadataManager = new FileMetadataManager(resolvedDir);
      }

      // Sync metadata with file system first
      await this.metadataManager!.syncWithFileSystem();

      // Parse URI to check if requesting specific file by ID
      const pathSegments = uri.pathname
        .split('/')
        .filter((segment) => segment.length > 0);
      console.log(`[TestResourcesResource] Path segments:`, pathSegments);

      // Handle different URI patterns:
      // resource://test-resources -> list files
      // resource://test-resources/ -> list files
      // resource://test-resources/<fileid> -> get specific file
      const fileId = pathSegments.length >= 2 ? pathSegments[1] : null;
      console.log(`[TestResourcesResource] Extracted file ID: ${fileId}`);

      if (fileId && fileId !== 'test-resources') {
        // Request for specific file by ID: resource://test-resources/<fileid>
        return await this.getFileById(uri, fileId);
      } else {
        // Request for file list: resource://test-resources
        return await this.getFileList(uri, resolvedDir);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: this.mimeType,
            text: JSON.stringify(
              {
                error: `Failed to read test resources: ${errorMessage}`,
                files: []
              },
              null,
              2
            )
          }
        ]
      };
    }
  }

  private async getFileById(uri: URL, fileId: string) {
    console.log(`[TestResourcesResource] Getting file by ID: ${fileId}`);
    const metadata = await this.metadataManager!.getFileMetadata(fileId);
    console.log(`[TestResourcesResource] Metadata found:`, metadata);

    if (!metadata) {
      const availableIds = await this.getAvailableFileIds();
      console.log(`[TestResourcesResource] Available file IDs:`, availableIds);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: this.mimeType,
            text: JSON.stringify(
              {
                error: `File with ID '${fileId}' not found`,
                availableFiles: availableIds
              },
              null,
              2
            )
          }
        ]
      };
    }

    // Check if file still exists
    if (!fs.existsSync(metadata.originalPath)) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: this.mimeType,
            text: JSON.stringify(
              {
                error: `File '${metadata.filename}' (ID: ${fileId}) no longer exists on disk`,
                metadata
              },
              null,
              2
            )
          }
        ]
      };
    }

    try {
      const content = fs.readFileSync(metadata.originalPath, 'utf8');
      const response = {
        id: metadata.id,
        filename: metadata.filename,
        type: metadata.type,
        size: metadata.size,
        created: metadata.created,
        modified: metadata.modified,
        content: content
      };

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: this.mimeType,
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: this.mimeType,
            text: JSON.stringify(
              {
                error: `Failed to read file content: ${error instanceof Error ? error.message : String(error)}`,
                metadata
              },
              null,
              2
            )
          }
        ]
      };
    }
  }

  private async getFileList(uri: URL, testResourcesDir: string) {
    // Check if directory exists
    if (!fs.existsSync(testResourcesDir)) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: this.mimeType,
            text: JSON.stringify(
              {
                message:
                  'No test resources directory found. Generate some data files first using the generate_data_tool.',
                files: [],
                usage: {
                  listFiles: 'resource://test-resources',
                  getFileById: 'resource://test-resources/<file-id>'
                }
              },
              null,
              2
            )
          }
        ]
      };
    }

    const allMetadata = await this.metadataManager!.getAllMetadata();
    const fileList = Object.values(allMetadata).map((metadata) => ({
      id: metadata.id,
      filename: metadata.filename,
      type: metadata.type,
      size: metadata.size,
      created: metadata.created,
      modified: metadata.modified,
      exists: fs.existsSync(metadata.originalPath),
      resourceUri: `resource://test-resources/${metadata.id}`
    }));

    // Sort by modification time (newest first)
    fileList.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    const response = {
      directory: testResourcesDir,
      totalFiles: fileList.length,
      files: fileList,
      usage: {
        message:
          'To view file content, use resource://test-resources/<file-id>',
        examples: fileList.slice(0, 3).map((f) => f.resourceUri)
      }
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: this.mimeType,
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  private async getAvailableFileIds(): Promise<string[]> {
    const allMetadata = await this.metadataManager!.getAllMetadata();
    return Object.keys(allMetadata);
  }
}
