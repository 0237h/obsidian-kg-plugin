import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { SpaceManager } from '../../src/space-manager';
import { Graph } from '@graphprotocol/grc-20';

// Mock Graph
mock.module('@graphprotocol/grc-20', () => ({
  Graph: {
    createSpace: mock(() => Promise.resolve({ id: 'space-123' }))
  }
}));

// Mock localStorage
const mockLocalStorage = {
  setItem: mock(),
  getItem: mock(),
  removeItem: mock(),
  key: mock(),
  length: 0
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

// Mock fetch
global.fetch = mock(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    name: 'Test Space',
    description: 'A test space',
    isPublic: false,
    createdAt: 1640995200000,
    updatedAt: 1640995200000,
    memberCount: 1,
    governance: 'PERSONAL',
    entityCount: 5,
    relationCount: 3,
    lastUpdate: 1640995200000
  })
})) as any;

const mockSettings = {
  network: 'TESTNET' as const,
  privateKey: '0xprivatekey',
  apiOrigin: 'https://test-api.com'
};

describe('SpaceManager', () => {
  let spaceManager: SpaceManager;

  beforeEach(() => {
    spaceManager = new SpaceManager(mockSettings);
    // Reset mocks
    mock.restore();
    mockLocalStorage.length = 0;
  });

  describe('createSpace', () => {
    it('should create a new space successfully', async () => {
      const spaceId = await spaceManager.createSpace('My Test Space', 'A space for testing');

      expect(spaceId).toBe('space-123');
      expect(Graph.createSpace).toHaveBeenCalledWith({
        editorAddress: '0x0000000000000000000000000000000000000000',
        name: 'my-test-space',
        network: 'TESTNET'
      });
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'kg_space_space-123',
        expect.stringContaining('my-test-space')
      );
    });

    it('should sanitize space names', async () => {
      await spaceManager.createSpace('My Test Space!@#$%^&*()');

      expect(Graph.createSpace).toHaveBeenCalledWith({
        editorAddress: expect.any(String),
        name: 'my-test-space',
        network: 'TESTNET'
      });
    });

    it('should handle space creation errors', async () => {
      (Graph.createSpace as any).mockRejectedValue(new Error('Creation failed'));

      await expect(spaceManager.createSpace('Test Space'))
        .rejects
        .toThrow('Failed to create space: Creation failed');
    });

    it('should truncate long space names', async () => {
      const longName = 'a'.repeat(100);
      await spaceManager.createSpace(longName);

      expect(Graph.createSpace).toHaveBeenCalledWith({
        editorAddress: expect.any(String),
        name: 'a'.repeat(50),
        network: 'TESTNET'
      });
    });
  });

  describe('getSpaceDetails', () => {
    it('should fetch space details from API', async () => {
      const details = await spaceManager.getSpaceDetails('space-123');

      expect(details).toEqual({
        id: 'space-123',
        name: 'Test Space',
        description: 'A test space',
        isPublic: false,
        createdAt: 1640995200000,
        updatedAt: 1640995200000,
        memberCount: 1,
        governance: 'PERSONAL'
      });
      expect(fetch).toHaveBeenCalledWith('https://test-api.com/space/space-123');
    });

    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      const details = await spaceManager.getSpaceDetails('invalid-space');

      expect(details).toBeNull();
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const details = await spaceManager.getSpaceDetails('space-123');

      expect(details).toBeNull();
    });
  });

  describe('getSpaceStats', () => {
    it('should fetch space statistics', async () => {
      const stats = await spaceManager.getSpaceStats('space-123');

      expect(stats).toEqual({
        entityCount: 5,
        relationCount: 3,
        lastUpdate: 1640995200000
      });
      expect(fetch).toHaveBeenCalledWith('https://test-api.com/space/space-123/stats');
    });

    it('should return default stats on error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API error'));

      const stats = await spaceManager.getSpaceStats('space-123');

      expect(stats).toEqual({
        entityCount: 0,
        relationCount: 0,
        lastUpdate: 0
      });
    });
  });

  describe('validateSpace', () => {
    it('should validate existing space', async () => {
      const isValid = await spaceManager.validateSpace('space-123');

      expect(isValid).toBe(true);
    });

    it('should return false for invalid space', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      const isValid = await spaceManager.validateSpace('invalid-space');

      expect(isValid).toBe(false);
    });
  });

  describe('joinSpace', () => {
    it('should join valid space', async () => {
      const result = await spaceManager.joinSpace('space-123', 'invite-code');

      expect(result).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'kg_space_space-123',
        expect.stringContaining('Joined Space')
      );
    });

    it('should fail to join invalid space', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      const result = await spaceManager.joinSpace('invalid-space');

      expect(result).toBe(false);
      expect(mockLocalStorage.setItem).not.toHaveBeenCalled();
    });
  });

  describe('leaveSpace', () => {
    it('should leave space successfully', async () => {
      const result = await spaceManager.leaveSpace('space-123');

      expect(result).toBe(true);
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('kg_space_space-123');
    });
  });

  describe('generateInviteCode', () => {
    it('should generate invite code', async () => {
      const inviteCode = await spaceManager.generateInviteCode('space-123');

      expect(inviteCode).toMatch(/^invite_space-123_\d+$/);
    });
  });

  describe('listSpaces', () => {
    it('should list stored spaces', async () => {
      mockLocalStorage.length = 2;
      mockLocalStorage.key = mock()
        .mockReturnValueOnce('kg_space_space-1')
        .mockReturnValueOnce('kg_space_space-2');
      
      mockLocalStorage.getItem = mock()
        .mockReturnValueOnce(JSON.stringify({
          id: 'space-1',
          name: 'Space 1',
          updatedAt: 1640995200000
        }))
        .mockReturnValueOnce(JSON.stringify({
          id: 'space-2',
          name: 'Space 2',
          updatedAt: 1640995300000
        }));

      const spaces = await spaceManager.listSpaces();

      expect(spaces).toHaveLength(2);
      expect(spaces[0]?.name).toBe('Space 2'); // Should be sorted by updatedAt desc
      expect(spaces[1]?.name).toBe('Space 1');
    });

    it('should handle empty storage', async () => {
      mockLocalStorage.length = 0;

      const spaces = await spaceManager.listSpaces();

      expect(spaces).toHaveLength(0);
    });

    it('should handle corrupted storage data', async () => {
      mockLocalStorage.length = 1;
      mockLocalStorage.key = mock().mockReturnValue('kg_space_space-1');
      mockLocalStorage.getItem = mock().mockReturnValue('invalid-json');

      const spaces = await spaceManager.listSpaces();

      expect(spaces).toHaveLength(0);
    });
  });

  describe('exportSpaceData', () => {
    it('should export space data', async () => {
      const exportData = await spaceManager.exportSpaceData('space-123');

      expect(exportData).toEqual({
        spaceId: 'space-123',
        metadata: expect.objectContaining({
          id: 'space-123',
          name: 'Test Space'
        }),
        stats: expect.objectContaining({
          entityCount: 5,
          relationCount: 3
        }),
        exportedAt: expect.any(Number)
      });
    });

    it('should handle export errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Export failed'));

      await expect(spaceManager.exportSpaceData('space-123'))
        .rejects
        .toThrow('Failed to export space data: Export failed');
    });
  });

  describe('importSpaceData', () => {
    it('should import space data', async () => {
      const importData = {
        metadata: {
          name: 'Imported Space',
          description: 'Imported from backup'
        }
      };

      const newSpaceId = await spaceManager.importSpaceData(importData);

      expect(newSpaceId).toBe('space-123');
      expect(Graph.createSpace).toHaveBeenCalledWith({
        editorAddress: expect.any(String),
        name: 'imported-space',
        network: 'TESTNET'
      });
    });

    it('should handle missing metadata', async () => {
      const importData = {};

      const newSpaceId = await spaceManager.importSpaceData(importData);

      expect(newSpaceId).toBe('space-123');
      expect(Graph.createSpace).toHaveBeenCalledWith({
        editorAddress: expect.any(String),
        name: 'imported-space',
        network: 'TESTNET'
      });
    });
  });

  describe('network configuration', () => {
    it('should use testnet configuration by default', () => {
      const manager = new SpaceManager(mockSettings);
      
      // Access private method through any cast for testing
      const config = (manager as any).getNetworkConfig();
      
      expect(config.name).toBe('TESTNET');
      expect(config.apiOrigin).toBe('https://hypergraph-v2-testnet.up.railway.app');
      expect(config.chainId).toBe(421614);
    });

    it('should use mainnet configuration when specified', () => {
      const mainnetSettings = { ...mockSettings, network: 'MAINNET' as const };
      const manager = new SpaceManager(mainnetSettings);
      
      const config = (manager as any).getNetworkConfig();
      
      expect(config.name).toBe('MAINNET');
      expect(config.apiOrigin).toBe('https://hypergraph-v2.up.railway.app');
      expect(config.chainId).toBe(42161);
    });
  });

  describe('storage operations', () => {
    it('should handle localStorage unavailability', async () => {
      // Temporarily remove localStorage
      const originalLocalStorage = globalThis.localStorage;
      delete (globalThis as any).localStorage;

      // These should not throw errors
      await spaceManager.createSpace('Test Space');
      const spaces = await spaceManager.listSpaces();
      await spaceManager.leaveSpace('space-123');

      expect(spaces).toHaveLength(0);

      // Restore localStorage
      (globalThis as any).localStorage = originalLocalStorage;
    });
  });
});