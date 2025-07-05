import { App } from 'obsidian';
import { Graph, Id, Ipfs, getSmartAccountWalletClient, type Op } from '@graphprotocol/grc-20';
import type { NoteData, ProcessedEntity, ProcessedRelation } from './types';

export class KnowledgeGraphService {
  private app: App;
  private settings: any;
  private walletClient: any;
  private initialized = false;

  constructor(settings: any, app: App) {
    this.settings = settings;
    this.app = app;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      this.walletClient = await getSmartAccountWalletClient({
        privateKey: this.settings.privateKey,
      });
      this.initialized = true;
      console.log('Knowledge Graph Service initialized');
    } catch (error) {
      console.error('Failed to initialize Knowledge Graph Service:', error);
      throw error;
    }
  }

  async createKnowledgeEntities(noteData: NoteData): Promise<{
    entities: ProcessedEntity[];
    relations: ProcessedRelation[];
  }> {
    const entities: ProcessedEntity[] = [];
    const relations: ProcessedRelation[] = [];
    const ops: Op[] = [];

    // Create main note entity
    const noteEntity = await this.createNoteEntity(noteData, ops);
    entities.push(noteEntity);

    // Create tag entities if enabled
    if (this.settings.includeTags && noteData.tags.length > 0) {
      for (const tag of noteData.tags) {
        const tagEntity = await this.createTagEntity(tag, ops);
        entities.push(tagEntity);
        
        // Create relation between note and tag
        const tagRelation = await this.createTagRelation(noteEntity.id, tagEntity.id, ops);
        relations.push(tagRelation);
      }
    }

    // Create link entities and relations if enabled
    if (this.settings.includeLinks && noteData.links.length > 0) {
      for (const link of noteData.links) {
        const linkEntity = await this.createLinkEntity(link.target, ops);
        entities.push(linkEntity);
        
        // Create relation between note and linked note
        const linkRelation = await this.createLinkRelation(noteEntity.id, linkEntity.id, ops);
        relations.push(linkRelation);
      }
    }

    return { entities, relations };
  }

  async publishToKnowledgeGraph(entities: ProcessedEntity[], relations: ProcessedRelation[]): Promise<any> {
    await this.initialize();

    try {
      // Collect all ops from entities and relations
      const allOps: Op[] = [];
      entities.forEach(entity => allOps.push(...entity.ops));
      relations.forEach(relation => allOps.push(...relation.ops));

      // Publish to IPFS
      const { cid } = await Ipfs.publishEdit({
        name: `Obsidian Knowledge Update - ${new Date().toISOString()}`,
        ops: allOps,
        author: this.walletClient.account.address,
        network: this.settings.network,
      });

      // Get calldata for the space
      const response = await fetch(`${this.settings.apiOrigin}/space/${this.settings.spaceId}/edit/calldata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cid }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get calldata: ${response.statusText}`);
      }

      const responseData = await response.json() as { to: string; data: string };
      const { to, data } = responseData;

      // Send transaction
      const txResult = await this.walletClient.sendTransaction({
        to,
        value: 0n,
        data,
      });

      console.log('Transaction sent:', txResult);
      return { cid, txResult };
    } catch (error) {
      console.error('Error publishing to Knowledge Graph:', error);
      throw error;
    }
  }

  private async createNoteEntity(noteData: NoteData, ops: Op[]): Promise<ProcessedEntity> {
    // Create properties for the note
    const { id: titlePropertyId, ops: titlePropertyOps } = Graph.createProperty({
      name: 'Title',
      dataType: 'TEXT',
    });
    ops.push(...titlePropertyOps);

    const { id: contentPropertyId, ops: contentPropertyOps } = Graph.createProperty({
      name: 'Content',
      dataType: 'TEXT',
    });
    ops.push(...contentPropertyOps);

    const { id: createdPropertyId, ops: createdPropertyOps } = Graph.createProperty({
      name: 'Created Date',
      dataType: 'TIME',
    });
    ops.push(...createdPropertyOps);

    const { id: modifiedPropertyId, ops: modifiedPropertyOps } = Graph.createProperty({
      name: 'Modified Date',
      dataType: 'TIME',
    });
    ops.push(...modifiedPropertyOps);

    const { id: pathPropertyId, ops: pathPropertyOps } = Graph.createProperty({
      name: 'File Path',
      dataType: 'TEXT',
    });
    ops.push(...pathPropertyOps);

    // Create note type
    const { id: noteTypeId, ops: noteTypeOps } = Graph.createType({
      name: 'Obsidian Note',
      properties: [titlePropertyId, contentPropertyId, createdPropertyId, modifiedPropertyId, pathPropertyId],
    });
    ops.push(...noteTypeOps);

    // Create the note entity
    const { id: noteId, ops: noteOps } = Graph.createEntity({
      name: noteData.title,
      description: noteData.content.substring(0, 200) + '...',
      types: [noteTypeId],
      values: [
        {
          property: titlePropertyId,
          value: noteData.title,
        },
        {
          property: contentPropertyId,
          value: noteData.content,
        },
        {
          property: createdPropertyId,
          value: Graph.serializeDate(new Date(noteData.createdDate)),
        },
        {
          property: modifiedPropertyId,
          value: Graph.serializeDate(new Date(noteData.modifiedDate)),
        },
        {
          property: pathPropertyId,
          value: noteData.path,
        },
      ],
    });
    ops.push(...noteOps);

    return {
      id: noteId,
      type: 'note',
      name: noteData.title,
      ops: [...titlePropertyOps, ...contentPropertyOps, ...createdPropertyOps, ...modifiedPropertyOps, ...pathPropertyOps, ...noteTypeOps, ...noteOps],
    };
  }

  private async createTagEntity(tag: string, ops: Op[]): Promise<ProcessedEntity> {
    // Create properties for the tag
    const { id: namePropertyId, ops: namePropertyOps } = Graph.createProperty({
      name: 'Tag Name',
      dataType: 'TEXT',
    });
    ops.push(...namePropertyOps);

    // Create tag type
    const { id: tagTypeId, ops: tagTypeOps } = Graph.createType({
      name: 'Obsidian Tag',
      properties: [namePropertyId],
    });
    ops.push(...tagTypeOps);

    // Create the tag entity
    const { id: tagId, ops: tagOps } = Graph.createEntity({
      name: tag,
      description: `Tag: ${tag}`,
      types: [tagTypeId],
      values: [
        {
          property: namePropertyId,
          value: tag,
        },
      ],
    });
    ops.push(...tagOps);

    return {
      id: tagId,
      type: 'tag',
      name: tag,
      ops: [...namePropertyOps, ...tagTypeOps, ...tagOps],
    };
  }

  private async createLinkEntity(link: string, ops: Op[]): Promise<ProcessedEntity> {
    // Create properties for the link
    const { id: linkPropertyId, ops: linkPropertyOps } = Graph.createProperty({
      name: 'Link Target',
      dataType: 'TEXT',
    });
    ops.push(...linkPropertyOps);

    // Create link type
    const { id: linkTypeId, ops: linkTypeOps } = Graph.createType({
      name: 'Obsidian Link',
      properties: [linkPropertyId],
    });
    ops.push(...linkTypeOps);

    // Create the link entity
    const { id: linkId, ops: linkEntityOps } = Graph.createEntity({
      name: link,
      description: `Link to: ${link}`,
      types: [linkTypeId],
      values: [
        {
          property: linkPropertyId,
          value: link,
        },
      ],
    });
    ops.push(...linkEntityOps);

    return {
      id: linkId,
      type: 'link',
      name: link,
      ops: [...linkPropertyOps, ...linkTypeOps, ...linkEntityOps],
    };
  }

  private async createTagRelation(noteId: string, tagId: string, ops: Op[]): Promise<ProcessedRelation> {
    // Create the "has-tag" relation type
    const { id: hasTagTypeId, ops: hasTagTypeOps } = Graph.createType({
      name: 'Has Tag Relation',
      properties: [],
    });
    ops.push(...hasTagTypeOps);

    // Create the relation
    const relationId = Id.generate();
    const { ops: relationOps } = Graph.createRelation({
      id: relationId,
      fromEntity: noteId,
      toEntity: tagId,
      type: hasTagTypeId,
      toSpace: this.settings.spaceId,
      position: 'tag-relation',
    });
    ops.push(...relationOps);

    return {
      id: relationId,
      type: 'has-tag',
      fromEntity: noteId,
      toEntity: tagId,
      ops: [...hasTagTypeOps, ...relationOps],
    };
  }

  private async createLinkRelation(noteId: string, linkId: string, ops: Op[]): Promise<ProcessedRelation> {
    // Create the "links-to" relation type
    const { id: linksToTypeId, ops: linksToTypeOps } = Graph.createType({
      name: 'Links To Relation',
      properties: [],
    });
    ops.push(...linksToTypeOps);

    // Create the relation
    const relationId = Id.generate();
    const { ops: relationOps } = Graph.createRelation({
      id: relationId,
      fromEntity: noteId,
      toEntity: linkId,
      type: linksToTypeId,
      toSpace: this.settings.spaceId,
      position: 'link-relation',
    });
    ops.push(...relationOps);

    return {
      id: relationId,
      type: 'links-to',
      fromEntity: noteId,
      toEntity: linkId,
      ops: [...linksToTypeOps, ...relationOps],
    };
  }
}