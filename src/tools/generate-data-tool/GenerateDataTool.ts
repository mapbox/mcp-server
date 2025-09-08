import * as fs from 'fs';
import * as path from 'path';
import {
  McpServer,
  RegisteredTool
} from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { FileMetadataManager } from '../../resources/test-resources-resource/FileMetadataManager.js';

const InputSchema = z.object({
  filename: z
    .string()
    .optional()
    .describe(
      'Optional filename for the generated file. If not provided, a random name will be used.'
    ),
  size: z
    .number()
    .min(1)
    .max(10000)
    .optional()
    .default(1000)
    .describe(
      'Size of random content to generate in bytes (1-10000, default: 1000)'
    ),
  type: z
    .enum(['text', 'json', 'csv'])
    .optional()
    .default('text')
    .describe('Type of content to generate (text, json, or csv)')
});

export class GenerateDataTool {
  readonly name = 'generate_data_tool';
  readonly description =
    'Generate a file with random content. Supports text, JSON, and CSV formats. Returns a file ID for later access via resources.';
  readonly inputSchema = InputSchema;

  private server: McpServer | null = null;
  private metadataManager: FileMetadataManager | null = null;

  async run(rawInput: unknown): Promise<{
    content: Array<{
      type: 'text';
      text: string;
    }>;
    isError: boolean;
  }> {
    try {
      const input = this.inputSchema.parse(rawInput);
      const { filename, size, type } = input;

      // Ensure the target directory exists
      const targetDir = '/tmp/test-resources';
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // Resolve the real path to handle symlinks (like /tmp -> /private/tmp on macOS)
      const resolvedTargetDir = fs.realpathSync(targetDir);

      // Create metadata manager with resolved path
      if (!this.metadataManager) {
        this.metadataManager = new FileMetadataManager(resolvedTargetDir);
      }

      // Generate original filename if not provided
      const originalFilename = filename || this.generateRandomFilename(type);

      // Create metadata and get file ID and actual filename
      const { fileId, actualFilename } =
        await this.metadataManager.createFileMetadata(originalFilename);
      const filePath = path.join(resolvedTargetDir, actualFilename);

      // Generate content based on type
      let content: string;
      switch (type) {
        case 'json':
          content = this.generateJsonContent(size);
          break;
        case 'csv':
          content = this.generateCsvContent(size);
          break;
        default:
          content = this.generateTextContent(size);
      }

      // Write file with ID-based filename
      fs.writeFileSync(filePath, content, 'utf8');

      // Save metadata
      await this.metadataManager.saveFileMetadata(
        fileId,
        originalFilename,
        filePath
      );

      const resultText = `Successfully generated data file:
- File ID: ${fileId}
- Original filename: ${originalFilename}
- Saved as: ${actualFilename} (ID-based filename)
- Path: ${filePath}
- Size: ${Buffer.byteLength(content, 'utf8')} bytes
- Type: ${type}
- Access via resource: test-resources://${fileId}
- Content preview (first 100 chars): ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`;

      return {
        content: [{ type: 'text', text: resultText }],
        isError: false
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log(
        'error',
        `${this.name}: Error during execution: ${errorMessage}`
      );

      return {
        content: [
          {
            type: 'text',
            text: `Error generating data file: ${errorMessage}`
          }
        ],
        isError: true
      };
    }
  }

  private generateRandomFilename(type: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = type === 'json' ? 'json' : type === 'csv' ? 'csv' : 'txt';
    return `test_data_${timestamp}_${random}.${extension}`;
  }

  private generateTextContent(size: number): string {
    const words = [
      'lorem',
      'ipsum',
      'dolor',
      'sit',
      'amet',
      'consectetur',
      'adipiscing',
      'elit',
      'sed',
      'do',
      'eiusmod',
      'tempor',
      'incididunt',
      'ut',
      'labore',
      'et',
      'dolore',
      'magna',
      'aliqua',
      'enim',
      'ad',
      'minim',
      'veniam',
      'quis',
      'nostrud',
      'exercitation',
      'ullamco',
      'laboris',
      'nisi',
      'aliquip',
      'ex',
      'ea',
      'commodo',
      'consequat',
      'duis',
      'aute',
      'irure',
      'in',
      'reprehenderit',
      'voluptate',
      'velit',
      'esse',
      'cillum',
      'fugiat',
      'nulla',
      'pariatur',
      'excepteur',
      'sint',
      'occaecat',
      'cupidatat',
      'non',
      'proident',
      'sunt',
      'culpa',
      'qui',
      'officia',
      'deserunt',
      'mollit',
      'anim',
      'id',
      'est',
      'laborum'
    ];

    let content = '';
    while (content.length < size) {
      const randomWords = Array.from(
        { length: Math.floor(Math.random() * 10) + 5 },
        () => words[Math.floor(Math.random() * words.length)]
      );
      content += randomWords.join(' ') + '. ';

      if (Math.random() > 0.7) {
        content += '\n';
      }
    }

    return content.substring(0, size);
  }

  private generateJsonContent(size: number): string {
    const data: any[] = [];
    const names = [
      'Alice',
      'Bob',
      'Charlie',
      'Diana',
      'Eve',
      'Frank',
      'Grace',
      'Henry'
    ];
    const cities = [
      'New York',
      'London',
      'Tokyo',
      'Paris',
      'Sydney',
      'Berlin',
      'Toronto',
      'Mumbai'
    ];

    let currentSize = 0;
    let id = 1;

    while (currentSize < size) {
      const record = {
        id: id++,
        name: names[Math.floor(Math.random() * names.length)],
        age: Math.floor(Math.random() * 80) + 18,
        city: cities[Math.floor(Math.random() * cities.length)],
        score: Math.round(Math.random() * 100),
        active: Math.random() > 0.5,
        timestamp: new Date(
          Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
        ).toISOString()
      };

      data.push(record);
      currentSize = JSON.stringify(data).length;

      if (currentSize >= size && data.length > 1) {
        data.pop(); // Remove last item if it exceeds size
        break;
      }
    }

    return JSON.stringify(data, null, 2);
  }

  private generateCsvContent(size: number): string {
    const headers = [
      'id',
      'name',
      'age',
      'city',
      'score',
      'active',
      'timestamp'
    ];
    const names = [
      'Alice',
      'Bob',
      'Charlie',
      'Diana',
      'Eve',
      'Frank',
      'Grace',
      'Henry'
    ];
    const cities = [
      'New York',
      'London',
      'Tokyo',
      'Paris',
      'Sydney',
      'Berlin',
      'Toronto',
      'Mumbai'
    ];

    let content = headers.join(',') + '\n';
    let id = 1;

    while (content.length < size) {
      const row = [
        id++,
        names[Math.floor(Math.random() * names.length)],
        Math.floor(Math.random() * 80) + 18,
        `"${cities[Math.floor(Math.random() * cities.length)]}"`,
        Math.round(Math.random() * 100),
        Math.random() > 0.5,
        new Date(
          Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000
        ).toISOString()
      ];

      const newRow = row.join(',') + '\n';
      if (
        content.length + newRow.length > size &&
        content.split('\n').length > 2
      ) {
        break;
      }
      content += newRow;
    }

    return content;
  }

  installTo(server: McpServer): RegisteredTool {
    this.server = server;
    return server.tool(
      this.name,
      this.description,
      this.inputSchema.shape,
      this.run.bind(this)
    );
  }

  private log(level: 'debug' | 'info' | 'warning' | 'error', data: any): void {
    if (this.server) {
      this.server.server.sendLoggingMessage({ level, data });
    }
  }
}
