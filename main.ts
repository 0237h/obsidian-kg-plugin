import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, type MarkdownFileInfo } from 'obsidian';
// import { Graph, Id, Ipfs, getSmartAccountWalletClient } from '@graphprotocol/grc-20';
import { KnowledgeGraphService } from './src/knowledge-graph-service';
import { NoteProcessor } from './src/note-processor';
import { TagManager } from './src/tag-manager';
import { SpaceManager } from './src/space-manager';

interface KnowledgeGraphSettings {
  privateKey: string;
  spaceId: string;
  network: 'MAINNET' | 'TESTNET';
  autoPublish: boolean;
  includeTags: boolean;
  includeLinks: boolean;
  excludedFolders: string[];
  apiOrigin: string;
  lastSyncTimestamp: number;
}

const DEFAULT_SETTINGS: KnowledgeGraphSettings = {
  privateKey: '',
  spaceId: '',
  network: 'TESTNET',
  autoPublish: false,
  includeTags: true,
  includeLinks: true,
  excludedFolders: [],
  apiOrigin: 'https://hypergraph-v2-testnet.up.railway.app',
  lastSyncTimestamp: 0
};

export default class KnowledgeGraphPlugin extends Plugin {
  settings!: KnowledgeGraphSettings;
  knowledgeGraphService!: KnowledgeGraphService;
  noteProcessor!: NoteProcessor;
  tagManager!: TagManager;
  spaceManager!: SpaceManager;
  statusBarItem!: HTMLElement;

  override async onload() {
    await this.loadSettings();

    // Initialize services
    this.knowledgeGraphService = new KnowledgeGraphService(this.settings, this.app);
    this.noteProcessor = new NoteProcessor(this.app);
    this.tagManager = new TagManager(this.app);
    this.spaceManager = new SpaceManager(this.settings);

    // Add status bar item
    this.statusBarItem = this.addStatusBarItem();
    this.statusBarItem.setText('KG: Ready');

    // Add ribbon icon
    this.addRibbonIcon('network', 'Publish to Knowledge Graph', () => {
      this.publishCurrentNote();
    });

    // Add commands
    this.addCommand({
      id: 'publish-current-note',
      name: 'Publish current note to Knowledge Graph',
      editorCallback: (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
        this.publishCurrentNote();
      }
    });

    this.addCommand({
      id: 'publish-all-notes',
      name: 'Publish all notes to Knowledge Graph',
      callback: () => {
        this.publishAllNotes();
      }
    });

    this.addCommand({
      id: 'sync-knowledge-graph',
      name: 'Sync with Knowledge Graph',
      callback: () => {
        this.syncWithKnowledgeGraph();
      }
    });

    this.addCommand({
      id: 'create-knowledge-space',
      name: 'Create new Knowledge Graph space',
      callback: () => {
        this.createNewSpace();
      }
    });

    // Add settings tab
    this.addSettingTab(new KnowledgeGraphSettingsTab(this.app, this));

    // Register file events for auto-publish
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (this.settings.autoPublish && file instanceof TFile && file.extension === 'md') {
          this.schedulePublish(file);
        }
      })
    );

    // Register tag events
    this.registerEvent(
      this.app.metadataCache.on('changed', (file) => {
        if (this.settings.autoPublish && file instanceof TFile) {
          this.schedulePublish(file);
        }
      })
    );

    console.log('Knowledge Graph Publisher plugin loaded');
  }

  override onunload() {
    console.log('Knowledge Graph Publisher plugin unloaded');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async publishCurrentNote() {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice('No active markdown file');
      return;
    }

    const file = activeView.file;
    if (!file) {
      new Notice('No file selected');
      return;
    }

    await this.publishNote(file);
  }

  async publishNote(file: TFile) {
    if (!this.validateSettings()) {
      return;
    }

    try {
      this.statusBarItem.setText('KG: Publishing...');
      
      // Process the note
      const noteData = await this.noteProcessor.processNote(file);
      
      // Create entities and relations
      const { entities, relations } = await this.knowledgeGraphService.createKnowledgeEntities(noteData);
      
      // Publish to IPFS and Knowledge Graph
      const result = await this.knowledgeGraphService.publishToKnowledgeGraph(entities, relations);
      
      new Notice(`Successfully published "${file.basename}" to Knowledge Graph`);
      this.statusBarItem.setText('KG: Ready');
      
      // Update last sync timestamp
      this.settings.lastSyncTimestamp = Date.now();
      await this.saveSettings();
      
    } catch (error) {
      console.error('Error publishing note:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      new Notice(`Error publishing note: ${errorMessage}`);
      this.statusBarItem.setText('KG: Error');
    }
  }

  async publishAllNotes() {
    if (!this.validateSettings()) {
      return;
    }

    const files = this.app.vault.getMarkdownFiles();
    const filteredFiles = files.filter(file => 
      !this.settings.excludedFolders.some(folder => file.path.startsWith(folder))
    );

    const modal = new PublishProgressModal(this.app, filteredFiles.length);
    modal.open();

    let published = 0;
    let errors = 0;

    for (const file of filteredFiles) {
      try {
        await this.publishNote(file);
        published++;
        modal.updateProgress(published, errors);
      } catch (error) {
        errors++;
        console.error(`Error publishing ${file.path}:`, error);
        modal.updateProgress(published, errors);
      }
    }

    modal.close();
    new Notice(`Published ${published} notes with ${errors} errors`);
  }

  async syncWithKnowledgeGraph() {
    // TODO: Implement bidirectional sync
    new Notice('Sync functionality coming soon!');
  }

  async createNewSpace() {
    const modal = new CreateSpaceModal(this.app, this.spaceManager, (spaceId) => {
      this.settings.spaceId = spaceId;
      this.saveSettings();
      new Notice(`Created new space: ${spaceId}`);
    });
    modal.open();
  }

  private validateSettings(): boolean {
    if (!this.settings.privateKey) {
      new Notice('Please configure your private key in settings');
      return false;
    }
    if (!this.settings.spaceId) {
      new Notice('Please configure your space ID in settings');
      return false;
    }
    return true;
  }

  private schedulePublish(file: TFile) {
    // Debounce rapid changes
    clearTimeout((this as any).publishTimer);
    (this as any).publishTimer = setTimeout(() => {
      this.publishNote(file);
    }, 5000); // 5 second delay
  }
}

class PublishProgressModal extends Modal {
  private total: number;
  private progressEl!: HTMLElement;
  private statusEl!: HTMLElement;

  constructor(app: App, total: number) {
    super(app);
    this.total = total;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Publishing Notes to Knowledge Graph' });
    
    this.progressEl = contentEl.createEl('div', { cls: 'progress-bar' });
    this.statusEl = contentEl.createEl('p', { text: 'Starting...' });
  }

  updateProgress(published: number, errors: number) {
    const percentage = ((published + errors) / this.total) * 100;
    //(this.progressEl as HTMLElement & { style: CSSStyleDeclaration }).style.width = `${percentage}%`;
    this.statusEl.setText(`Published: ${published}, Errors: ${errors}, Remaining: ${this.total - published - errors}`);
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class CreateSpaceModal extends Modal {
  private spaceManager: SpaceManager;
  private onSuccess: (spaceId: string) => void;

  constructor(app: App, spaceManager: SpaceManager, onSuccess: (spaceId: string) => void) {
    super(app);
    this.spaceManager = spaceManager;
    this.onSuccess = onSuccess;
  }

  override onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h2', { text: 'Create New Knowledge Graph Space' });

    const form = contentEl.createEl('form');
    
    const nameInput = form.createEl('input', { type: 'text', placeholder: 'Space name' });
    const descInput = form.createEl('textarea', { placeholder: 'Description (optional)' });
    
    const submitBtn = form.createEl('button', { text: 'Create Space', type: 'submit' });
    
    form.onsubmit = async (e: Event) => {
      e.preventDefault();
      try {
        const spaceId = await this.spaceManager.createSpace(nameInput.value, descInput.value);
        this.onSuccess(spaceId);
        this.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        new Notice(`Error creating space: ${errorMessage}`);
      }
    };
  }

  override onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class KnowledgeGraphSettingsTab extends PluginSettingTab {
  plugin: KnowledgeGraphPlugin;

  constructor(app: App, plugin: KnowledgeGraphPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Knowledge Graph Publisher Settings' });

    // Network selection
    new Setting(containerEl)
      .setName('Network')
      .setDesc('Choose between mainnet and testnet')
      .addDropdown(dropdown => dropdown
        .addOption('TESTNET', 'Testnet')
        .addOption('MAINNET', 'Mainnet')
        .setValue(this.plugin.settings.network)
        .onChange(async (value: string) => {
          const networkValue = value as 'MAINNET' | 'TESTNET';
          this.plugin.settings.network = networkValue;
          this.plugin.settings.apiOrigin = networkValue === 'TESTNET' 
            ? 'https://hypergraph-v2-testnet.up.railway.app'
            : 'https://hypergraph-v2.up.railway.app';
          await this.plugin.saveSettings();
        }));

    // Private key
    new Setting(containerEl)
      .setName('Private Key')
      .setDesc('Your wallet private key (keep this secure!)')
      .addText(text => text
        .setPlaceholder('0x...')
        .setValue(this.plugin.settings.privateKey)
        .onChange(async (value) => {
          this.plugin.settings.privateKey = value;
          await this.plugin.saveSettings();
        }));

    // Space ID
    new Setting(containerEl)
      .setName('Space ID')
      .setDesc('Your Knowledge Graph space identifier')
      .addText(text => text
        .setPlaceholder('Enter space ID')
        .setValue(this.plugin.settings.spaceId)
        .onChange(async (value) => {
          this.plugin.settings.spaceId = value;
          await this.plugin.saveSettings();
        }));

    // Auto-publish toggle
    new Setting(containerEl)
      .setName('Auto-publish')
      .setDesc('Automatically publish notes when they are modified')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoPublish)
        .onChange(async (value) => {
          this.plugin.settings.autoPublish = value;
          await this.plugin.saveSettings();
        }));

    // Include tags toggle
    new Setting(containerEl)
      .setName('Include Tags')
      .setDesc('Include note tags as entities in the knowledge graph')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeTags)
        .onChange(async (value) => {
          this.plugin.settings.includeTags = value;
          await this.plugin.saveSettings();
        }));

    // Include links toggle
    new Setting(containerEl)
      .setName('Include Links')
      .setDesc('Include note links as relations in the knowledge graph')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.includeLinks)
        .onChange(async (value) => {
          this.plugin.settings.includeLinks = value;
          await this.plugin.saveSettings();
        }));

    // Excluded folders
    new Setting(containerEl)
      .setName('Excluded Folders')
      .setDesc('Folders to exclude from publishing (comma-separated)')
      .addTextArea(text => text
        .setPlaceholder('folder1/, folder2/subfolder/')
        .setValue(this.plugin.settings.excludedFolders.join(', '))
        .onChange(async (value) => {
          this.plugin.settings.excludedFolders = value.split(',').map(f => f.trim()).filter(f => f);
          await this.plugin.saveSettings();
        }));

    // Wallet export link
    containerEl.createEl('p', { 
      text: 'To get your private key, visit: ',
    }).createEl('a', {
      text: 'https://www.geobrowser.io/export-wallet',
      href: 'https://www.geobrowser.io/export-wallet'
    });

    // Last sync info
    if (this.plugin.settings.lastSyncTimestamp > 0) {
      containerEl.createEl('p', {
        text: `Last sync: ${new Date(this.plugin.settings.lastSyncTimestamp).toLocaleString()}`
      });
    }
  }
}