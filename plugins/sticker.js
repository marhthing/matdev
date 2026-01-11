/**
 * MATDEV Sticker Plugin
 * Convert images and videos to stickers (2025 Updated)
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');

class StickerPlugin {
    constructor() {
        this.name = 'sticker';
        this.description = 'Convert images and videos to stickers';
        this.version = '2.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure temp directory exists
        await fs.ensureDir(path.join(process.cwd(), 'tmp'));

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

        this.bot.messageHandler.registerCommand('s', this.stickerCommand.bind(this), {
            description: 'Convert image/video to sticker (shortcut)',
            usage: `${config.PREFIX}s (reply to image/video)`,
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
            let messageToDownload = null;
            let isImage = false;
            let isVideo = false;

            // Check if this is a direct image/video with .sticker/.s as caption
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
                // Check for quoted message
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      messageInfo.message?.quotedMessage;
                
                if (!quotedMessage) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Reply to an image/video or send media with caption');
                    return;
                }

                // Check if quoted message is image or video
                isImage = !!quotedMessage.imageMessage;
                isVideo = !!quotedMessage.videoMessage;
                
                if (!isImage && !isVideo) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Reply to an image/video only');
                    return;
                }

                messageToDownload = {
                    key: messageInfo.message?.extendedTextMessage?.contextInfo?.key || messageInfo.key,
                    message: quotedMessage
                };
            }

            // Download media
            let buffer;
            try {
                buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                    logger: console,
                    reuploadRequest: this.bot.sock.updateMediaMessage
                });
            } catch (downloadError) {
                console.error('Download error:', downloadError);
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download media');
                return;
            }

            if (!buffer || buffer.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Empty media buffer');
                return;
            }

            // Process and send sticker
            let stickerBuffer;
            if (isImage) {
                stickerBuffer = await this.imageToSticker(buffer);
            } else {
                stickerBuffer = await this.videoToSticker(buffer);
            }

            if (!stickerBuffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to create sticker');
                return;
            }

            // Send sticker
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                sticker: stickerBuffer
            });

            console.log('✅ Sticker sent');

        } catch (error) {
            console.error('❌ Sticker error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error creating sticker');
        }
    }

    /**
     * Convert image to WebP sticker format
     */
    async imageToSticker(imageBuffer) {
        try {
            // Convert to WebP with proper sticker dimensions (512x512 max)
            const webpBuffer = await sharp(imageBuffer)
                .resize(512, 512, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .webp({
                    quality: 100,
                    lossless: false
                })
                .toBuffer();

            return webpBuffer;

        } catch (error) {
            console.error('Image processing error:', error);
            
            // Fallback: try with lower quality
            try {
                return await sharp(imageBuffer)
                    .resize(512, 512, {
                        fit: 'contain',
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    })
                    .webp({ quality: 75 })
                    .toBuffer();
            } catch (fallbackError) {
                console.error('Image fallback failed:', fallbackError);
                return null;
            }
        }
    }

    /**
     * Convert video to animated WebP sticker format
     */
    async videoToSticker(videoBuffer) {
        return new Promise(async (resolve, reject) => {
            const tmpDir = path.join(process.cwd(), 'tmp');
            const inputPath = path.join(tmpDir, `input_${Date.now()}.mp4`);
            const outputPath = path.join(tmpDir, `output_${Date.now()}.webp`);

            try {
                // Write video buffer to temp file
                await fs.writeFile(inputPath, videoBuffer);

                // Convert video to WebP using ffmpeg
                ffmpeg(inputPath)
                    .outputOptions([
                        '-vcodec libwebp',
                        '-vf scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=0x00000000',
                        '-loop 0',
                        '-preset default',
                        '-an',
                        '-vsync 0',
                        '-s 512:512'
                    ])
                    .toFormat('webp')
                    .on('end', async () => {
                        try {
                            const stickerBuffer = await fs.readFile(outputPath);
                            
                            // Cleanup
                            await fs.unlink(inputPath).catch(() => {});
                            await fs.unlink(outputPath).catch(() => {});
                            
                            resolve(stickerBuffer);
                        } catch (readError) {
                            await fs.unlink(inputPath).catch(() => {});
                            await fs.unlink(outputPath).catch(() => {});
                            reject(readError);
                        }
                    })
                    .on('error', async (err) => {
                        await fs.unlink(inputPath).catch(() => {});
                        await fs.unlink(outputPath).catch(() => {});
                        
                        // If ffmpeg fails, try fallback: extract first frame as static sticker
                        try {
                            const frameBuffer = await this.extractFirstFrame(videoBuffer);
                            if (frameBuffer) {
                                resolve(await this.imageToSticker(frameBuffer));
                            } else {
                                reject(err);
                            }
                        } catch (fallbackError) {
                            reject(err);
                        }
                    })
                    .save(outputPath);

            } catch (error) {
                await fs.unlink(inputPath).catch(() => {});
                await fs.unlink(outputPath).catch(() => {});
                reject(error);
            }
        });
    }

    /**
     * Extract first frame from video as fallback
     */
    async extractFirstFrame(videoBuffer) {
        return new Promise(async (resolve, reject) => {
            const tmpDir = path.join(process.cwd(), 'tmp');
            const inputPath = path.join(tmpDir, `frame_input_${Date.now()}.mp4`);
            const outputPath = path.join(tmpDir, `frame_output_${Date.now()}.png`);

            try {
                await fs.writeFile(inputPath, videoBuffer);

                ffmpeg(inputPath)
                    .screenshots({
                        count: 1,
                        folder: tmpDir,
                        filename: path.basename(outputPath)
                    })
                    .on('end', async () => {
                        try {
                            const frameBuffer = await fs.readFile(outputPath);
                            await fs.unlink(inputPath).catch(() => {});
                            await fs.unlink(outputPath).catch(() => {});
                            resolve(frameBuffer);
                        } catch (readError) {
                            await fs.unlink(inputPath).catch(() => {});
                            await fs.unlink(outputPath).catch(() => {});
                            reject(readError);
                        }
                    })
                    .on('error', async (err) => {
                        await fs.unlink(inputPath).catch(() => {});
                        await fs.unlink(outputPath).catch(() => {});
                        reject(err);
                    });

            } catch (error) {
                await fs.unlink(inputPath).catch(() => {});
                await fs.unlink(outputPath).catch(() => {});
                reject(error);
            }
        });
    }

    async cleanup() {
        // Clean up old temp files
        const tmpDir = path.join(process.cwd(), 'tmp');
        try {
            const files = await fs.readdir(tmpDir);
            const now = Date.now();
            
            for (const file of files) {
                if (file.includes('input_') || file.includes('output_') || file.includes('frame_')) {
                    const filePath = path.join(tmpDir, file);
                    const stats = await fs.stat(filePath);
                    
                    // Delete files older than 1 hour
                    if (now - stats.mtimeMs > 3600000) {
                        await fs.unlink(filePath).catch(() => {});
                    }
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
        
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