import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { NoteProcessor } from '../../src/note-processor';
import type { App, TFile, CachedMetadata } from 'obsidian';

// Mock Obsidian types
const mockApp = {
  vault: {
    read: mock(() => Promise.resolve(''))
  },
  metadataCache: {
    getFileCache: mock(() => null)
  }
} as unknown as App;

const mockFile: TFile = {
  path: 'test-note.md',
  basename: 'test-note',
  extension: 'md',
  stat: {
    ctime: 1640995200000, // 2022-01-01
    mtime: 1640995200000
  }
} as TFile;

describe('NoteProcessor', () => {
  let processor: NoteProcessor;

  beforeEach(() => {
    processor = new NoteProcessor(mockApp);
    // Reset mocks
    mock.restore();
  });

  describe('processNote', () => {
    it('should process a basic note', async () => {
      const content = `# Test Note

This is a test note with some content.

#tag1 #tag2

[[Linked Note]]`;

      mockApp.vault.read = mock(() => Promise.resolve(content));
      mockApp.metadataCache.getFileCache = mock(() => ({
        tags: [
          { tag: '#tag1', position: { start: { line: 4, col: 0, offset: 50 }, end: { line: 4, col: 5, offset: 55 } } },
          { tag: '#tag2', position: { start: { line: 4, col: 6, offset: 56 }, end: { line: 4, col: 11, offset: 61 } } }
        ],
        links: [
          { 
            link: 'Linked Note',
            displayText: 'Linked Note',
            position: { start: { line: 6, col: 0, offset: 70 }, end: { line: 6, col: 15, offset: 85 } }
          }
        ],
        headings: [
          { heading: 'Test Note', level: 1, position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 11, offset: 11 } } }
        ]
      } as CachedMetadata));

      const result = await processor.processNote(mockFile);

      expect(result.title).toBe('Test Note');
      expect(result.path).toBe('test-note.md');
      expect(result.tags).toEqual(['tag1', 'tag2']);
      expect(result.links).toHaveLength(1);
      expect(result.links[0]?.target).toBe('Linked Note');
      expect(result.headings).toHaveLength(1);
      expect(result.headings[0]?.heading).toBe('Test Note');
    });

    it('should extract title from frontmatter', async () => {
      const content = `---
title: Custom Title
tags: [research, ai]
---

# Header

Content here.`;

      mockApp.vault.read = mock(() => Promise.resolve(content));
      mockApp.metadataCache.getFileCache = mock(() => ({
        frontmatter: {
          title: 'Custom Title',
          tags: ['research', 'ai']
        }
      } as CachedMetadata));

      const result = await processor.processNote(mockFile);

      expect(result.title).toBe('Custom Title');
      expect(result.tags).toEqual(['research', 'ai']);
    });

    it('should clean content properly', async () => {
      const content = `---
title: Test
---

# Header

This is **bold** and *italic* text.
==Highlighted== text and ~~strikethrough~~.
[[Internal Link]] and [External Link](https://example.com).
#hashtag`;

      mockApp.vault.read = mock(() => Promise.resolve(content));
      mockApp.metadataCache.getFileCache = mock(() => ({
        frontmatter: { title: 'Test' }
      } as CachedMetadata));

      const result = await processor.processNote(mockFile);

      expect(result.content).not.toContain('---');
      expect(result.content).not.toContain('**');
      expect(result.content).not.toContain('*');
      expect(result.content).not.toContain('==');
      expect(result.content).not.toContain('~~');
      expect(result.content).not.toContain('[[');
      expect(result.content).not.toContain(']]');
      expect(result.content).not.toContain('#hashtag');
    });

    it('should extract blocks correctly', async () => {
      const content = `# Test Note

\`\`\`typescript
const test = 'hello';
\`\`\`

> [!note]
> This is a callout

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |`;

      mockApp.vault.read = mock(() => Promise.resolve(content));
      mockApp.metadataCache.getFileCache = mock(() => ({}));

      const result = await processor.processNote(mockFile);

      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0]?.type).toBe('code');
      expect(result.blocks[0]?.content).toContain('const test = \'hello\';');
      expect(result.blocks[1]?.type).toBe('callout');
      expect(result.blocks[2]?.type).toBe('table');
    });
  });

  describe('findNoteRelationships', () => {
    it('should find direct link relationships', async () => {
      const notes = [
        {
          title: 'Note A',
          path: 'note-a.md',
          content: 'Content A',
          tags: ['tag1'],
          links: [{ target: 'Note B', displayText: 'Note B', type: 'internal' as const, position: {} as any }],
          createdDate: Date.now(),
          modifiedDate: Date.now(),
          frontmatter: {},
          headings: [],
          blocks: []
        },
        {
          title: 'Note B',
          path: 'note-b.md',
          content: 'Content B',
          tags: ['tag2'],
          links: [],
          createdDate: Date.now(),
          modifiedDate: Date.now(),
          frontmatter: {},
          headings: [],
          blocks: []
        }
      ];

      const relationships = await processor.findNoteRelationships(notes);

      expect(relationships).toHaveLength(1);
      expect(relationships[0]?.type).toBe('direct-link');
      expect(relationships[0]?.source).toBe('note-a.md');
      expect(relationships[0]?.target).toBe('note-b.md');
      expect(relationships[0]?.strength).toBe(1.0);
    });

    it('should find shared tag relationships', async () => {
      const notes = [
        {
          title: 'Note A',
          path: 'note-a.md',
          content: 'Content A',
          tags: ['shared', 'unique1'],
          links: [],
          createdDate: Date.now(),
          modifiedDate: Date.now(),
          frontmatter: {},
          headings: [],
          blocks: []
        },
        {
          title: 'Note B',
          path: 'note-b.md',
          content: 'Content B',
          tags: ['shared', 'unique2'],
          links: [],
          createdDate: Date.now(),
          modifiedDate: Date.now(),
          frontmatter: {},
          headings: [],
          blocks: []
        }
      ];

      const relationships = await processor.findNoteRelationships(notes);

      expect(relationships).toHaveLength(1);
      expect(relationships[0]?.type).toBe('shared-tags');
      expect(relationships[0]?.strength).toBe(0.5); // 1 shared tag out of 2 total unique tags
    });

    it('should find content similarity relationships', async () => {
      const notes = [
        {
          title: 'Note A',
          path: 'note-a.md',
          content: 'artificial intelligence machine learning deep learning neural networks',
          tags: [],
          links: [],
          createdDate: Date.now(),
          modifiedDate: Date.now(),
          frontmatter: {},
          headings: [],
          blocks: []
        },
        {
          title: 'Note B',
          path: 'note-b.md',
          content: 'machine learning algorithms artificial intelligence applications',
          tags: [],
          links: [],
          createdDate: Date.now(),
          modifiedDate: Date.now(),
          frontmatter: {},
          headings: [],
          blocks: []
        }
      ];

      const relationships = await processor.findNoteRelationships(notes);

      expect(relationships).toHaveLength(1);
      expect(relationships[0]?.type).toBe('content-similarity');
      expect(relationships[0]?.strength).toBeGreaterThan(0.3);
    });
  });

  describe('processMultipleNotes', () => {
    it('should process multiple notes and handle errors', async () => {
      const files = [mockFile, { ...mockFile, path: 'error-note.md' }] as TFile[];

      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# Good Note\nContent')
        .mockRejectedValueOnce(new Error('Read error'));

      mockApp.metadataCache.getFileCache = mock(() => ({}));

      const results = await processor.processMultipleNotes(files);

      expect(results).toHaveLength(1);
      expect(results[0]?.title).toBe('Good Note');
    });
  });
});