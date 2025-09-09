
/**
 * MATDEV Caption Editor Plugin
 * Edit video and image captions without downloading media
 */

const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');

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
        // Add caption to media
        this.bot.messageHandler.registerCommand('addcaption', this.addCaptionCommand.bind(this), {
            description: 'Add caption to image/video without downloading',
            usage: `${config.PREFIX}addcaption <new caption> (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });

        // Edit existing caption
        this.bot.messageHandler.registerCommand('editcaption', this.editCaptionCommand.bind(this), {
            description: 'Edit caption of image/video without downloading',
            usage: `${config.PREFIX}editcaption <new caption> (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });

        // Remove caption
        this.bot.messageHandler.registerCommand('removecaption', this.removeCaptionCommand.bind(this), {
            description: 'Remove caption from image/video without downloading',
            usage: `${config.PREFIX}removecaption (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });

        // Copy caption text from media
        this.bot.messageHandler.registerCommand('copycaption', this.copyCaptionCommand.bind(this), {
            description: 'Extract and send caption text from media',
            usage: `${config.PREFIX}copycaption (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });
    }

    /**
     * Add caption command
     */
    async addCaptionCommand(messageInfo) {
        try {
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to add a caption.\n\n*Usage:* ${config.PREFIX}addcaption <caption>`
                );
                return;
            }

            const mediaInfo = this.getMediaInfo(quotedMessage);
            if (!mediaInfo) {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
                return;
            }

            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a caption.\n\n*Usage:* ${config.PREFIX}addcaption <caption>`
                );
                return;
            }

            const newCaption = messageInfo.args.join(' ');
            await this.processMediaWithCaption(messageInfo, quotedMessage, mediaInfo, newCaption, 'added');

        } catch (error) {
            console.error('Error in addCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error adding caption: ' + error.message);
        }
    }

    /**
     * Edit caption command
     */
    async editCaptionCommand(messageInfo) {
        try {
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to edit its caption.\n\n*Usage:* ${config.PREFIX}editcaption <new caption>`
                );
                return;
            }

            const mediaInfo = this.getMediaInfo(quotedMessage);
            if (!mediaInfo) {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
                return;
            }

            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a new caption.\n\n*Usage:* ${config.PREFIX}editcaption <new caption>`
                );
                return;
            }

            const newCaption = messageInfo.args.join(' ');
            await this.processMediaWithCaption(messageInfo, quotedMessage, mediaInfo, newCaption, 'edited');

        } catch (error) {
            console.error('Error in editCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error editing caption: ' + error.message);
        }
    }

    /**
     * Remove caption command
     */
    async removeCaptionCommand(messageInfo) {
        try {
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to remove its caption.\n\n*Usage:* ${config.PREFIX}removecaption`
                );
                return;
            }

            const mediaInfo = this.getMediaInfo(quotedMessage);
            if (!mediaInfo) {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
                return;
            }

            await this.processMediaWithCaption(messageInfo, quotedMessage, mediaInfo, null, 'removed');

        } catch (error) {
            console.error('Error in removeCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error removing caption: ' + error.message);
        }
    }

    /**
     * Copy caption command - extracts and sends caption text only
     */
    async copyCaptionCommand(messageInfo) {
        try {
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to copy its caption.\n\n*Usage:* ${config.PREFIX}copycaption`
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

        } catch (error) {
            console.error('Error in copyCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error copying caption: ' + error.message);
        }
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
                    console.log(`🗑️ Cleaned up temp file: ${tempFilePath}`);
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
