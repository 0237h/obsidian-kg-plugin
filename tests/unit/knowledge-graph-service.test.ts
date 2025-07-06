import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { KnowledgeGraphService } from '../../src/knowledge-graph-service';
import { Graph, Id, Ipfs, getSmartAccountWalletClient } from '@graphprotocol/grc-20';
import type { App } from 'obsidian';
import type { NoteData, ProcessedRelation } from '../../src/types';

// Mock dependencies
mock.module('@graphprotocol/grc-20', () => ({
  Graph: {
    createProperty: mock(() => ({ id: 'prop123', ops: [{ type: 'CREATE_PROPERTY' }] })),
    createType: mock(() => ({ id: 'type123', ops: [{ type: 'CREATE_TYPE' }] })),
    createEntity: mock(() => ({ id: 'entity123', ops: [{ type: 'UPDATE_ENTITY' }] })),
    createRelation: mock(() => ({ ops: [{ type: 'CREATE_RELATION' }] })),
    serializeDate: mock((date: Date) => date.toISOString())
  },
  Id: {
    generate: mock(() => 'generated-id')
  },
  Ipfs: {
    publishEdit: mock(() => Promise.resolve({ cid: 'test-cid' }))
  },
  getSmartAccountWalletClient: mock(() => Promise.resolve({
    account: { address: '0x123' },
    sendTransaction: mock(() => Promise.resolve({ hash: '0xabcdef' }))
  }))
}));

// Mock fetch
global.fetch = mock(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({ to: '0x456', data: '0x789' })
})) as any;

const mockApp = {} as App;
const mockSettings = {
  privateKey: '0xprivatekey',
  spaceId: 'test-space',
  network: 'TESTNET',
  apiOrigin: 'https://test-api.com',
  includeTags: true,
  includeLinks: true
};

describe('KnowledgeGraphService', () => {
  let service: KnowledgeGraphService;
  let mockNoteData: NoteData;

  beforeEach(() => {
    service = new KnowledgeGraphService(mockSettings, mockApp);
    mockNoteData = {
      title: 'Test Note',
      content: 'This is test content',
      path: 'test-note.md',
      createdDate: 1640995200000,
      modifiedDate: 1640995200000,
      tags: ['ai', 'research'],
      links: [
        {
          target: 'Related Note',
          displayText: 'Related Note',
          type: 'internal',
          position: {
            start: { line: 0, col: 0, offset: 0 },
            end: { line: 0, col: 10, offset: 10 }
          }
        }
      ],
      frontmatter: {},
      headings: [],
      blocks: []
    };
    
    // Reset mocks
    mock.restore();
  });

  describe('initialize', () => {
    it('should initialize wallet client', async () => {
      await service.initialize();
      
      expect(getSmartAccountWalletClient).toHaveBeenCalledWith({
        privateKey: mockSettings.privateKey
      });
    });

    it('should not initialize twice', async () => {
      await service.initialize();
      await service.initialize();
      
      expect(getSmartAccountWalletClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('createKnowledgeEntities', () => {
    it('should create entities for note, tags, and links', async () => {
      const result = await service.createKnowledgeEntities(mockNoteData);

      expect(result.entities).toHaveLength(4); // 1 note + 2 tags + 1 link
      expect(result.relations).toHaveLength(3); // 2 tag relations + 1 link relation
      
      // Check note entity
      expect(result.entities[0]?.type).toBe('note');
      expect(result.entities[0]?.name).toBe('Test Note');
      
      // Check tag entities
      expect(result.entities[1]?.type).toBe('tag');
      expect(result.entities[1]?.name).toBe('ai');
      expect(result.entities[2]?.type).toBe('tag');
      expect(result.entities[2]?.name).toBe('research');
      
      // Check link entity
      expect(result.entities[3]?.type).toBe('link');
      expect(result.entities[3]?.name).toBe('Related Note');
    });

    it('should skip tags when includeTags is false', async () => {
      const settingsWithoutTags = { ...mockSettings, includeTags: false };
      const serviceWithoutTags = new KnowledgeGraphService(settingsWithoutTags, mockApp);
      
      const result = await serviceWithoutTags.createKnowledgeEntities(mockNoteData);

      expect(result.entities).toHaveLength(2); // 1 note + 1 link
      expect(result.relations).toHaveLength(1); // 1 link relation
    });

    it('should skip links when includeLinks is false', async () => {
      const settingsWithoutLinks = { ...mockSettings, includeLinks: false };
      const serviceWithoutLinks = new KnowledgeGraphService(settingsWithoutLinks, mockApp);
      
      const result = await serviceWithoutLinks.createKnowledgeEntities(mockNoteData);

      expect(result.entities).toHaveLength(3); // 1 note + 2 tags
      expect(result.relations).toHaveLength(2); // 2 tag relations
    });
  });

  describe('publishToKnowledgeGraph', () => {
    it('should publish successfully', async () => {
      const entities = [
        { 
          id: 'entity1', 
          type: 'note' as const, 
          name: 'Test', 
          ops: [{ 
            type: 'UPDATE_ENTITY' as const, 
            entity: { id: 'entity1', values: [] } 
          }] 
        }
      ];
      const relations: ProcessedRelation[] = [];

      //@ts-expect-error
      const result = await service.publishToKnowledgeGraph(entities, relations);

      expect(result.success).toBe(true);
      expect(result.cid).toBe('test-cid');
      expect(result.entitiesCreated).toBe(1);
      expect(result.relationsCreated).toBe(0);
      expect(typeof result.timestamp).toBe('number');
    });

    it('should handle IPFS publishing', async () => {
      const entities = [
        { 
          id: 'entity1', 
          type: 'note' as const, 
          name: 'Test', 
          ops: [{ 
            type: 'UPDATE_ENTITY' as const, 
            entity: { id: 'entity1', values: [] } 
          }] 
        }
      ];
      const relations: ProcessedRelation[] = [];

      //@ts-expect-error
      await service.publishToKnowledgeGraph(entities, relations);

      expect(Ipfs.publishEdit).toHaveBeenCalledWith({
        name: expect.stringContaining('Obsidian Knowledge Update'),
        ops: expect.any(Array),
        author: '0x123',
        network: 'TESTNET'
      });
    });

    it('should handle API calldata request', async () => {
      const entities = [
        { 
          id: 'entity1', 
          type: 'note' as const, 
          name: 'Test', 
          ops: [{ 
            type: 'UPDATE_ENTITY' as const, 
            entity: { id: 'entity1', values: [] } 
          }] 
        }
      ];
      const relations: ProcessedRelation[] = [];

      //@ts-expect-error
      await service.publishToKnowledgeGraph(entities, relations);

      expect(fetch).toHaveBeenCalledWith(
        'https://test-api.com/space/test-space/edit/calldata',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid: 'test-cid' })
        }
      );
    });

    it('should handle transaction execution errors', async () => {
      const mockWalletClient = {
        account: { address: '0x123' },
        sendTransaction: mock(() => Promise.reject(new Error('execution reverted')))
      };
      
      (getSmartAccountWalletClient as any).mockResolvedValue(mockWalletClient);

      const entities = [
        { 
          id: 'entity1', 
          type: 'note' as const, 
          name: 'Test', 
          ops: [{ 
            type: 'UPDATE_ENTITY' as const, 
            entity: { id: 'entity1', values: [] } 
          }] 
        }
      ];
      const relations: ProcessedRelation[] = [];

      //@ts-expect-error
      await expect(service.publishToKnowledgeGraph(entities, relations))
        .rejects
        .toThrow('Transaction execution failed');
    });

    it('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      const entities = [
        { 
          id: 'entity1', 
          type: 'note' as const, 
          name: 'Test', 
          ops: [{ 
            type: 'UPDATE_ENTITY' as const, 
            entity: { id: 'entity1', values: [] } 
          }] 
        }
      ];
      const relations: ProcessedRelation[] = [];

      //@ts-expect-error
      await expect(service.publishToKnowledgeGraph(entities, relations))
        .rejects
        .toThrow('Failed to get calldata: Not Found');
    });
  });

  describe('Graph API calls', () => {
    it('should create properties with correct parameters', async () => {
      await service.createKnowledgeEntities(mockNoteData);

      expect(Graph.createProperty).toHaveBeenCalledWith({
        name: 'Title',
        dataType: 'TEXT'
      });
      expect(Graph.createProperty).toHaveBeenCalledWith({
        name: 'Content',
        dataType: 'TEXT'
      });
    });

    it('should create types with property references', async () => {
      await service.createKnowledgeEntities(mockNoteData);

      expect(Graph.createType).toHaveBeenCalledWith({
        name: 'Obsidian Note',
        properties: expect.any(Array)
      });
    });

    it('should create entities with values', async () => {
      await service.createKnowledgeEntities(mockNoteData);

      expect(Graph.createEntity).toHaveBeenCalledWith({
        name: 'Test Note',
        description: expect.stringContaining('This is test content'),
        types: expect.any(Array),
        values: expect.arrayContaining([
          { property: expect.any(String), value: 'Test Note' },
          { property: expect.any(String), value: 'This is test content' }
        ])
      });
    });

    it('should create relations with correct parameters', async () => {
      await service.createKnowledgeEntities(mockNoteData);

      expect(Graph.createRelation).toHaveBeenCalledWith({
        id: 'generated-id',
        fromEntity: expect.any(String),
        toEntity: expect.any(String),
        type: expect.any(String),
        toSpace: 'test-space',
        position: expect.any(String)
      });
    });
  });
});