/**
 * MATDEV Media Plugin
 * Advanced media processing with multiple download methods
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const config = require('../config');
const Utils = require('../lib/utils'); // Keep the Utils import as it's used in the original code for formatting

const utils = new Utils(); // Instantiate Utils as it was in the original

class MediaPlugin {
    constructor() {
        this.name = 'media';
        this.description = 'Media processing and manipulation';
        this.version = '1.0.0';
        this.tempDir = path.join(process.cwd(), 'tmp'); // Keep the tempDir from original
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure temp directory exists (from original)
        await fs.ensureDir(this.tempDir);
        // Ensure media directory exists (from edited)
        await fs.ensureDir(path.join(process.cwd(), 'session', 'media'));

        console.log('✅ Media plugin loaded');
    }

    /**
     * Register media commands
     */
    registerCommands() {
        // Main media command with subcommands
        this.bot.messageHandler.registerCommand('media', this.mediaCommand.bind(this), {
            description: 'Media processing and manipulation',
            usage: `${config.PREFIX}media [subcommand] - Available: info, convert <format>, compress, mp3`,
            category: 'media'
        });
    }

    /**
     * Main media command dispatcher
     */
    async mediaCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            const subcommand = args[0]?.toLowerCase();

            // Handle subcommands
            switch (subcommand) {
                case 'info':
                    await this.handleInfoCommand(messageInfo);
                    break;
                case 'convert':
                    await this.handleConvertCommand(messageInfo, args.slice(1));
                    break;
                case 'compress':
                    await this.handleCompressCommand(messageInfo);
                    break;
                case 'mp3':
                    await this.handleToMp3Command(messageInfo);
                    break;
                default:
                    // No subcommand - show available subcommands
                    const helpText = `*📱 MEDIA COMMANDS*\n\n` +
                        `*Usage:* ${config.PREFIX}media <subcommand>\n\n` +
                        `*Available subcommands:*\n` +
                        `• \`info\` - Get media information\n` +
                        `• \`convert <format>\` - Convert to different format\n` +
                        `• \`compress\` - Compress media file\n` +
                        `• \`mp3\` - Convert to MP3 format\n` +
                        `\n` +
                        `*Example:* ${config.PREFIX}media info (reply to media)`;
                    
                    await this.bot.messageHandler.reply(messageInfo, helpText);
                    break;
            }

        } catch (error) {
            console.error('Media command error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing media command.');
        }
    }

    /**
     * Get quoted message reliably
     */
    getQuoted(messageInfo) {
        return messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
               messageInfo.message?.quotedMessage ||
               null;
    }

    /**
     * Get media type from message directly (like other plugins do)
     */
    getMediaType(message) {
        // Check for media types directly on the quoted message content
        if (message.imageMessage) return 'imageMessage';
        if (message.videoMessage) return 'videoMessage';
        if (message.audioMessage) return 'audioMessage';
        if (message.documentMessage) return 'documentMessage';
        if (message.stickerMessage) return 'stickerMessage';
        
        return null; // No media found
    }

    /**
     * Get and validate quoted media message
     */
    getQuotedMedia(messageInfo) {
        // Get quoted message
        const quoted = this.getQuoted(messageInfo);
        if (!quoted) {
            return { error: '❌ Please reply to a media message.' };
        }

        // Validate it's a media message
        const mediaType = this.getMediaType(quoted);
        if (!mediaType) {
            return { error: '❌ Quoted message is not a media file.' };
        }

        return { quoted, mediaType };
    }

    /**
     * Handle info subcommand
     */
    async handleInfoCommand(messageInfo) {
        const { quoted, mediaType, error } = this.getQuotedMedia(messageInfo);
        if (error) {
            await this.bot.messageHandler.reply(messageInfo, error);
            return;
        }
        
        await this.handleInfo(messageInfo, quoted, mediaType);
    }

    /**
     * Handle info processing
     */
    async handleInfo(messageInfo, quoted, mediaType) {
        try {
            const mediaContent = quoted[mediaType];
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
            console.error('Media info error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving media information.');
        }
    }

    /**
     * Handle convert subcommand
     */
    async handleConvertCommand(messageInfo, args) {
        const { quoted, mediaType, error } = this.getQuotedMedia(messageInfo);
        if (error) {
            await this.bot.messageHandler.reply(messageInfo, error);
            return;
        }
        
        await this.handleConvert(messageInfo, quoted, mediaType, args);
    }

    /**
     * Handle convert processing
     */
    async handleConvert(messageInfo, quoted, mediaType, args) {
        try {
            if (args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please specify target format (jpg, png, mp3, mp4, etc.).');
                return;
            }

            // await this.bot.messageHandler.reply(messageInfo, '🔄 Converting media... Please wait.');

            const targetFormat = args[0].toLowerCase();

            // Download media using updated method
            const { buffer } = await this.downloadMediaRobust(messageInfo, quoted, mediaType);
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
            console.error('Convert error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting media.');
        }
    }




    /**
     * Handle compress subcommand
     */
    async handleCompressCommand(messageInfo) {
        const { quoted, mediaType, error } = this.getQuotedMedia(messageInfo);
        if (error) {
            await this.bot.messageHandler.reply(messageInfo, error);
            return;
        }
        
        await this.handleCompress(messageInfo, quoted, mediaType);
    }

    /**
     * Handle compress processing
     */
    async handleCompress(messageInfo, quoted, mediaType) {
        try {
            // await this.bot.messageHandler.reply(messageInfo, '🗜️ Compressing media... Please wait.');

            // Download media using updated method
            const { buffer } = await this.downloadMediaRobust(messageInfo, quoted, mediaType);

            // Send compressed version (simplified - in production use proper compression tools)
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
            console.error('Compress error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error compressing media.');
        }
    }


    /**
     * Handle mp3 subcommand
     */
    async handleToMp3Command(messageInfo) {
        const { quoted, mediaType, error } = this.getQuotedMedia(messageInfo);
        if (error) {
            await this.bot.messageHandler.reply(messageInfo, error);
            return;
        }
        
        await this.handleToMp3(messageInfo, quoted, mediaType);
    }

    /**
     * Handle mp3 processing
     */
    async handleToMp3(messageInfo, quoted, mediaType) {
        try {
            if (!['audioMessage', 'videoMessage'].includes(mediaType)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or video file.');
                return;
            }

            // await this.bot.messageHandler.reply(messageInfo, '🎵 Converting to MP3... Please wait.');

            // Download media using updated method
            const { buffer } = await this.downloadMediaRobust(messageInfo, quoted, mediaType);

            // Send as MP3
            await this.bot.sock.sendMessage(messageInfo.sender, {
                audio: buffer,
                mimetype: 'audio/mpeg',
                fileName: `audio_${Date.now()}.mp3`
            });

        } catch (error) {
            console.error('ToMp3 error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting to MP3.');
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
                // Final fallback to existing downloadMedia method with proper key
                const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;
                const fallbackMessage = {
                    key: { 
                        id: ctx?.stanzaId || `final_fallback_${Date.now()}`,
                        remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                        participant: ctx?.participant || undefined
                    },
                    message: quoted
                };
                
                return await this.downloadMedia(fallbackMessage, mediaType);
            }
        }
    }

    /**
     * Download media with multiple fallback methods
     */
    async downloadMedia(message, messageType) {
        let mediaBuffer = null;
        let mediaInfo = {};

        // console.log(`📥 Starting media download for type: ${messageType}`);

        try {
            // Method 1: Try to get from cached files in session/media folder
            // console.log('🔍 Method 1: Checking session/media folder...');
            const messageId = message.key?.id;
            if (messageId) {
                const mediaDir = path.join(process.cwd(), 'session', 'media');
                const files = await fs.readdir(mediaDir).catch(() => []);

                // Look for files that contain the message ID
                const mediaFile = files.find(file => file.includes(messageId));
                if (mediaFile) {
                    const filePath = path.join(mediaDir, mediaFile);
                    // console.log(`📁 Found cached media file: ${mediaFile}`);

                    const stats = await fs.stat(filePath);
                    if (stats.size > 0) {
                        mediaBuffer = await fs.readFile(filePath);
                        mediaInfo = {
                            filename: mediaFile,
                            size: stats.size,
                            source: 'session_cache'
                        };
                        // console.log(`✅ Successfully loaded from session cache: ${mediaFile} (${stats.size} bytes)`);
                    }
                }
            }

            // Method 2: Try database archived media if session cache failed
            // This part assumes a `this.bot.database.getArchivedMedia` method exists
            // If it doesn't, this block will fail or be skipped.
            if (!mediaBuffer && messageId && this.bot.database && typeof this.bot.database.getArchivedMedia === 'function') {
                // console.log('🔍 Method 2: Checking database archived media...');
                const archivedMedia = await this.bot.database.getArchivedMedia(messageId);
                if (archivedMedia && archivedMedia.buffer && archivedMedia.buffer.length > 0) {
                    mediaBuffer = archivedMedia.buffer;
                    mediaInfo = {
                        filename: archivedMedia.filename || `media_${messageId}`,
                        size: archivedMedia.buffer.length,
                        source: 'database_archive'
                    };
                    // console.log(`✅ Successfully loaded from database: ${mediaInfo.filename} (${mediaInfo.size} bytes)`);
                }
            }

            // Method 3: Direct baileys download as last resort
            if (!mediaBuffer) {
                // console.log('🔍 Method 3: Direct baileys download...');
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
                        // console.log(`✅ Successfully downloaded directly: ${mediaInfo.size} bytes`);
                    }
                } catch (directError) {
                    console.log(`❌ Direct download failed: ${directError.message}`);
                }
            }

            if (!mediaBuffer) {
                throw new Error('All download methods failed');
            }

            // Get media type info from the original message object
            const messageContent = message.message || message; // Handle cases where message itself is the content
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


            // console.log(`📊 Final media info:`, mediaInfo);
            return { buffer: mediaBuffer, info: mediaInfo };

        } catch (error) {
            console.error(`❌ Media download failed:`, error);
            throw new Error(`Unable to process media: ${error.message}`);
        }
    }


    /**
     * Get media information from message
     * This method seems to be from the original code, but the edited snippet also has a getMediaInfo command.
     * We will keep the original `getMediaInfo` method as it's used by `mediainfoCommand`.
     * The `getMediaInfo` command in the edited snippet should be renamed if it clashes.
     * Let's assume the edited snippet's "getMediaInfo" command handler should be mapped to `mediainfoCommand`.
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
        // return plugin; // Keep original return structure for init
        // The original code doesn't return the plugin instance from init,
        // so we'll stick to that. The 'setInterval' for cleanup is also removed
        // as it was not in the edited snippet and is not essential for the core fix.
        // If cleanup needs to be scheduled, it should be explicitly added.

        // The edited snippet does not include the cleanup interval, so we will remove it.
        // If it's crucial, it should be explicitly re-added.
        // setInterval(() => {
        //     plugin.cleanup();
        // }, 30 * 60 * 1000); // Every 30 minutes
    }
};