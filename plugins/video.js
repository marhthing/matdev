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

        // Ensure tmp directory exists
        await fs.ensureDir(path.join(process.cwd(), 'tmp'));

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
        let tempFilePath = null;

        try {
            // Enhanced quoted message detection using contextInfo
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            let quotedMessage = null;
            let quotedKey = null;

            if (contextInfo && contextInfo.quotedMessage) {
                quotedMessage = contextInfo.quotedMessage;
                quotedKey = {
                    id: contextInfo.stanzaId,
                    remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                    fromMe: contextInfo.participant ? (contextInfo.participant === this.bot.sock.user?.id) : false,
                    participant: contextInfo.participant || undefined
                };
            } else if (messageInfo.message?.quotedMessage) {
                quotedMessage = messageInfo.message.quotedMessage;
                quotedKey = messageInfo.key;
            }

            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF or GIF sticker.');
                return;
            }

            // Enhanced media type detection
            let mediaType = null;
            let isValidMedia = false;

            // Check for animated sticker (GIF sticker)
            if (quotedMessage.stickerMessage) {
                mediaType = 'stickerMessage';
                // Any sticker can potentially be converted to video
                isValidMedia = true;
                console.log('📹 Detected sticker message for video conversion');
            }
            // Check for GIF image
            else if (quotedMessage.imageMessage && 
                     (quotedMessage.imageMessage.mimetype === 'image/gif' || 
                      quotedMessage.imageMessage.gifPlayback)) {
                mediaType = 'imageMessage';
                isValidMedia = true;
                console.log('📹 Detected GIF image for video conversion');
            }
            // Check for GIF document
            else if (quotedMessage.documentMessage && 
                     quotedMessage.documentMessage.mimetype === 'image/gif') {
                mediaType = 'documentMessage';
                isValidMedia = true;
                console.log('📹 Detected GIF document for video conversion');
            }
            // Check for video (for potential re-encoding)
            else if (quotedMessage.videoMessage) {
                mediaType = 'videoMessage';
                isValidMedia = true;
                console.log('📹 Detected video for re-encoding');
            }

            if (!isValidMedia) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF, sticker, or video.');
                return;
            }

            // Create proper message structure for download
            const messageToProcess = {
                key: quotedKey,
                message: quotedMessage
            };

            console.log(`📹 Processing ${mediaType} for video conversion...`);

            // Download media using the robust download method
            const mediaResult = await this.downloadMediaRobust(messageInfo, quotedMessage, mediaType);

            if (!mediaResult || !mediaResult.buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process media. Please try again.');
                return;
            }

            // Generate temp filename in tmp directory
            const timestamp = Date.now();
            const tempFileName = `video_${timestamp}.mp4`;
            tempFilePath = path.join(process.cwd(), 'tmp', tempFileName);

            // Write buffer to temp file
            await fs.writeFile(tempFilePath, mediaResult.buffer);

            // Send as video using the temp file
            await this.bot.sock.sendMessage(messageInfo.sender, {
                video: { url: tempFilePath },
                mimetype: 'video/mp4',
                caption: '🎬 GIF converted to video'
            });

            console.log('✅ Video');

        } catch (error) {
            console.log('Video error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting GIF to video.');
        } finally {
            // Clean up temp file
            if (tempFilePath) {
                try {
                    await fs.unlink(tempFilePath);
                } catch (cleanupError) {
                    console.log('Cleanup error (non-critical):', cleanupError.message);
                }
            }
        }
    }

    /**
     * Robust media download with latest Baileys methods
     */
    async downloadMediaRobust(messageInfo, quoted, mediaType) {
        try {
            // Extract contextInfo for proper quoted message key construction
            const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;
            
            if (!ctx || !ctx.stanzaId) {
                throw new Error('No quoted message context found - unable to download media');
            }

            // Construct proper key using contextInfo data
            const quotedKey = {
                id: ctx.stanzaId,
                remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                fromMe: ctx.participant ? (ctx.participant === this.bot.sock.user?.id) : false,
                participant: ctx.participant || undefined
            };

            // Create proper WAMessage structure with correct key
            const messageToDownload = {
                key: quotedKey,
                message: quoted
            };

            // Try downloading as stream first (memory efficient)
            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            // Convert stream to buffer
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            if (!buffer || buffer.length === 0) {
                throw new Error('Downloaded buffer is empty');
            }

            return {
                buffer,
                info: {
                    size: buffer.length,
                    source: 'stream_download'
                }
            };

        } catch (error) {
            console.error('Stream download failed, trying buffer fallback:', error);
            
            try {
                // Use same key extraction for buffer fallback
                const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;
                
                if (!ctx || !ctx.stanzaId) {
                    throw new Error('No quoted message context found for buffer fallback');
                }

                const quotedKey = {
                    id: ctx.stanzaId,
                    remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                    fromMe: ctx.participant ? (ctx.participant === this.bot.sock.user?.id) : false,
                    participant: ctx.participant || undefined
                };

                const messageToDownload = {
                    key: quotedKey,
                    message: quoted
                };

                const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                    logger: console,
                    reuploadRequest: this.bot.sock.updateMediaMessage
                });

                return {
                    buffer,
                    info: {
                        size: buffer.length,
                        source: 'buffer_fallback'
                    }
                };
            } catch (fallbackError) {
                console.error('All download methods failed:', fallbackError);
                return null;
            }
        }
    }

    /**
     * Download media with multiple fallback methods (legacy method)
     */
    async downloadMedia(message, messageType) {
        let mediaBuffer = null;
        let mediaInfo = {};

        try {
            // Method 1: Try to get from cached files in session/media folder
            const messageId = message.key?.id;
            if (messageId) {
                const mediaDir = path.join(process.cwd(), 'session', 'media');

                try {
                    const files = await fs.readdir(mediaDir);
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
                } catch (sessionError) {
                    // Session directory might not exist, continue to other methods
                }
            }

            // Method 2: Try database archived media if session cache failed
            if (!mediaBuffer && messageId && this.bot.database && typeof this.bot.database.getArchivedMedia === 'function') {
                try {
                    const archivedMedia = await this.bot.database.getArchivedMedia(messageId);
                    if (archivedMedia && archivedMedia.buffer && archivedMedia.buffer.length > 0) {
                        mediaBuffer = archivedMedia.buffer;
                        mediaInfo = {
                            filename: archivedMedia.filename || `media_${messageId}`,
                            size: archivedMedia.buffer.length,
                            source: 'database_archive'
                        };
                    }
                } catch (dbError) {
                    // Database method failed, continue to direct download
                }
            }

            // Method 3: Direct baileys download as last resort
            if (!mediaBuffer) {
                try {
                    mediaBuffer = await downloadMediaMessage(message, 'buffer', {}, {
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
            const actualMediaType = Object.keys(messageContent).find(type => 
                ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(type)
            );

            if (actualMediaType && messageContent[actualMediaType]) {
                const mediaMessage = messageContent[actualMediaType];
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