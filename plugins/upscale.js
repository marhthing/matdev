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

                    console.log(`Upscaled image validation passed: ${metadata.width}x${metadata.height}`);
                    console.log(`Image stats - R: ${channels[0]?.mean.toFixed(1)}, G: ${channels[1]?.mean.toFixed(1)}, B: ${channels[2]?.mean.toFixed(1)}`);
                } catch (validationError) {
                    console.error('Image validation failed:', validationError);
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Upscaled image is corrupted or blank. Please try with a different image.',
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
     * Upscale image using latest 2025 methods
     */
    async upscaleImage(imagePath, apiKey) {
        const imageBuffer = await fs.readFile(imagePath);

        // Try latest 2025 APIs in order of quality
        const modernApis = [
            this.tryReplicateRealESRGAN.bind(this),
            this.tryStabilityAI.bind(this),
            this.tryCloudinaryAPI.bind(this),
            this.tryAdvancedFallback.bind(this)
        ];

        for (const apiFunction of modernApis) {
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
     * Try Replicate Real-ESRGAN API (2025 - Best Quality)
     */
    async tryReplicateRealESRGAN(imageBuffer) {
        // Check for Replicate API key first
        const apiKey = process.env.REPLICATE_API_TOKEN;
        if (!apiKey) {
            console.log('⚠️ REPLICATE_API_TOKEN not set, skipping Replicate API');
            throw new Error('No API key');
        }

        console.log('🤖 Using Replicate Real-ESRGAN API...');
        
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('input', JSON.stringify({
            image: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`,
            scale: 4,
            face_enhance: true
        }));

        const response = await axios.post(
            'https://api.replicate.com/v1/predictions',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000
            }
        );

        if (response.data && response.data.urls && response.data.urls.get) {
            // Poll for result
            let attempts = 0;
            while (attempts < 30) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const statusResponse = await axios.get(response.data.urls.get, {
                    headers: {
                        'Authorization': `Token ${apiKey}`
                    }
                });

                if (statusResponse.data.status === 'succeeded' && statusResponse.data.output) {
                    const imageResponse = await axios.get(statusResponse.data.output, {
                        responseType: 'arraybuffer'
                    });
                    return Buffer.from(imageResponse.data);
                } else if (statusResponse.data.status === 'failed') {
                    throw new Error('Replicate processing failed');
                }
                attempts++;
            }
        }
        throw new Error('Replicate API timeout');
    }

    /**
     * Try Stability AI Upscaling API (2025 - Latest)
     */
    async tryStabilityAI(imageBuffer) {
        const apiKey = process.env.STABILITY_API_KEY;
        if (!apiKey) {
            console.log('⚠️ STABILITY_API_KEY not set, skipping Stability AI');
            throw new Error('No API key');
        }

        console.log('🚀 Using Stability AI Upscaling...');
        
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('image', imageBuffer, { filename: 'image.jpg' });
        form.append('width', '2048');
        form.append('height', '2048');

        const response = await axios.post(
            'https://api.stability.ai/v2beta/stable-image/upscale/conservative',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${apiKey}`,
                    'Accept': 'image/*'
                },
                responseType: 'arraybuffer',
                timeout: 60000
            }
        );

        if (response.status === 200) {
            return Buffer.from(response.data);
        }
        throw new Error(`Stability AI returned status ${response.status}`);
    }

    /**
     * Try Cloudinary API (2025 - Reliable Free Tier)
     */
    async tryCloudinaryAPI(imageBuffer) {
        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        
        if (!cloudName || !apiKey || !apiSecret) {
            console.log('⚠️ Cloudinary credentials not set, skipping Cloudinary');
            throw new Error('No API credentials');
        }

        console.log('☁️ Using Cloudinary Super Resolution...');
        
        const crypto = require('crypto');
        const timestamp = Math.round((new Date()).getTime() / 1000);
        
        // Create signature
        const params = {
            timestamp: timestamp,
            transformation: 'e_upscale',
            format: 'jpg'
        };
        
        const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
        const signature = crypto.createHash('sha1').update(sortedParams + apiSecret).digest('hex');
        
        const FormData = require('form-data');
        const form = new FormData();
        
        form.append('file', imageBuffer, { filename: 'image.jpg' });
        form.append('timestamp', timestamp);
        form.append('api_key', apiKey);
        form.append('signature', signature);
        form.append('transformation', 'e_upscale');
        form.append('format', 'jpg');

        const response = await axios.post(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            form,
            {
                headers: form.getHeaders(),
                timeout: 45000
            }
        );

        if (response.data && response.data.secure_url) {
            const imageResponse = await axios.get(response.data.secure_url, {
                responseType: 'arraybuffer'
            });
            return Buffer.from(imageResponse.data);
        }
        throw new Error('Cloudinary API failed');
    }

    /**
     * Advanced fallback with better algorithms
     */
    async tryAdvancedFallback(imageBuffer, imagePath) {
        console.log('Using advanced local upscaling...');
        return await this.advancedFallback(imagePath);
    }

    /**
     * Advanced local fallback using latest Sharp algorithms (2025)
     */
    async advancedFallback(imagePath) {
        try {
            const sharp = require('sharp');
            
            console.log('🔧 Using advanced local upscaling with latest algorithms...');
            
            // Read and validate input image
            const imageBuffer = await fs.readFile(imagePath);
            const inputMetadata = await sharp(imageBuffer).metadata();

            if (!inputMetadata.width || !inputMetadata.height) {
                throw new Error('Invalid input image metadata');
            }

            console.log(`📐 Input: ${inputMetadata.width}x${inputMetadata.height} (${inputMetadata.format})`);

            const scaleFactor = 3; // Increased to 3x for better results
            const newWidth = Math.round(inputMetadata.width * scaleFactor);
            const newHeight = Math.round(inputMetadata.height * scaleFactor);

            // Use the highest quality methods available in Sharp 2025
            let upscaledBuffer;
            
            if (inputMetadata.format === 'png' || inputMetadata.hasAlpha) {
                // Enhanced PNG processing with transparency preservation
                upscaledBuffer = await sharp(imageBuffer)
                    .resize(newWidth, newHeight, {
                        kernel: sharp.kernel.lanczos3, // Best quality kernel
                        withoutEnlargement: false,
                        fastShrinkOnLoad: false // Better quality
                    })
                    .sharpen(0.5, 1, 0.5) // Gentle unsharp masking
                    .modulate({ brightness: 1.02, saturation: 1.05 }) // Slight enhancement
                    .png({ 
                        quality: 100,
                        compressionLevel: 6,
                        adaptiveFiltering: true
                    })
                    .toBuffer();
            } else {
                // Enhanced JPEG processing
                upscaledBuffer = await sharp(imageBuffer)
                    .resize(newWidth, newHeight, {
                        kernel: sharp.kernel.lanczos3,
                        withoutEnlargement: false,
                        fastShrinkOnLoad: false
                    })
                    .sharpen(0.8, 1, 0.3) // Optimized sharpening
                    .modulate({ brightness: 1.01, saturation: 1.03, lightness: 0 })
                    .jpeg({ 
                        quality: 95,
                        progressive: true,
                        mozjpeg: true, // Use mozjpeg for better compression
                        optimizeScans: true
                    })
                    .toBuffer();
            }

            // Validate output
            const outputMetadata = await sharp(upscaledBuffer).metadata();
            
            if (!outputMetadata.width || !outputMetadata.height) {
                throw new Error('Failed to generate valid upscaled image');
            }

            console.log(`✅ Advanced local upscaling successful: ${outputMetadata.width}x${outputMetadata.height}`);
            console.log(`📊 Size: ${(upscaledBuffer.length / 1024).toFixed(1)}KB`);

            return upscaledBuffer;

        } catch (error) {
            console.error('❌ Advanced fallback failed:', error.message);
            console.log('🔄 Trying basic fallback...');

            // Improved basic fallback
            try {
                const sharp = require('sharp');
                const imageBuffer = await fs.readFile(imagePath);
                const metadata = await sharp(imageBuffer).metadata();

                const basicUpscaled = await sharp(imageBuffer)
                    .resize(metadata.width * 2, metadata.height * 2, {
                        kernel: sharp.kernel.cubic, // Better than nearest
                        withoutEnlargement: false
                    })
                    .sharpen(0.5) // Add some sharpening
                    .jpeg({ quality: 90, mozjpeg: true })
                    .toBuffer();

                console.log(`✅ Basic fallback completed: ${(basicUpscaled.length / 1024).toFixed(1)}KB`);
                return basicUpscaled;

            } catch (basicError) {
                console.error('❌ All fallback methods failed:', basicError.message);
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