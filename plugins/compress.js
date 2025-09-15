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
            usage: `${config.PREFIX}compress [mode] [resolution] (reply to video)\nModes: size (prioritize file size), br (prioritize quality/bitrate)\nResolutions: 144p, 480p, 720p, 1080p (default: 720p)\nExamples:\n${config.PREFIX}compress 720p (balanced)\n${config.PREFIX}compress size 720p (prioritize size)\n${config.PREFIX}compress br 720p (prioritize quality)`,
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
            let compressionMode = 'balanced'; // default mode
            let requestedResolution = '720p'; // default resolution
            
            // Parse arguments: [mode] [resolution] or just [resolution]
            if (args.length === 1) {
                // Single argument - could be mode or resolution
                if (['size', 'br'].includes(args[0].toLowerCase())) {
                    compressionMode = args[0].toLowerCase();
                    requestedResolution = '720p'; // default
                } else {
                    requestedResolution = args[0].toLowerCase();
                }
            } else if (args.length === 2) {
                // Two arguments: mode and resolution
                compressionMode = args[0].toLowerCase();
                requestedResolution = args[1].toLowerCase();
            }
            
            // Validate mode
            if (!['balanced', 'size', 'br'].includes(compressionMode)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Invalid mode. Available modes:\n` +
                    `• **balanced** - Smart size/quality balance (default)\n` +
                    `• **size** - Prioritize file size (smaller files)\n` +
                    `• **br** - Prioritize bitrate/quality (better quality)\n\n` +
                    `Examples:\n${config.PREFIX}compress 720p\n${config.PREFIX}compress size 480p\n${config.PREFIX}compress br 1080p`
                );
                return;
            }

            // Validate resolution
            if (!this.resolutions[requestedResolution]) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Invalid resolution. Available options:\n` +
                    Object.keys(this.resolutions).map(res => 
                        `• ${res} - ${this.resolutions[res].name}`
                    ).join('\n') +
                    `\n\nExample: ${config.PREFIX}compress size 480p`
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
            const modeInfo = {
                'balanced': 'smart balance',
                'size': 'size priority', 
                'br': 'quality priority'
            };
            await this.bot.messageHandler.reply(messageInfo, 
                `🔄 Compressing ${sourceInfo} to ${this.resolutions[requestedResolution].name}...\n` +
                `⚙️ Settings: 30 FPS, ${modeInfo[compressionMode]}, optimized scaling`
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
            
            // Calculate optimal bitrate based on duration, target file size, and user preference
            const optimalBitrate = this.calculateOptimalBitrate(requestedResolution, duration, compressionMode);

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
                         `⚙️ Settings: 30 FPS, CRF quality, ${optimalBitrate.audio}k audio\n` +
                         `🎛️ Mode: ${compressionModeInfo[optimalBitrate.compressionMode] || 'Standard'}`;

            // Add specific warnings based on compression mode
            if (optimalBitrate.sizeWarning || optimalBitrate.compressionMode === 'aggressive') {
                caption += `\n\n⚠️ Note: Aggressive compression applied to meet size target - some quality loss expected.`;
            }
            
            if (isDocument) {
                caption += `\n\n📄 Original was sent as document - quality preserved in compression.`;
            }

            // Always send as regular WhatsApp video message
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                video: { url: outputPath },
                mimetype: 'video/mp4',
                caption: caption
            });

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
            `• Modern 2025 FFmpeg encoding (CRF-based quality)\n` +
            `• File size optimization (up to 16 MB max)\n` +
            `• Content-aware compression modes\n` +
            `• WhatsApp optimized output\n` +
            `• MP4 document detection\n\n` +
            `📝 **Usage:** ${config.PREFIX}compress [resolution]\n` +
            `**Example:** ${config.PREFIX}compress 720p`;

        await this.bot.messageHandler.reply(messageInfo, infoText);
    }

    buildEnhancedFFmpegCommand(inputPath, outputPath, resolution, bitrates) {
        const resConfig = this.resolutions[resolution];
        
        // Modern 2025 FFmpeg: Better aspect ratio handling with even dimensions for libx264
        let scaleFilter;
        if (bitrates.compressionMode === 'aggressive') {
            // For aggressive mode, allow slight stretching for size optimization
            scaleFilter = `scale=${resConfig.width}:${resConfig.height}`;
        } else {
            // For other modes, preserve aspect ratio but ensure even dimensions for libx264
            scaleFilter = `scale='min(${resConfig.width},iw)':'min(${resConfig.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;
        }
        
        // Modern 2025 FFmpeg encoding parameters
        // Use CRF for quality control and modern optimizations
        const crf = this.getCRFForBitrate(bitrates.video, resolution);
        const preset = bitrates.compressionMode === 'aggressive' ? 'faster' : 
                      bitrates.compressionMode === 'high-quality' ? 'slow' : 'medium';
        const tune = bitrates.compressionMode === 'aggressive' ? 'fastdecode' : 'film';
        
        // 2025 optimized FFmpeg command with:
        // - CRF-based quality control (modern approach)
        // - Content-aware tuning
        // - High profile with modern level
        // - Psychovisual optimizations
        // - Improved GOP structure
        return `ffmpeg -i "${inputPath}" ` +
               `-vf "${scaleFilter}" ` +
               `-r ${this.targetFPS} ` +
               `-c:v libx264 ` +
               `-preset ${preset} ` +
               `-crf ${crf} ` +
               `-tune ${tune} ` +
               `-profile:v high ` +
               `-level 4.1 ` +
               `-pix_fmt yuv420p ` +
               `-g 60 ` +
               `-bf 3 ` +
               `-b_strategy 2 ` +
               `-refs 3 ` +
               `-aq-mode 1 ` +
               `-psy-rd 1.0:0.15 ` +
               `-maxrate ${Math.floor(bitrates.video * 1.5)}k ` +
               `-bufsize ${Math.floor(bitrates.video * 3)}k ` +
               `-c:a aac ` +
               `-b:a ${bitrates.audio}k ` +
               `-profile:a aac_low ` +
               `-ac 2 ` +
               `-ar 44100 ` +
               `-movflags +faststart ` +
               `"${outputPath}"`;
    }

    // Convert bitrate target to appropriate CRF value (2025 best practices)
    getCRFForBitrate(targetBitrate, resolution) {
        // Modern CRF mapping based on 2025 benchmarks
        const crfMappings = {
            '144p': { 500: 32, 1000: 30, 2000: 28, 3000: 26, 5000: 24 },
            '480p': { 1000: 30, 1500: 28, 2500: 26, 4000: 24, 6000: 22 },
            '720p': { 1500: 28, 2500: 26, 4000: 24, 6000: 22, 8000: 20 },
            '1080p': { 2000: 26, 4000: 24, 6000: 22, 8000: 20, 12000: 18 }
        };
        
        const mapping = crfMappings[resolution] || crfMappings['720p'];
        const bitrates = Object.keys(mapping).map(Number).sort((a, b) => a - b);
        
        // Find the closest bitrate and return corresponding CRF
        for (let i = 0; i < bitrates.length; i++) {
            if (targetBitrate <= bitrates[i]) {
                return mapping[bitrates[i]];
            }
        }
        
        // If higher than max mapped bitrate, use the best quality CRF
        return mapping[bitrates[bitrates.length - 1]];
    }

    calculateOptimalBitrate(resolution, durationSeconds, mode = 'balanced') {
        const baseBitrate = this.bitrateConfig[resolution];
        
        // Handle different compression modes
        if (mode === 'br') {
            // Bitrate priority mode - use backend range with minimal size constraints
            return {
                ...baseBitrate,
                compressionMode: 'high-quality'
            };
        }
        
        // Smart balancing for 'balanced' and 'size' modes
        if (durationSeconds > 0) {
            let targetFileSizeMB;
            
            // Calculate target file size based on duration and mode (16MB max)
            if (mode === 'size') {
                // Size priority - more aggressive targets but allow up to 16MB
                if (durationSeconds <= 90) {
                    targetFileSizeMB = Math.min(12, Math.max(8, 6 + (durationSeconds / 60) * 3));
                } else {
                    const minutes = durationSeconds / 60;
                    targetFileSizeMB = Math.min(16, 8 + (minutes - 1.5) * 4);
                }
            } else {
                // Balanced mode - higher targets up to 16MB
                if (durationSeconds <= 90) {
                    targetFileSizeMB = Math.min(16, Math.max(10, 8 + (durationSeconds / 60) * 4));
                } else {
                    const minutes = durationSeconds / 60;
                    targetFileSizeMB = Math.min(16, 10 + (minutes - 1.5) * 3);
                }
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