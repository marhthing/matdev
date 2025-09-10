
/**
 * MATDEV Remove.bg Plugin
 * Remove backgrounds from images using Remove.bg API
 */

const config = require('../config');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');

class RemoveBgPlugin {
    constructor() {
        this.name = 'rmbg';
        this.description = 'Remove background from images using Remove.bg API';
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

            // Register the rmbg command
            this.bot.messageHandler.registerCommand('rmbg', this.removeBgCommand.bind(this), {
                description: 'Remove background from image using Remove.bg API',
                usage: `${config.PREFIX}rmbg (reply to image) OR send image with .rmbg caption`,
                category: 'media',
                plugin: 'rmbg',
                source: 'rmbg.js'
            });

            console.log('✅ Remove.bg plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Remove.bg plugin:', error);
            return false;
        }
    }

    /**
     * Remove background command
     */
    async removeBgCommand(messageInfo) {
        try {
            // Check if API key exists
            const apiKey = process.env.REMOVEBG_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No API found, use .setenv REMOVEBG_API_KEY=<key>');
                return;
            }

            let messageToDownload = null;
            let currentImage = null;
            
            // Check if this is an image with .rmbg as caption (like sticker command)
            const directImage = messageInfo.message?.imageMessage;
            
            if (directImage) {
                // Direct image with .rmbg caption
                currentImage = directImage;
                messageToDownload = {
                    key: messageInfo.key,
                    message: messageInfo.message
                };
            } else {
                // Check for quoted message
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                    messageInfo.message?.quotedMessage;

                if (!quotedMessage || !quotedMessage.imageMessage) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Send an image with .rmbg as caption or reply to an image with .rmbg');
                    return;
                }

                currentImage = quotedMessage.imageMessage;
                messageToDownload = {
                    key: messageInfo.message.extendedTextMessage?.contextInfo?.quotedMessage?.key || {},
                    message: quotedMessage
                };
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🎨 Removing background...');

            try {
                // Download image
                const imageBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {});

                if (!imageBuffer || imageBuffer.length === 0) {
                    throw new Error('Failed to download image');
                }

                // Check file size (Remove.bg limit is 22MB)
                if (imageBuffer.length > 22 * 1024 * 1024) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Image too large. Maximum file size is 22MB.',
                        edit: processingMsg.key
                    });
                    return;
                }

                // Create form data for Remove.bg API
                const formData = new FormData();
                formData.append('size', 'auto'); // Use highest available resolution
                formData.append('format', 'png'); // PNG format with transparency
                formData.append('image_file', imageBuffer, {
                    filename: 'image.jpg',
                    contentType: currentImage.mimetype || 'image/jpeg'
                });

                // Call Remove.bg API
                const response = await axios.post('https://api.remove.bg/v1.0/removebg', formData, {
                    headers: {
                        'X-Api-Key': apiKey,
                        ...formData.getHeaders()
                    },
                    responseType: 'arraybuffer',
                    timeout: 60000 // 60 second timeout
                });

                if (!response.data || response.data.length === 0) {
                    throw new Error('Empty response from Remove.bg API');
                }

                // Get credits information from headers
                const creditsCharged = response.headers['x-credits-charged'] || 'Unknown';
                const detectedType = response.headers['x-type'] || 'Unknown';

                // Save processed image to temp file
                const outputPath = path.join(this.tempDir, `rmbg_${Date.now()}.png`);
                await fs.writeFile(outputPath, response.data);

                // Send the processed image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: fs.readFileSync(outputPath),
                    caption: `🎨 *Background Removed Successfully!*\n\n📊 *Details:*\n• Type: ${detectedType}\n• Credits used: ${creditsCharged}\n• Format: PNG with transparency\n\n🤖 Powered by Remove.bg`
                });

                // Edit the processing message to show completion
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '✅ Background removal completed!',
                    edit: processingMsg.key
                });

                // Clean up temp file
                await fs.remove(outputPath);

            } catch (apiError) {
                console.error('Remove.bg API error:', apiError);
                
                let errorMessage = '❌ Error removing background. Please try again.';
                
                if (apiError.response) {
                    const status = apiError.response.status;
                    
                    if (status === 402) {
                        errorMessage = '❌ Insufficient credits. Please check your Remove.bg account balance.';
                    } else if (status === 403) {
                        errorMessage = '❌ Invalid API key. Please check your REMOVEBG_API_KEY.';
                    } else if (status === 429) {
                        errorMessage = '❌ Rate limit exceeded. Please try again later.';
                    } else if (status === 400) {
                        errorMessage = '❌ Invalid image or parameters. Make sure the image contains a foreground object.';
                    }
                } else if (apiError.message.includes('timeout')) {
                    errorMessage = '❌ Request timeout. The image might be too complex. Please try again.';
                }
                
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in rmbg command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing background removal request.');
            }
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        try {
            const files = await fs.readdir(this.tempDir);
            const now = Date.now();
            let cleaned = 0;

            for (const file of files) {
                if (!file.startsWith('rmbg_')) continue;

                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);

                // Remove files older than 1 hour
                if (now - stats.mtime.getTime() > 3600000) {
                    await fs.remove(filePath);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                console.log(`🧹 Cleaned ${cleaned} temporary Remove.bg files`);
            }
        } catch (error) {
            console.error('Error cleaning Remove.bg temporary files:', error);
        }

        console.log('🧹 Remove.bg plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new RemoveBgPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
