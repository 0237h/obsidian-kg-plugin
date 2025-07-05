import { Graph } from '@graphprotocol/grc-20';
import type { KnowledgeGraphSpace, NetworkConfig } from './types';

export class SpaceManager {
  private settings: any;
  private networkConfig: NetworkConfig;

  constructor(settings: any) {
    this.settings = settings;
    this.networkConfig = this.getNetworkConfig();
  }

  private getNetworkConfig(): NetworkConfig {
    const isTestnet = this.settings.network === 'TESTNET';
    return {
      name: this.settings.network,
      apiOrigin: isTestnet 
        ? 'https://hypergraph-v2-testnet.up.railway.app'
        : 'https://hypergraph-v2.up.railway.app',
      chainId: isTestnet ? 421614 : 42161, // Arbitrum testnet / mainnet
      blockExplorer: isTestnet 
        ? 'https://sepolia.arbiscan.io'
        : 'https://arbiscan.io',
      gasLimit: 500000,
      gasPrice: '0.1',
    };
  }

  async createSpace(name: string, description?: string): Promise<string> {
    try {
      const spaceName = this.sanitizeSpaceName(name);
      
      const spaceResult = await Graph.createSpace({
        editorAddress: this.getEditorAddress(),
        name: spaceName,
        network: this.settings.network,
      });

      const spaceId = spaceResult.id;
      console.log(`Created space: ${spaceId}`);
      
      // Store space metadata locally
      await this.storeSpaceMetadata(spaceId, {
        name: spaceName,
        description: description || '',
        createdAt: Date.now(),
        isPublic: false,
        governance: 'PERSONAL',
      });

      return spaceId;
    } catch (error) {
      console.error('Error creating space:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to create space: ${errorMessage}`);
    }
  }

  async listSpaces(): Promise<KnowledgeGraphSpace[]> {
    try {
      // In a real implementation, this would query the blockchain/API
      // For now, we'll return locally stored spaces
      const spaces = await this.getStoredSpaces();
      return spaces;
    } catch (error) {
      console.error('Error listing spaces:', error);
      return [];
    }
  }

  async getSpaceDetails(spaceId: string): Promise<KnowledgeGraphSpace | null> {
    try {
      const response = await fetch(`${this.networkConfig.apiOrigin}/space/${spaceId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch space details: ${response.statusText}`);
      }
      
      const spaceData = await response.json() as any;
      return {
        id: spaceId,
        name: spaceData?.name || 'Unknown Space',
        description: spaceData?.description || '',
        isPublic: spaceData?.isPublic || false,
        createdAt: spaceData?.createdAt || 0,
        updatedAt: spaceData?.updatedAt || 0,
        memberCount: spaceData?.memberCount || 1,
        governance: spaceData?.governance || 'PERSONAL',
      };
    } catch (error) {
      console.error('Error fetching space details:', error);
      return null;
    }
  }

  async validateSpace(spaceId: string): Promise<boolean> {
    try {
      const spaceDetails = await this.getSpaceDetails(spaceId);
      return spaceDetails !== null;
    } catch (error) {
      console.error('Error validating space:', error);
      return false;
    }
  }

  async getSpaceStats(spaceId: string): Promise<{
    entityCount: number;
    relationCount: number;
    lastUpdate: number;
  }> {
    try {
      const response = await fetch(`${this.networkConfig.apiOrigin}/space/${spaceId}/stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch space stats: ${response.statusText}`);
      }
      
      const stats = await response.json() as any;
      return {
        entityCount: stats?.entityCount || 0,
        relationCount: stats?.relationCount || 0,
        lastUpdate: stats?.lastUpdate || 0,
      };
    } catch (error) {
      console.error('Error fetching space stats:', error);
      return {
        entityCount: 0,
        relationCount: 0,
        lastUpdate: 0,
      };
    }
  }

  async joinSpace(spaceId: string, inviteCode?: string): Promise<boolean> {
    try {
      // Implementation would depend on the space's governance model
      // For now, we'll just validate the space exists
      const isValid = await this.validateSpace(spaceId);
      if (isValid) {
        await this.storeSpaceMetadata(spaceId, {
          name: 'Joined Space',
          description: 'Space joined via invite',
          createdAt: Date.now(),
          isPublic: false,
          governance: 'PUBLIC',
        });
      }
      return isValid;
    } catch (error) {
      console.error('Error joining space:', error);
      return false;
    }
  }

  async leaveSpace(spaceId: string): Promise<boolean> {
    try {
      // Remove from local storage
      await this.removeSpaceMetadata(spaceId);
      return true;
    } catch (error) {
      console.error('Error leaving space:', error);
      return false;
    }
  }

  async generateInviteCode(spaceId: string): Promise<string> {
    try {
      // This would typically interact with the space's smart contract
      // For now, return a mock invite code
      const inviteCode = `invite_${spaceId}_${Date.now()}`;
      return inviteCode;
    } catch (error) {
      console.error('Error generating invite code:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate invite code: ${errorMessage}`);
    }
  }

  private sanitizeSpaceName(name: string): string {
    // Remove special characters and ensure valid space name
    return name
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .substring(0, 50);
  }

  private getEditorAddress(): string {
    // In a real implementation, this would derive the address from the private key
    // For now, we'll use a placeholder that should be replaced with actual wallet address derivation
    // This should ideally match the address from the wallet client used in knowledge-graph-service
    return '0x0000000000000000000000000000000000000000';
  }

  private async storeSpaceMetadata(spaceId: string, metadata: Partial<KnowledgeGraphSpace>) {
    try {
      const key = `kg_space_${spaceId}`;
      const data = {
        id: spaceId,
        ...metadata,
        updatedAt: Date.now(),
      };
      
      // Store in localStorage (in a real plugin, this would use Obsidian's data storage)
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        globalThis.localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Error storing space metadata:', error);
    }
  }

  private async getStoredSpaces(): Promise<KnowledgeGraphSpace[]> {
    try {
      const spaces: KnowledgeGraphSpace[] = [];
      
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        for (let i = 0; i < globalThis.localStorage.length; i++) {
          const key = globalThis.localStorage.key(i);
          if (key && key.startsWith('kg_space_')) {
            const data = globalThis.localStorage.getItem(key);
            if (data) {
              const space = JSON.parse(data);
              spaces.push(space);
            }
          }
        }
      }
      
      return spaces.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      console.error('Error retrieving stored spaces:', error);
      return [];
    }
  }

  private async removeSpaceMetadata(spaceId: string) {
    try {
      const key = `kg_space_${spaceId}`;
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        globalThis.localStorage.removeItem(key);
      }
    } catch (error) {
      console.error('Error removing space metadata:', error);
    }
  }

  async exportSpaceData(spaceId: string): Promise<any> {
    try {
      // This would query the Knowledge Graph for all data in the space
      // For now, return a placeholder structure
      return {
        spaceId,
        metadata: await this.getSpaceDetails(spaceId),
        stats: await this.getSpaceStats(spaceId),
        exportedAt: Date.now(),
      };
    } catch (error) {
      console.error('Error exporting space data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to export space data: ${errorMessage}`);
    }
  }

  async importSpaceData(data: any): Promise<string> {
    try {
      // This would create a new space and import all the data
      // For now, just create a new space
      const spaceId = await this.createSpace(
        data.metadata?.name || 'Imported Space',
        data.metadata?.description || 'Imported from backup'
      );
      
      return spaceId;
    } catch (error) {
      console.error('Error importing space data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to import space data: ${errorMessage}`);
    }
  }
}