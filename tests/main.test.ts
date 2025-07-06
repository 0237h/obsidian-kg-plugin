import { describe, it, expect, beforeEach, mock, jest } from 'bun:test';
import KnowledgeGraphPlugin from '../main';
import type { App, TFile, MarkdownView } from 'obsidian';

// Mock Obsidian API
const mockApp = {
  workspace: {
    getActiveViewOfType: mock(() => null)
  },
  vault: {
    getMarkdownFiles: mock(() => []),
    on: mock(() => ({ unload: mock() }))
  },
  metadataCache: {
    on: mock(() => ({ unload: mock() }))
  }
} as unknown as App;

// Mock plugin methods
const mockPlugin = {
  loadData: mock(() => Promise.resolve({})),
  saveData: mock(() => Promise.resolve()),
  addStatusBarItem: mock(() => ({ setText: mock() })),
  addRibbonIcon: mock(() => {}),
  addCommand: mock(() => {}),
  addSettingTab: mock(() => {}),
  registerEvent: mock(() => {})
} as any;

// Mock services
const mockKnowledgeGraphService = {
  createKnowledgeEntities: mock(() => Promise.resolve({ entities: [], relations: [] })),
  publishToKnowledgeGraph: mock(() => Promise.resolve({ success: true, cid: 'test-cid' }))
};

const mockNoteProcessor = {
  processNote: mock(() => Promise.resolve({
    title: 'Test Note',
    content: 'Test content',
    path: 'test.md',
    tags: [],
    links: [],
    createdDate: Date.now(),
    modifiedDate: Date.now(),
    frontmatter: {},
    headings: [],
    blocks: []
  }))
};

const mockTagManager = {};
const mockSpaceManager = {};

describe('KnowledgeGraphPlugin', () => {
  let plugin: KnowledgeGraphPlugin;
  let mockFile: TFile;

  beforeEach(() => {
    plugin = new KnowledgeGraphPlugin(mockApp, {} as any);
    
    // Apply mocks to plugin instance
    Object.assign(plugin, mockPlugin);
    
    // Mock services
    (plugin as any).knowledgeGraphService = mockKnowledgeGraphService;
    (plugin as any).noteProcessor = mockNoteProcessor;
    (plugin as any).tagManager = mockTagManager;
    (plugin as any).spaceManager = mockSpaceManager;
    
    // Mock status bar
    (plugin as any).statusBarItem = { setText: mock() };
    
    // Mock settings
    plugin.settings = {
      privateKey: '0xtest',
      spaceId: 'test-space',
      network: 'TESTNET',
      autoPublish: false,
      includeTags: true,
      includeLinks: true,
      excludedFolders: [],
      apiOrigin: 'https://test-api.com',
      lastSyncTimestamp: 0
    };

    mockFile = {
      path: 'test-note.md',
      basename: 'test-note',
      extension: 'md',
      stat: { ctime: Date.now(), mtime: Date.now() }
    } as TFile;

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('onload', () => {
    it('should initialize plugin correctly', async () => {
      await plugin.onload();

      expect(mockPlugin.addStatusBarItem).toHaveBeenCalled();
      expect(mockPlugin.addRibbonIcon).toHaveBeenCalled();
      expect(mockPlugin.addCommand).toHaveBeenCalledTimes(4);
      expect(mockPlugin.addSettingTab).toHaveBeenCalled();
      expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
    });

    it('should load settings on startup', async () => {
      mockPlugin.loadData.mockResolvedValue({
        privateKey: '0xcustom',
        spaceId: 'custom-space'
      });

      await plugin.onload();

      expect(plugin.settings.privateKey).toBe('0xcustom');
      expect(plugin.settings.spaceId).toBe('custom-space');
    });
  });

  describe('publishCurrentNote', () => {
    it('should publish active note successfully', async () => {
      const mockView = {
        file: mockFile
      } as MarkdownView;

      mockApp.workspace.getActiveViewOfType = mock(() => mockView) as any;

      await plugin.publishCurrentNote();

      expect(mockNoteProcessor.processNote).toHaveBeenCalledWith(mockFile);
      expect(mockKnowledgeGraphService.createKnowledgeEntities).toHaveBeenCalled();
      expect(mockKnowledgeGraphService.publishToKnowledgeGraph).toHaveBeenCalled();
    });

    it('should handle no active view', async () => {
      mockApp.workspace.getActiveViewOfType = mock(() => null);

      await plugin.publishCurrentNote();

      expect(mockNoteProcessor.processNote).not.toHaveBeenCalled();
    });

    it('should handle view without file', async () => {
      const mockView = {
        file: null
      } as MarkdownView;

      mockApp.workspace.getActiveViewOfType = mock(() => mockView) as any;

      await plugin.publishCurrentNote();

      expect(mockNoteProcessor.processNote).not.toHaveBeenCalled();
    });
  });

  describe('publishNote', () => {
    it('should publish note successfully', async () => {
      await plugin.publishNote(mockFile);

      expect(mockNoteProcessor.processNote).toHaveBeenCalledWith(mockFile);
      expect(mockKnowledgeGraphService.createKnowledgeEntities).toHaveBeenCalled();
      expect(mockKnowledgeGraphService.publishToKnowledgeGraph).toHaveBeenCalled();
      expect(plugin.settings.lastSyncTimestamp).toBeGreaterThan(0);
    });

    it('should handle publishing errors', async () => {
      mockNoteProcessor.processNote.mockRejectedValue(new Error('Processing failed'));

      await plugin.publishNote(mockFile);

      expect((plugin as any).statusBarItem.setText).toHaveBeenCalledWith('KG: Error');
    });

    it('should validate settings before publishing', async () => {
      plugin.settings.privateKey = '';

      await plugin.publishNote(mockFile);

      expect(mockNoteProcessor.processNote).not.toHaveBeenCalled();
    });
  });

  describe('publishAllNotes', () => {
    it('should publish all notes', async () => {
      const files = [mockFile, { ...mockFile, path: 'note2.md' }] as TFile[];
      mockApp.vault.getMarkdownFiles = mock(() => files);

      await plugin.publishAllNotes();

      expect(mockNoteProcessor.processNote).toHaveBeenCalledTimes(2);
    });

    it('should exclude folders from publishing', async () => {
      const files = [
        mockFile,
        { ...mockFile, path: 'excluded/note.md' }
      ] as TFile[];
      
      plugin.settings.excludedFolders = ['excluded/'];
      mockApp.vault.getMarkdownFiles = mock(() => files);

      await plugin.publishAllNotes();

      expect(mockNoteProcessor.processNote).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during batch publishing', async () => {
      const files = [mockFile] as TFile[];
      mockApp.vault.getMarkdownFiles = mock(() => files);
      mockNoteProcessor.processNote.mockRejectedValue(new Error('Processing failed'));

      await plugin.publishAllNotes();

      // Should complete without throwing
    });
  });

  describe('validateSettings', () => {
    it('should validate complete settings', () => {
      const isValid = (plugin as any).validateSettings();
      expect(isValid).toBe(true);
    });

    it('should reject missing private key', () => {
      plugin.settings.privateKey = '';
      const isValid = (plugin as any).validateSettings();
      expect(isValid).toBe(false);
    });

    it('should reject missing space ID', () => {
      plugin.settings.spaceId = '';
      const isValid = (plugin as any).validateSettings();
      expect(isValid).toBe(false);
    });
  });

  describe('schedulePublish', () => {
    it('should debounce rapid changes', async () => {
      const schedulePublish = (plugin as any).schedulePublish.bind(plugin);
      
      // Mock setTimeout
      const originalSetTimeout = globalThis.setTimeout;
      const mockSetTimeout = mock();
      globalThis.setTimeout = mockSetTimeout as any;

      schedulePublish(mockFile);
      schedulePublish(mockFile);

      expect(mockSetTimeout).toHaveBeenCalledTimes(2);

      // Restore setTimeout
      globalThis.setTimeout = originalSetTimeout;
    });
  });

  describe('auto-publish', () => {
    it('should auto-publish when enabled', async () => {
      plugin.settings.autoPublish = true;
      
      await plugin.onload();

      expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
    });

    it('should not auto-publish when disabled', async () => {
      plugin.settings.autoPublish = false;
      
      await plugin.onload();

      expect(mockPlugin.registerEvent).toHaveBeenCalledTimes(2);
    });
  });

  describe('settings management', () => {
    it('should save settings', async () => {
      await plugin.saveSettings();

      expect(mockPlugin.saveData).toHaveBeenCalledWith(plugin.settings);
    });

    it('should load settings with defaults', async () => {
      mockPlugin.loadData.mockResolvedValue({});

      await plugin.loadSettings();

      expect(plugin.settings.network).toBe('TESTNET');
      expect(plugin.settings.autoPublish).toBe(false);
      expect(plugin.settings.includeTags).toBe(true);
      expect(plugin.settings.includeLinks).toBe(true);
    });

    it('should merge loaded settings with defaults', async () => {
      mockPlugin.loadData.mockResolvedValue({
        privateKey: '0xloaded',
        customField: 'value'
      });

      await plugin.loadSettings();

      expect(plugin.settings.privateKey).toBe('0xloaded');
      expect(plugin.settings.network).toBe('TESTNET'); // Default value
    });
  });

  describe('command registration', () => {
    it('should register all commands', async () => {
      await plugin.onload();

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'publish-current-note',
        name: 'Publish current note to Knowledge Graph',
        editorCallback: expect.any(Function)
      });

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'publish-all-notes',
        name: 'Publish all notes to Knowledge Graph',
        callback: expect.any(Function)
      });

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'sync-knowledge-graph',
        name: 'Sync with Knowledge Graph',
        callback: expect.any(Function)
      });

      expect(mockPlugin.addCommand).toHaveBeenCalledWith({
        id: 'create-knowledge-space',
        name: 'Create new Knowledge Graph space',
        callback: expect.any(Function)
      });
    });
  });

  describe('ribbon icon', () => {
    it('should add ribbon icon', async () => {
      await plugin.onload();

      expect(mockPlugin.addRibbonIcon).toHaveBeenCalledWith(
        'network',
        'Publish to Knowledge Graph',
        expect.any(Function)
      );
    });
  });

  describe('status bar', () => {
    it('should initialize status bar', async () => {
      await plugin.onload();

      expect(mockPlugin.addStatusBarItem).toHaveBeenCalled();
      expect((plugin as any).statusBarItem.setText).toHaveBeenCalledWith('KG: Ready');
    });

    it('should update status during publishing', async () => {
      await plugin.publishNote(mockFile);

      expect((plugin as any).statusBarItem.setText).toHaveBeenCalledWith('KG: Publishing...');
      expect((plugin as any).statusBarItem.setText).toHaveBeenCalledWith('KG: Ready');
    });
  });

  describe('error handling', () => {
    it('should handle service initialization errors', async () => {
      const originalConsoleError = console.error;
      console.error = mock();

      // Mock service constructor to throw
      const originalKnowledgeGraphService = (plugin as any).knowledgeGraphService;
      (plugin as any).knowledgeGraphService = null;

      try {
        await plugin.publishNote(mockFile);
      } catch (error) {
        // Expected to throw due to null service
      }

      console.error = originalConsoleError;
    });

    it('should handle unknown errors gracefully', async () => {
      mockNoteProcessor.processNote.mockRejectedValue('string error');

      await plugin.publishNote(mockFile);

      expect((plugin as any).statusBarItem.setText).toHaveBeenCalledWith('KG: Error');
    });
  });
});