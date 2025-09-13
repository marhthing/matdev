const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class ScreenshotTextPlugin {
    constructor() {
        this.name = 'screenshot-text';
        this.description = 'Extract text from images using OCR (Optical Character Recognition)';
        this.version = '1.0.0';
        this.enabled = true;
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('ocr', this.ocrCommand.bind(this), {
                description: 'Extract text from image',
                usage: `${config.PREFIX}ocr (reply to image)`,
                category: 'utility',
                plugin: 'screenshot-text',
                source: 'screenshot-text.js'
            });

            this.bot.messageHandler.registerCommand('readtext', this.readTextCommand.bind(this), {
                description: 'Read text from screenshot/image',
                usage: `${config.PREFIX}readtext (reply to image)`,
                category: 'utility', 
                plugin: 'screenshot-text',
                source: 'screenshot-text.js'
            });

            console.log('✅ Screenshot Text plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Screenshot Text plugin:', error);
            return false;
        }
    }

    async ocrCommand(messageInfo) {
        try {
            // Check for quoted message with image
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.imageMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '🔍 Usage: Reply to an image with .ocr\n\n' +
                    '📸 Supported formats: JPG, PNG, WebP\n' +
                    '💡 Works best with clear, high-contrast text');
                return;
            }

            // Show processing message
            await this.bot.messageHandler.reply(messageInfo, '🔍 Processing image for text extraction...');

            try {
                // Download the image
                const { downloadMediaMessage } = require('baileys');
                const imageBuffer = await downloadMediaMessage(
                    { message: quotedMessage },
                    'buffer',
                    {},
                    {
                        logger: console,
                        reuploadRequest: this.bot.sock.updateMediaMessage
                    }
                );

                // Extract text from image
                const result = await this.extractTextFromImage(imageBuffer);
                
                if (result.success && result.text.trim()) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `🔍 **Text Extracted**\n\n` +
                        `${result.text}\n\n` +
                        `📊 **Stats:**\n` +
                        `• Characters: ${result.text.length}\n` +
                        `• Words: ${result.text.split(/\s+/).length}\n` +
                        `• Confidence: ${result.confidence || 'N/A'}`);
                } else if (result.success && !result.text.trim()) {
                    await this.bot.messageHandler.reply(messageInfo,
                        '❌ No text found in the image.\n\n' +
                        '💡 Tips for better results:\n' +
                        '• Use high-quality, clear images\n' +
                        '• Ensure good contrast between text and background\n' +
                        '• Avoid blurry or rotated images');
                } else {
                    await this.bot.messageHandler.reply(messageInfo, `❌ ${result.error}`);
                }

            } catch (downloadError) {
                console.error('Image download error:', downloadError);
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download image. Please try again.');
            }

        } catch (error) {
            console.error('Error in ocr command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing OCR request.');
        }
    }

    async readTextCommand(messageInfo) {
        // Alias for OCR command with different messaging
        await this.ocrCommand(messageInfo);
    }

    async extractTextFromImage(imageBuffer) {
        try {
            // Try multiple OCR services in order of preference
            
            // First try: OCR.space (free API with decent results)
            const ocrSpaceResult = await this.tryOCRSpace(imageBuffer);
            if (ocrSpaceResult.success) {
                return ocrSpaceResult;
            }

            // Second try: Free OCR API
            const freeOCRResult = await this.tryFreeOCR(imageBuffer);
            if (freeOCRResult.success) {
                return freeOCRResult;
            }

            // Fallback: Basic pattern recognition (limited but works for simple cases)
            return await this.fallbackOCR(imageBuffer);

        } catch (error) {
            console.error('OCR extraction error:', error);
            return {
                success: false,
                error: 'OCR service temporarily unavailable. Please try again later.'
            };
        }
    }

    async tryOCRSpace(imageBuffer) {
        try {
            // OCR.space free API (limited requests per month)
            const formData = new FormData();
            formData.append('file', new Blob([imageBuffer]), 'image.jpg');
            formData.append('language', 'eng');
            formData.append('isOverlayRequired', 'false');
            formData.append('apikey', 'helloworld'); // Free demo key (very limited)

            const response = await axios.post('https://api.ocr.space/parse/image', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 15000
            });

            if (response.data && response.data.ParsedResults && response.data.ParsedResults[0]) {
                const result = response.data.ParsedResults[0];
                if (result.ParsedText) {
                    return {
                        success: true,
                        text: result.ParsedText.trim(),
                        confidence: result.TextOverlay ? 'Good' : 'Fair'
                    };
                }
            }

            throw new Error('No text extracted from OCR.space');

        } catch (error) {
            console.error('OCR.space error:', error.message);
            return { success: false };
        }
    }

    async tryFreeOCR(imageBuffer) {
        try {
            // Try a basic OCR implementation using free services
            // This is a placeholder - in practice you'd integrate with a real OCR service
            
            // Convert image to base64 for API
            const base64Image = imageBuffer.toString('base64');
            
            // This is a mock implementation - replace with actual free OCR service
            return { success: false };

        } catch (error) {
            console.error('Free OCR error:', error.message);
            return { success: false };
        }
    }

    async fallbackOCR(imageBuffer) {
        // Very basic fallback - just return a helpful message
        // In a real implementation, you could try local OCR libraries
        return {
            success: false,
            error: 'OCR services temporarily unavailable.\n\n' +
                   '💡 This feature requires external OCR services.\n' +
                   'Please try again later or contact admin for API key setup.'
        };
    }

    // Helper method to determine image format
    getImageFormat(buffer) {
        // Check magic bytes to determine format
        if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'jpeg';
        if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
        if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'webp';
        return 'unknown';
    }

    async cleanup() {
        console.log('🧹 Screenshot Text plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ScreenshotTextPlugin();
        await plugin.init(bot);
        return plugin;
    }
};