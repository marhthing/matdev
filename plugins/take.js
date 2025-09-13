/**
 * MATDEV Take Plugin
 * Take sticker and add custom metadata
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');

class TakePlugin {
    constructor() {
        this.name = 'take';
        this.description = 'Take sticker and add custom metadata';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure media directory exists
        await fs.ensureDir(path.join(process.cwd(), 'session', 'media'));

        console.log('✅ Take plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('take', this.takeCommand.bind(this), {
            description: 'Take sticker and add metadata',
            usage: `${config.PREFIX}take <packname>|<author> (reply to sticker)`,
            category: 'media',
            plugin: 'take',
            source: 'take.js'
        });
    }

    /**
     * Take sticker command
     */
    async takeCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a sticker.');
                return;
            }

            if (!quotedMessage.stickerMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a sticker.');
                return;
            }

            let packname = config.BOT_NAME || 'MATDEV';
            let author = config.BOT_NAME || 'MATDEV';

            if (args.length > 0) {
                const metadata = args.join(' ').split('|');
                if (metadata.length >= 2) {
                    packname = metadata[0].trim();
                    author = metadata[1].trim();
                } else {
                    packname = metadata[0].trim();
                }
            }

            // Use the same robust download method as .sticker command
            // Create proper message structure for downloadMedia
            const messageToProcess = {
                key: messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key || 
                     messageInfo.key, // fallback to current message key
                message: quotedMessage
            };

            const mediaResult = await this.downloadMedia(messageToProcess, 'stickerMessage');
            
            if (!mediaResult || !mediaResult.buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process sticker. Please try again.');
                return;
            }

            // Use wa-sticker-formatter to properly embed metadata
            const { Sticker, StickerTypes } = require('wa-sticker-formatter');

            // Configure sticker options with custom metadata
            const stickerOptions = {
                pack: packname,
                author: author,
                type: StickerTypes.FULL,
                categories: ['🤖'],
                quality: 90
            };

            // Check if original was animated and preserve that
            if (quotedMessage.stickerMessage.isAnimated) {
                stickerOptions.animated = true;
            }

            // Create sticker with embedded metadata
            const sticker = new Sticker(mediaResult.buffer, stickerOptions);
            const stickerBuffer = await sticker.toBuffer();

            if (!stickerBuffer || stickerBuffer.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to process sticker with metadata.');
                return;
            }

            // Send the sticker with embedded metadata
            await this.bot.sock.sendMessage(messageInfo.sender, {
                sticker: stickerBuffer
            });

        } catch (error) {
            console.log('Take error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error taking sticker.');
        }
    }

    /**
     * Download media with multiple fallback methods
     */
    async downloadMedia(message, messageType) {
        let mediaBuffer = null;
        let mediaInfo = {};

        try {
            // Method 1: Try to get from cached files in session/media folder
            const messageId = message.key?.id;
            if (messageId) {
                const mediaDir = path.join(process.cwd(), 'session', 'media');
                const files = await fs.readdir(mediaDir).catch(() => []);

                // Look for files that contain the message ID
                const mediaFile = files.find(file => file.includes(messageId));
                if (mediaFile) {
                    const filePath = path.join(mediaDir, mediaFile);

                    const stats = await fs.stat(filePath);
                    if (stats.size > 0) {
                        mediaBuffer = await fs.readFile(filePath);
                        mediaInfo = {
                            filename: mediaFile,
                            size: stats.size,
                            source: 'session_cache'
                        };
                    }
                }
            }

            // Method 2: Try database archived media if session cache failed
            if (!mediaBuffer && messageId && this.bot.database && typeof this.bot.database.getArchivedMedia === 'function') {
                const archivedMedia = await this.bot.database.getArchivedMedia(messageId);
                if (archivedMedia && archivedMedia.buffer && archivedMedia.buffer.length > 0) {
                    mediaBuffer = archivedMedia.buffer;
                    mediaInfo = {
                        filename: archivedMedia.filename || `media_${messageId}`,
                        size: archivedMedia.buffer.length,
                        source: 'database_archive'
                    };
                }
            }

            // Method 3: Direct baileys download as last resort
            if (!mediaBuffer) {
                try {
                    // Ensure we pass the correct message structure to downloadMediaMessage
                    const messageToDownload = message.message ? message : { message: message };
                    mediaBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                        logger: console,
                        reuploadRequest: this.bot.sock.updateMediaMessage
                    });

                    if (mediaBuffer) {
                        mediaInfo = {
                            filename: `direct_${Date.now()}`,
                            size: mediaBuffer.length,
                            source: 'direct_download'
                        };
                    }
                } catch (directError) {
                    console.log(`❌ Direct download failed: ${directError.message}`);
                }
            }

            if (!mediaBuffer) {
                throw new Error('All download methods failed');
            }

            // Get media type info from the original message object
            const messageContent = message.message || message;
            const actualMediaType = Object.keys(messageContent).find(type => ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(type));
            
            if (actualMediaType && messageContent[actualMediaType]) {
                const mediaMessage = messageContent[actualMediaType];
                mediaInfo.mimetype = mediaMessage.mimetype;
                mediaInfo.caption = mediaMessage.caption;
                mediaInfo.seconds = mediaMessage.seconds;
                mediaInfo.fileLength = mediaMessage.fileLength;
            } else if (messageType && message.message && message.message[messageType]) {
                // Fallback if actualMediaType extraction fails
                const mediaMessage = message.message[messageType];
                mediaInfo.mimetype = mediaMessage.mimetype;
                mediaInfo.caption = mediaMessage.caption;
                mediaInfo.seconds = mediaMessage.seconds;
                mediaInfo.fileLength = mediaMessage.fileLength;
            }

            return { buffer: mediaBuffer, info: mediaInfo };

        } catch (error) {
            console.error(`❌ Media download failed:`, error);
            throw new Error(`Unable to process media: ${error.message}`);
        }
    }

    async cleanup() {
        console.log('🧹 Take plugin cleanup completed');
    }
}

module.exports = {
    init: async (bot) => {
        const plugin = new TakePlugin();
        await plugin.init(bot);
        return plugin;
    }
};