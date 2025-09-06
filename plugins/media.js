/**
 * MATDEV Media Plugin
 * Advanced media processing with multiple download methods
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
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
        // Media info command (original command name)
        this.bot.messageHandler.registerCommand('mediainfo', this.mediainfoCommand.bind(this), {
            description: 'Get information about media file',
            usage: `${config.PREFIX}mediainfo (reply to media)`,
            category: 'media'
        });

        // Convert media command (original command name)
        this.bot.messageHandler.registerCommand('convert', this.convertCommand.bind(this), {
            description: 'Convert media to different format',
            usage: `${config.PREFIX}convert <format> (reply to media)`,
            category: 'media'
        });

        // Sticker command (original command name)
        this.bot.messageHandler.registerCommand('sticker', this.stickerCommand.bind(this), {
            description: 'Convert image/video to sticker',
            usage: `${config.PREFIX}sticker (reply to image/video)`,
            category: 'media'
        });

        // Take sticker command (original command name)
        this.bot.messageHandler.registerCommand('take', this.takeCommand.bind(this), {
            description: 'Take sticker and add metadata',
            usage: `${config.PREFIX}take <packname>|<author> (reply to sticker)`,
            category: 'media'
        });

        // Photo command (original command name)
        this.bot.messageHandler.registerCommand('photo', this.photoCommand.bind(this), {
            description: 'Convert sticker to photo',
            usage: `${config.PREFIX}photo (reply to sticker)`,
            category: 'media'
        });

        // Compress command (original command name)
        this.bot.messageHandler.registerCommand('compress', this.compressCommand.bind(this), {
            description: 'Compress media file',
            usage: `${config.PREFIX}compress (reply to media)`,
            category: 'media'
        });

        // Audio commands (original command names)
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

        // Video commands (original command names)
        this.bot.messageHandler.registerCommand('tovideo', this.tovideoCommand.bind(this), {
            description: 'Convert to video format',
            usage: `${config.PREFIX}tovideo (reply to gif/video)`,
            category: 'media'
        });

        // Image commands (original command names)
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
            const mediaInfo = await this.getMediaInfo(mediaContent, mediaType); // Keep original getMediaInfo method

            const infoText = `*📱 MEDIA INFORMATION*\n\n` +
                `*Type:* ${mediaType.replace('Message', '').toUpperCase()}\n` +
                `*Size:* ${mediaInfo.size ? utils.formatFileSize(mediaInfo.size) : 'Unknown'}\n` + // Use utils.formatFileSize
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
                mimetype: utils.getMimeType(targetFormat), // Use utils.getMimeType
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
            // Import wa-sticker-formatter
            const { Sticker, StickerTypes } = require('wa-sticker-formatter');
            
            let messageToDownload = null;
            let isImage = false;
            let isVideo = false;

            // Check if this is an image/video with .sticker as caption
            const directImage = messageInfo.message?.imageMessage;
            const directVideo = messageInfo.message?.videoMessage;
            
            console.log(`📷 Direct media check - Image: ${!!directImage}, Video: ${!!directVideo}`);
            if (directImage) {
                console.log(`📷 Image caption: "${directImage.caption}"`);
            }
            if (directVideo) {
                console.log(`🎥 Video caption: "${directVideo.caption}"`);
            }
            
            if (directImage || directVideo) {
                // Direct image/video with .sticker caption
                isImage = !!directImage;
                isVideo = !!directVideo;
                
                messageToDownload = {
                    key: messageInfo.key,
                    message: messageInfo.message
                };
                console.log(`📷 Using direct media for sticker creation`);
            } else {
                // Check for quoted message in multiple possible locations
                let quotedMsg = null;
                let quotedKey = null;
                let quotedParticipant = null;
                
                // Method 1: Standard reply structure (including restored contextInfo from edited messages)
                if (messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                    quotedMsg = messageInfo.message.extendedTextMessage.contextInfo.quotedMessage;
                    quotedKey = messageInfo.message.extendedTextMessage.contextInfo.stanzaId;
                    quotedParticipant = messageInfo.message.extendedTextMessage.contextInfo.participant || messageInfo.sender;
                }
                // Method 2: Edited message with reply structure
                else if (messageInfo.message?.editedMessage?.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                    quotedMsg = messageInfo.message.editedMessage.message.extendedTextMessage.contextInfo.quotedMessage;
                    quotedKey = messageInfo.message.editedMessage.message.extendedTextMessage.contextInfo.stanzaId;
                    quotedParticipant = messageInfo.message.editedMessage.message.extendedTextMessage.contextInfo.participant || messageInfo.sender;
                }
                // Method 3: Try other contextInfo locations for edited messages
                else if (messageInfo.message?.editedMessage?.contextInfo?.quotedMessage) {
                    quotedMsg = messageInfo.message.editedMessage.contextInfo.quotedMessage;
                    quotedKey = messageInfo.message.editedMessage.contextInfo.stanzaId;
                    quotedParticipant = messageInfo.message.editedMessage.contextInfo.participant || messageInfo.sender;
                }
                else if (messageInfo.message?.editedMessage?.message?.contextInfo?.quotedMessage) {
                    quotedMsg = messageInfo.message.editedMessage.message.contextInfo.quotedMessage;
                    quotedKey = messageInfo.message.editedMessage.message.contextInfo.stanzaId;
                    quotedParticipant = messageInfo.message.editedMessage.message.contextInfo.participant || messageInfo.sender;
                }
                else if (messageInfo.message?.conversation && messageInfo.message?.contextInfo?.quotedMessage) {
                    quotedMsg = messageInfo.message.contextInfo.quotedMessage;
                    quotedKey = messageInfo.message.contextInfo.stanzaId;
                    quotedParticipant = messageInfo.message.contextInfo.participant || messageInfo.sender;
                }

                if (!quotedMsg) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image/video or send image/video with .sticker as caption.');
                    return;
                }

                // Check if quoted message is image or video
                isImage = quotedMsg.imageMessage;
                isVideo = quotedMsg.videoMessage;
                
                if (!isImage && !isVideo) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image/video or send image/video with .sticker as caption.');
                    return;
                }

                // Create proper message structure for Baileys download
                messageToDownload = {
                    key: {
                        remoteJid: messageInfo.chat_jid,
                        fromMe: false,
                        id: quotedKey,
                        participant: quotedParticipant
                    },
                    message: quotedMsg
                };
            }

            // Download media using Baileys directly
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
                console.log('🎬 Processing video sticker with optimized settings...');
                // Additional options for video processing can be added here
            } else {
                console.log('🖼️ Processing image sticker...');
            }
            
            const sticker = new Sticker(buffer, stickerOptions);

            // Convert to proper WebP format with embedded metadata
            const stickerBuffer = await sticker.toBuffer();
            
            if (!stickerBuffer || stickerBuffer.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to create sticker. Please try again.');
                return;
            }

            console.log(`✅ Sticker created successfully: ${stickerBuffer.length} bytes`);

            // Send the properly formatted sticker
            await this.bot.sock.sendMessage(messageInfo.sender, {
                sticker: stickerBuffer
            });
            
            console.log('✅ Sticker sent successfully');

        } catch (error) {
            console.error('❌ Sticker creation error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error creating sticker. Please try again with a smaller image or shorter video (max 6 seconds).');
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

            const buffer = await this.downloadMedia(quotedMessage, 'stickerMessage');
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process sticker. Please try again.');
                return;
            }

            // Prepare sticker message with proper metadata structure
            const stickerMessage = {
                sticker: buffer.buffer,
                packname: packname,
                author: author
            };

            // Check if original was animated and preserve that
            if (quotedMessage.stickerMessage.isAnimated) {
                stickerMessage.isAnimated = true;
            }

            await this.bot.sock.sendMessage(messageInfo.sender, stickerMessage);

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

            const buffer = await this.downloadMedia(quotedMessage, 'stickerMessage'); // Use the new downloadMedia
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process sticker. Please try again.');
                return;
            }

            // Send as image
            await this.bot.sock.sendMessage(messageInfo.sender, {
                image: buffer.buffer // Access buffer from the object returned by downloadMedia
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
            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {}); // Original downloadMediaMessage usage
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

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {}); // Original downloadMediaMessage usage

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

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {}); // Original downloadMediaMessage usage

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

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {}); // Original downloadMediaMessage usage

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

            const buffer = await downloadMediaMessage(quotedMessage, 'buffer', {}); // Original downloadMediaMessage usage

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
     * This method is kept as is from the original code, as the new downloadMedia
     * method is intended to replace it or be used in conjunction.
     * However, the prompt indicates a refactor, so we will integrate the new download logic.
     * The new downloadMedia function handles multiple methods.
     */
    // async downloadMedia(quotedMessage, mediaType) {
    //     try {
    //         // Only use cached files method
    //         if (this.bot.database && quotedMessage.key) {
    //             try {
    //                 // Try to find cached media by message ID
    //                 const messageId = quotedMessage.key.id;
    //                 const cachedPath = path.join(__dirname, '../session/media');
    //                 const files = await fs.readdir(cachedPath).catch(() => []);
                    
    //                 console.log(`Looking for cached media for message ID: ${messageId}`);
                    
    //                 for (const file of files) {
    //                     if (file.includes(messageId.replace(/[^a-zA-Z0-9]/g, '_'))) {
    //                         const filePath = path.join(cachedPath, file);
    //                         const buffer = await fs.readFile(filePath);
    //                         if (buffer && buffer.length > 0) {
    //                             console.log(`Found cached media: ${file}`);
    //                             return buffer;
    //                         }
    //                     }
    //                 }
                    
    //                 console.log(`No cached media found for message ID: ${messageId}`);
    //             } catch (error) {
    //                 console.log('Cache lookup failed:', error);
    //             }
    //         }

    //         return null;
    //     } catch (error) {
    //         console.log('Media download from cache failed:', error);
    //         return null;
    //     }
    // }

    // The new downloadMedia function from the edited snippet is integrated below.
    // The original downloadMedia method is effectively replaced by this new, more robust one.
    /**
     * Download media with multiple fallback methods
     */
    async downloadMedia(message, messageType) {
        let mediaBuffer = null;
        let mediaInfo = {};

        console.log(`📥 Starting media download for type: ${messageType}`);

        try {
            // Method 1: Try to get from cached files in session/media folder
            console.log('🔍 Method 1: Checking session/media folder...');
            const messageId = message.key?.id;
            if (messageId) {
                const mediaDir = path.join(process.cwd(), 'session', 'media');
                const files = await fs.readdir(mediaDir).catch(() => []);

                // Look for files that contain the message ID
                const mediaFile = files.find(file => file.includes(messageId));
                if (mediaFile) {
                    const filePath = path.join(mediaDir, mediaFile);
                    console.log(`📁 Found cached media file: ${mediaFile}`);

                    const stats = await fs.stat(filePath);
                    if (stats.size > 0) {
                        mediaBuffer = await fs.readFile(filePath);
                        mediaInfo = {
                            filename: mediaFile,
                            size: stats.size,
                            source: 'session_cache'
                        };
                        console.log(`✅ Successfully loaded from session cache: ${mediaFile} (${stats.size} bytes)`);
                    }
                }
            }

            // Method 2: Try database archived media if session cache failed
            // This part assumes a `this.bot.database.getArchivedMedia` method exists
            // If it doesn't, this block will fail or be skipped.
            if (!mediaBuffer && messageId && this.bot.database && typeof this.bot.database.getArchivedMedia === 'function') {
                console.log('🔍 Method 2: Checking database archived media...');
                const archivedMedia = await this.bot.database.getArchivedMedia(messageId);
                if (archivedMedia && archivedMedia.buffer && archivedMedia.buffer.length > 0) {
                    mediaBuffer = archivedMedia.buffer;
                    mediaInfo = {
                        filename: archivedMedia.filename || `media_${messageId}`,
                        size: archivedMedia.buffer.length,
                        source: 'database_archive'
                    };
                    console.log(`✅ Successfully loaded from database: ${mediaInfo.filename} (${mediaInfo.size} bytes)`);
                }
            }

            // Method 3: Direct baileys download as last resort
            if (!mediaBuffer) {
                console.log('🔍 Method 3: Direct baileys download...');
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
                        console.log(`✅ Successfully downloaded directly: ${mediaInfo.size} bytes`);
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


            console.log(`📊 Final media info:`, mediaInfo);
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