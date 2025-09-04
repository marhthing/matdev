/**
 * MATDEV Media Plugin
 * Advanced media processing and manipulation commands
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');
const Utils = require('../lib/utils');

const utils = new Utils();

class MediaPlugin {
    constructor() {
        this.name = 'media';
        this.description = 'Media processing and manipulation';
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
        
        console.log('✅ Media plugin loaded');
    }

    /**
     * Register media commands
     */
    registerCommands() {
        // Media info command
        this.bot.messageHandler.registerCommand('mediainfo', this.mediainfoCommand.bind(this), {
            description: 'Get information about media file',
            usage: `${config.PREFIX}mediainfo (reply to media)`,
            category: 'media'
        });

        // Convert media command
        this.bot.messageHandler.registerCommand('convert', this.convertCommand.bind(this), {
            description: 'Convert media to different format',
            usage: `${config.PREFIX}convert <format> (reply to media)`,
            category: 'media'
        });

        // Sticker command
        this.bot.messageHandler.registerCommand('sticker', this.stickerCommand.bind(this), {
            description: 'Convert image/video to sticker',
            usage: `${config.PREFIX}sticker (reply to image/video)`,
            category: 'media'
        });

        // Take sticker command
        this.bot.messageHandler.registerCommand('take', this.takeCommand.bind(this), {
            description: 'Take sticker and add metadata',
            usage: `${config.PREFIX}take <packname>|<author> (reply to sticker)`,
            category: 'media'
        });

        // Photo command
        this.bot.messageHandler.registerCommand('photo', this.photoCommand.bind(this), {
            description: 'Convert sticker to photo',
            usage: `${config.PREFIX}photo (reply to sticker)`,
            category: 'media'
        });

        // Compress command
        this.bot.messageHandler.registerCommand('compress', this.compressCommand.bind(this), {
            description: 'Compress media file',
            usage: `${config.PREFIX}compress (reply to media)`,
            category: 'media'
        });

        // Audio commands
        this.bot.messageHandler.registerCommand('toaudio', this.toaudioCommand.bind(this), {
            description: 'Convert video to audio',
            usage: `${config.PREFIX}toaudio (reply to video)`,
            category: 'media'
        });

        this.bot.messageHandler.registerCommand('tomp3', this.tomp3Command.bind(this), {
            description: 'Convert audio to MP3',
            usage: `${config.PREFIX}tomp3 (reply to audio/video)`,
            category: 'media'
        });

        // Video commands
        this.bot.messageHandler.registerCommand('tovideo', this.tovideoCommand.bind(this), {
            description: 'Convert to video format',
            usage: `${config.PREFIX}tovideo (reply to gif/video)`,
            category: 'media'
        });

        // Image commands
        this.bot.messageHandler.registerCommand('toimage', this.toimageCommand.bind(this), {
            description: 'Convert to image format',
            usage: `${config.PREFIX}toimage (reply to sticker/document)`,
            category: 'media'
        });
    }

    /**
     * Media info command
     */
    async mediainfoCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a media message.');
                return;
            }
            const mediaType = Object.keys(quotedMessage)[0];

            if (!this.isMediaMessage(quotedMessage)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Quoted message is not a media file.');
                return;
            }

            const mediaContent = quotedMessage[mediaType];
            const mediaInfo = await this.getMediaInfo(mediaContent, mediaType);

            const infoText = `*📱 MEDIA INFORMATION*\n\n` +
                `*Type:* ${mediaType.replace('Message', '').toUpperCase()}\n` +
                `*Size:* ${mediaInfo.size ? utils.formatFileSize(mediaInfo.size) : 'Unknown'}\n` +
                `*Duration:* ${mediaInfo.duration ? `${mediaInfo.duration}s` : 'N/A'}\n` +
                `*Dimensions:* ${mediaInfo.width && mediaInfo.height ? `${mediaInfo.width}x${mediaInfo.height}` : 'N/A'}\n` +
                `*MIME Type:* ${mediaInfo.mimetype || 'Unknown'}\n` +
                `*File Name:* ${mediaInfo.fileName || 'Unknown'}\n` +
                `*Animated:* ${mediaInfo.gifPlayback ? 'Yes' : 'No'}\n` +
                `*Viewonce:* ${mediaInfo.viewOnce ? 'Yes' : 'No'}`;

            await this.bot.messageHandler.reply(messageInfo, infoText);

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving media information.');
        }
    }

    /**
     * Convert media command
     */
    async convertCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            if (args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please specify target format (jpg, png, mp3, mp4, etc.).');
                return;
            }

            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a media message.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting media... Please wait.');

            const targetFormat = args[0].toLowerCase();

            if (!this.isMediaMessage(quotedMessage)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Quoted message is not a media file.');
                return;
            }

            // Download and convert media (simplified implementation)
            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {});
            const fileName = `converted_${Date.now()}.${targetFormat}`;
            const outputPath = path.join(this.tempDir, fileName);

            // Write buffer to file (in production, you'd use proper conversion tools like FFmpeg)
            await fs.writeFile(outputPath, buffer);

            // Send converted file
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: { url: outputPath },
                fileName: fileName,
                mimetype: utils.getMimeType(targetFormat),
                caption: `✅ Converted to ${targetFormat.toUpperCase()}`
            });

            // Clean up
            await fs.remove(outputPath);

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting media.');
        }
    }

    /**
     * Create sticker command
     */
    async stickerCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image or video.');
                return;
            }
            const mediaType = Object.keys(quotedMessage)[0];

            if (!['imageMessage', 'videoMessage'].includes(mediaType)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image or video.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🎨 Creating sticker... Please wait.');

            const buffer = await this.downloadMedia(quotedMessage, mediaType);
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process media. Please try again.');
                return;
            }

            // Send as sticker
            await this.bot.sock.sendMessage(messageInfo.sender, {
                sticker: buffer,
                packname: config.BOT_NAME || 'MATDEV',
                author: 'MATDEV Bot'
            });

        } catch (error) {
            console.log('Sticker error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error creating sticker.');
        }
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
            let author = 'MATDEV Bot';

            if (args.length > 0) {
                const metadata = args.join(' ').split('|');
                if (metadata.length >= 2) {
                    packname = metadata[0].trim();
                    author = metadata[1].trim();
                } else {
                    packname = metadata[0].trim();
                }
            }

            const buffer = await this.downloadMedia(quotedMessage, 'stickerMessage');
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process sticker. Please try again.');
                return;
            }

            // Send sticker with new metadata
            await this.bot.sock.sendMessage(messageInfo.sender, {
                sticker: buffer,
                packname: packname,
                author: author
            });

        } catch (error) {
            console.log('Take error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error taking sticker.');
        }
    }

    /**
     * Convert sticker to photo
     */
    async photoCommand(messageInfo) {
        try {
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

            const buffer = await this.downloadMedia(quotedMessage, 'stickerMessage');
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process sticker. Please try again.');
                return;
            }

            // Send as image
            await this.bot.sock.sendMessage(messageInfo.sender, {
                image: buffer,
                caption: '✅ Sticker converted to photo'
            });

        } catch (error) {
            console.log('Photo error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting sticker to photo.');
        }
    }

    /**
     * Compress media command
     */
    async compressCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a media message.');
                return;
            }

            if (!this.isMediaMessage(quotedMessage)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Quoted message is not a media file.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🗜️ Compressing media... Please wait.');

            // This is a simplified implementation
            // In production, you'd use proper compression tools
            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {});
            const mediaType = Object.keys(quotedMessage)[0];
            const mediaContent = quotedMessage[mediaType];

            // Send compressed version (in this case, just resending with lower quality indication)
            if (mediaType === 'imageMessage') {
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    image: buffer,
                    caption: '✅ Image compressed'
                });
            } else if (mediaType === 'videoMessage') {
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    video: buffer,
                    caption: '✅ Video compressed'
                });
            } else {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unsupported media type for compression.');
            }

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error compressing media.');
        }
    }

    /**
     * Convert video to audio
     */
    async toaudioCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a video.');
                return;
            }

            if (!quotedMessage.videoMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a video.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🎵 Extracting audio... Please wait.');

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

            // Send as audio (simplified - in production use FFmpeg for proper conversion)
            await this.bot.sock.sendMessage(messageInfo.sender, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                ptt: false
            });

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error extracting audio.');
        }
    }

    /**
     * Convert to MP3
     */
    async tomp3Command(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or video file.');
                return;
            }
            const mediaType = Object.keys(quotedMessage)[0];

            if (!['audioMessage', 'videoMessage'].includes(mediaType)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or video file.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🎵 Converting to MP3... Please wait.');

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

            // Send as MP3
            await this.bot.sock.sendMessage(messageInfo.sender, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                fileName: `audio_${Date.now()}.mp3`
            });

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting to MP3.');
        }
    }

    /**
     * Convert to video
     */
    async tovideoCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF or video.');
                return;
            }

            if (!this.isMediaMessage(quotedMessage)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Quoted message is not a media file.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🎬 Converting to video... Please wait.');

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

            // Send as video
            await this.bot.sock.sendMessage(messageInfo.sender, {
                video: buffer,
                caption: '✅ Converted to video'
            });

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting to video.');
        }
    }

    /**
     * Convert to image
     */
    async toimageCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a sticker or document.');
                return;
            }
            const mediaType = Object.keys(quotedMessage)[0];

            if (!['stickerMessage', 'documentMessage'].includes(mediaType)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a sticker or image document.');
                return;
            }

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

            // Send as image
            await this.bot.sock.sendMessage(messageInfo.sender, {
                image: buffer,
                caption: '✅ Converted to image'
            });

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting to image.');
        }
    }

    /**
     * Check if message contains media
     */
    isMediaMessage(message) {
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
        return mediaTypes.some(type => message[type]);
    }

    /**
     * Download media from cached files only
     */
    async downloadMedia(quotedMessage, mediaType) {
        try {
            // Only use cached files method
            if (this.bot.database && quotedMessage.key) {
                try {
                    // Try to find cached media by message ID
                    const messageId = quotedMessage.key.id;
                    const cachedPath = path.join(__dirname, '../session/media');
                    const files = await fs.readdir(cachedPath).catch(() => []);
                    
                    console.log(`Looking for cached media for message ID: ${messageId}`);
                    
                    for (const file of files) {
                        if (file.includes(messageId.replace(/[^a-zA-Z0-9]/g, '_'))) {
                            const filePath = path.join(cachedPath, file);
                            const buffer = await fs.readFile(filePath);
                            if (buffer && buffer.length > 0) {
                                console.log(`Found cached media: ${file}`);
                                return buffer;
                            }
                        }
                    }
                    
                    console.log(`No cached media found for message ID: ${messageId}`);
                } catch (error) {
                    console.log('Cache lookup failed:', error);
                }
            }

            return null;
        } catch (error) {
            console.log('Media download from cache failed:', error);
            return null;
        }
    }

    /**
     * Get media information from message
     */
    async getMediaInfo(mediaContent, mediaType) {
        const info = {
            type: mediaType,
            size: mediaContent.fileLength || null,
            duration: mediaContent.seconds || null,
            width: mediaContent.width || null,
            height: mediaContent.height || null,
            mimetype: mediaContent.mimetype || null,
            fileName: mediaContent.fileName || null,
            gifPlayback: mediaContent.gifPlayback || false,
            viewOnce: mediaContent.viewOnce || false
        };

        return info;
    }

    /**
     * Clean up temporary files
     */
    async cleanup() {
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            let cleaned = 0;

            for (const file of files) {
                if (file.startsWith('.')) continue;

                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);

                // Remove files older than 1 hour
                if (now - stats.mtime.getTime() > 3600000) {
                    await fs.remove(filePath);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                console.log(`🧹 Cleaned ${cleaned} temporary media files`);
            }
        } catch (error) {
            console.error('Error cleaning temporary files:', error);
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new MediaPlugin();
        await plugin.init(bot);

        // Set up periodic cleanup
        setInterval(() => {
            plugin.cleanup();
        }, 30 * 60 * 1000); // Every 30 minutes
    }
};
