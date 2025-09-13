const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class ImagePlugin {
    constructor() {
        this.name = 'image';
        this.description = 'Google Nano Banana (Gemini 2.5 Flash Image) for AI image generation and editing';
        this.version = '1.0.0';
        this.enabled = true;
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            // Register image generation commands
            this.bot.messageHandler.registerCommand('image', this.imageCommand.bind(this), {
                description: 'Generate images using Google Nano Banana AI',
                usage: `${config.PREFIX}image <description>`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            this.bot.messageHandler.registerCommand('img', this.imageCommand.bind(this), {
                description: 'Generate images using Google Nano Banana AI (short)',
                usage: `${config.PREFIX}img <description>`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            this.bot.messageHandler.registerCommand('edit', this.editCommand.bind(this), {
                description: 'Edit images using Google Nano Banana AI',
                usage: `${config.PREFIX}edit <description> (reply to image)`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            console.log('✅ Nano Banana Image plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Image plugin:', error);
            return false;
        }
    }

    /**
     * Handle image generation command
     */
    async imageCommand(messageInfo) {
        try {
            // Check if API key exists
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No API found, use .setenv GEMINI_API_KEY=<key>\nGet your free key at: ai.google.dev');
                return;
            }

            // Get the prompt from the message
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide an image description.\nUsage: .image <description>\n\nExamples:\n• .image a cat eating nano banana in fancy restaurant\n• .img futuristic city with flying cars');
                return;
            }

            // Send generating indicator
            const generatingMsg = await this.bot.messageHandler.reply(messageInfo, '🎨 Generating image with Nano Banana...');

            try {
                // Initialize Gemini AI with image model
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image-preview" });

                // Generate image
                const result = await model.generateContent([prompt]);
                const response = await result.response;

                // Check if we have image data in the response
                const candidates = response.candidates || [];
                if (candidates.length === 0) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No image generated. Try a different prompt.',
                        edit: generatingMsg.key
                    });
                    return;
                }

                // Look for inline image data
                let imageBuffer = null;
                for (const candidate of candidates) {
                    if (candidate.content && candidate.content.parts) {
                        for (const part of candidate.content.parts) {
                            if (part.inline_data && part.inline_data.data) {
                                imageBuffer = Buffer.from(part.inline_data.data, 'base64');
                                break;
                            }
                        }
                    }
                    if (imageBuffer) break;
                }

                if (!imageBuffer) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Image data not found in response. Please try again.',
                        edit: generatingMsg.key
                    });
                    return;
                }

                // Save image to temp directory
                const tempDir = path.join(__dirname, '..', 'tmp');
                await fs.ensureDir(tempDir);
                const timestamp = Date.now();
                const imagePath = path.join(tempDir, `generated_${timestamp}.jpg`);
                
                await fs.writeFile(imagePath, imageBuffer);

                // Send the generated image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: imagePath },
                    caption: `🎨 *Generated by Nano Banana*\n\n📝 Prompt: ${prompt}`
                });

                // Delete the generating message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    delete: generatingMsg.key
                });

                // Clean up temp file after 5 seconds
                setTimeout(async () => {
                    try {
                        await fs.unlink(imagePath);
                    } catch (cleanupError) {
                        console.log('Cleanup note: temp file already removed');
                    }
                }, 5000);

                console.log('✅ Image generated and sent');

            } catch (apiError) {
                console.error('Nano Banana API error:', apiError);
                
                let errorMessage = '❌ Error generating image with Nano Banana. Please try again.';
                if (apiError.message.includes('API_KEY_INVALID')) {
                    errorMessage = '❌ Invalid API key. Please check your GEMINI_API_KEY.';
                } else if (apiError.message.includes('QUOTA_EXCEEDED')) {
                    errorMessage = '❌ API quota exceeded. Please try again later or upgrade your plan.';
                } else if (apiError.message.includes('SAFETY')) {
                    errorMessage = '❌ Image blocked by safety filters. Please try a different prompt.';
                }
                
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: generatingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in image command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your image request.');
        }
    }

    /**
     * Handle image editing command
     */
    async editCommand(messageInfo) {
        try {
            // Check if API key exists
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No API found, use .setenv GEMINI_API_KEY=<key>');
                return;
            }

            // Get the edit prompt
            const editPrompt = messageInfo.args.join(' ').trim();
            if (!editPrompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide edit instructions and reply to an image.\nUsage: .edit <instructions>\n\nExample: .edit add sunglasses to the person');
                return;
            }

            // Check if this is a reply to a message with an image
            const quotedMsg = messageInfo.message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg || !quotedMsg.imageMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to an image message with your edit instructions.');
                return;
            }

            // Send editing indicator
            const editingMsg = await this.bot.messageHandler.reply(messageInfo, '✏️ Editing image with Nano Banana...');

            try {
                // Download the original image
                const media = await this.bot.sock.downloadMediaMessage({
                    key: messageInfo.message.key,
                    message: { imageMessage: quotedMsg.imageMessage }
                });

                if (!media) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Could not download the original image.',
                        edit: editingMsg.key
                    });
                    return;
                }

                // Initialize Gemini AI
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image-preview" });

                // Prepare image data for Gemini
                const imageData = {
                    inlineData: {
                        data: media.toString('base64'),
                        mimeType: 'image/jpeg'
                    }
                };

                // Generate edited image
                const result = await model.generateContent([editPrompt, imageData]);
                const response = await result.response;

                // Check for image data in response
                let editedImageBuffer = null;
                const candidates = response.candidates || [];
                
                for (const candidate of candidates) {
                    if (candidate.content && candidate.content.parts) {
                        for (const part of candidate.content.parts) {
                            if (part.inline_data && part.inline_data.data) {
                                editedImageBuffer = Buffer.from(part.inline_data.data, 'base64');
                                break;
                            }
                        }
                    }
                    if (editedImageBuffer) break;
                }

                if (!editedImageBuffer) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Could not edit the image. Please try a different edit instruction.',
                        edit: editingMsg.key
                    });
                    return;
                }

                // Save edited image
                const tempDir = path.join(__dirname, '..', 'tmp');
                await fs.ensureDir(tempDir);
                const timestamp = Date.now();
                const editedImagePath = path.join(tempDir, `edited_${timestamp}.jpg`);
                
                await fs.writeFile(editedImagePath, editedImageBuffer);

                // Send the edited image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: editedImagePath },
                    caption: `✏️ *Edited by Nano Banana*\n\n📝 Edit: ${editPrompt}`
                });

                // Delete the editing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    delete: editingMsg.key
                });

                // Clean up temp file
                setTimeout(async () => {
                    try {
                        await fs.unlink(editedImagePath);
                    } catch (cleanupError) {
                        console.log('Cleanup note: temp file already removed');
                    }
                }, 5000);

                console.log('✅ Image edited and sent');

            } catch (apiError) {
                console.error('Image editing error:', apiError);
                
                let errorMessage = '❌ Error editing image. Please try again with different instructions.';
                if (apiError.message.includes('API_KEY_INVALID')) {
                    errorMessage = '❌ Invalid API key. Please check your GEMINI_API_KEY.';
                } else if (apiError.message.includes('QUOTA_EXCEEDED')) {
                    errorMessage = '❌ API quota exceeded. Please try again later.';
                }
                
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: editingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in edit command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your edit request.');
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Image plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ImagePlugin();
        await plugin.init(bot);
        return plugin;
    }
};