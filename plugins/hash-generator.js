const crypto = require('crypto');
const config = require('../config');

class HashGeneratorPlugin {
    constructor() {
        this.name = 'hash-generator';
        this.description = 'Generate various hash types (MD5, SHA1, SHA256, etc.)';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.supportedHashes = ['md5', 'sha1', 'sha256', 'sha512'];
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('hash', this.hashCommand.bind(this), {
                description: 'Generate hash from text or file',
                usage: `${config.PREFIX}hash <algorithm> <text> OR ${config.PREFIX}hash file <algorithm>`,
                category: 'utility',
                plugin: 'hash-generator',
                source: 'hash-generator.js'
            });

            console.log('✅ Hash Generator plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Hash Generator plugin:', error);
            return false;
        }
    }

    async hashCommand(messageInfo) {
        try {
            const args = messageInfo.args;
            
            if (args.length < 1) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔐 **Hash Generator**\n\n' +
                    '**Usage:**\n' +
                    `• ${config.PREFIX}hash <algorithm> <text>\n` +
                    `• ${config.PREFIX}hash file <algorithm> (reply to file)\n\n` +
                    '**Available algorithms:**\n• md5\n• sha1\n• sha256\n• sha512\n\n' +
                    '**Examples:**\n' +
                    `• ${config.PREFIX}hash md5 Hello World\n` +
                    `• ${config.PREFIX}hash sha256 My secret text\n` +
                    `• ${config.PREFIX}hash file md5 (reply to document)`);
                return;
            }

            // Check if first argument is "file" for file hashing
            if (args[0].toLowerCase() === 'file') {
                await this.handleFileHash(messageInfo, args.slice(1));
                return;
            }

            // Handle text hashing
            await this.handleTextHash(messageInfo, args);

        } catch (error) {
            console.error('Error in hash command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing hash command.');
        }
    }

    async handleFileHash(messageInfo, args) {
        try {
            const args = messageInfo.args;
            if (args.length < 1) {
                await this.bot.messageHandler.reply(messageInfo,
                    '📄 Usage: .hash file <algorithm> (reply to file)\n\n' +
                    '**Available algorithms:** md5, sha1, sha256, sha512\n\n' +
                    'Example: Reply to a document and type .hash file md5');
                return;
            }

            const algorithm = args[0].toLowerCase();
            if (!this.supportedHashes.includes(algorithm)) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Unsupported algorithm: ${algorithm}\n\n` +
                    `**Available:** ${this.supportedHashes.join(', ')}`);
                return;
            }

            // Check for quoted message with document
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.documentMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a document/file to generate its hash.');
                return;
            }

            try {
                // Download the document
                const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                const buffer = await downloadMediaMessage(
                    { message: quotedMessage },
                    'buffer',
                    {},
                    {
                        logger: console,
                        reuploadRequest: this.bot.sock.updateMediaMessage
                    }
                );

                const fileName = quotedMessage.documentMessage.fileName || 'Unknown';
                const fileSize = buffer.length;
                const hash = this.generateHashFromBuffer(buffer, algorithm);

                await this.bot.messageHandler.reply(messageInfo,
                    `📄 **File ${algorithm.toUpperCase()} Hash**\n\n` +
                    `**File:** ${fileName}\n` +
                    `**Size:** ${this.formatFileSize(fileSize)}\n\n` +
                    `**Hash:**\n\`\`\`${hash}\`\`\`\n\n` +
                    `📊 Algorithm: ${algorithm.toUpperCase()}`);

            } catch (error) {
                console.error('File hash error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error downloading or processing file. Please try again.');
            }

        } catch (error) {
            console.error('Error in file hash command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing file hash command.');
        }
    }

    async handleTextHash(messageInfo, args) {
        try {
            if (args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔐 Usage: .hash <algorithm> <text>\n\n' +
                    '**Available algorithms:**\n• md5\n• sha1\n• sha256\n• sha512\n\n' +
                    'Examples:\n• .hash md5 Hello World\n• .hash sha256 My secret text');
                return;
            }

            const algorithm = args[0].toLowerCase();
            const text = args.slice(1).join(' ');

            if (!this.supportedHashes.includes(algorithm)) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Unsupported algorithm: ${algorithm}\n\n` +
                    `**Available:** ${this.supportedHashes.join(', ')}`);
                return;
            }

            if (text.length > 1000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long! Maximum 1000 characters.');
                return;
            }

            try {
                const hash = this.generateHash(text, algorithm);
                
                await this.bot.messageHandler.reply(messageInfo,
                    `🔐 **${algorithm.toUpperCase()} Hash**\n\n` +
                    `**Text:** ${text.length > 50 ? text.substring(0, 50) + '...' : text}\n\n` +
                    `**Hash:**\n\`\`\`${hash}\`\`\`\n\n` +
                    `📊 Algorithm: ${algorithm.toUpperCase()}\n` +
                    `📏 Length: ${hash.length} characters`);

            } catch (error) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Error generating hash. Please try again.');
            }

        } catch (error) {
            console.error('Error in text hash command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing text hash command.');
        }
    }

    generateHash(text, algorithm) {
        return crypto.createHash(algorithm).update(text, 'utf8').digest('hex');
    }

    generateHashFromBuffer(buffer, algorithm) {
        return crypto.createHash(algorithm).update(buffer).digest('hex');
    }

    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    async cleanup() {
        console.log('🧹 Hash Generator plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new HashGeneratorPlugin();
        await plugin.init(bot);
        return plugin;
    }
};