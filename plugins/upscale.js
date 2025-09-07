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
                const upscaledBuffer = await this.upscaleImage(tempFilePath);

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
     * Upscale image using free Waifu2x service
     */
    async upscaleImage(imagePath, apiKey) {
        try {
            // Using free Waifu2x API for upscaling
            const imageBuffer = await fs.readFile(imagePath);
            
            // Create form data for the API request
            const FormData = require('form-data');
            const form = new FormData();
            
            form.append('file', imageBuffer, {
                filename: 'image.jpg',
                contentType: 'image/jpeg'
            });
            form.append('style', 'art'); // 'art' or 'photo'
            form.append('noise', '1'); // noise reduction level (0, 1, 2, 3)
            form.append('scale', '2'); // upscaling factor (1, 2)

            const response = await axios.post('https://api.waifu2x.udp.jp/api', form, {
                headers: {
                    ...form.getHeaders(),
                },
                responseType: 'arraybuffer',
                timeout: 60000 // 60 seconds timeout
            });

            if (response.status === 200) {
                return Buffer.from(response.data);
            } else {
                throw new Error(`Waifu2x API returned status ${response.status}`);
            }

        } catch (error) {
            console.error('Error in upscaleImage:', error);
            
            // Fallback to a simple image processing method
            try {
                console.log('Trying fallback upscaling method...');
                return await this.fallbackUpscale(imagePath);
            } catch (fallbackError) {
                console.error('Fallback upscaling also failed:', fallbackError);
                return null;
            }
        }
    }

    /**
     * Fallback upscaling using Sharp (simple interpolation)
     */
    async fallbackUpscale(imagePath) {
        try {
            const sharp = require('sharp');
            const imageBuffer = await fs.readFile(imagePath);
            
            // Get image metadata
            const metadata = await sharp(imageBuffer).metadata();
            const newWidth = metadata.width * 2;
            const newHeight = metadata.height * 2;
            
            // Upscale using bicubic interpolation
            const upscaledBuffer = await sharp(imageBuffer)
                .resize(newWidth, newHeight, {
                    kernel: sharp.kernel.cubic
                })
                .jpeg({ quality: 95 })
                .toBuffer();
                
            return upscaledBuffer;
        } catch (error) {
            console.error('Error in fallback upscaling:', error);
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