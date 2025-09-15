
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

class ImageEffectsPlugin {
    constructor() {
        this.name = 'image-effects';
        this.description = 'Advanced image effects using modern processing techniques';
        this.version = '2.0.0';
        this.effects = {
            // Color temperature effects
            cool: {
                filter: 'eq=gamma=1.05:saturation=1.1:brightness=0.02,colorbalance=rs=-0.1:gs=0.02:bs=0.15',
                description: 'Cool blue color temperature',
                category: 'color'
            },
            warm: {
                filter: 'eq=gamma=1.1:saturation=1.2:brightness=0.05,colorbalance=rs=0.15:gs=0.05:bs=-0.1',
                description: 'Warm sunset color temperature',
                category: 'color'
            },

            // Enhancement effects
            sharpen: {
                filter: 'unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=1.2:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.8',
                description: 'Professional sharpening with luma and chroma control',
                category: 'enhance'
            }
        };
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        
        // Check if FFmpeg is available
        try {
            await new Promise((resolve, reject) => {
                exec('ffmpeg -version', (error, stdout, stderr) => {
                    if (error) {
                        console.log('⚠️ FFmpeg not found - image effects may not work');
                        reject(error);
                    } else {
                        console.log('✅ Image Effects plugin loaded (FFmpeg available)');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.log('✅ Image Effects plugin loaded (FFmpeg check failed - will attempt to use anyway)');
        }
    }

    registerCommands() {
        // Register individual effect commands with "image editing" category
        Object.keys(this.effects).forEach(effect => {
            const commandName = effect;
            this.bot.messageHandler.registerCommand(commandName, 
                (messageInfo) => this.applyEffect(messageInfo, effect), {
                description: this.effects[effect].description,
                usage: `${config.PREFIX}${commandName} (reply to image)`,
                category: 'image effects',
                plugin: 'image-effects',
                source: 'image-effects.js'
            });
        });
    }

    async applyEffect(messageInfo, effectName) {
        let inputPath = null;
        let outputPath = null;

        try {
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image message.');
                return;
            }

            if (!quotedMessage.imageMessage && !quotedMessage.stickerMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image or sticker message.');
                return;
            }

            // Download image
            const media = await this.downloadMediaRobust(messageInfo, quotedMessage, quotedMessage.imageMessage ? 'imageMessage' : 'stickerMessage');
            
            if (!media?.buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process image. Please try again.');
                return;
            }

            // Setup file paths in tmp/
            const timestamp = Date.now();
            const inputExt = quotedMessage.imageMessage ? 'jpg' : 'webp';
            inputPath = path.join(process.cwd(), 'tmp', `image_input_${timestamp}.${inputExt}`);
            outputPath = path.join(process.cwd(), 'tmp', `image_effect_${effectName}_${timestamp}.jpg`);

            // Write input file
            await fs.writeFile(inputPath, media.buffer);

            // Apply image effect using FFmpeg with 2025 optimizations
            const effect = this.effects[effectName];
            let command = `ffmpeg -hide_banner -loglevel error -i "${inputPath}" -vf "${effect.filter}" -q:v 1 -pix_fmt yuv420p -threads 0 "${outputPath}"`;
            
            // Execute FFmpeg command
            await new Promise((resolve, reject) => {
                exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg image effect error:', stderr);
                        reject(new Error(`Image effect failed: ${stderr}`));
                    } else {
                        resolve();
                    }
                });
            });

            // Check if output file exists and has content
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                throw new Error('Output image is empty');
            }

            // Send processed image
            const imageMessage = {
                image: { url: outputPath },
                caption: `${effectName.toUpperCase()}`,
            };

            await this.bot.sock.sendMessage(messageInfo.sender, imageMessage);

        } catch (error) {
            console.error(`Image effect ${effectName} error:`, error);
            let errorMessage = `❌ Error applying ${effectName} effect.`;
            
            if (error.message.includes('FFmpeg')) {
                errorMessage += ' FFmpeg may not be installed or filter not supported.';
            } else if (error.message.includes('format')) {
                errorMessage += ' Image format not supported.';
            } else if (error.message.includes('empty')) {
                errorMessage += ' Processing resulted in empty image.';
            }
            
            await this.bot.messageHandler.reply(messageInfo, errorMessage);
        } finally {
            // Cleanup
            const filesToClean = [inputPath, outputPath];
            
            for (const filePath of filesToClean) {
                if (filePath) {
                    try {
                        if (await fs.pathExists(filePath)) {
                            await fs.unlink(filePath);
                        }
                    } catch (cleanupError) {
                        console.log(`Cleanup warning: ${cleanupError.message}`);
                        // Force cleanup attempt
                        setTimeout(async () => {
                            try {
                                if (await fs.pathExists(filePath)) {
                                    await fs.unlink(filePath);
                                }
                            } catch (e) {
                                // Silent failure for delayed cleanup
                            }
                        }, 5000);
                    }
                }
            }
        }
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
            console.error('Image download failed:', error);
            return null;
        }
    }
}

const imageEffectsPlugin = new ImageEffectsPlugin();

module.exports = {
    init: imageEffectsPlugin.init.bind(imageEffectsPlugin),
    name: imageEffectsPlugin.name,
    description: imageEffectsPlugin.description,
    version: imageEffectsPlugin.version
};
