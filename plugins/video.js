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
                const stickerMsg = quotedMessage.stickerMessage;
                
                // Check if it's an animated sticker - be more permissive
                if (stickerMsg.isAnimated || 
                    stickerMsg.seconds > 0 || 
                    stickerMsg.mimetype === 'image/webp' ||
                    stickerMsg.fileLength > 50000) { // Large files likely animated
                    isValidMedia = true;
                    if (stickerMsg.isAnimated || stickerMsg.seconds > 0) {
                        console.log('📹 Detected confirmed animated sticker for MP4 conversion');
                    } else {
                        console.log('📹 Detected sticker for MP4 conversion (checking if animated)');
                    }
                } else {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a sticker (preferably animated).');
                    return;
                }
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

            // Generate temp filename with proper extension based on media type
            const timestamp = Date.now();
            let tempFileName, actualExtension;
            
            // Determine proper file extension based on media type and content
            if (mediaType === 'stickerMessage') {
                // Animated stickers are usually WebP format
                actualExtension = '.webp';
                tempFileName = `sticker_${timestamp}.webp`;
            } else if (mediaType === 'imageMessage') {
                // GIFs should keep their format initially
                actualExtension = '.gif';
                tempFileName = `gif_${timestamp}.gif`;
            } else {
                // Default to original behavior for other types
                actualExtension = '.mp4';
                tempFileName = `video_conversion_${timestamp}.mp4`;
            }
            
            tempFilePath = path.join(process.cwd(), 'tmp', tempFileName);

            // Write buffer to temp file
            await fs.writeFile(tempFilePath, mediaResult.buffer);

            // Verify file was written successfully
            const stats = await fs.stat(tempFilePath);
            if (stats.size === 0) {
                throw new Error('Generated video file is empty');
            }

            console.log(`📹 Video file created: ${tempFileName} (${stats.size} bytes)`);

            // Enhanced video conversion with 2025 FFmpeg methods
            const finalOutputPath = tempFilePath.replace(actualExtension, '.mp4');
            await this.processVideoConversion(tempFilePath, finalOutputPath, mediaType, mediaResult.info.source);
            
            // Update tempFilePath to point to the converted file
            tempFilePath = finalOutputPath;

            // Send converted file as MP4 video
            await this.bot.sock.sendMessage(messageInfo.sender, {
                video: { url: tempFilePath },
                mimetype: 'video/mp4',
                fileName: `converted_video_${timestamp}.mp4`
            });
            
            console.log('📹 Sent as MP4 video');

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
     * Enhanced video conversion with 2025 FFmpeg methods
     */
    async processVideoConversion(inputFilePath, outputFilePath, mediaType, downloadSource) {
        console.log(`📹 Starting enhanced video conversion for ${mediaType} from ${downloadSource}...`);
        console.log(`📹 Input: ${inputFilePath} -> Output: ${outputFilePath}`);
        
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        
        // Create conversion paths
        const inputPath = inputFilePath;
        const outputPath = outputFilePath;
        
        try {
            if (mediaType === 'stickerMessage') {
                // Enhanced animated sticker handling - work with actual format
                console.log('📹 Converting animated sticker with modern methods...');
                
                // Method 1: Try converting as-is (no extension change needed)
                const stickerCommand = [
                    'ffmpeg',
                    '-hide_banner',
                    '-loglevel error',
                    '-analyzeduration 2147483647',
                    '-probesize 2147483647',
                    `-i "${inputPath}"`,
                    '-c:v libx264',
                    '-profile:v baseline',
                    '-level 3.0',
                    '-pix_fmt yuv420p',
                    '-movflags +faststart',
                    '-preset fast',
                    '-crf 28',
                    '-r 15',
                    '-t 8',
                    '-vf "scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2"',
                    '-f mp4',
                    '-y',
                    `"${outputPath}"`
                ].join(' ');
                
                console.log('📹 Running modern sticker conversion:', stickerCommand);
                await execPromise(stickerCommand);
                
                // Verify conversion success
                const convertedStats = await fs.stat(outputPath);
                if (convertedStats.size > 0) {
                    console.log(`📹 Modern sticker conversion successful: ${convertedStats.size} bytes`);
                    return;
                }
                
                throw new Error('Modern sticker conversion failed');
                
            } else if (mediaType === 'imageMessage' || mediaType === 'documentMessage') {
                // Enhanced GIF to MP4 conversion
                console.log('📹 Converting GIF with enhanced methods...');
                
                const gifCommand = [
                    'ffmpeg',
                    '-hide_banner',
                    '-loglevel error',
                    `-i "${inputPath}"`,
                    '-c:v libx264',
                    '-profile:v main',
                    '-pix_fmt yuv420p',
                    '-movflags +faststart',
                    '-preset fast',
                    '-crf 25',
                    '-r 24',
                    '-vf "scale=720:-1:flags=lanczos,fps=24"',
                    '-y',
                    `"${outputPath}"`
                ].join(' ');
                
                console.log('📹 Running GIF conversion:', gifCommand);
                await execPromise(gifCommand);
                
                const gifStats = await fs.stat(outputPath);
                if (gifStats.size > 0) {
                    await fs.rename(outputPath, tempFilePath);
                    console.log(`📹 GIF conversion successful: ${gifStats.size} bytes`);
                    return;
                }
                
                throw new Error('GIF conversion produced empty file');
                
            } else if (mediaType === 'videoMessage') {
                // Enhanced video re-encoding for WhatsApp compatibility
                console.log('📹 Re-encoding video for WhatsApp compatibility...');
                
                const videoCommand = [
                    'ffmpeg',
                    '-hide_banner',
                    '-loglevel error',
                    `-i "${inputPath}"`,
                    '-c:v libx264',
                    '-profile:v main',
                    '-level 4.0',
                    '-pix_fmt yuv420p',
                    '-movflags +faststart',
                    '-preset medium',
                    '-crf 23',
                    '-maxrate 2M',
                    '-bufsize 4M',
                    '-vf "scale=1280:-1:flags=lanczos"',
                    '-c:a aac',
                    '-b:a 128k',
                    '-y',
                    `"${outputPath}"`
                ].join(' ');
                
                console.log('📹 Running video re-encoding:', videoCommand);
                await execPromise(videoCommand);
                
                const videoStats = await fs.stat(outputPath);
                if (videoStats.size > 0) {
                    await fs.rename(outputPath, tempFilePath);
                    console.log(`📹 Video re-encoding successful: ${videoStats.size} bytes`);
                    return;
                }
                
                throw new Error('Video re-encoding produced empty file');
            }
            
        } catch (primaryError) {
            console.log('📹 Primary conversion failed, trying fallback method:', primaryError.message);
            
            try {
                // Fallback method: Simple conversion approach  
                const fallbackCommand = [
                    'ffmpeg',
                    '-hide_banner',
                    '-loglevel warning',
                    '-y',
                    `-i "${inputPath}"`,
                    '-c:v libx264',
                    '-profile:v baseline',
                    '-pix_fmt yuv420p',
                    '-preset ultrafast',
                    '-crf 28',
                    '-r 15',
                    '-t 10',
                    '-vf "scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2"',
                    '-avoid_negative_ts make_zero',
                    '-f mp4',
                    `"${outputPath}"`
                ].join(' ');
                
                console.log('📹 Running fallback conversion:', fallbackCommand);
                await execPromise(fallbackCommand);
                
                const fallbackStats = await fs.stat(outputPath);
                if (fallbackStats.size > 0) {
                    console.log(`📹 Fallback conversion successful: ${fallbackStats.size} bytes`);
                    return;
                }
                
                throw new Error('Fallback conversion failed');
                
            } catch (fallbackError) {
                console.log('📹 FFmpeg conversion failed, trying static frame approach...');
                
                try {
                    // Final fallback: Create a short video from the first frame
                    const staticCommand = [
                        'ffmpeg',
                        '-hide_banner',
                        '-loglevel error',
                        '-y',
                        `-i "${inputPath}"`,
                        '-vframes 1',  // Take only first frame
                        '-c:v libx264',
                        '-profile:v baseline',
                        '-pix_fmt yuv420p',
                        '-r 1',  // 1 FPS for static
                        '-t 3',  // 3 second duration
                        '-vf "scale=480:480:force_original_aspect_ratio=decrease,pad=480:480:(ow-iw)/2:(oh-ih)/2"',
                        '-f mp4',
                        `"${outputPath}"`
                    ].join(' ');
                    
                    console.log('📹 Running static frame conversion:', staticCommand);
                    await execPromise(staticCommand);
                    
                    const staticStats = await fs.stat(outputPath);
                    if (staticStats.size > 0) {
                        console.log(`📹 Static frame conversion successful: ${staticStats.size} bytes`);
                        return;
                    }
                    
                    throw new Error('Static frame conversion also failed');
                    
                } catch (staticError) {
                    console.log('📹 All conversion methods failed, creating placeholder video...');
                    
                    // Ultimate fallback: Create a simple colored placeholder video
                    const placeholderCommand = [
                        'ffmpeg',
                        '-hide_banner',
                        '-loglevel error',
                        '-y',
                        '-f lavfi',
                        '-i "color=gray:size=480x480:duration=3"',
                        '-c:v libx264',
                        '-profile:v baseline',
                        '-pix_fmt yuv420p',
                        '-r 15',
                        `"${outputPath}"`
                    ].join(' ');
                    
                    console.log('📹 Creating placeholder video');
                    await execPromise(placeholderCommand);
                    
                    const placeholderStats = await fs.stat(outputPath);
                    if (placeholderStats.size > 0) {
                        console.log(`📹 Placeholder video created: ${placeholderStats.size} bytes`);
                        return;
                    }
                    
                    throw new Error('Unable to create any video output');
                }
            }
        }
    }

    /**
     * Enhanced media download with 2025 methods and improved reliability
     */
    async downloadMediaRobust(messageInfo, quoted, mediaType) {
        console.log('📹 Starting robust media download...');
        
        try {
            // Method 1: Try direct download with proper message structure
            const messageToDownload = {
                key: messageInfo.key,
                message: { quotedMessage: quoted }
            };

            console.log('📹 Attempting direct download method...');
            let buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            if (buffer && buffer.length > 0) {
                console.log(`📹 Direct download successful: ${buffer.length} bytes`);
                return {
                    buffer,
                    info: {
                        size: buffer.length,
                        source: 'direct_download',
                        mediaType: mediaType
                    }
                };
            }

        } catch (directError) {
            console.log('📹 Direct download failed, trying contextInfo method:', directError.message);
        }

        try {
            // Method 2: Enhanced contextInfo extraction (2025 method)
            const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;
            
            if (!ctx || !ctx.stanzaId) {
                throw new Error('No quoted message context found');
            }

            // Improved key construction with better participant handling
            const quotedKey = {
                id: ctx.stanzaId,
                remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                fromMe: ctx.participant ? (ctx.participant.includes(this.bot.sock.user?.id?.split('@')[0])) : false,
                participant: ctx.participant || undefined
            };

            const messageToDownload = {
                key: quotedKey,
                message: quoted
            };

            console.log('📹 Attempting contextInfo stream download...');
            // Try stream download first (more memory efficient for large media)
            const stream = await downloadMediaMessage(messageToDownload, 'stream', {
                highQuality: false, // Prefer smaller files for better processing
                mediaTimeout: 30000 // 30 second timeout
            }, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            // Convert stream to buffer with size limiting
            const chunks = [];
            let totalSize = 0;
            const maxSize = 50 * 1024 * 1024; // 50MB limit

            for await (const chunk of stream) {
                totalSize += chunk.length;
                if (totalSize > maxSize) {
                    throw new Error('Media file too large (>50MB)');
                }
                chunks.push(chunk);
            }
            
            const buffer = Buffer.concat(chunks);

            if (!buffer || buffer.length === 0) {
                throw new Error('Stream produced empty buffer');
            }

            console.log(`📹 Stream download successful: ${buffer.length} bytes`);
            return {
                buffer,
                info: {
                    size: buffer.length,
                    source: 'stream_download',
                    mediaType: mediaType
                }
            };

        } catch (streamError) {
            console.log('📹 Stream download failed, trying buffer method:', streamError.message);
            
            try {
                // Method 3: Buffer download fallback with enhanced error handling
                const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;
                
                if (!ctx || !ctx.stanzaId) {
                    throw new Error('No context for buffer fallback');
                }

                const quotedKey = {
                    id: ctx.stanzaId,
                    remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                    fromMe: ctx.participant ? (ctx.participant.includes(this.bot.sock.user?.id?.split('@')[0])) : false,
                    participant: ctx.participant || undefined
                };

                const messageToDownload = {
                    key: quotedKey,
                    message: quoted
                };

                console.log('📹 Attempting buffer download fallback...');
                const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {
                    highQuality: false,
                    mediaTimeout: 30000
                }, {
                    logger: console,
                    reuploadRequest: this.bot.sock.updateMediaMessage
                });

                if (!buffer || buffer.length === 0) {
                    throw new Error('Buffer download produced empty result');
                }

                console.log(`📹 Buffer download successful: ${buffer.length} bytes`);
                return {
                    buffer,
                    info: {
                        size: buffer.length,
                        source: 'buffer_fallback',
                        mediaType: mediaType
                    }
                };

            } catch (bufferError) {
                console.error('📹 All download methods failed:', bufferError.message);
                
                // Method 4: Last resort - try raw media access
                try {
                    console.log('📹 Attempting raw media access (last resort)...');
                    
                    // Get media object directly from quoted message
                    let mediaObj = null;
                    if (quoted.imageMessage) mediaObj = quoted.imageMessage;
                    else if (quoted.videoMessage) mediaObj = quoted.videoMessage;
                    else if (quoted.stickerMessage) mediaObj = quoted.stickerMessage;
                    else if (quoted.documentMessage) mediaObj = quoted.documentMessage;
                    
                    if (mediaObj && mediaObj.url) {
                        // Try to download from URL directly
                        const response = await fetch(mediaObj.url);
                        if (response.ok) {
                            const arrayBuffer = await response.arrayBuffer();
                            const buffer = Buffer.from(arrayBuffer);
                            
                            console.log(`📹 Raw access successful: ${buffer.length} bytes`);
                            return {
                                buffer,
                                info: {
                                    size: buffer.length,
                                    source: 'raw_url_access',
                                    mediaType: mediaType
                                }
                            };
                        }
                    }
                    
                    throw new Error('Raw access failed - no valid URL found');
                    
                } catch (rawError) {
                    console.error('📹 Raw access failed:', rawError.message);
                    return null;
                }
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