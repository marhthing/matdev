const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class GeminiPlugin {
    constructor() {
        this.name = 'gemini';
        this.description = 'Google Gemini AI integration for intelligent responses';
        this.version = '1.0.0';
        this.enabled = true;
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            // Register the gemini command
            this.bot.messageHandler.registerCommand('gemini', this.geminiCommand.bind(this), {
                description: 'Ask Gemini AI a question',
                usage: `${config.PREFIX}gemini <your question>`,
                category: 'ai',
                plugin: 'gemini',
                source: 'gemini.js'
            });

            // Register the image generation command
            this.bot.messageHandler.registerCommand('imagine', this.imagineCommand.bind(this), {
                description: 'Generate an image using Nano Banana (Gemini 2.5 Flash Image)',
                usage: `${config.PREFIX}imagine <image description>`,
                category: 'ai',
                plugin: 'gemini',
                source: 'gemini.js'
            });


            console.log('✅ Gemini AI plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Gemini plugin:', error);
            return false;
        }
    }

    /**
     * Handle gemini command
     */
    async geminiCommand(messageInfo) {
        try {
            // Check if API key exists
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No API found, use .setenv GEMINI_API_KEY=<key>');
                return;
            }

            // Get the prompt from the message
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a question or prompt.\nUsage: .gemini <your question>');
                return;
            }

            // Send typing indicator
            const thinkingMsg = await this.bot.messageHandler.reply(messageInfo, '🤖 Thinking...');

            try {
                // Initialize Gemini AI
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                // Generate response
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                if (!text || text.trim().length === 0) {
                    // Edit the thinking message to show error
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Gemini returned an empty response.',
                        edit: thinkingMsg.key
                    });
                    return;
                }

                // Edit the thinking message with the actual AI response
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🤖 *MATDEV AI Response:*\n\n${text}`,
                    edit: thinkingMsg.key
                });
                console.log('✅ Gemini response sent');

            } catch (apiError) {
                console.error('Gemini API error:', apiError);
                
                let errorMessage = '❌ Error communicating with Gemini AI. Please try again.';
                if (apiError.message.includes('API_KEY_INVALID')) {
                    errorMessage = '❌ Invalid API key. Please check your GEMINI_API_KEY.';
                } else if (apiError.message.includes('QUOTA_EXCEEDED')) {
                    errorMessage = '❌ API quota exceeded. Please try again later.';
                }
                
                // Edit the thinking message to show error
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: thinkingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in gemini command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Handle image generation command using Nano Banana
     */
    async imagineCommand(messageInfo) {
        try {
            // Check if API key exists
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No API found, use .setenv GEMINI_API_KEY=<key>');
                return;
            }

            // Get the prompt from the message
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide an image description.\nUsage: .imagine <description>');
                return;
            }

            // Send generating indicator
            const generatingMsg = await this.bot.messageHandler.reply(messageInfo, '🎨 Generating image with Nano Banana...');

            try {
                // Initialize Gemini AI with image generation model
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image-preview" });

                // Generate image with proper configuration
                const result = await model.generateContent({
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "image/png"
                    }
                });
                
                const response = await result.response;
                const candidates = response.candidates;

                // Check for safety or other blocking
                if (!candidates || candidates.length === 0) {
                    let errorMessage = '❌ No image was generated. Please try a different prompt.';
                    if (response.promptFeedback && response.promptFeedback.blockReason) {
                        errorMessage = `❌ Content blocked: ${response.promptFeedback.blockReason}. Please try a different prompt.`;
                    }
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: errorMessage,
                        edit: generatingMsg.key
                    });
                    return;
                }

                const candidate = candidates[0];
                
                // Check finish reason for safety filtering
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                    let errorMessage = '❌ Image generation was blocked. Please try a different prompt.';
                    if (candidate.finishReason === 'SAFETY') {
                        errorMessage = '❌ Content filtered for safety. Please try a more appropriate prompt.';
                    } else if (candidate.finishReason === 'RECITATION') {
                        errorMessage = '❌ Content blocked due to recitation. Please try a more original prompt.';
                    }
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: errorMessage,
                        edit: generatingMsg.key
                    });
                    return;
                }

                const content = candidate.content;
                if (!content || !content.parts) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No image content received. Please try again.',
                        edit: generatingMsg.key
                    });
                    return;
                }

                // Find the image part
                let imageGenerated = false;
                for (const part of content.parts) {
                    if (part.inlineData && part.inlineData.data) {
                        const imageData = Buffer.from(part.inlineData.data, 'base64');
                        
                        // Create temp directory if it doesn't exist
                        const tempDir = path.join(process.cwd(), 'temp');
                        await fs.ensureDir(tempDir);
                        
                        // Save image with unique filename
                        const filename = `nano_banana_${Date.now()}.png`;
                        const imagePath = path.join(tempDir, filename);
                        await fs.writeFile(imagePath, imageData);

                        // Send the image
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            image: { url: imagePath },
                            caption: `🎨 *Generated by Nano Banana*\n\n📝 Prompt: "${prompt}"\n⚡ Powered by Gemini 2.5 Flash Image Preview`
                        });

                        // Clean up temp file after a delay
                        setTimeout(async () => {
                            try {
                                await fs.remove(imagePath);
                                console.log(`🧹 Cleaned up temp image: ${filename}`);
                            } catch (cleanupError) {
                                console.log('Note: Could not clean up temp image file:', cleanupError.message);
                            }
                        }, 15000); // 15 seconds delay for better delivery

                        imageGenerated = true;
                        break;
                    }
                }

                if (!imageGenerated) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No image data found in response. Please try again.',
                        edit: generatingMsg.key
                    });
                    return;
                }

                // Delete the generating message since we sent the image
                try {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        delete: generatingMsg.key
                    });
                } catch (deleteError) {
                    // If delete fails, just log it - not critical
                    console.log('Note: Could not delete generating message:', deleteError.message);
                }

                console.log('✅ Nano Banana image generated and sent');

            } catch (apiError) {
                console.error('Nano Banana API error:', apiError);
                
                let errorMessage = '❌ Error generating image with Nano Banana. Please try again.';
                
                // Check for specific error codes/status
                if (apiError.status === 400) {
                    if (apiError.message.includes('API_KEY_INVALID') || apiError.message.includes('Invalid API key')) {
                        errorMessage = '❌ Invalid API key. Please check your GEMINI_API_KEY.';
                    } else if (apiError.message.includes('safety') || apiError.message.includes('SAFETY')) {
                        errorMessage = '❌ Content filtered for safety. Please try a different prompt.';
                    } else {
                        errorMessage = '❌ Invalid request. Please check your prompt and try again.';
                    }
                } else if (apiError.status === 429 || apiError.message.includes('quota') || apiError.message.includes('rate limit')) {
                    errorMessage = '❌ API quota exceeded or rate limited. Please try again later.';
                } else if (apiError.status === 401) {
                    errorMessage = '❌ API key authentication failed. Please check your GEMINI_API_KEY.';
                } else if (apiError.status === 403) {
                    errorMessage = '❌ API access forbidden. Check your API key permissions.';
                }
                
                // Edit the generating message to show error
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: generatingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in imagine command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your image generation request.');
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Gemini plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new GeminiPlugin();
        await plugin.init(bot);
        return plugin;
    }
};