const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');

class UpscalePlugin {
    constructor() {
        this.name = 'upscale';
        this.description = 'FREE AI image upscaling for enhanced picture quality';
        this.version = '2.0.0';
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
                description: 'Upscale image quality using FREE AI methods',
                usage: `${config.PREFIX}upscale (reply to image or use as caption)`,
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
            let messageToDownload;

            // Check if this is an image with .upscale as caption (like sticker command)
            const directImage = messageInfo.message?.imageMessage;
            
            if (directImage) {
                // Direct image with .upscale caption
                messageToDownload = {
                    key: messageInfo.key,
                    message: messageInfo.message
                };
            } else {
                // Check for quoted message
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                    messageInfo.message?.quotedMessage;

                if (!quotedMessage) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Please reply to an image or send image with .upscale as caption.');
                    return;
                }

                // Check if the quoted message has an image
                if (!quotedMessage.imageMessage && !quotedMessage.stickerMessage) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ The message you replied to must contain an image.');
                    return;
                }

                // Get the proper quoted message structure
                const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;

                if (!contextInfo || !contextInfo.quotedMessage) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Could not access the quoted message.');
                    return;
                }

                // Create proper message structure for quoted message
                messageToDownload = {
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
            }

            // Using 100% FREE methods only - no API keys needed!

            try {

                // console.log('Downloading media from quoted message...');
                const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {});

                if (!buffer || buffer.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download the image or image is empty.');
                    return;
                }

                // console.log(`Downloaded image buffer: ${buffer.length} bytes`);

                // Save image temporarily
                const tempFileName = `upscale_${Date.now()}.jpg`;
                const tempFilePath = path.join(this.tempDir, tempFileName);
                await fs.writeFile(tempFilePath, buffer);

                // Upscale the image
                const upscaledBuffer = await this.upscaleImage(tempFilePath);

                if (!upscaledBuffer || upscaledBuffer.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Failed to upscale the image. Please try again.');
                    return;
                }

                // console.log(`Upscaled image buffer: ${upscaledBuffer.length} bytes`);

                // Comprehensive validation of the upscaled image
                try {
                    const sharp = require('sharp');
                    const metadata = await sharp(upscaledBuffer).metadata();

                    if (!metadata.width || !metadata.height || metadata.width < 10 || metadata.height < 10) {
                        throw new Error('Invalid image dimensions');
                    }

                    // Test that the image can actually be processed (corruption check)
                    const testImage = await sharp(upscaledBuffer)
                        .resize(50, 50)
                        .jpeg()
                        .toBuffer();

                    if (testImage.length < 50) {
                        throw new Error('Image appears to be corrupted (test processing failed)');
                    }

                    // Check if the image is just black/blank by sampling pixels
                    const stats = await sharp(upscaledBuffer).stats();
                    const channels = stats.channels;
                    
                    // Check if all channels have very low variance (indicating blank image)
                    const isBlank = channels.every(channel => 
                        channel.mean < 5 || (channel.max - channel.min) < 10
                    );

                    if (isBlank) {
                        throw new Error('Upscaled image appears to be blank or corrupted');
                    }

                    // console.log(`Upscaled image validation passed: ${metadata.width}x${metadata.height}`);
                    // console.log(`Image stats - R: ${channels[0]?.mean.toFixed(1)}, G: ${channels[1]?.mean.toFixed(1)}, B: ${channels[2]?.mean.toFixed(1)}`);
                } catch (validationError) {
                    console.error('Image validation failed:', validationError);
                    await this.bot.messageHandler.reply(messageInfo, '❌ Upscaled image is corrupted or blank. Please try with a different image.');
                    return;
                }

                // Send the upscaled image silently
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: upscaledBuffer,
                    caption: '_✨ Image Upscaled by MATDEV AI_'
                });

                // Clean up temporary file
                await fs.remove(tempFilePath);
                // console.log('✅ Image upscaling completed');

            } catch (processError) {
                console.error('Upscaling process error:', processError);

                let errorMessage = '❌ Error during image processing. Please try again.';
                if (processError.message.includes('API_LIMIT')) {
                    errorMessage = '❌ Free API limit reached. Using local processing...';
                } else if (processError.message.includes('FILE_TOO_LARGE')) {
                    errorMessage = '❌ Image file is too large. Please try with a smaller image.';
                }

                // Send error message
                await this.bot.messageHandler.reply(messageInfo, errorMessage);
            }

        } catch (error) {
            console.error('Error in upscale command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing upscale request.');
        }
    }

    /**
     * Upscale image using truly FREE methods only
     */
    async upscaleImage(imagePath, apiKey) {
        const imageBuffer = await fs.readFile(imagePath);

        // Try FREE methods in order of preference (Sharp first for best quality)
        const freeApis = [
            this.tryAdvancedSharp.bind(this),           // Always works, best quality locally
            this.tryPixelcutFree.bind(this),            // 3 free daily uploads
            this.tryUpscaleMediaFree.bind(this),        // Completely free
            this.tryImgUpscalerFree.bind(this),         // Free without signup
            this.tryBasicSharpFallback.bind(this)       // Final fallback
        ];

        for (const apiFunction of freeApis) {
            try {
                // console.log(`Trying ${apiFunction.name}...`);
                const result = await apiFunction(imageBuffer, imagePath);
                if (result) {
                    return result;
                }
            } catch (error) {
                // console.log(`${apiFunction.name} failed:`, error.message);
                continue;
            }
        }

        console.error('All free upscaling methods failed');
        return null;
    }

    /**
     * Advanced Sharp Processing (PRIMARY METHOD - Always Free)
     */
    async tryAdvancedSharp(imageBuffer, imagePath) {
        // console.log('🚀 Using Advanced Sharp Processing (100% Free)...');
        
        const sharp = require('sharp');
        const inputMetadata = await sharp(imageBuffer).metadata();
        
        if (!inputMetadata.width || !inputMetadata.height) {
            throw new Error('Invalid image metadata');
        }
        
        // console.log(`📐 Input: ${inputMetadata.width}x${inputMetadata.height}`);
        
        // Smart scaling - more aggressive for better visual results
        let scaleFactor = 4;
        if (inputMetadata.width > 600 || inputMetadata.height > 450) scaleFactor = 3;
        if (inputMetadata.width > 1000 || inputMetadata.height > 750) scaleFactor = 2;
        
        // Force minimum 2x scaling even for very large images
        if (scaleFactor < 2) scaleFactor = 2;
        
        const newWidth = Math.round(inputMetadata.width * scaleFactor);
        const newHeight = Math.round(inputMetadata.height * scaleFactor);
        
        // console.log(`🎯 Target: ${newWidth}x${newHeight} (${scaleFactor}x scaling)`);
        
        let processedBuffer;
        
        // Use different processing for different image types
        if (inputMetadata.format === 'png' || inputMetadata.hasAlpha) {
            processedBuffer = await sharp(imageBuffer)
                .resize(newWidth, newHeight, {
                    kernel: sharp.kernel.lanczos3,  // Best quality
                    withoutEnlargement: false,
                    fastShrinkOnLoad: false
                })
                .sharpen({ sigma: 1.2, m1: 1.1, m2: 0.2 })  // More aggressive sharpening
                .modulate({ brightness: 1.04, saturation: 1.12, lightness: 0 })  // Enhanced colors
                .png({ 
                    quality: 100,
                    compressionLevel: 6,
                    adaptiveFiltering: true,
                    palette: false
                })
                .toBuffer();
        } else {
            processedBuffer = await sharp(imageBuffer)
                .resize(newWidth, newHeight, {
                    kernel: sharp.kernel.lanczos3,
                    withoutEnlargement: false,
                    fastShrinkOnLoad: false
                })
                .sharpen({ sigma: 1.5, m1: 1.2, m2: 0.1 })  // More aggressive sharpening
                .modulate({ brightness: 1.03, saturation: 1.15, lightness: 0 })  // Enhanced colors
                .gamma(1.15)  // Better contrast enhancement
                .linear(1.1, 0)  // Slight contrast boost
                .jpeg({ 
                    quality: 95,
                    progressive: true,
                    mozjpeg: true,
                    optimizeScans: true,
                    quantizationTable: 0  // High quality quantization
                })
                .toBuffer();
        }
        
        const outputMetadata = await sharp(processedBuffer).metadata();
        // console.log(`✅ Sharp processing success: ${outputMetadata.width}x${outputMetadata.height}`);
        // console.log(`📊 Size: ${(processedBuffer.length / 1024).toFixed(1)}KB`);
        
        return processedBuffer;
    }

    /**
     * Try Pixelcut Free API (3 free daily uploads)
     */
    async tryPixelcutFree(imageBuffer) {
        console.log('🎨 Trying Pixelcut Free API...');
        
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('image', imageBuffer, { filename: 'image.jpg' });
        
        const response = await axios.post('https://api.pixelcut.ai/v1/upscale', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'MATDEV-Bot/1.0'
            },
            timeout: 45000
        });
        
        if (response.data && response.data.result_url) {
            const imageResponse = await axios.get(response.data.result_url, {
                responseType: 'arraybuffer'
            });
            console.log('✅ Pixelcut success!');
            return Buffer.from(imageResponse.data);
        }
        throw new Error('Pixelcut API failed');
    }

    /**
     * Try Upscale.media Free Service (Completely Free)
     */
    async tryUpscaleMediaFree(imageBuffer) {
        console.log('🌐 Trying Upscale.media Free Service...');
        
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('image', imageBuffer, { filename: 'image.jpg' });
        form.append('scale', '4');
        
        const response = await axios.post('https://www.upscale.media/api/upscale', form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': 'Mozilla/5.0 (compatible; MATDEV-Bot/1.0)'
            },
            timeout: 60000
        });
        
        if (response.data && response.data.output) {
            const imageResponse = await axios.get(response.data.output, {
                responseType: 'arraybuffer'
            });
            console.log('✅ Upscale.media success!');
            return Buffer.from(imageResponse.data);
        }
        throw new Error('Upscale.media API failed');
    }

    /**
     * Try ImgUpscaler.ai Free (No signup required)
     */
    async tryImgUpscalerFree(imageBuffer) {
        console.log('🆙 Trying ImgUpscaler.ai Free...');
        
        const base64Image = imageBuffer.toString('base64');
        
        const response = await axios.post('https://imgupscaler.ai/api/upscale', {
            image: base64Image,
            scale: 4
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'MATDEV-Bot/1.0'
            },
            timeout: 45000
        });
        
        if (response.data && response.data.result) {
            const imageData = response.data.result.replace('data:image/jpeg;base64,', '');
            console.log('✅ ImgUpscaler.ai success!');
            return Buffer.from(imageData, 'base64');
        }
        throw new Error('ImgUpscaler.ai API failed');
    }

    /**
     * Basic Sharp Fallback (Final backup method)
     */
    async tryBasicSharpFallback(imageBuffer, imagePath) {
        console.log('🔧 Using Basic Sharp Fallback...');
        
        try {
            const sharp = require('sharp');
            const inputMetadata = await sharp(imageBuffer).metadata();
            
            if (!inputMetadata.width || !inputMetadata.height) {
                throw new Error('Invalid image metadata');
            }
            
            console.log(`📐 Input: ${inputMetadata.width}x${inputMetadata.height}`);
            
            // Simple 2x upscaling with good quality
            const newWidth = inputMetadata.width * 2;
            const newHeight = inputMetadata.height * 2;
            
            const basicBuffer = await sharp(imageBuffer)
                .resize(newWidth, newHeight, {
                    kernel: sharp.kernel.cubic,  // Good balance of quality and speed
                    withoutEnlargement: false
                })
                .sharpen(0.6)  // Moderate sharpening
                .jpeg({ 
                    quality: 88,
                    progressive: true,
                    mozjpeg: true
                })
                .toBuffer();
            
            console.log(`✅ Basic Sharp success: ${newWidth}x${newHeight}`);
            console.log(`📊 Size: ${(basicBuffer.length / 1024).toFixed(1)}KB`);
            
            return basicBuffer;
            
        } catch (error) {
            console.error('❌ Basic Sharp fallback failed:', error.message);
            throw error;
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