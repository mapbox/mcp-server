import * as fs from 'fs';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BaseResource } from '../BaseResource.js';
import { FileMetadataManager } from './FileMetadataManager.js';

export class TestResourcesResource extends BaseResource {
  readonly name = 'test-resources';
  readonly uriTemplate = new ResourceTemplate('test-resources://{fileId}', {
    list: undefined
  });
  readonly title = 'Test Resources Files';
  readonly description =
    'List and access generated test data files. Use test-resources:// for file list or test-resources://<fileid> for specific file content';

  private metadataManager: FileMetadataManager | null = null;

  protected async readCallback(uri: URL, variables?: Record<string, any>) {
    try {
      const testResourcesDir = '/tmp/test-resources';
      // Resolve the real path to handle symlinks
      const resolvedDir = fs.existsSync(testResourcesDir)
        ? fs.realpathSync(testResourcesDir)
        : testResourcesDir;

      // Create metadata manager with resolved path
      if (!this.metadataManager) {
        this.metadataManager = new FileMetadataManager(resolvedDir);
      }

      // Sync metadata with file system first
      await this.metadataManager!.syncWithFileSystem();

      // Extract fileId from variables (ResourceTemplate provides this)
      const fileId = variables?.fileId;

      if (fileId) {
        // Request for specific file by ID: test-resources://<fileid>
        return await this.getFileById(uri, fileId);
      } else {
        // Request for file list: test-resources://
        return await this.getFileList(uri, resolvedDir);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
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
    const metadata = await this.metadataManager!.getFileMetadata(fileId);

    if (!metadata) {
      const availableIds = await this.getAvailableFileIds();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
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
            mimeType: 'application/json',
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
            mimeType: 'application/json',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
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
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                message:
                  'No test resources directory found. Generate some data files first using the generate_data_tool.',
                files: [],
                usage: {
                  listFiles: 'test-resources://',
                  getFileById: 'test-resources://<file-id>'
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
      resourceUri: `test-resources://${metadata.id}`
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
        message: 'To view file content, use test-resources://<file-id>',
        examples: fileList.slice(0, 3).map((f) => f.resourceUri)
      }
    };

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
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
