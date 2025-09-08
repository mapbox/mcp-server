import * as fs from 'fs';
import { GenerateDataTool } from './GenerateDataTool';

jest.mock('fs');
const mockCreateFileMetadata = jest.fn();
const mockSaveFileMetadata = jest.fn().mockResolvedValue(undefined);
const mockSyncWithFileSystem = jest.fn().mockResolvedValue(undefined);

jest.mock(
  '../../resources/test-resources-resource/FileMetadataManager.js',
  () => {
    return {
      FileMetadataManager: jest.fn().mockImplementation(() => ({
        createFileMetadata: mockCreateFileMetadata,
        saveFileMetadata: mockSaveFileMetadata,
        syncWithFileSystem: mockSyncWithFileSystem
      }))
    };
  }
);

const mockFs = fs as jest.Mocked<typeof fs>;

describe('GenerateDataTool', () => {
  let tool: GenerateDataTool;
  const mockTargetDir = '/tmp/test-resources';

  beforeEach(() => {
    tool = new GenerateDataTool();
    jest.clearAllMocks();

    // Setup default mock behaviors
    mockFs.existsSync.mockReturnValue(true);
    mockFs.writeFileSync.mockImplementation(() => {});
    mockFs.mkdirSync.mockImplementation(() => '');

    // Default mock for createFileMetadata
    mockCreateFileMetadata.mockResolvedValue({
      fileId: 'mock-file-id-123',
      actualFilename: 'mock-file-id-123'
    });
  });

  describe('run', () => {
    it('should generate a text file with default parameters', async () => {
      const result = await tool.run({});

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain(
        'Successfully generated data file'
      );
      expect(result.content[0].text).toContain('/tmp/test-resources');
      expect(result.content[0].text).toContain('Type: text');
      expect(result.content[0].text).toContain('File ID: mock-file-id-123');
      expect(result.content[0].text).toContain(
        'resource://test-resources/mock-file-id-123'
      );

      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toBe(`${mockTargetDir}/mock-file-id-123`);
      expect(writeCall[2]).toBe('utf8');
    });

    it('should generate a JSON file when type is specified', async () => {
      mockCreateFileMetadata.mockResolvedValue({
        fileId: 'json-file-456',
        actualFilename: 'json-file-456'
      });

      const result = await tool.run({ type: 'json', size: 500 });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Type: json');

      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toBe(`${mockTargetDir}/json-file-456`);

      const content = writeCall[1] as string;
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should generate a CSV file when type is specified', async () => {
      mockCreateFileMetadata.mockResolvedValue({
        fileId: 'csv-file-789',
        actualFilename: 'csv-file-789'
      });

      const result = await tool.run({ type: 'csv', size: 300 });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Type: csv');

      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toBe(`${mockTargetDir}/csv-file-789`);

      const content = writeCall[1] as string;
      expect(content).toMatch(/^id,name,age,city,score,active,timestamp\n/);
    });

    it('should use custom filename when provided', async () => {
      const customFilename = 'my-test-file.txt';
      mockCreateFileMetadata.mockResolvedValue({
        fileId: 'custom-123',
        actualFilename: 'custom-123'
      });

      const result = await tool.run({ filename: customFilename });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain(
        'Original filename: my-test-file.txt'
      );
      expect(result.content[0].text).toContain('Saved as: custom-123');

      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(1);
      const writeCall = mockFs.writeFileSync.mock.calls[0];
      expect(writeCall[0]).toBe(`${mockTargetDir}/custom-123`);
    });

    it('should create directory if it does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await tool.run({});

      expect(result.isError).toBe(false);
      expect(mockFs.mkdirSync).toHaveBeenCalledWith(mockTargetDir, {
        recursive: true
      });
    });

    it('should respect size parameter', async () => {
      const targetSize = 200;
      const result = await tool.run({ size: targetSize });

      expect(result.isError).toBe(false);

      const writeCall = mockFs.writeFileSync.mock.calls[0];
      const content = writeCall[1] as string;
      expect(content.length).toBeLessThanOrEqual(targetSize);
      expect(content.length).toBeGreaterThan(targetSize * 0.8); // Should be reasonably close to target size
    });

    it('should handle file system errors gracefully', async () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = await tool.run({});

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Error generating data file');
      expect(result.content[0].text).toContain('Permission denied');
    });

    it('should validate input parameters', async () => {
      const result = await tool.run({ size: 15000 }); // Exceeds max size

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Error generating data file');
    });

    it('should generate different content types correctly', async () => {
      // Test text content generation
      const textResult = await tool.run({ type: 'text', size: 100 });
      expect(textResult.isError).toBe(false);

      // Test JSON content generation
      mockCreateFileMetadata.mockResolvedValueOnce({
        fileId: 'json-test-id',
        actualFilename: 'json-test-id'
      });
      const jsonResult = await tool.run({ type: 'json', size: 500 });
      expect(jsonResult.isError).toBe(false);

      // Check the JSON content (should be the last write call)
      const jsonWriteCall =
        mockFs.writeFileSync.mock.calls[
          mockFs.writeFileSync.mock.calls.length - 1
        ];
      const jsonContent = jsonWriteCall[1] as string;
      expect(() => JSON.parse(jsonContent)).not.toThrow();
      const parsed = JSON.parse(jsonContent);
      expect(Array.isArray(parsed)).toBe(true);
      if (parsed.length > 0) {
        expect(parsed[0]).toHaveProperty('id');
        expect(parsed[0]).toHaveProperty('name');
        expect(parsed[0]).toHaveProperty('age');
      }

      // Test CSV content generation
      mockCreateFileMetadata.mockResolvedValueOnce({
        fileId: 'csv-test-id',
        actualFilename: 'csv-test-id'
      });
      const csvResult = await tool.run({ type: 'csv', size: 300 });
      expect(csvResult.isError).toBe(false);

      // Check the CSV content (should be the last write call)
      const csvWriteCall =
        mockFs.writeFileSync.mock.calls[
          mockFs.writeFileSync.mock.calls.length - 1
        ];
      const csvContent = csvWriteCall[1] as string;
      const lines = csvContent.split('\n');
      expect(lines[0]).toBe('id,name,age,city,score,active,timestamp');
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('generate_data_tool');
    });

    it('should have correct description', () => {
      expect(tool.description).toContain('Generate a file with random content');
      expect(tool.description).toContain('/tmp/test-resources/');
    });

    it('should have valid input schema', () => {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.shape).toBeDefined();
    });
  });
});
