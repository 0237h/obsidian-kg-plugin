import { App, TFile } from 'obsidian';
import { TagMetadata } from './types';

export class TagManager {
  private app: App;
  private tagCache: Map<string, TagMetadata> = new Map();
  private lastCacheUpdate = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(app: App) {
    this.app = app;
  }

  async getAllTags(): Promise<TagMetadata[]> {
    await this.refreshTagCache();
    return Array.from(this.tagCache.values()).sort((a, b) => b.count - a.count);
  }

  async getTagMetadata(tagName: string): Promise<TagMetadata | null> {
    await this.refreshTagCache();
    return this.tagCache.get(tagName) || null;
  }

  async getTagsByFrequency(minCount = 1): Promise<TagMetadata[]> {
    const allTags = await this.getAllTags();
    return allTags.filter(tag => tag.count >= minCount);
  }

  async getRelatedTags(tagName: string): Promise<Array<{tag: string; strength: number}>> {
    await this.refreshTagCache();
    const targetTag = this.tagCache.get(tagName);
    if (!targetTag) return [];

    const relatedTags = new Map<string, number>();
    
    // Find notes that have the target tag
    const targetNotes = new Set(targetTag.notes);
    
    // Check other tags for overlap
    for (const [otherTagName, otherTag] of this.tagCache) {
      if (otherTagName === tagName) continue;
      
      const overlap = otherTag.notes.filter(note => targetNotes.has(note)).length;
      if (overlap > 0) {
        const strength = overlap / Math.max(targetTag.count, otherTag.count);
        relatedTags.set(otherTagName, strength);
      }
    }

    return Array.from(relatedTags.entries())
      .map(([tag, strength]) => ({ tag, strength }))
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 10); // Top 10 related tags
  }

  async getUnusedTags(): Promise<string[]> {
    await this.refreshTagCache();
    return Array.from(this.tagCache.entries())
      .filter(([_, metadata]) => metadata.count === 0)
      .map(([tagName]) => tagName);
  }

  async suggestTagsForNote(file: TFile): Promise<string[]> {
    const content = await this.app.vault.read(file);
    const existingTags = this.extractTagsFromContent(content);
    
    // Get all available tags
    const allTags = await this.getAllTags();
    
    // Simple keyword matching for tag suggestions
    const suggestions: Array<{tag: string; score: number}> = [];
    
    for (const tagMetadata of allTags) {
      if (existingTags.includes(tagMetadata.name)) continue;
      
      const score = this.calculateTagRelevance(content, tagMetadata.name);
      if (score > 0.3) {
        suggestions.push({ tag: tagMetadata.name, score });
      }
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.tag);
  }

  async getTagHierarchy(): Promise<Record<string, string[]>> {
    const allTags = await this.getAllTags();
    const hierarchy: Record<string, string[]> = {};
    
    for (const tag of allTags) {
      const parts = tag.name.split('/');
      if (parts.length > 1) {
        const parent = parts.slice(0, -1).join('/');
        if (!hierarchy[parent]) {
          hierarchy[parent] = [];
        }
        hierarchy[parent].push(tag.name);
      }
    }
    
    return hierarchy;
  }

  async renameTag(oldName: string, newName: string): Promise<{success: boolean; updatedFiles: string[]}> {
    const files = this.app.vault.getMarkdownFiles();
    const updatedFiles: string[] = [];
    
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const tags = this.extractTagsFromContent(content);
        
        if (tags.includes(oldName)) {
          const newContent = content.replace(
            new RegExp(`#${oldName}\\b`, 'g'),
            `#${newName}`
          );
          
          await this.app.vault.modify(file, newContent);
          updatedFiles.push(file.path);
        }
      } catch (error) {
        console.error(`Error updating tags in ${file.path}:`, error);
      }
    }
    
    // Clear cache to force refresh
    this.tagCache.clear();
    this.lastCacheUpdate = 0;
    
    return {
      success: true,
      updatedFiles,
    };
  }

  async deleteTag(tagName: string): Promise<{success: boolean; updatedFiles: string[]}> {
    const files = this.app.vault.getMarkdownFiles();
    const updatedFiles: string[] = [];
    
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const tags = this.extractTagsFromContent(content);
        
        if (tags.includes(tagName)) {
          const newContent = content.replace(
            new RegExp(`#${tagName}\\b`, 'g'),
            ''
          ).replace(/\s+/g, ' ').trim();
          
          await this.app.vault.modify(file, newContent);
          updatedFiles.push(file.path);
        }
      } catch (error) {
        console.error(`Error removing tag from ${file.path}:`, error);
      }
    }
    
    // Clear cache to force refresh
    this.tagCache.clear();
    this.lastCacheUpdate = 0;
    
    return {
      success: true,
      updatedFiles,
    };
  }

  async exportTagData(): Promise<any> {
    const allTags = await this.getAllTags();
    const hierarchy = await this.getTagHierarchy();
    
    return {
      tags: allTags,
      hierarchy,
      exportedAt: Date.now(),
      totalTags: allTags.length,
      totalUsage: allTags.reduce((sum, tag) => sum + tag.count, 0),
    };
  }

  private async refreshTagCache(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCacheUpdate < this.CACHE_DURATION && this.tagCache.size > 0) {
      return;
    }

    this.tagCache.clear();
    const files = this.app.vault.getMarkdownFiles();
    
    for (const file of files) {
      try {
        const content = await this.app.vault.read(file);
        const tags = this.extractTagsFromContent(content);
        
        for (const tag of tags) {
          if (!this.tagCache.has(tag)) {
            this.tagCache.set(tag, {
              name: tag,
              count: 0,
              notes: [],
              color: this.generateTagColor(tag),
              description: '',
            });
          }
          
          const metadata = this.tagCache.get(tag)!;
          metadata.count++;
          metadata.notes.push(file.path);
        }
      } catch (error) {
        console.error(`Error processing tags in ${file.path}:`, error);
      }
    }
    
    this.lastCacheUpdate = now;
  }

  private extractTagsFromContent(content: string): string[] {
    const tags: string[] = [];
    
    // Extract hashtags from content
    const hashtagRegex = /#([^\s#]+)/g;
    let match;
    while ((match = hashtagRegex.exec(content)) !== null) {
      tags.push(match[1]);
    }
    
    // Extract tags from frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const tagsMatch = frontmatter.match(/tags:\s*\[(.*?)\]/s);
      if (tagsMatch) {
        const frontmatterTags = tagsMatch[1]
          .split(',')
          .map(tag => tag.trim().replace(/['"]/g, ''))
          .filter(tag => tag.length > 0);
        tags.push(...frontmatterTags);
      }
    }
    
    // Remove duplicates and return
    return [...new Set(tags)];
  }

  private calculateTagRelevance(content: string, tagName: string): number {
    const contentLower = content.toLowerCase();
    const tagLower = tagName.toLowerCase();
    
    // Simple keyword matching
    const directMatches = (contentLower.match(new RegExp(tagLower, 'g')) || []).length;
    const wordCount = content.split(/\s+/).length;
    
    // Boost score if tag appears in title or headings
    const titleBoost = contentLower.includes(tagLower) ? 0.3 : 0;
    const headingBoost = (contentLower.match(new RegExp(`^#+.*${tagLower}.*$`, 'gm')) || []).length * 0.2;
    
    return Math.min(1.0, (directMatches / wordCount) * 100 + titleBoost + headingBoost);
  }

  private generateTagColor(tag: string): string {
    // Generate a consistent color for a tag based on its name
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#FFB6C1', '#F0E68C', '#FFA07A',
      '#20B2AA', '#87CEEB', '#DDA0DD', '#F0E68C', '#FFB6C1'
    ];
    
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash << 5) - hash) + tag.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  async getMostUsedTags(limit = 10): Promise<TagMetadata[]> {
    const allTags = await this.getAllTags();
    return allTags.slice(0, limit);
  }

  async getRecentlyUsedTags(days = 7): Promise<TagMetadata[]> {
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000);
    const allTags = await this.getAllTags();
    
    const recentTags: TagMetadata[] = [];
    
    for (const tag of allTags) {
      const recentNotes = tag.notes.filter(notePath => {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        return file && file instanceof TFile && file.stat.mtime > cutoffDate;
      });
      
      if (recentNotes.length > 0) {
        recentTags.push({
          ...tag,
          count: recentNotes.length,
          notes: recentNotes,
        });
      }
    }
    
    return recentTags.sort((a, b) => b.count - a.count);
  }

  async getTagUsageOverTime(tagName: string, days = 30): Promise<Array<{date: string; count: number}>> {
    const tagMetadata = await this.getTagMetadata(tagName);
    if (!tagMetadata) return [];
    
    const usage: Array<{date: string; count: number}> = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      const dateStr = date.toISOString().split('T')[0];
      
      const dayStart = date.getTime();
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      
      const dayCount = tagMetadata.notes.filter(notePath => {
        const file = this.app.vault.getAbstractFileByPath(notePath);
        return file && file instanceof TFile && 
               file.stat.mtime >= dayStart && file.stat.mtime < dayEnd;
      }).length;
      
      usage.push({ date: dateStr, count: dayCount });
    }
    
    return usage;
  }

  async getTopTagPairs(limit = 10): Promise<Array<{tag1: string; tag2: string; count: number}>> {
    const allTags = await this.getAllTags();
    const pairCounts = new Map<string, number>();
    
    // Count co-occurrences of tag pairs
    for (const tag1 of allTags) {
      for (const tag2 of allTags) {
        if (tag1.name >= tag2.name) continue; // Avoid duplicates and self-pairs
        
        const sharedNotes = tag1.notes.filter(note => tag2.notes.includes(note));
        if (sharedNotes.length > 0) {
          const pairKey = `${tag1.name}|${tag2.name}`;
          pairCounts.set(pairKey, sharedNotes.length);
        }
      }
    }
    
    return Array.from(pairCounts.entries())
      .map(([pairKey, count]) => {
        const [tag1, tag2] = pairKey.split('|');
        return { tag1, tag2, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async getTagStatistics(): Promise<{
    totalTags: number;
    totalUsage: number;
    averageTagsPerNote: number;
    mostUsedTag: string;
    leastUsedTag: string;
    hierarchicalTags: number;
  }> {
    const allTags = await this.getAllTags();
    const files = this.app.vault.getMarkdownFiles();
    
    if (allTags.length === 0) {
      return {
        totalTags: 0,
        totalUsage: 0,
        averageTagsPerNote: 0,
        mostUsedTag: '',
        leastUsedTag: '',
        hierarchicalTags: 0,
      };
    }
    
    const totalUsage = allTags.reduce((sum, tag) => sum + tag.count, 0);
    const hierarchicalTags = allTags.filter(tag => tag.name.includes('/')).length;
    
    return {
      totalTags: allTags.length,
      totalUsage,
      averageTagsPerNote: totalUsage / files.length,
      mostUsedTag: allTags[0].name,
      leastUsedTag: allTags[allTags.length - 1].name,
      hierarchicalTags,
    };
  }
}