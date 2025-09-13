
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const Jimp = require('jimp');
const { createWorker } = require('tesseract.js');

class ImageToTextPlugin {
    constructor() {
        this.name = 'image-to-text';
        this.description = 'Extract text from images using OCR (Optical Character Recognition)';
        this.version = '1.0.0';
        this.enabled = true;
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('imgtxt', this.imgTxtCommand.bind(this), {
                description: 'Extract text from image',
                usage: `${config.PREFIX}imgtxt (reply to image)`,
                category: 'utility',
                plugin: 'image-to-text',
                source: 'image-to-text.js'
            });

            console.log('✅ Image to Text plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Image to Text plugin:', error);
            return false;
        }
    }

    async imgTxtCommand(messageInfo) {
        try {
            // Check for quoted message with image
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.imageMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '🔍 Usage: Reply to an image with .imgtxt\n\n' +
                    '📸 Supported formats: JPG, PNG, WebP\n' +
                    '💡 Works best with clear, high-contrast text');
                return;
            }

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
                    await this.bot.messageHandler.reply(messageInfo, result.text);
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
            console.error('Error in imgtxt command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing image to text request.');
        }
    }

    async extractTextFromImage(imageBuffer) {
        try {
            console.log('🔍 Starting enhanced OCR with multiple preprocessing techniques...');

            // Step 1: Advanced image preprocessing for blurred/poor quality images
            const processedImages = await this.preprocessImageForOCR(imageBuffer);
            
            // Step 2: Try multiple OCR engines with different processed versions
            const results = [];
            
            // Try Tesseract.js with enhanced preprocessing (best for blurred images)
            for (const [method, processedBuffer] of processedImages) {
                console.log(`🔧 Trying Tesseract OCR with ${method} preprocessing...`);
                const tesseractResult = await this.tryTesseractOCR(processedBuffer, method);
                if (tesseractResult.success && tesseractResult.text.length > 5) {
                    results.push(tesseractResult);
                }
            }

            // Try cloud APIs with original and best processed image
            console.log('☁️ Trying cloud OCR services...');
            const cloudResult = await this.tryCloudOCR(imageBuffer);
            if (cloudResult.success && cloudResult.text.length > 5) {
                results.push(cloudResult);
            }

            // Try enhanced OCR.space with best processed image
            if (processedImages.length > 0) {
                const enhancedResult = await this.tryEnhancedOCRSpace(processedImages[0][1]);
                if (enhancedResult.success && enhancedResult.text.length > 5) {
                    results.push(enhancedResult);
                }
            }

            // Return best result based on confidence and text length
            if (results.length > 0) {
                const bestResult = this.selectBestResult(results);
                console.log(`✅ OCR completed using ${bestResult.method}`);
                return bestResult;
            }

            // Final fallback
            return {
                success: false,
                error: 'Unable to extract text from image.\n\n' +
                       '💡 Tips:\n' +
                       '• Ensure text is clearly visible\n' +
                       '• Try images with higher contrast\n' +
                       '• Avoid extremely blurry or distorted images'
            };

        } catch (error) {
            console.error('Enhanced OCR extraction error:', error);
            return {
                success: false,
                error: 'OCR processing failed. Please try again.'
            };
        }
    }

    async preprocessImageForOCR(imageBuffer) {
        try {
            const processedImages = [];
            const image = await Jimp.read(imageBuffer);
            
            // Method 1: Enhanced for blurred images
            const enhanced = image.clone()
                .scale(1.5) // Upscale for better OCR
                .contrast(0.3) // Increase contrast
                .brightness(0.1) // Slight brightness boost
                .blur(1) // Slight blur to reduce noise
                .blur(-1); // Then sharpen
            
            processedImages.push(['enhanced', await enhanced.getBufferAsync(Jimp.MIME_PNG)]);
            
            // Method 2: High contrast for faded text
            const highContrast = image.clone()
                .scale(2) // Scale up significantly
                .contrast(0.5) // High contrast
                .normalize() // Normalize colors
                .greyscale(); // Convert to grayscale
            
            processedImages.push(['high_contrast', await highContrast.getBufferAsync(Jimp.MIME_PNG)]);
            
            // Method 3: Sharpened for slightly blurred text
            const sharpened = image.clone()
                .scale(1.5)
                .contrast(0.2)
                .convolute([
                    [0, -1, 0],
                    [-1, 5, -1],
                    [0, -1, 0]
                ]); // Sharpening kernel
            
            processedImages.push(['sharpened', await sharpened.getBufferAsync(Jimp.MIME_PNG)]);
            
            // Method 4: Denoised for noisy images
            const denoised = image.clone()
                .scale(1.8)
                .blur(0.5) // Light blur to reduce noise
                .contrast(0.3)
                .normalize();
            
            processedImages.push(['denoised', await denoised.getBufferAsync(Jimp.MIME_PNG)]);

            return processedImages;

        } catch (error) {
            console.error('Image preprocessing error:', error);
            return [];
        }
    }

    async tryTesseractOCR(imageBuffer, method) {
        try {
            const worker = await createWorker('eng');
            
            await worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?:;-() \n',
                tessedit_pageseg_mode: '6', // Uniform block of text
            });

            const { data: { text, confidence } } = await worker.recognize(imageBuffer);
            await worker.terminate();

            if (text && text.trim().length > 2) {
                return {
                    success: true,
                    text: text.trim(),
                    confidence: confidence,
                    method: `tesseract_${method}`
                };
            }

            return { success: false };

        } catch (error) {
            console.error('Tesseract OCR error:', error);
            return { success: false };
        }
    }

    async tryCloudOCR(imageBuffer) {
        try {
            // Try multiple cloud OCR services
            const results = [];

            // Try API1 - OCR.space with premium settings
            try {
                const formData = new FormData();
                formData.append('file', new Blob([imageBuffer]), 'image.png');
                formData.append('language', 'eng');
                formData.append('isOverlayRequired', 'false');
                formData.append('detectOrientation', 'true');
                formData.append('scale', 'true');
                formData.append('OCREngine', '2'); // Better engine

                const response = await axios.post('https://api.ocr.space/parse/image', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 15000
                });

                if (response.data?.ParsedResults?.[0]?.ParsedText) {
                    results.push({
                        success: true,
                        text: response.data.ParsedResults[0].ParsedText.trim(),
                        confidence: 85,
                        method: 'ocr_space_premium'
                    });
                }
            } catch (e) { /* Continue to next service */ }

            // Try API2 - Alternative free OCR service
            try {
                const base64 = imageBuffer.toString('base64');
                const ocrResponse = await axios.post('https://api.api-ninjas.com/v1/imagetotext', {
                    image: base64
                }, {
                    headers: { 'X-Api-Key': 'your-api-key' }, // Would need real key
                    timeout: 10000
                });

                if (ocrResponse.data && ocrResponse.data.length > 0) {
                    results.push({
                        success: true,
                        text: ocrResponse.data[0].text,
                        confidence: 80,
                        method: 'api_ninjas'
                    });
                }
            } catch (e) { /* Continue to next service */ }

            return results.length > 0 ? results[0] : { success: false };

        } catch (error) {
            console.error('Cloud OCR error:', error);
            return { success: false };
        }
    }

    async tryEnhancedOCRSpace(imageBuffer) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([imageBuffer]), 'image.png');
            formData.append('language', 'eng');
            formData.append('isOverlayRequired', 'true');
            formData.append('detectOrientation', 'true');
            formData.append('scale', 'true');
            formData.append('OCREngine', '2');
            formData.append('filetype', 'png');

            const response = await axios.post('https://api.ocr.space/parse/image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 20000
            });

            if (response.data?.ParsedResults?.[0]?.ParsedText) {
                return {
                    success: true,
                    text: response.data.ParsedResults[0].ParsedText.trim(),
                    confidence: 90,
                    method: 'enhanced_ocr_space'
                };
            }

            return { success: false };

        } catch (error) {
            console.error('Enhanced OCR.space error:', error);
            return { success: false };
        }
    }

    selectBestResult(results) {
        if (results.length === 0) return { success: false };
        if (results.length === 1) return results[0];

        // Score results based on text length, confidence, and method quality
        return results.reduce((best, current) => {
            const bestScore = (best.text.length * 0.4) + (best.confidence || 50) * 0.6;
            const currentScore = (current.text.length * 0.4) + (current.confidence || 50) * 0.6;
            
            return currentScore > bestScore ? current : best;
        });
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
        console.log('🧹 Image to Text plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ImageToTextPlugin();
        await plugin.init(bot);
        return plugin;
    }
};

