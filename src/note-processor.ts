import { App, TFile, CachedMetadata } from 'obsidian';
import { NoteData, LinkData } from './types';

export class NoteProcessor {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async processNote(file: TFile): Promise<NoteData> {
    const content = await this.app.vault.read(file);
    const metadata = this.app.metadataCache.getFileCache(file);
    
    return {
      title: this.extractTitle(file, content),
      content: this.cleanContent(content),
      path: file.path,
      createdDate: file.stat.ctime,
      modifiedDate: file.stat.mtime,
      tags: this.extractTags(metadata),
      links: this.extractLinks(metadata),
      frontmatter: this.extractFrontmatter(metadata),
      headings: this.extractHeadings(metadata),
      blocks: this.extractBlocks(content),
    };
  }

  private extractTitle(file: TFile, content: string): string {
    // First try to get title from frontmatter
    const metadata = this.app.metadataCache.getFileCache(file);
    if (metadata?.frontmatter?.title) {
      return metadata.frontmatter.title;
    }

    // Then try to get the first H1 heading
    const h1Match = content.match(/^# (.+)$/m);
    if (h1Match) {
      return h1Match[1].trim();
    }

    // Finally, use the filename without extension
    return file.basename;
  }

  private cleanContent(content: string): string {
    // Remove frontmatter
    const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    
    // Remove Obsidian-specific syntax while preserving readability
    return withoutFrontmatter
      .replace(/\[\[([^\]]+)\]\]/g, '$1') // Remove wiki link brackets
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Convert markdown links to plain text
      .replace(/^#{1,6}\s+/gm, '') // Remove heading markers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold markers
      .replace(/\*([^*]+)\*/g, '$1') // Remove italic markers
      .replace(/==([^=]+)==/g, '$1') // Remove highlight markers
      .replace(/~~([^~]+)~~/g, '$1') // Remove strikethrough markers
      .replace(/#[\w-]+/g, '') // Remove hashtags
      .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
      .trim();
  }

  private extractTags(metadata: CachedMetadata | null): string[] {
    const tags: string[] = [];
    
    if (metadata?.tags) {
      metadata.tags.forEach(tag => {
        tags.push(tag.tag.replace('#', ''));
      });
    }

    if (metadata?.frontmatter?.tags) {
      const frontmatterTags = metadata.frontmatter.tags;
      if (Array.isArray(frontmatterTags)) {
        frontmatterTags.forEach(tag => {
          if (typeof tag === 'string') {
            tags.push(tag.replace('#', ''));
          }
        });
      } else if (typeof frontmatterTags === 'string') {
        tags.push(frontmatterTags.replace('#', ''));
      }
    }

    // Remove duplicates and return
    return [...new Set(tags)];
  }

  private extractLinks(metadata: CachedMetadata | null): LinkData[] {
    const links: LinkData[] = [];
    
    if (metadata?.links) {
      metadata.links.forEach(link => {
        links.push({
          target: link.link,
          displayText: link.displayText || link.link,
          type: 'internal',
          position: link.position,
        });
      });
    }

    if (metadata?.embeds) {
      metadata.embeds.forEach(embed => {
        links.push({
          target: embed.link,
          displayText: embed.displayText || embed.link,
          type: 'embed',
          position: embed.position,
        });
      });
    }

    return links;
  }

  private extractFrontmatter(metadata: CachedMetadata | null): Record<string, any> {
    return metadata?.frontmatter || {};
  }

  private extractHeadings(metadata: CachedMetadata | null): Array<{level: number, heading: string}> {
    const headings: Array<{level: number, heading: string}> = [];
    
    if (metadata?.headings) {
      metadata.headings.forEach(heading => {
        headings.push({
          level: heading.level,
          heading: heading.heading,
        });
      });
    }

    return headings;
  }

  private extractBlocks(content: string): Array<{type: string, content: string}> {
    const blocks: Array<{type: string, content: string}> = [];
    
    // Extract code blocks
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      blocks.push({
        type: 'code',
        content: match[2].trim(),
      });
    }

    // Extract callouts
    const calloutRegex = /^> \[!(\w+)\].*?\n((?:^>.*$\n?)*)/gm;
    while ((match = calloutRegex.exec(content)) !== null) {
      blocks.push({
        type: 'callout',
        content: match[2].replace(/^> /gm, '').trim(),
      });
    }

    // Extract tables
    const tableRegex = /(\|.*\|[\r\n]+\|.*\|[\r\n]+(?:\|.*\|[\r\n]*)*)/g;
    while ((match = tableRegex.exec(content)) !== null) {
      blocks.push({
        type: 'table',
        content: match[1].trim(),
      });
    }

    return blocks;
  }

  async processMultipleNotes(files: TFile[]): Promise<NoteData[]> {
    const results: NoteData[] = [];
    
    for (const file of files) {
      try {
        const noteData = await this.processNote(file);
        results.push(noteData);
      } catch (error) {
        console.error(`Error processing note ${file.path}:`, error);
      }
    }

    return results;
  }

  /**
   * Find relationships between notes based on content analysis
   */
  async findNoteRelationships(notes: NoteData[]): Promise<Array<{
    source: string;
    target: string;
    type: string;
    strength: number;
  }>> {
    const relationships: Array<{
      source: string;
      target: string;
      type: string;
      strength: number;
    }> = [];

    for (let i = 0; i < notes.length; i++) {
      for (let j = i + 1; j < notes.length; j++) {
        const note1 = notes[i];
        const note2 = notes[j];

        // Check for direct links
        const hasDirectLink = note1.links.some(link => link.target === note2.title) ||
                             note2.links.some(link => link.target === note1.title);

        if (hasDirectLink) {
          relationships.push({
            source: note1.path,
            target: note2.path,
            type: 'direct-link',
            strength: 1.0,
          });
        }

        // Check for shared tags
        const sharedTags = note1.tags.filter(tag => note2.tags.includes(tag));
        if (sharedTags.length > 0) {
          relationships.push({
            source: note1.path,
            target: note2.path,
            type: 'shared-tags',
            strength: sharedTags.length / Math.max(note1.tags.length, note2.tags.length),
          });
        }

        // Check for content similarity (basic keyword matching)
        const similarity = this.calculateContentSimilarity(note1.content, note2.content);
        if (similarity > 0.3) {
          relationships.push({
            source: note1.path,
            target: note2.path,
            type: 'content-similarity',
            strength: similarity,
          });
        }
      }
    }

    return relationships;
  }

  private calculateContentSimilarity(content1: string, content2: string): number {
    // Simple keyword-based similarity calculation
    const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(word => word.length > 3));
    const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(word => word.length > 3));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}