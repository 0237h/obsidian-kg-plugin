/**
 * Global test setup for Obsidian Knowledge Graph Plugin tests
 */

import { afterEach, beforeEach, mock } from 'bun:test';

// Mock Obsidian globals
declare global {
  var app: any;
  var workspace: any;
  var vault: any;
  var metadataCache: any;
}

// Mock Obsidian module
mock.module('obsidian', () => ({
  Plugin: class MockPlugin {
    app: any;
    manifest: any;
    
    constructor(app: any, manifest: any) {
      this.app = app;
      this.manifest = manifest;
    }
    
    onload() {}
    onunload() {}
    loadData() { return Promise.resolve({}); }
    saveData() { return Promise.resolve(); }
    addStatusBarItem() { return { setText: mock() }; }
    addRibbonIcon() {}
    addCommand() {}
    addSettingTab() {}
    registerEvent() { return { unload: mock() }; }
  },
  
  Modal: class MockModal {
    app: any;
    contentEl: any;
    
    constructor(app: any) {
      this.app = app;
      this.contentEl = {
        empty: mock(),
        createEl: mock((tag: string, attrs?: any) => ({
          setText: mock(),
          createEl: mock(),
          style: {},
          onsubmit: null as any
        }))
      };
    }
    
    open() {}
    close() {}
    onOpen() {}
    onClose() {}
  },
  
  PluginSettingTab: class MockPluginSettingTab {
    app: any;
    plugin: any;
    containerEl: any;
    
    constructor(app: any, plugin: any) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = {
        empty: mock(),
        createEl: mock()
      };
    }
    
    display() {}
  },
  
  Setting: class MockSetting {
    constructor(containerEl: any) {}
    setName() { return this; }
    setDesc() { return this; }
    addText() { return this; }
    addTextArea() { return this; }
    addToggle() { return this; }
    addDropdown() { return this; }
    onChange() { return this; }
  },
  
  Notice: class MockNotice {
    constructor(message: string, timeout?: number) {}
  },
  
  MarkdownView: class MockMarkdownView {
    file: any;
    constructor() {}
  },
  
  TFile: class MockTFile {
    path: string = '';
    basename: string = '';
    extension: string = '';
    stat: any = { ctime: 0, mtime: 0 };
  },
  
  TFolder: class MockTFolder {
    path: string = '';
    name: string = '';
  }
}));

// Mock console methods for tests
const originalConsole = { ...console };

beforeEach(() => {
  // Reset console mocks
  console.log = mock();
  console.error = mock();
  console.warn = mock();
});

afterEach(() => {
  // Restore original console
  Object.assign(console, originalConsole);
});

// Mock global fetch if not already mocked
if (!global.fetch) {
  global.fetch = mock(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    status: 200,
    statusText: 'OK'
  })) as any;
}

// Mock localStorage
if (!global.localStorage) {
  global.localStorage = {
    getItem: mock(() => null),
    setItem: mock(),
    removeItem: mock(),
    clear: mock(),
    key: mock(() => null),
    length: 0
  };
}

// Mock crypto for ID generation
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substr(2, 9),
    getRandomValues: (arr: any) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }
  } as any;
}

// Export test utilities
export const createMockApp = () => ({
  workspace: {
    getActiveViewOfType: mock(() => null),
    on: mock(() => ({ unload: mock() }))
  },
  vault: {
    getMarkdownFiles: mock(() => []),
    read: mock(() => Promise.resolve('')),
    modify: mock(() => Promise.resolve()),
    getAbstractFileByPath: mock(() => null),
    on: mock(() => ({ unload: mock() }))
  },
  metadataCache: {
    getFileCache: mock(() => null),
    on: mock(() => ({ unload: mock() }))
  }
});

export const createMockFile = (path: string = 'test.md'): any => ({
  path,
  basename: path.replace(/\.[^/.]+$/, ''),
  extension: 'md',
  stat: {
    ctime: Date.now(),
    mtime: Date.now()
  }
});

export const createMockNoteData = (overrides: any = {}) => ({
  title: 'Test Note',
  content: 'Test content',
  path: 'test.md',
  createdDate: Date.now(),
  modifiedDate: Date.now(),
  tags: [],
  links: [],
  frontmatter: {},
  headings: [],
  blocks: [],
  ...overrides
});

export const createMockSettings = (overrides: any = {}) => ({
  privateKey: '0xtest',
  spaceId: 'test-space',
  network: 'TESTNET' as const,
  autoPublish: false,
  includeTags: true,
  includeLinks: true,
  excludedFolders: [],
  apiOrigin: 'https://test-api.com',
  lastSyncTimestamp: 0,
  ...overrides
});