
/**
 * MATDEV Caption Editor Plugin
 * Edit video and image captions without downloading media
 */

const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

class CaptionEditorPlugin {
    constructor() {
        this.name = 'captioneditor';
        this.description = 'Edit media captions without downloading';
        this.version = '1.0.0';
        this.tempDir = path.join(process.cwd(), 'tmp');
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure temp directory exists
        await fs.ensureDir(this.tempDir);

        console.log('✅ Caption Editor plugin loaded');
        return this;
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Main caption command with subcommands
        this.bot.messageHandler.registerCommand('caption', this.captionCommand.bind(this), {
            description: 'Manage media captions - add, edit, remove, or copy',
            usage: `${config.PREFIX}caption <add|edit|remove|copy> [caption text] (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });
    }

    /**
     * Main caption command handler with subcommands
     */
    async captionCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            
            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please specify an action!\n\n*Usage:*\n` +
                    `${config.PREFIX}caption add <caption text> (reply to media)\n` +
                    `${config.PREFIX}caption edit <new caption> (reply to media)\n` +
                    `${config.PREFIX}caption remove (reply to media)\n` +
                    `${config.PREFIX}caption copy (reply to media)`
                );
                return;
            }

            const action = args[0].toLowerCase();
            const remainingArgs = args.slice(1);

            switch (action) {
                case 'add':
                    await this.handleAddCaption(messageInfo, remainingArgs);
                    break;
                case 'edit':
                    await this.handleEditCaption(messageInfo, remainingArgs);
                    break;
                case 'remove':
                    await this.handleRemoveCaption(messageInfo);
                    break;
                case 'copy':
                    await this.handleCopyCaption(messageInfo);
                    break;
                default:
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Unknown action: "${action}"\n\n*Valid actions:* add, edit, remove, copy`
                    );
                    break;
            }

        } catch (error) {
            console.error('Error in captionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing caption command: ' + error.message);
        }
    }

    /**
     * Handle add caption subcommand
     */
    async handleAddCaption(messageInfo, args) {
        const quotedMessage = await this.getQuotedMessage(messageInfo);
        if (!quotedMessage) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please reply to an image or video to add a caption.\n\n*Usage:* ${config.PREFIX}caption add <caption text>`
            );
            return;
        }

        const mediaInfo = this.getMediaInfo(quotedMessage);
        if (!mediaInfo) {
            await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
            return;
        }

        if (!args.length) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please provide a caption.\n\n*Usage:* ${config.PREFIX}caption add <caption text>`
            );
            return;
        }

        const newCaption = args.join(' ');
        await this.processMediaWithCaption(messageInfo, quotedMessage, mediaInfo, newCaption, 'added');
    }

    /**
     * Handle edit caption subcommand
     */
    async handleEditCaption(messageInfo, args) {
        const quotedMessage = await this.getQuotedMessage(messageInfo);
        if (!quotedMessage) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please reply to an image or video to edit its caption.\n\n*Usage:* ${config.PREFIX}caption edit <new caption>`
            );
            return;
        }

        const mediaInfo = this.getMediaInfo(quotedMessage);
        if (!mediaInfo) {
            await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
            return;
        }

        if (!args.length) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please provide a new caption.\n\n*Usage:* ${config.PREFIX}caption edit <new caption>`
            );
            return;
        }

        const newCaption = args.join(' ');
        await this.processMediaWithCaption(messageInfo, quotedMessage, mediaInfo, newCaption, 'edited');
    }

    /**
     * Handle remove caption subcommand
     */
    async handleRemoveCaption(messageInfo) {
        const quotedMessage = await this.getQuotedMessage(messageInfo);
        if (!quotedMessage) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please reply to an image or video to remove its caption.\n\n*Usage:* ${config.PREFIX}caption remove`
            );
            return;
        }

        const mediaInfo = this.getMediaInfo(quotedMessage);
        if (!mediaInfo) {
            await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
            return;
        }

        await this.processMediaWithCaption(messageInfo, quotedMessage, mediaInfo, null, 'removed');
    }

    /**
     * Handle copy caption subcommand
     */
    async handleCopyCaption(messageInfo) {
        const quotedMessage = await this.getQuotedMessage(messageInfo);
        if (!quotedMessage) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please reply to an image or video to copy its caption.\n\n*Usage:* ${config.PREFIX}caption copy`
            );
            return;
        }

        const mediaInfo = this.getMediaInfo(quotedMessage);
        if (!mediaInfo) {
            await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
            return;
        }

        // Check if there's a caption to copy
        if (!mediaInfo.originalCaption) {
            await this.bot.messageHandler.reply(messageInfo, '❌ The media has no caption to copy.');
            return;
        }

        // Send only the caption text as a regular message
        await this.bot.messageHandler.reply(messageInfo, mediaInfo.originalCaption);
    }

    /**
     * Process media with caption using tmp download method
     */
    async processMediaWithCaption(messageInfo, quotedMessage, mediaInfo, newCaption, action) {
        let tempFilePath = null;
        
        try {
            // Download media to temp directory
            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {});
            if (!buffer) {
                throw new Error('Failed to download media');
            }

            // Generate temp filename
            const timestamp = Date.now();
            const extension = this.getFileExtension(mediaInfo.mimetype);
            const tempFileName = `caption_${timestamp}${extension}`;
            tempFilePath = path.join(this.tempDir, tempFileName);

            // Save to temp file
            await fs.writeFile(tempFilePath, buffer);

            // Prepare media message
            let mediaMessage = {};
            
            if (mediaInfo.type === 'image') {
                mediaMessage = {
                    image: {
                        url: tempFilePath
                    },
                    caption: newCaption || ''
                };
            } else if (mediaInfo.type === 'video') {
                mediaMessage = {
                    video: {
                        url: tempFilePath
                    },
                    caption: newCaption || ''
                };
            }

            // Send the media silently
            await this.bot.sock.sendMessage(messageInfo.chat_jid, mediaMessage);

        } catch (error) {
            console.error('Error processing media with caption:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Failed to ${action} caption. Error: ${error.message}`
            );
        } finally {
            // Clean up temp file
            if (tempFilePath && await fs.pathExists(tempFilePath)) {
                try {
                    await fs.remove(tempFilePath);
                    // console.log(`🗑️ Cleaned up temp file: ${tempFilePath}`);
                } catch (cleanupError) {
                    console.error('Error cleaning up temp file:', cleanupError);
                }
            }
        }
    }

    /**
     * Get quoted/replied message
     */
    async getQuotedMessage(messageInfo) {
        try {
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            if (!contextInfo?.quotedMessage) {
                return null;
            }

            return {
                message: contextInfo.quotedMessage,
                key: {
                    remoteJid: messageInfo.key.remoteJid,
                    id: contextInfo.stanzaId,
                    participant: contextInfo.participant
                }
            };
        } catch (error) {
            console.error('Error getting quoted message:', error);
            return null;
        }
    }

    /**
     * Get media information from message
     */
    getMediaInfo(message) {
        try {
            const msg = message.message;
            if (!msg) return null;

            if (msg.imageMessage) {
                return {
                    type: 'image',
                    media: msg.imageMessage,
                    originalCaption: msg.imageMessage.caption || null,
                    mimetype: msg.imageMessage.mimetype || 'image/jpeg'
                };
            }

            if (msg.videoMessage) {
                return {
                    type: 'video',
                    media: msg.videoMessage,
                    originalCaption: msg.videoMessage.caption || null,
                    mimetype: msg.videoMessage.mimetype || 'video/mp4'
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting media info:', error);
            return null;
        }
    }

    /**
     * Get file extension from mimetype
     */
    getFileExtension(mimetype) {
        const extensions = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/avi': '.avi',
            'video/mkv': '.mkv',
            'video/mov': '.mov',
            'video/3gp': '.3gp'
        };
        
        return extensions[mimetype] || '.bin';
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new CaptionEditorPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
