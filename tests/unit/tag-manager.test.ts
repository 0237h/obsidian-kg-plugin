import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { TagManager } from '../../src/tag-manager';
import type { App, TFile } from 'obsidian';

const mockApp = {
  vault: {
    getMarkdownFiles: mock(() => []),
    read: mock(() => Promise.resolve('')),
    modify: mock(() => Promise.resolve()),
    getAbstractFileByPath: mock(() => null)
  }
} as unknown as App;

const mockFile: TFile = {
  path: 'test-note.md',
  basename: 'test-note',
  extension: 'md',
  stat: {
    ctime: 1640995200000,
    mtime: 1640995200000
  }
} as TFile;

describe('TagManager', () => {
  let tagManager: TagManager;

  beforeEach(() => {
    tagManager = new TagManager(mockApp);
    // Reset mocks
    mock.restore();
  });

  describe('getAllTags', () => {
    it('should return all tags sorted by frequency', async () => {
      const files = [mockFile, { ...mockFile, path: 'note2.md' }] as TFile[];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# Note 1\n#ai #research')
        .mockResolvedValueOnce('# Note 2\n#ai #machine-learning');

      const tags = await tagManager.getAllTags();

      expect(tags).toHaveLength(3);
      expect(tags[0]?.name).toBe('ai');
      expect(tags[0]?.count).toBe(2);
      expect(tags[1]?.count).toBe(1);
      expect(tags[2]?.count).toBe(1);
    });

    it('should handle frontmatter tags', async () => {
      const files = [mockFile];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock(() => Promise.resolve(`---
tags: [frontend, javascript]
---

# Test Note
Content here.`));

      const tags = await tagManager.getAllTags();

      expect(tags).toHaveLength(2);
      expect(tags.map(t => t.name)).toContain('frontend');
      expect(tags.map(t => t.name)).toContain('javascript');
    });
  });

  describe('getTagMetadata', () => {
    it('should return specific tag metadata', async () => {
      const files = [mockFile];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock(() => Promise.resolve('# Note\n#ai #research'));

      const tagMetadata = await tagManager.getTagMetadata('ai');

      expect(tagMetadata).not.toBeNull();
      expect(tagMetadata!.name).toBe('ai');
      expect(tagMetadata!.count).toBe(1);
      expect(tagMetadata!.notes).toContain('test-note.md');
    });

    it('should return null for non-existent tag', async () => {
      mockApp.vault.getMarkdownFiles = mock(() => []);

      const tagMetadata = await tagManager.getTagMetadata('nonexistent');

      expect(tagMetadata).toBeNull();
    });
  });

  describe('getRelatedTags', () => {
    it('should find tags that co-occur with target tag', async () => {
      const files = [
        mockFile,
        { ...mockFile, path: 'note2.md' },
        { ...mockFile, path: 'note3.md' }
      ] as TFile[];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# Note 1\n#ai #research')
        .mockResolvedValueOnce('# Note 2\n#ai #machine-learning')
        .mockResolvedValueOnce('# Note 3\n#research #academic');

      const relatedTags = await tagManager.getRelatedTags('ai');

      expect(relatedTags).toHaveLength(2);
      expect(relatedTags[0]?.tag).toBe('research');
      expect(relatedTags[0]?.strength).toBe(0.5); // 1 overlap out of 2 max
      expect(relatedTags[1]?.tag).toBe('machine-learning');
      expect(relatedTags[1]?.strength).toBe(0.5);
    });
  });

  describe('suggestTagsForNote', () => {
    it('should suggest relevant tags based on content', async () => {
      const files = [
        { ...mockFile, path: 'existing1.md' },
        { ...mockFile, path: 'existing2.md' }
      ] as TFile[];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# AI Research\n#ai #research')
        .mockResolvedValueOnce('# Machine Learning\n#machine-learning #ai')
        .mockResolvedValueOnce('This note discusses artificial intelligence and machine learning concepts.');

      const suggestions = await tagManager.suggestTagsForNote(mockFile);

      expect(suggestions).toContain('ai');
      expect(suggestions).toContain('machine-learning');
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getTagHierarchy', () => {
    it('should build hierarchical tag structure', async () => {
      const files = [mockFile];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock(() => Promise.resolve('# Note\n#tech/ai #tech/web #personal'));

      const hierarchy = await tagManager.getTagHierarchy();

      expect(hierarchy).toHaveProperty('tech');
      expect(hierarchy.tech).toContain('tech/ai');
      expect(hierarchy.tech).toContain('tech/web');
      expect(hierarchy).not.toHaveProperty('personal');
    });
  });

  describe('renameTag', () => {
    it('should rename tag across all files', async () => {
      const files = [
        mockFile,
        { ...mockFile, path: 'note2.md' }
      ] as TFile[];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# Note 1\n#oldtag #other')
        .mockResolvedValueOnce('# Note 2\n#different #oldtag');

      const result = await tagManager.renameTag('oldtag', 'newtag');

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toHaveLength(2);
      expect(mockApp.vault.modify).toHaveBeenCalledTimes(2);
    });

    it('should not modify files without the target tag', async () => {
      const files = [mockFile];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock(() => Promise.resolve('# Note\n#different #other'));

      const result = await tagManager.renameTag('oldtag', 'newtag');

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toHaveLength(0);
      expect(mockApp.vault.modify).not.toHaveBeenCalled();
    });
  });

  describe('deleteTag', () => {
    it('should remove tag from all files', async () => {
      const files = [mockFile];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock(() => Promise.resolve('# Note\n#delete-me #keep-me'));

      const result = await tagManager.deleteTag('delete-me');

      expect(result.success).toBe(true);
      expect(result.updatedFiles).toHaveLength(1);
      expect(mockApp.vault.modify).toHaveBeenCalledWith(
        mockFile,
        expect.not.stringContaining('#delete-me')
      );
    });
  });

  describe('getTagStatistics', () => {
    it('should calculate tag statistics', async () => {
      const files = [
        mockFile,
        { ...mockFile, path: 'note2.md' }
      ] as TFile[];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# Note 1\n#ai #research')
        .mockResolvedValueOnce('# Note 2\n#ai #tech/web');

      const stats = await tagManager.getTagStatistics();

      expect(stats.totalTags).toBe(3);
      expect(stats.totalUsage).toBe(4);
      expect(stats.averageTagsPerNote).toBe(2);
      expect(stats.mostUsedTag).toBe('ai');
      expect(stats.hierarchicalTags).toBe(1);
    });

    it('should handle empty vault', async () => {
      mockApp.vault.getMarkdownFiles = mock(() => []);

      const stats = await tagManager.getTagStatistics();

      expect(stats.totalTags).toBe(0);
      expect(stats.totalUsage).toBe(0);
      expect(stats.averageTagsPerNote).toBe(0);
      expect(stats.mostUsedTag).toBe('');
      expect(stats.leastUsedTag).toBe('');
    });
  });

  describe('getTopTagPairs', () => {
    it('should find frequently co-occurring tag pairs', async () => {
      const files = [
        mockFile,
        { ...mockFile, path: 'note2.md' },
        { ...mockFile, path: 'note3.md' }
      ] as TFile[];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# Note 1\n#ai #research')
        .mockResolvedValueOnce('# Note 2\n#ai #research')
        .mockResolvedValueOnce('# Note 3\n#ai #machine-learning');

      const pairs = await tagManager.getTopTagPairs(5);

      expect(pairs).toHaveLength(2);
      expect(pairs[0]?.tag1).toBe('ai');
      expect(pairs[0]?.tag2).toBe('research');
      expect(pairs[0]?.count).toBe(2);
    });
  });

  describe('generateTagColor', () => {
    it('should generate consistent colors', async () => {
      const files = [mockFile];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock(() => Promise.resolve('# Note\n#test'));

      const tags = await tagManager.getAllTags();
      const tag = tags[0];
      const tagColor = tag?.color;

      expect(tagColor).toBeDefined();
      expect(tagColor).toMatch(/^#[0-9A-F]{6}$/i);

      if (!tagColor)
        return;
      
      // Should be consistent
      const tags2 = await tagManager.getAllTags();
      expect(tags2[0]?.color).toBe(tagColor);
    });
  });

  describe('cache management', () => {
    it('should refresh cache after modifications', async () => {
      const files = [mockFile];
      
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock(() => Promise.resolve('# Note\n#test'));

      // First call
      await tagManager.getAllTags();
      expect(mockApp.vault.read).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await tagManager.getAllTags();
      expect(mockApp.vault.read).toHaveBeenCalledTimes(1);

      // After rename, cache should be cleared
      await tagManager.renameTag('test', 'newtest');
      await tagManager.getAllTags();
      expect(mockApp.vault.read).toHaveBeenCalledTimes(3); // 1 initial + 1 for rename + 1 for refresh
    });
  });
});