# Knowledge Graph Publisher for Obsidian

A powerful Obsidian plugin that seamlessly integrates your personal knowledge management with The Graph's decentralized Knowledge Graph using the GRC-20 protocol.

## Features

- **🚀 One-Click Publishing**: Publish individual notes or your entire vault to the Knowledge Graph
- **🏷️ Smart Tag Management**: Automatically extract and manage tags as knowledge entities
- **🔗 Link Preservation**: Maintain note relationships through graph relations
- **🌐 Decentralized Storage**: Your knowledge is stored on IPFS and anchored on-chain
- **🤝 Collaborative Knowledge**: Contribute to shared knowledge spaces or create your own
- **📊 Analytics**: Track your knowledge contributions and discover connections
- **🔄 Auto-Sync**: Optionally sync changes automatically as you work

## Installation

### From Source (Development)

1. Clone this repository into your Obsidian plugins folder:
   ```bash
   cd path/to/your/vault/.obsidian/plugins
   git clone https://github.com/your-username/obsidian-knowledge-graph-publisher.git
   ```

2. Install dependencies:
   ```bash
   cd obsidian-knowledge-graph-publisher
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Enable the plugin in Obsidian's Community Plugins settings

### From Obsidian Community Plugins (Coming Soon)

Search for "Knowledge Graph Publisher" in the Community Plugins section of Obsidian settings.

## Setup

1. **Get Your Private Key**: 
   - Visit [https://www.geobrowser.io/export-wallet](https://www.geobrowser.io/export-wallet)
   - Export your wallet's private key
   - ⚠️ **Keep this secure** - never share your private key!

2. **Configure the Plugin**:
   - Go to Settings → Community Plugins → Knowledge Graph Publisher
   - Enter your private key
   - Choose between Testnet (for testing) or Mainnet (for production)
   - Create or join a Knowledge Graph space

3. **Start Publishing**:
   - Use the ribbon icon to publish your current note
   - Use Command Palette: "Publish to Knowledge Graph"
   - Enable auto-publish for seamless integration

## Usage

### Publishing Notes

#### Single Note
- Click the Knowledge Graph icon in the ribbon
- Use `Ctrl+P` → "Publish current note to Knowledge Graph"
- Right-click on a note → "Publish to Knowledge Graph"

#### Bulk Publishing
- Use `Ctrl+P` → "Publish all notes to Knowledge Graph"
- Configure excluded folders in settings to skip certain content

### Managing Spaces

#### Create a New Space
- Use `Ctrl+P` → "Create new Knowledge Graph space"
- Enter a name and description
- The space will be deployed to the blockchain

#### Join an Existing Space
- Get an invite code from a space owner
- Use `Ctrl+P` → "Join Knowledge Graph space"
- Enter the invite code

### Tag Management

The plugin automatically:
- Extracts hashtags from your notes
- Processes frontmatter tags
- Creates tag entities in the Knowledge Graph
- Establishes relationships between notes and tags

### Link Preservation

- Internal links (`[[Note Name]]`) become relations in the Knowledge Graph
- Backlinks are maintained and discoverable
- Embedded content relationships are preserved

## Configuration

### Settings Overview

| Setting | Description | Default |
|---------|-------------|---------|
| Network | Choose Testnet or Mainnet | Testnet |
| Private Key | Your wallet's private key | (empty) |
| Space ID | Your Knowledge Graph space | (empty) |
| Auto-publish | Publish changes automatically | false |
| Include Tags | Include note tags as entities | true |
| Include Links | Include note links as relations | true |
| Excluded Folders | Folders to skip during publishing | (empty) |

### Advanced Configuration

#### Custom API Endpoint
For advanced users, you can specify a custom API endpoint:
- Testnet: `https://hypergraph-v2-testnet.up.railway.app`
- Mainnet: `https://hypergraph-v2.up.railway.app`

#### Batch Processing
The plugin processes notes in batches to avoid overwhelming the network:
- Batch size: 10 notes per batch
- Delay between batches: 2 seconds
- Maximum retries: 3 per note

## Development

### Project Structure

```
src/
├── knowledge-graph-service.ts  # GRC-20 integration
├── note-processor.ts          # Note parsing and processing
├── tag-manager.ts             # Tag extraction and management
├── space-manager.ts           # Space creation and management
├── types.ts                   # TypeScript definitions
└── utils.ts                   # Utility functions

main.ts                        # Main plugin file
manifest.json                  # Plugin manifest
styles.css                     # Plugin styles
```

### Building

```bash
# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run check
```

### Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## How It Works

### The GRC-20 Protocol

The plugin uses the GRC-20 protocol to structure your knowledge:

1. **Entities**: Each note becomes an entity with properties like title, content, creation date
2. **Relations**: Links between notes become relations in the graph
3. **Properties**: Tags, metadata, and other attributes become entity properties
4. **Spaces**: Your knowledge is organized into collaborative spaces

### Data Flow

1. **Note Processing**: Extract content, tags, links, and metadata
2. **Entity Creation**: Transform notes into GRC-20 entities
3. **Relation Mapping**: Create relations between entities
4. **IPFS Storage**: Encode and store data on IPFS
5. **Blockchain Anchoring**: Record the IPFS hash on-chain
6. **Indexing**: The Graph's indexers process and expose your data

### Privacy and Security

- **End-to-End Encryption**: Your private spaces are encrypted
- **Selective Sharing**: Choose what to publish publicly or privately
- **Decentralized Storage**: No single point of failure
- **Blockchain Verification**: Immutable record of contributions

## Troubleshooting

### Common Issues

#### "No space configured"
- Ensure you've set a valid Space ID in settings
- Create a new space if you don't have one
- Verify the space exists and you have access

#### "Invalid private key"
- Check that your private key starts with "0x"
- Ensure the key is from your Geo wallet
- Never share your private key with anyone

#### "Network connection failed"
- Check your internet connection
- Verify the API endpoint is correct
- Try switching networks (testnet/mainnet)

#### "Transaction failed"
- Ensure you have sufficient funds for gas fees
- Check that your wallet has the necessary permissions
- Verify the space allows new contributions

### Debug Mode

Enable debug mode in settings to see detailed logs:
1. Go to Settings → Community Plugins → Knowledge Graph Publisher
2. Enable "Debug Mode"
3. Check the Developer Console (Ctrl+Shift+I) for detailed logs

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass: `npm test`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

## Roadmap

- [ ] **Bidirectional Sync**: Pull changes from the Knowledge Graph back to Obsidian
- [ ] **Visual Graph Explorer**: Browse the Knowledge Graph directly in Obsidian
- [ ] **AI-Powered Insights**: Discover connections and insights from your knowledge
- [ ] **Multi-Vault Support**: Sync multiple vaults to the same space
- [ ] **Advanced Analytics**: Detailed metrics on your knowledge contributions
- [ ] **Mobile Support**: Full functionality on Obsidian mobile apps
- [ ] **Plugin Integrations**: Work with other popular Obsidian plugins

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 **Documentation**: [Full documentation](https://docs.your-domain.com)
- 💬 **Community**: Join our [Discord](https://discord.gg/your-server)
- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/your-username/obsidian-knowledge-graph-publisher/issues)
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/your-username/obsidian-knowledge-graph-publisher/discussions)

## Acknowledgments

- [Obsidian](https://obsidian.md/) for creating an amazing knowledge management platform
- [The Graph](https://thegraph.com/) for building the decentralized knowledge infrastructure
- [GRC-20](https://github.com/graphprotocol/grc-20-ts) for the knowledge graph protocol
- The open-source community for inspiration and contributions

---

**Made with ❤️ by the Knowledge Graph community**