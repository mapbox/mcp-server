import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface FileMetadata {
  id: string;
  filename: string;
  originalPath: string;
  size: number;
  type: string;
  created: string;
  modified: string;
}

export class FileMetadataManager {
  private metadataFile: string;
  private testResourcesDir: string;

  constructor(testResourcesDir: string = '/tmp/test-resources') {
    // Resolve the real path to handle symlinks (like /tmp -> /private/tmp on macOS)
    try {
      this.testResourcesDir = fs.existsSync(testResourcesDir)
        ? fs.realpathSync(testResourcesDir)
        : testResourcesDir;
    } catch {
      this.testResourcesDir = testResourcesDir;
    }
    this.metadataFile = path.join(this.testResourcesDir, '.metadata.json');
    console.log(
      `[FileMetadataManager] Using directory: ${this.testResourcesDir}`
    );
  }

  generateFileId(filename: string): string {
    const timestamp = Date.now().toString();
    const hash = crypto
      .createHash('md5')
      .update(filename + timestamp)
      .digest('hex');
    return hash.substring(0, 8);
  }

  async createFileMetadata(
    originalFilename: string
  ): Promise<{ fileId: string; actualFilename: string }> {
    const fileId = this.generateFileId(originalFilename);
    const actualFilename = fileId; // File is saved with ID as filename, no extension

    return { fileId, actualFilename };
  }

  async saveFileMetadata(
    fileId: string,
    originalFilename: string,
    actualPath: string
  ): Promise<void> {
    const stats = fs.statSync(actualPath);

    const metadata: FileMetadata = {
      id: fileId,
      filename: originalFilename, // Store original filename for display
      originalPath: actualPath, // Store actual path where file is saved
      size: stats.size,
      type: this.getFileType(originalFilename),
      created: stats.birthtime.toISOString(),
      modified: stats.mtime.toISOString()
    };

    const allMetadata = await this.loadAllMetadata();
    allMetadata[fileId] = metadata;

    await this.saveAllMetadata(allMetadata);
  }

  async getFileMetadata(fileId: string): Promise<FileMetadata | null> {
    const allMetadata = await this.loadAllMetadata();
    return allMetadata[fileId] || null;
  }

  async getAllMetadata(): Promise<Record<string, FileMetadata>> {
    return this.loadAllMetadata();
  }

  async removeFileMetadata(fileId: string): Promise<void> {
    const allMetadata = await this.loadAllMetadata();
    delete allMetadata[fileId];
    await this.saveAllMetadata(allMetadata);
  }

  private async loadAllMetadata(): Promise<Record<string, FileMetadata>> {
    try {
      if (fs.existsSync(this.metadataFile)) {
        const data = fs.readFileSync(this.metadataFile, 'utf8');
        return JSON.parse(data);
      }
    } catch {
      // If metadata file is corrupted, start fresh
    }
    return {};
  }

  private async saveAllMetadata(
    metadata: Record<string, FileMetadata>
  ): Promise<void> {
    // Ensure directory exists
    if (!fs.existsSync(this.testResourcesDir)) {
      fs.mkdirSync(this.testResourcesDir, { recursive: true });
    }

    fs.writeFileSync(
      this.metadataFile,
      JSON.stringify(metadata, null, 2),
      'utf8'
    );
  }

  private getFileType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
      case '.json':
        return 'json';
      case '.csv':
        return 'csv';
      case '.txt':
        return 'text';
      default:
        return 'unknown';
    }
  }

  async syncWithFileSystem(): Promise<void> {
    const allMetadata = await this.loadAllMetadata();
    const updatedMetadata: Record<string, FileMetadata> = {};

    // Check which files still exist
    for (const [fileId, metadata] of Object.entries(allMetadata)) {
      if (fs.existsSync(metadata.originalPath)) {
        updatedMetadata[fileId] = metadata;
      }
    }

    await this.saveAllMetadata(updatedMetadata);
  }
}
