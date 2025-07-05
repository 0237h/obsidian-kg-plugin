import { Op } from '@graphprotocol/grc-20';

export interface NoteData {
  title: string;
  content: string;
  path: string;
  createdDate: number;
  modifiedDate: number;
  tags: string[];
  links: LinkData[];
  frontmatter: Record<string, any>;
  headings: Array<{level: number, heading: string}>;
  blocks: Array<{type: string, content: string}>;
}

export interface LinkData {
  target: string;
  displayText: string;
  type: 'internal' | 'external' | 'embed';
  position: {
    start: {
      line: number;
      col: number;
      offset: number;
    };
    end: {
      line: number;
      col: number;
      offset: number;
    };
  };
}

export interface ProcessedEntity {
  id: string;
  type: 'note' | 'tag' | 'link' | 'heading' | 'block';
  name: string;
  ops: Op[];
  metadata?: Record<string, any>;
}

export interface ProcessedRelation {
  id: string;
  type: 'has-tag' | 'links-to' | 'contains' | 'references' | 'similar-to';
  fromEntity: string;
  toEntity: string;
  ops: Op[];
  strength?: number;
  metadata?: Record<string, any>;
}

export interface KnowledgeGraphSpace {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  memberCount: number;
  governance: 'PERSONAL' | 'PUBLIC';
}

export interface PublishResult {
  cid: string;
  transactionHash: string;
  entitiesCreated: number;
  relationsCreated: number;
  timestamp: number;
}

export interface SyncStatus {
  lastSyncTimestamp: number;
  totalNotes: number;
  publishedNotes: number;
  pendingNotes: number;
  errors: string[];
}

export interface TagMetadata {
  name: string;
  count: number;
  notes: string[];
  color?: string;
  description?: string;
}

export interface NoteRelationship {
  sourceNote: string;
  targetNote: string;
  type: 'direct-link' | 'shared-tags' | 'content-similarity' | 'backlink' | 'mention';
  strength: number;
  metadata?: Record<string, any>;
}

export interface KnowledgeGraphStats {
  totalEntities: number;
  totalRelations: number;
  noteCount: number;
  tagCount: number;
  linkCount: number;
  spacesCount: number;
  lastUpdate: number;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'rdf' | 'turtle';
  includeContent: boolean;
  includeTags: boolean;
  includeLinks: boolean;
  includeRelations: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  folders?: string[];
}

export interface ImportOptions {
  format: 'json' | 'csv' | 'rdf' | 'turtle';
  overwriteExisting: boolean;
  createMissingTags: boolean;
  preserveTimestamps: boolean;
  targetFolder?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface NetworkConfig {
  name: 'MAINNET' | 'TESTNET';
  apiOrigin: string;
  chainId: number;
  blockExplorer: string;
  gasLimit: number;
  gasPrice: string;
}

export interface BatchOperation {
  id: string;
  type: 'publish' | 'sync' | 'update' | 'delete';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  startTime: number;
  endTime?: number;
  errors: string[];
}