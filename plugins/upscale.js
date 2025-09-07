const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');

class UpscalePlugin {
    constructor() {
        this.name = 'upscale';
        this.description = 'AI image upscaling for enhanced picture quality';
        this.version = '1.0.0';
        this.enabled = true;
        this.tempDir = path.join(process.cwd(), 'tmp');
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            // Ensure temp directory exists
            await fs.ensureDir(this.tempDir);

            // Register the upscale command
            this.bot.messageHandler.registerCommand('upscale', this.upscaleCommand.bind(this), {
                description: 'Upscale image quality (reply to an image)',
                usage: `${config.PREFIX}upscale (reply to image)`,
                category: 'media',
                plugin: 'upscale',
                source: 'upscale.js'
            });

            console.log('✅ Upscale plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Upscale plugin:', error);
            return false;
        }
    }

    /**
     * Handle upscale command
     */
    async upscaleCommand(messageInfo) {
        try {
            // Check for quoted message using the same approach as media plugin
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to an image to upscale it.\nUsage: Reply to an image and type .upscale');
                return;
            }

            // Check if the quoted message has an image
            if (!quotedMessage.imageMessage && !quotedMessage.stickerMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ The message you replied to must contain an image.');
                return;
            }

            // No API key needed for free service!

            // Send processing indicator
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                '🔄 Processing image for upscaling...');

            try {
                // Get the proper quoted message structure
                const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
                
                if (!contextInfo || !contextInfo.quotedMessage) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Could not access the quoted message.',
                        edit: processingMsg.key
                    });
                    return;
                }

                // Create proper message structure with original message key
                const messageToDownload = {
                    key: contextInfo.stanzaId ? {
                        remoteJid: messageInfo.chat_jid,
                        fromMe: contextInfo.participant === this.bot.botJid,
                        id: contextInfo.stanzaId
                    } : {
                        remoteJid: messageInfo.chat_jid,
                        fromMe: false,
                        id: 'quoted-media-' + Date.now()
                    },
                    message: contextInfo.quotedMessage
                };

                console.log('Downloading media from quoted message...');
                const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {});
                
                if (!buffer || buffer.length === 0) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Failed to download the image or image is empty.',
                        edit: processingMsg.key
                    });
                    return;
                }

                console.log(`Downloaded image buffer: ${buffer.length} bytes`);

                // Save image temporarily
                const tempFileName = `upscale_${Date.now()}.jpg`;
                const tempFilePath = path.join(this.tempDir, tempFileName);
                await fs.writeFile(tempFilePath, buffer);

                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '🤖 Upscaling image with AI...',
                    edit: processingMsg.key
                });

                // Upscale the image
                const upscaledBuffer = await this.upscaleImage(tempFilePath);

                if (!upscaledBuffer || upscaledBuffer.length === 0) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Failed to upscale the image. Please try again.',
                        edit: processingMsg.key
                    });
                    return;
                }

                console.log(`Upscaled image buffer: ${upscaledBuffer.length} bytes`);

                // Validate the upscaled image is not corrupted
                try {
                    const sharp = require('sharp');
                    const metadata = await sharp(upscaledBuffer).metadata();
                    
                    if (!metadata.width || !metadata.height || metadata.width < 10 || metadata.height < 10) {
                        throw new Error('Invalid image dimensions');
                    }
                    
                    console.log(`Upscaled image validation: ${metadata.width}x${metadata.height}`);
                } catch (validationError) {
                    console.error('Image validation failed:', validationError);
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Upscaled image is corrupted. Please try with a different image.',
                        edit: processingMsg.key
                    });
                    return;
                }

                // Send the upscaled image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: upscaledBuffer,
                    caption: '_✨ Image Upscaled by MATDEV AI_'
                });

                // Edit processing message to show completion
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '✅ Image upscaling completed!',
                    edit: processingMsg.key
                });

                // Clean up temporary file
                await fs.remove(tempFilePath);
                console.log('✅ Image upscaling completed');

            } catch (processError) {
                console.error('Upscaling process error:', processError);
                
                let errorMessage = '❌ Error during image processing. Please try again.';
                if (processError.message.includes('API_KEY_INVALID')) {
                    errorMessage = '❌ Invalid upscaling API key. Please check your UPSCALE_API_KEY.';
                } else if (processError.message.includes('QUOTA_EXCEEDED')) {
                    errorMessage = '❌ API quota exceeded. Please try again later.';
                } else if (processError.message.includes('FILE_TOO_LARGE')) {
                    errorMessage = '❌ Image file is too large. Please try with a smaller image.';
                }
                
                // Edit the processing message to show error
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in upscale command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing upscale request.');
        }
    }

    /**
     * Upscale image using multiple free services
     */
    async upscaleImage(imagePath, apiKey) {
        const imageBuffer = await fs.readFile(imagePath);
        
        // Try multiple free APIs in order of preference
        const freeApis = [
            this.tryWaifu2xOriginal.bind(this),
            this.tryWaifu2xAlternative.bind(this),
            this.tryImageUpscalerAPI.bind(this),
            this.tryAdvancedFallback.bind(this)
        ];

        for (const apiFunction of freeApis) {
            try {
                console.log(`Trying ${apiFunction.name}...`);
                const result = await apiFunction(imageBuffer, imagePath);
                if (result) {
                    return result;
                }
            } catch (error) {
                console.log(`${apiFunction.name} failed:`, error.message);
                continue;
            }
        }

        console.error('All upscaling methods failed');
        return null;
    }

    /**
     * Try original Waifu2x API
     */
    async tryWaifu2xOriginal(imageBuffer) {
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('file', imageBuffer, {
            filename: 'image.jpg',
            contentType: 'image/jpeg'
        });
        form.append('style', 'photo');
        form.append('noise', '2');
        form.append('scale', '2');

        const response = await axios.post('https://api.waifu2x.udp.jp/api', form, {
            headers: { ...form.getHeaders() },
            responseType: 'arraybuffer',
            timeout: 45000
        });

        if (response.status === 200) {
            return Buffer.from(response.data);
        }
        throw new Error(`Waifu2x returned status ${response.status}`);
    }

    /**
     * Try alternative Waifu2x endpoint
     */
    async tryWaifu2xAlternative(imageBuffer) {
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('file', imageBuffer, {
            filename: 'image.png',
            contentType: 'image/png'
        });
        form.append('scale', '2');
        form.append('denoise', '1');

        const response = await axios.post('https://waifu2x.booru.pics/Home/FromFile', form, {
            headers: { ...form.getHeaders() },
            responseType: 'arraybuffer',
            timeout: 45000
        });

        if (response.status === 200 && response.data.byteLength > 1000) {
            return Buffer.from(response.data);
        }
        throw new Error('Waifu2x alternative failed');
    }

    /**
     * Try ImageUpscaler API
     */
    async tryImageUpscalerAPI(imageBuffer) {
        const base64Image = imageBuffer.toString('base64');
        
        const response = await axios.post('https://api.upscaler.ai/v1/upscale', {
            image: base64Image,
            scale: 2,
            format: 'jpg'
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 45000
        });

        if (response.data && response.data.image) {
            return Buffer.from(response.data.image, 'base64');
        }
        throw new Error('ImageUpscaler API failed');
    }

    /**
     * Advanced fallback with better algorithms
     */
    async tryAdvancedFallback(imageBuffer, imagePath) {
        console.log('Using advanced local upscaling...');
        return await this.advancedFallback(imagePath);
    }

    /**
     * Advanced fallback upscaling using multiple techniques
     */
    async advancedFallback(imagePath) {
        try {
            const sharp = require('sharp');
            const imageBuffer = await fs.readFile(imagePath);
            
            // Validate input image first
            const inputMetadata = await sharp(imageBuffer).metadata();
            
            if (!inputMetadata.width || !inputMetadata.height) {
                throw new Error('Invalid input image metadata');
            }
            
            console.log(`Input image: ${inputMetadata.width}x${inputMetadata.height}, format: ${inputMetadata.format}`);
            
            const scaleFactor = 2;
            const newWidth = Math.round(inputMetadata.width * scaleFactor);
            const newHeight = Math.round(inputMetadata.height * scaleFactor);
            
            console.log(`Upscaling from ${inputMetadata.width}x${inputMetadata.height} to ${newWidth}x${newHeight}`);
            
            // Simple but effective upscaling approach
            const upscaledBuffer = await sharp(imageBuffer)
                .resize(newWidth, newHeight, {
                    kernel: sharp.kernel.lanczos3,
                    withoutEnlargement: false,
                    fastShrinkOnLoad: false
                })
                .sharpen({
                    sigma: 1.5,
                    flat: 1.0,
                    jagged: 2.0
                })
                .modulate({
                    brightness: 1.05,
                    contrast: 1.15,
                    saturation: 1.05
                })
                .jpeg({ 
                    quality: 95,
                    progressive: true,
                    optimizeScans: true,
                    force: true
                })
                .toBuffer();
                
            // Validate output
            const outputMetadata = await sharp(upscaledBuffer).metadata();
            console.log(`✅ Upscaling completed: ${inputMetadata.width}x${inputMetadata.height} -> ${outputMetadata.width}x${outputMetadata.height}`);
            console.log(`Output buffer size: ${upscaledBuffer.length} bytes`);
            
            return upscaledBuffer;
            
        } catch (error) {
            console.error('Error in advanced fallback upscaling:', error);
            
            // Very simple fallback - just resize without any effects
            try {
                const sharp = require('sharp');
                const imageBuffer = await fs.readFile(imagePath);
                const metadata = await sharp(imageBuffer).metadata();
                
                console.log('Using minimal fallback upscaling...');
                const simpleUpscaled = await sharp(imageBuffer)
                    .resize(metadata.width * 2, metadata.height * 2, {
                        kernel: sharp.kernel.cubic
                    })
                    .jpeg({ quality: 90 })
                    .toBuffer();
                    
                console.log(`Simple fallback completed: ${simpleUpscaled.length} bytes`);
                return simpleUpscaled;
                
            } catch (simpleError) {
                console.error('Simple fallback also failed:', simpleError);
                return null;
            }
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Upscale plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new UpscalePlugin();
        await plugin.init(bot);
        return plugin;
    }
};