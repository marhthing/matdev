/**
 * MATDEV Sticker Plugin
 * Convert images and videos to stickers
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

class StickerPlugin {
    constructor() {
        this.name = 'sticker';
        this.description = 'Convert images and videos to stickers';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure media directory exists
        await fs.ensureDir(path.join(process.cwd(), 'session', 'media'));

        console.log('✅ Sticker plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('sticker', this.stickerCommand.bind(this), {
            description: 'Convert image/video to sticker',
            usage: `${config.PREFIX}sticker (reply to image/video)`,
            category: 'media',
            plugin: 'sticker',
            source: 'sticker.js'
        });
    }

    /**
     * Create sticker command
     */
    async stickerCommand(messageInfo) {
        try {
            // Import wa-sticker-formatter
            const { Sticker, StickerTypes } = require('wa-sticker-formatter');
            
            let messageToDownload = null;
            let isImage = false;
            let isVideo = false;

            // Check if this is an image/video with .sticker as caption
            const directImage = messageInfo.message?.imageMessage;
            const directVideo = messageInfo.message?.videoMessage;
            
            
            if (directImage || directVideo) {
                // Direct image/video with .sticker caption
                isImage = !!directImage;
                isVideo = !!directVideo;
                
                messageToDownload = {
                    key: messageInfo.key,
                    message: messageInfo.message
                };
            } else {
                // Check for quoted message using the same simple approach as photoCommand
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      messageInfo.message?.quotedMessage;
                
                if (!quotedMessage) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image/video or send image/video with .sticker as caption.');
                    return;
                }

                // Check if quoted message is image or video
                isImage = quotedMessage.imageMessage;
                isVideo = quotedMessage.videoMessage;
                
                if (!isImage && !isVideo) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image/video or send image/video with .sticker as caption.');
                    return;
                }

                // Use the downloadMedia method like photoCommand does - create proper message structure
                const messageToProcess = {
                    key: messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key || 
                         messageInfo.key, // fallback to current message key
                    message: quotedMessage
                };

                const mediaResult = await this.downloadMedia(messageToProcess, isImage ? 'imageMessage' : 'videoMessage');
                
                if (!mediaResult || !mediaResult.buffer) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process media. Please try again.');
                    return;
                }

                // Create proper WhatsApp sticker using wa-sticker-formatter
                
                // Configure sticker options based on media type
                const stickerOptions = {
                    pack: config.BOT_NAME || 'MATDEV',
                    author: config.BOT_NAME || 'MATDEV', 
                    type: StickerTypes.FULL,
                    categories: ['🤖'], // Bot category
                    quality: isVideo ? 60 : 90 // Lower quality for videos to meet size limits
                };

                // For video stickers, add specific handling
                if (isVideo) {
                    // console.log('🎬 Processing video sticker with optimized settings...');
                    // Additional options for video processing can be added here
                } else {
                    // console.log('🖼️ Processing image sticker...');
                }
                
                const sticker = new Sticker(mediaResult.buffer, stickerOptions);

                // Convert to proper WebP format with embedded metadata
                const stickerBuffer = await sticker.toBuffer();
                
                if (!stickerBuffer || stickerBuffer.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Failed to create sticker. Please try again.');
                    return;
                }

                console.log('✅ Sticker');

                // Send the properly formatted sticker
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    sticker: stickerBuffer
                });
                
                // console.log('✅ Sticker sent successfully');
                return;
            }

            // Download media using Baileys directly for non-quoted messages
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            if (!buffer || buffer.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download media. Please try again.');
                return;
            }

            // Create proper WhatsApp sticker using wa-sticker-formatter
            
            // Configure sticker options based on media type
            const stickerOptions = {
                pack: config.BOT_NAME || 'MATDEV',
                author: config.BOT_NAME || 'MATDEV', 
                type: StickerTypes.FULL,
                categories: ['🤖'], // Bot category
                quality: isVideo ? 60 : 90 // Lower quality for videos to meet size limits
            };

            // For video stickers, add specific handling
            if (isVideo) {
                // console.log('🎬 Processing video sticker with optimized settings...');
                // Additional options for video processing can be added here
            } else {
                // console.log('🖼️ Processing image sticker...');
            }
            
            const sticker = new Sticker(buffer, stickerOptions);

            // Convert to proper WebP format with embedded metadata
            const stickerBuffer = await sticker.toBuffer();
            
            if (!stickerBuffer || stickerBuffer.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to create sticker. Please try again.');
                return;
            }

            console.log('✅ Sticker');

            // Send the properly formatted sticker
            await this.bot.sock.sendMessage(messageInfo.sender, {
                sticker: stickerBuffer
            });
            
            // console.log('✅ Sticker sent successfully');

        } catch (error) {
            console.error('❌ Sticker creation error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error creating sticker. Please try again with a smaller image or shorter video (max 6 seconds).');
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
        console.log('🧹 Sticker plugin cleanup completed');
    }
}

module.exports = {
    init: async (bot) => {
        const plugin = new StickerPlugin();
        await plugin.init(bot);
        return plugin;
    }
};