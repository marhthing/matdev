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

            // Check if API key exists
            const apiKey = process.env.UPSCALE_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No upscaling API key found. Use .setenv UPSCALE_API_KEY=<key>');
                return;
            }

            // Send processing indicator
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                '🔄 Processing image for upscaling...');

            try {
                // Create proper message structure for downloadMediaMessage
                const mediaMessage = quotedMessage.imageMessage || quotedMessage.stickerMessage;
                
                // Create a complete message object that downloadMediaMessage expects
                const messageToDownload = {
                    key: messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key || {
                        remoteJid: messageInfo.chat_jid,
                        fromMe: false,
                        id: 'quoted-media-' + Date.now()
                    },
                    message: quotedMessage
                };

                const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {});
                
                if (!buffer) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Failed to download the image.',
                        edit: processingMsg.key
                    });
                    return;
                }

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
                const upscaledBuffer = await this.upscaleImage(tempFilePath, apiKey);

                if (!upscaledBuffer) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Failed to upscale the image. Please try again.',
                        edit: processingMsg.key
                    });
                    return;
                }

                // Send the upscaled image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: upscaledBuffer,
                    caption: '✨ *Image Upscaled by MATDEV AI*\n\nYour image has been enhanced with AI upscaling!'
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
     * Upscale image using AI service
     */
    async upscaleImage(imagePath, apiKey) {
        try {
            // Using Replicate API for Real-ESRGAN upscaling
            const imageBuffer = await fs.readFile(imagePath);
            const base64Image = imageBuffer.toString('base64');

            const response = await axios.post('https://api.replicate.com/v1/predictions', {
                version: "42fed1c4974146d4d2414e2be2c5277c7fcf05fcc972f6bf2b8b4c7b7e3c4c61", // Real-ESRGAN model
                input: {
                    image: `data:image/jpeg;base64,${base64Image}`,
                    scale: 2, // 2x upscaling
                    face_enhance: false
                }
            }, {
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const predictionId = response.data.id;

            // Poll for completion
            let result = null;
            let attempts = 0;
            const maxAttempts = 30; // 30 seconds timeout

            while (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                
                const statusResponse = await axios.get(`https://api.replicate.com/v1/predictions/${predictionId}`, {
                    headers: {
                        'Authorization': `Token ${apiKey}`
                    }
                });

                if (statusResponse.data.status === 'succeeded') {
                    result = statusResponse.data.output;
                    break;
                } else if (statusResponse.data.status === 'failed') {
                    throw new Error('Upscaling failed on server');
                }

                attempts++;
            }

            if (!result) {
                throw new Error('Upscaling timeout - please try again');
            }

            // Download the upscaled image
            const imageResponse = await axios.get(result, { responseType: 'arraybuffer' });
            return Buffer.from(imageResponse.data);

        } catch (error) {
            console.error('Error in upscaleImage:', error);
            if (error.response) {
                console.error('API Response:', error.response.data);
            }
            return null;
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