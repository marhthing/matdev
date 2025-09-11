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
            this.bot.messageHandler.registerCommand('img', this.imagineCommand.bind(this), {
                description: 'Generate an image using free DeepAI API',
                usage: `${config.PREFIX}img <image description>`,
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
     * Handle image generation command using free DeepAI API
     */
    async imagineCommand(messageInfo) {
        try {
            // Check if API key exists - DeepAI gives you a free API key when you sign up
            const apiKey = process.env.DEEPAI_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No DeepAI API key found. Get a free one at https://deepai.org/\nThen use: .setenv DEEPAI_API_KEY=<your_key>');
                return;
            }

            // Get the prompt from the message
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide an image description.\nUsage: .img <description>');
                return;
            }

            // Send generating indicator
            const generatingMsg = await this.bot.messageHandler.reply(messageInfo, '🎨 Generating image with free AI...');

            try {
                // Generate image using DeepAI free API (using Node.js built-in fetch)
                const form = new FormData();
                form.append('text', prompt);

                const response = await fetch('https://api.deepai.org/api/text2img', {
                    method: 'POST',
                    headers: {
                        'api-key': apiKey
                    },
                    body: form
                });

                if (!response.ok) {
                    let errorMessage = '❌ Error generating image. Please try again.';
                    if (response.status === 401) {
                        errorMessage = '❌ Invalid API key. Check your DEEPAI_API_KEY.';
                    } else if (response.status === 429) {
                        errorMessage = '❌ Rate limit exceeded. Please wait a moment and try again.';
                    }
                    
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: errorMessage,
                        edit: generatingMsg.key
                    });
                    return;
                }

                const result = await response.json();
                
                // Check for API errors in the response
                if (result.status === 'error' || result.error) {
                    const errorMsg = result.error || 'Unknown error occurred';
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: `❌ DeepAI Error: ${errorMsg}`,
                        edit: generatingMsg.key
                    });
                    return;
                }
                
                if (!result.output_url) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No image was generated. Please try a different prompt.',
                        edit: generatingMsg.key
                    });
                    return;
                }

                // Download the image from the URL
                const imageResponse = await fetch(result.output_url);
                const arrayBuffer = await imageResponse.arrayBuffer();
                const imageBuffer = Buffer.from(arrayBuffer);
                
                // Create temp directory if it doesn't exist
                const tempDir = path.join(process.cwd(), 'temp');
                await fs.ensureDir(tempDir);
                
                // Save image with unique filename
                const filename = `deepai_${Date.now()}.jpg`;
                const imagePath = path.join(tempDir, filename);
                await fs.writeFile(imagePath, imageBuffer);

                // Send the image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: imagePath },
                    caption: `🎨 *Generated with Free AI*\n\n📝 Prompt: "${prompt}"\n⚡ Powered by DeepAI (100% Free)`
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

                // Delete the generating message since we sent the image
                try {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        delete: generatingMsg.key
                    });
                } catch (deleteError) {
                    // If delete fails, just log it - not critical
                    console.log('Note: Could not delete generating message:', deleteError.message);
                }

                console.log('✅ DeepAI image generated and sent');

            } catch (apiError) {
                console.error('DeepAI API error:', apiError);
                
                let errorMessage = '❌ Error generating image. Please try again.';
                if (apiError.message && apiError.message.includes('fetch')) {
                    errorMessage = '❌ Network error. Please check your connection and try again.';
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