
/**
 * MATDEV Video Plugin
 * Convert GIF or GIF stickers to video format
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');

class VideoPlugin {
    constructor() {
        this.name = 'video';
        this.description = 'Convert GIF or GIF stickers to video';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure media directory exists
        await fs.ensureDir(path.join(process.cwd(), 'session', 'media'));

        console.log('✅ Video plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('video', this.videoCommand.bind(this), {
            description: 'Convert GIF or GIF sticker to video',
            usage: `${config.PREFIX}video (reply to GIF or GIF sticker)`,
            category: 'media',
            plugin: 'video',
            source: 'video.js'
        });
    }

    /**
     * Convert GIF or GIF sticker to video
     */
    async videoCommand(messageInfo) {
        try {
            let messageToDownload = null;
            let isGifSticker = false;
            let isGifImage = false;
            let isGifDocument = false;

            // Check if this is a direct GIF/GIF sticker with .video as caption
            const directImage = messageInfo.message?.imageMessage;
            const directDocument = messageInfo.message?.documentMessage;
            const directSticker = messageInfo.message?.stickerMessage;
            
            if (directImage || directDocument || directSticker) {
                // Direct GIF/GIF sticker with .video caption
                isGifImage = directImage && directImage.mimetype === 'image/gif';
                isGifDocument = directDocument && directDocument.mimetype === 'image/gif';
                isGifSticker = directSticker && directSticker.isAnimated;
                
                if (isGifImage || isGifDocument || isGifSticker) {
                    messageToDownload = {
                        key: messageInfo.key,
                        message: messageInfo.message
                    };
                }
            } else {
                // Check for quoted message using the same approach as sticker plugin
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      messageInfo.message?.quotedMessage;
                
                if (!quotedMessage) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF or GIF sticker.');
                    return;
                }

                // Check if quoted message is GIF sticker or regular GIF
                isGifSticker = quotedMessage.stickerMessage && quotedMessage.stickerMessage.isAnimated;
                isGifImage = quotedMessage.imageMessage && quotedMessage.imageMessage.mimetype === 'image/gif';
                isGifDocument = quotedMessage.documentMessage && quotedMessage.documentMessage.mimetype === 'image/gif';
                
                if (!isGifSticker && !isGifImage && !isGifDocument) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF or GIF sticker.');
                    return;
                }

                // Use the downloadMedia method like other plugins - create proper message structure
                const messageToProcess = {
                    key: messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key || 
                         messageInfo.key, // fallback to current message key
                    message: quotedMessage
                };

                // Determine media type
                let mediaType;
                if (isGifSticker) {
                    mediaType = 'stickerMessage';
                } else if (isGifImage) {
                    mediaType = 'imageMessage';
                } else {
                    mediaType = 'documentMessage';
                }

                const mediaResult = await this.downloadMedia(messageToProcess, mediaType);
                
                if (!mediaResult || !mediaResult.buffer) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process GIF. Please try again.');
                    return;
                }

                // Send as video
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    video: mediaResult.buffer,
                    mimetype: 'video/mp4',
                    caption: '🎬 GIF converted to video'
                });

                console.log('✅ Video');
                return;
            }

            if (!messageToDownload) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF or GIF sticker.');
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

            // Send as video
            await this.bot.sock.sendMessage(messageInfo.sender, {
                video: buffer,
                mimetype: 'video/mp4',
                caption: '🎬 GIF converted to video'
            });

            console.log('✅ Video');

        } catch (error) {
            console.log('Video error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting GIF to video.');
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
}

// Export the plugin class instance with init function
const videoPlugin = new VideoPlugin();

module.exports = {
    init: videoPlugin.init.bind(videoPlugin),
    name: videoPlugin.name,
    description: videoPlugin.description,
    version: videoPlugin.version
};
