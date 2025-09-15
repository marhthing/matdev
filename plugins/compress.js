/**
 * MATDEV Enhanced Video Compression Plugin
 * Advanced video compression with resolution control, fixed FPS, and optimized bitrate
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const { exec } = require('child_process');
const config = require('../config');

class CompressPlugin {
    constructor() {
        this.name = 'compress';
        this.description = 'Enhanced video compression with resolution control and optimization';
        this.version = '3.0.0';

        // Resolution presets with dimensions
        this.resolutions = {
            '144p': { width: 256, height: 144, name: '144p (256x144)' },
            '480p': { width: 854, height: 480, name: '480p (854x480)' },
            '720p': { width: 1280, height: 720, name: '720p (1280x720)' },
            '1080p': { width: 1920, height: 1080, name: '1080p (1920x1080)' }
        };

        // Bitrate configuration (kbps) for different resolutions
        // Backend-controlled bitrate system: 5,000-8,000 kbps range as specified
        this.bitrateConfig = {
            '144p': { video: 5000, audio: 128 },   // Minimum backend range
            '480p': { video: 5500, audio: 128 },   // Low-mid range
            '720p': { video: 6500, audio: 128 },   // Mid-high range
            '1080p': { video: 8000, audio: 128 }   // Maximum backend range
        };

        // Fixed FPS for all outputs (WhatsApp optimization)
        this.targetFPS = 30;

        // File size constraints for 1-1.5 minute videos
        this.targetFileSize = { min: 8, max: 10 }; // Target: 8-10 MB total for 1-1.5 min videos
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        
        // Check if FFmpeg and FFprobe are available
        try {
            await new Promise((resolve, reject) => {
                exec('ffmpeg -version && ffprobe -version', (error, stdout, stderr) => {
                    if (error) {
                        console.log('⚠️ FFmpeg/FFprobe not found - compress plugin may not work properly');
                        reject(error);
                    } else {
                        console.log('✅ Enhanced Compress plugin loaded (FFmpeg and FFprobe available)');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.log('✅ Enhanced Compress plugin loaded (FFmpeg/FFprobe check failed - will attempt to use anyway)');
        }
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('compress', this.compressCommand.bind(this), {
            description: 'Enhanced video compression with resolution and quality control',
            usage: `${config.PREFIX}compress [resolution] (reply to video)\nResolutions: 144p, 480p, 720p, 1080p (default: 720p)\nExample: ${config.PREFIX}compress 480p`,
            category: 'video editing',
            plugin: 'compress',
            source: 'compress.js'
        });

        // Add info command for compression settings
        this.bot.messageHandler.registerCommand('compressinfo', this.infoCommand.bind(this), {
            description: 'Show available compression resolutions and settings',
            usage: `${config.PREFIX}compressinfo`,
            category: 'video editing',
            plugin: 'compress',
            source: 'compress.js'
        });
    }

    async compressCommand(messageInfo) {
        let inputPath = null;
        let outputPath = null;

        try {
            const args = messageInfo.text.split(' ').slice(1);
            const requestedResolution = args[0]?.toLowerCase() || '720p';

            // Validate resolution
            if (!this.resolutions[requestedResolution]) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Invalid resolution. Available options:\n` +
                    Object.keys(this.resolutions).map(res => 
                        `• ${res} - ${this.resolutions[res].name}`
                    ).join('\n') +
                    `\n\nExample: ${config.PREFIX}compress 480p`
                );
                return;
            }

            // Check for quoted video message or MP4 document
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a video message or MP4 document to compress it.'
                );
                return;
            }

            // Detect media type - video message or MP4 document
            let mediaType = null;
            let isDocument = false;
            
            if (quotedMessage.videoMessage) {
                mediaType = 'videoMessage';
            } else if (quotedMessage.documentMessage) {
                const mimeType = quotedMessage.documentMessage.mimetype || '';
                const fileName = quotedMessage.documentMessage.fileName || '';
                
                // Check if document is MP4 video
                if (mimeType.includes('video/mp4') || fileName.toLowerCase().endsWith('.mp4')) {
                    mediaType = 'documentMessage';
                    isDocument = true;
                } else {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Document must be an MP4 video file. Please reply to a video message or MP4 document.'
                    );
                    return;
                }
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a video message or MP4 document to compress it.'
                );
                return;
            }

            // Send processing message with document detection info
            const sourceInfo = isDocument ? 'MP4 document (quality preserved)' : 'video message';
            await this.bot.messageHandler.reply(messageInfo, 
                `🔄 Compressing ${sourceInfo} to ${this.resolutions[requestedResolution].name}...\n` +
                `⚙️ Settings: 30 FPS, smart compression, size optimized`
            );

            // Download video or document
            const buffer = await this.downloadMediaRobust(messageInfo, quotedMessage, mediaType);

            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to download video. Please try again.'
                );
                return;
            }

            // Setup file paths
            const timestamp = Date.now();
            inputPath = path.join(process.cwd(), 'tmp', `compress_input_${timestamp}.mp4`);
            outputPath = path.join(process.cwd(), 'tmp', `compressed_${requestedResolution}_${timestamp}.mp4`);

            // Write input file
            await fs.writeFile(inputPath, buffer.buffer);

            // Get video duration for file size calculation
            const duration = await this.getVideoDuration(inputPath);
            
            // Calculate optimal bitrate based on duration and target file size
            const optimalBitrate = this.calculateOptimalBitrate(requestedResolution, duration);

            // Build enhanced FFmpeg command
            const command = this.buildEnhancedFFmpegCommand(
                inputPath, 
                outputPath, 
                requestedResolution, 
                optimalBitrate
            );

            console.log(`🔧 FFmpeg command: ${command}`);

            // Execute FFmpeg command
            await new Promise((resolve, reject) => {
                exec(command, { maxBuffer: 1024 * 1024 * 200 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg compression error:', error);
                        console.error('FFmpeg stderr:', stderr);
                        reject(error);
                    } else {
                        console.log('✅ Video compression completed successfully');
                        resolve();
                    }
                });
            });

            // Check output file
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                throw new Error('Output file is empty');
            }

            // Calculate compression statistics
            const originalSize = buffer.buffer.length;
            const compressedSize = stats.size;
            const compressionRatio = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
            const sizeMB = (compressedSize / (1024 * 1024)).toFixed(2);

            // Prepare caption with compression info
            const sourceType = isDocument ? 'document' : 'video';
            const compressionModeInfo = {
                'aggressive': '🔥 Aggressive compression for size',
                'balanced': '⚖️ Balanced size/quality',
                'quality': '🎯 Quality-focused compression', 
                'high-quality': '✨ High-quality compression',
                'preset': '📐 Standard compression'
            };
            
            let caption = `✅ ${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} compressed to ${this.resolutions[requestedResolution].name}\n` +
                         `📊 Original: ${(originalSize / (1024 * 1024)).toFixed(2)} MB\n` +
                         `📊 Compressed: ${sizeMB} MB\n` +
                         `📈 Savings: ${compressionRatio}%\n` +
                         `⚙️ Settings: 30 FPS, ${optimalBitrate.video}k video, ${optimalBitrate.audio}k audio\n` +
                         `🎛️ Mode: ${compressionModeInfo[optimalBitrate.compressionMode] || 'Standard'}`;

            // Add specific warnings based on compression mode
            if (optimalBitrate.sizeWarning || optimalBitrate.compressionMode === 'aggressive') {
                caption += `\n\n⚠️ Note: Aggressive compression applied to meet size target - some quality loss expected.`;
            }
            
            if (isDocument) {
                caption += `\n\n📄 Original was sent as document - quality preserved in compression.`;
            }

            // Send compressed video as document to preserve quality (like original if it was document)
            if (isDocument || compressedSize > 15 * 1024 * 1024) { // Send as document if >15MB or original was document
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: outputPath },
                    mimetype: 'video/mp4',
                    fileName: `compressed_${requestedResolution}_${timestamp}.mp4`,
                    caption: caption + `\n\n📄 Sent as document to preserve quality`
                });
            } else {
                // Send as regular video message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: { url: outputPath },
                    mimetype: 'video/mp4',
                    caption: caption
                });
            }

        } catch (error) {
            console.error('Video compression error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to compress video. Please try again or use a different resolution.'
            );
        } finally {
            // Cleanup temporary files
            try {
                if (inputPath) await fs.unlink(inputPath);
                if (outputPath) await fs.unlink(outputPath);
            } catch (cleanupError) {
                console.log('Cleanup error (non-critical):', cleanupError.message);
            }
        }
    }

    async infoCommand(messageInfo) {
        const infoText = `📹 **Enhanced Video Compression Settings**\n\n` +
            `🎯 **Fixed Frame Rate:** 30 FPS (optimized for WhatsApp)\n\n` +
            `📐 **Available Resolutions:**\n` +
            Object.entries(this.resolutions).map(([key, res]) => 
                `• **${key}** - ${res.name} (${this.bitrateConfig[key].video}k bitrate)`
            ).join('\n') +
            `\n\n🎛️ **Features:**\n` +
            `• Backend-controlled bitrate (5,000-8,000 kbps)\n` +
            `• File size optimization (8-10 MB total for 1-1.5 min videos)\n` +
            `• Quality preservation\n` +
            `• WhatsApp optimized output\n\n` +
            `⚠️ **Note:** High bitrate range and small file targets may conflict for longer videos.\n\n` +
            `📝 **Usage:** ${config.PREFIX}compress [resolution]\n` +
            `**Example:** ${config.PREFIX}compress 720p`;

        await this.bot.messageHandler.reply(messageInfo, infoText);
    }

    buildEnhancedFFmpegCommand(inputPath, outputPath, resolution, bitrates) {
        const resConfig = this.resolutions[resolution];
        
        // Enhanced FFmpeg command with:
        // - Fixed 30 FPS output
        // - Resolution scaling with aspect ratio preservation
        // - Optimized encoding settings
        // - Audio quality optimization
        return `ffmpeg -i "${inputPath}" ` +
               `-vf "scale=${resConfig.width}:${resConfig.height}:force_original_aspect_ratio=decrease,pad=${resConfig.width}:${resConfig.height}:(ow-iw)/2:(oh-ih)/2" ` +
               `-r ${this.targetFPS} ` +
               `-c:v libx264 ` +
               `-b:v ${bitrates.video}k ` +
               `-maxrate ${Math.floor(bitrates.video * 1.2)}k ` +
               `-bufsize ${Math.floor(bitrates.video * 2)}k ` +
               `-preset medium ` +
               `-profile:v main ` +
               `-level 3.1 ` +
               `-c:a aac ` +
               `-b:a ${bitrates.audio}k ` +
               `-ac 2 ` +
               `-ar 44100 ` +
               `-movflags +faststart ` +
               `"${outputPath}"`;
    }

    calculateOptimalBitrate(resolution, durationSeconds) {
        const baseBitrate = this.bitrateConfig[resolution];
        
        // Smart balancing: Prioritize file size but maintain reasonable quality
        if (durationSeconds > 0) {
            let targetFileSizeMB;
            
            // Calculate target file size based on duration
            if (durationSeconds <= 90) {
                // For videos ≤ 1.5 min: 8-10 MB target (prioritize file size)
                targetFileSizeMB = Math.min(10, Math.max(8, 6 + (durationSeconds / 60) * 2));
            } else {
                // For longer videos: allow larger size but still optimize
                const minutes = durationSeconds / 60;
                targetFileSizeMB = Math.min(50, 8 + (minutes - 1.5) * 4); // ~12MB per additional minute
            }
            
            const targetBitrateBitsPerSecond = (targetFileSizeMB * 8 * 1024 * 1024) / durationSeconds;
            const targetBitrateKbps = Math.floor(targetBitrateBitsPerSecond / 1000);
            const availableForVideo = targetBitrateKbps - baseBitrate.audio;
            
            // Smart balancing logic
            if (availableForVideo < 1000) {
                // Very aggressive compression needed - use minimum viable quality
                return {
                    video: Math.max(500, availableForVideo),
                    audio: 64, // Reduce audio bitrate for extreme compression
                    sizeWarning: true,
                    compressionMode: 'aggressive'
                };
            } else if (availableForVideo < 3000) {
                // Moderate compression - balance size and quality
                return {
                    video: Math.max(1000, availableForVideo),
                    audio: 96, // Reduced audio for balance
                    compressionMode: 'balanced'
                };
            } else if (availableForVideo < 5000) {
                // Good compression with decent quality
                return {
                    video: Math.max(2000, availableForVideo),
                    audio: baseBitrate.audio,
                    compressionMode: 'quality'
                };
            } else {
                // High quality mode - use backend range but respect file size
                const optimalVideoBitrate = Math.min(baseBitrate.video, availableForVideo);
                return {
                    video: optimalVideoBitrate,
                    audio: baseBitrate.audio,
                    compressionMode: 'high-quality'
                };
            }
        }
        
        // Fallback to preset bitrates with balanced mode
        return {
            ...baseBitrate,
            compressionMode: 'preset'
        };
    }

    async getVideoDuration(videoPath) {
        return new Promise((resolve, reject) => {
            const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${videoPath}"`;
            
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error getting video duration:', error);
                    resolve(0); // Fallback to 0 if duration cannot be determined
                } else {
                    const duration = parseFloat(stdout.trim());
                    resolve(isNaN(duration) ? 0 : duration);
                }
            });
        });
    }

    async downloadMediaRobust(messageInfo, quoted, mediaType) {
        try {
            const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;

            if (!ctx || !ctx.stanzaId) {
                throw new Error('No quoted message context found');
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

            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            return { buffer };

        } catch (error) {
            console.error('Media download failed:', error);
            return null;
        }
    }
}

const compressPlugin = new CompressPlugin();

module.exports = {
    init: compressPlugin.init.bind(compressPlugin),
    name: compressPlugin.name,
    description: compressPlugin.description,
    version: compressPlugin.version
};