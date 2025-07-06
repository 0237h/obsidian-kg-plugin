import { describe, it, expect, beforeEach, mock } from 'bun:test';
import KnowledgeGraphPlugin from '../../main';
import { KnowledgeGraphService } from '../../src/knowledge-graph-service';
import { NoteProcessor } from '../../src/note-processor';
import { TagManager } from '../../src/tag-manager';
import { SpaceManager } from '../../src/space-manager';
import { createMockApp, createMockFile, createMockNoteData, createMockSettings } from '../test-setup';

/**
 * Integration tests that test the full workflow from note processing to knowledge graph publishing
 */

// Mock the GRC-20 library
mock.module('@graphprotocol/grc-20', () => ({
  Graph: {
    createProperty: mock(() => ({ id: 'prop-123', ops: [{ type: 'CREATE_PROPERTY' }] })),
    createType: mock(() => ({ id: 'type-123', ops: [{ type: 'CREATE_TYPE' }] })),
    createEntity: mock(() => ({ id: 'entity-123', ops: [{ type: 'UPDATE_ENTITY' }] })),
    createRelation: mock(() => ({ ops: [{ type: 'CREATE_RELATION' }] })),
    createSpace: mock(() => Promise.resolve({ id: 'space-123' })),
    serializeDate: mock((date: Date) => date.toISOString())
  },
  Id: {
    generate: mock(() => 'generated-id-' + Math.random().toString(36).substr(2, 9))
  },
  Ipfs: {
    publishEdit: mock(() => Promise.resolve({ cid: 'QmTest123' }))
  },
  getSmartAccountWalletClient: mock(() => Promise.resolve({
    account: { address: '0x1234567890123456789012345678901234567890' },
    sendTransaction: mock(() => Promise.resolve({ hash: '0xabcdef123456' }))
  }))
}));

// Mock successful API responses
global.fetch = mock(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    to: '0x9876543210987654321098765432109876543210',
    data: '0x123abc'
  })
})) as any;

describe('Knowledge Graph Plugin Integration Tests', () => {
  let plugin: KnowledgeGraphPlugin;
  let mockApp: any;

  beforeEach(() => {
    mockApp = createMockApp();
    plugin = new KnowledgeGraphPlugin(mockApp, {
      id: 'knowledge-graph-plugin',
      name: 'Knowledge Graph Plugin',
      version: '1.0.0',
      minAppVersion: '0.15.0'
    } as any);

    // Set up plugin with test settings
    plugin.settings = createMockSettings();
    
    // Reset all mocks
    mock.restore();
  });

  describe('Full Publishing Workflow', () => {
    it('should complete full note-to-knowledge-graph workflow', async () => {
      // Setup: Create a note with rich content
      const mockFile = createMockFile('research/ai-paper.md');
      const noteContent = `---
title: "Artificial Intelligence Research"
tags: [ai, research, machine-learning]
---

# Artificial Intelligence Research

This note discusses the latest advances in **artificial intelligence** and ==machine learning==.

## Key Topics
- Neural networks
- Deep learning
- Natural language processing

Related work: [[Previous Research]] and [[Future Directions]]

#important #review`;

      // Mock the vault read operation
      mockApp.vault.read = mock(() => Promise.resolve(noteContent));
      
      // Mock metadata cache
      mockApp.metadataCache.getFileCache = mock(() => ({
        frontmatter: {
          title: 'Artificial Intelligence Research',
          tags: ['ai', 'research', 'machine-learning']
        },
        tags: [
          { tag: '#important', position: { start: { line: 13, col: 0, offset: 250 }, end: { line: 13, col: 10, offset: 260 } } },
          { tag: '#review', position: { start: { line: 13, col: 11, offset: 261 }, end: { line: 13, col: 18, offset: 268 } } }
        ],
        links: [
          { 
            link: 'Previous Research',
            displayText: 'Previous Research',
            position: { start: { line: 11, col: 15, offset: 200 }, end: { line: 11, col: 34, offset: 219 } }
          },
          {
            link: 'Future Directions',
            displayText: 'Future Directions', 
            position: { start: { line: 11, col: 39, offset: 224 }, end: { line: 11, col: 58, offset: 243 } }
          }
        ],
        headings: [
          { heading: 'Artificial Intelligence Research', level: 1, position: { start: { line: 5, col: 0, offset: 80 }, end: { line: 5, col: 35, offset: 115 } } },
          { heading: 'Key Topics', level: 2, position: { start: { line: 9, col: 0, offset: 180 }, end: { line: 9, col: 12, offset: 192 } } }
        ]
      }));

      // Mock active view
      mockApp.workspace.getActiveViewOfType = mock(() => ({
        file: mockFile
      }));

      // Initialize plugin
      await plugin.onload();

      // Execute: Publish the current note
      await plugin.publishCurrentNote();

      // Verify: Check that all services were called correctly
      
      // 1. Note should be read from vault
      expect(mockApp.vault.read).toHaveBeenCalledWith(mockFile);
      
      // 2. Metadata should be extracted
      expect(mockApp.metadataCache.getFileCache).toHaveBeenCalledWith(mockFile);
      
      // 3. GRC-20 operations should be created
      const { Graph, Ipfs } = await import('@graphprotocol/grc-20');
      
      // Properties should be created for note fields
      expect(Graph.createProperty).toHaveBeenCalledWith({ name: 'Title', dataType: 'TEXT' });
      expect(Graph.createProperty).toHaveBeenCalledWith({ name: 'Content', dataType: 'TEXT' });
      expect(Graph.createProperty).toHaveBeenCalledWith({ name: 'Tag Name', dataType: 'TEXT' });
      expect(Graph.createProperty).toHaveBeenCalledWith({ name: 'Link Target', dataType: 'TEXT' });
      
      // Types should be created
      expect(Graph.createType).toHaveBeenCalledWith({
        name: 'Obsidian Note',
        properties: expect.any(Array)
      });
      expect(Graph.createType).toHaveBeenCalledWith({
        name: 'Obsidian Tag',
        properties: expect.any(Array)
      });
      expect(Graph.createType).toHaveBeenCalledWith({
        name: 'Obsidian Link',
        properties: expect.any(Array)
      });
      
      // Entities should be created (1 note + 5 tags + 2 links = 8 entities)
      expect(Graph.createEntity).toHaveBeenCalledTimes(8);
      
      // Relations should be created (5 tag relations + 2 link relations = 7 relations)
      expect(Graph.createRelation).toHaveBeenCalledTimes(7);
      
      // 4. Content should be published to IPFS
      expect(Ipfs.publishEdit).toHaveBeenCalledWith({
        name: expect.stringContaining('Obsidian Knowledge Update'),
        ops: expect.any(Array),
        author: '0x1234567890123456789012345678901234567890',
        network: 'TESTNET'
      });
      
      // 5. API should be called for transaction data
      expect(fetch).toHaveBeenCalledWith(
        'https://test-api.com/space/test-space/edit/calldata',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid: 'QmTest123' })
        }
      );
      
      // 6. Settings should be updated with sync timestamp
      expect(plugin.settings.lastSyncTimestamp).toBeGreaterThan(0);
    });

    it('should handle batch publishing with progress tracking', async () => {
      // Setup: Multiple files with different content types
      const files = [
        createMockFile('notes/note1.md'),
        createMockFile('notes/note2.md'),
        createMockFile('excluded/note3.md')
      ];

      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockApp.vault.read = mock()
        .mockResolvedValueOnce('# Note 1\n#tag1 #shared')
        .mockResolvedValueOnce('# Note 2\n#tag2 #shared')
        .mockResolvedValueOnce('# Note 3\n#excluded');

      mockApp.metadataCache.getFileCache = mock(() => ({
        tags: [
          { tag: '#tag1', position: { start: { line: 1, col: 0, offset: 10 }, end: { line: 1, col: 5, offset: 15 } } }
        ]
      }));

      // Exclude one folder
      plugin.settings.excludedFolders = ['excluded/'];

      // Initialize plugin
      await plugin.onload();

      // Execute: Publish all notes
      await plugin.publishAllNotes();

      // Verify: Only non-excluded files should be processed
      expect(mockApp.vault.read).toHaveBeenCalledTimes(2); // Only note1 and note2
      
      const { Graph } = await import('@graphprotocol/grc-20');
      expect(Graph.createEntity).toHaveBeenCalled(); // Should create entities for processed notes
    });
  });

  describe('Error Handling Integration', () => {
    it('should gracefully handle network failures', async () => {
      const mockFile = createMockFile('test.md');
      mockApp.vault.read = mock(() => Promise.resolve('# Test Note\nContent'));
      mockApp.metadataCache.getFileCache = mock(() => ({}));
      mockApp.workspace.getActiveViewOfType = mock(() => ({ file: mockFile }));

      // Mock network failure
      global.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

      await plugin.onload();

      // Should handle the error gracefully
      await expect(plugin.publishCurrentNote()).resolves.not.toThrow();
    });

    it('should handle transaction failures with proper error messages', async () => {
      const mockFile = createMockFile('test.md');
      mockApp.vault.read = mock(() => Promise.resolve('# Test Note\nContent'));
      mockApp.metadataCache.getFileCache = mock(() => ({}));
      mockApp.workspace.getActiveViewOfType = mock(() => ({ file: mockFile }));

      // Mock transaction failure
      const { getSmartAccountWalletClient } = await import('@graphprotocol/grc-20');
      (getSmartAccountWalletClient as any).mockResolvedValue({
        account: { address: '0x123' },
        sendTransaction: mock(() => Promise.reject(new Error('execution reverted')))
      });

      await plugin.onload();

      // Should handle transaction error gracefully
      await expect(plugin.publishCurrentNote()).resolves.not.toThrow();
    });

    it('should handle malformed note content', async () => {
      const mockFile = createMockFile('malformed.md');
      mockApp.vault.read = mock(() => Promise.resolve('Malformed content without proper structure'));
      mockApp.metadataCache.getFileCache = mock(() => null); // No metadata
      mockApp.workspace.getActiveViewOfType = mock(() => ({ file: mockFile }));

      await plugin.onload();

      // Should process even malformed content
      await expect(plugin.publishCurrentNote()).resolves.not.toThrow();
    });
  });

  describe('Settings Integration', () => {
    it('should respect include/exclude settings', async () => {
      const mockFile = createMockFile('test.md');
      mockApp.vault.read = mock(() => Promise.resolve('# Test\n#tag1 [[link1]]'));
      mockApp.metadataCache.getFileCache = mock(() => ({
        tags: [{ tag: '#tag1', position: { start: { line: 1, col: 0, offset: 8 }, end: { line: 1, col: 5, offset: 13 } } }],
        links: [{ link: 'link1', displayText: 'link1', position: { start: { line: 1, col: 6, offset: 14 }, end: { line: 1, col: 13, offset: 21 } } }]
      }));
      mockApp.workspace.getActiveViewOfType = mock(() => ({ file: mockFile }));

      // Disable tags and links
      plugin.settings.includeTags = false;
      plugin.settings.includeLinks = false;

      await plugin.onload();
      await plugin.publishCurrentNote();

      const { Graph } = await import('@graphprotocol/grc-20');
      
      // Should only create note entity (no tag or link entities)
      const entityCalls = (Graph.createEntity as any).mock.calls;
      expect(entityCalls.length).toBe(1); // Only the note entity
      
      // Should not create any relations
      expect(Graph.createRelation).not.toHaveBeenCalled();
    });

    it('should use correct network settings', async () => {
      const mockFile = createMockFile('test.md');
      mockApp.vault.read = mock(() => Promise.resolve('# Test Note'));
      mockApp.metadataCache.getFileCache = mock(() => ({}));
      mockApp.workspace.getActiveViewOfType = mock(() => ({ file: mockFile }));

      // Set to mainnet
      plugin.settings.network = 'MAINNET';
      plugin.settings.apiOrigin = 'https://hypergraph-v2.up.railway.app';

      await plugin.onload();
      await plugin.publishCurrentNote();

      const { Ipfs } = await import('@graphprotocol/grc-20');
      
      // Should use mainnet in IPFS publish
      expect(Ipfs.publishEdit).toHaveBeenCalledWith({
        name: expect.any(String),
        ops: expect.any(Array),
        author: expect.any(String),
        network: 'MAINNET'
      });

      // Should call mainnet API
      expect(fetch).toHaveBeenCalledWith(
        'https://hypergraph-v2.up.railway.app/space/test-space/edit/calldata',
        expect.any(Object)
      );
    });
  });

  describe('Performance Tests', () => {
    it('should handle large notes efficiently', async () => {
      const largeContent = `# Large Note\n${'This is a large note with lots of content. '.repeat(1000)}\n${'#tag'.repeat(50)} ${'[[link]] '.repeat(50)}`;
      const mockFile = createMockFile('large-note.md');
      
      mockApp.vault.read = mock(() => Promise.resolve(largeContent));
      mockApp.metadataCache.getFileCache = mock(() => ({
        tags: Array.from({ length: 50 }, (_, i) => ({ 
          tag: `#tag${i}`, 
          position: { start: { line: 2, col: i * 5, offset: 1000 + i * 5 }, end: { line: 2, col: i * 5 + 4, offset: 1004 + i * 5 } }
        })),
        links: Array.from({ length: 50 }, (_, i) => ({
          link: `link${i}`,
          displayText: `link${i}`,
          position: { start: { line: 2, col: 500 + i * 8, offset: 1500 + i * 8 }, end: { line: 2, col: 507 + i * 8, offset: 1507 + i * 8 } }
        }))
      }));
      mockApp.workspace.getActiveViewOfType = mock(() => ({ file: mockFile }));

      const startTime = Date.now();
      
      await plugin.onload();
      await plugin.publishCurrentNote();
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });
});