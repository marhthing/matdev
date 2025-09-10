
/**
 * MATDEV Hugging Face Plugin
 * Text-to-image generation using Stable Diffusion XL model
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class HuggingFacePlugin {
    constructor() {
        this.name = 'hf';
        this.description = 'Hugging Face text-to-image generation';
        this.version = '1.0.0';
        this.enabled = true;
        this.tempDir = path.join(process.cwd(), 'tmp');
        this.apiUrl = 'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0';
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            // Ensure temp directory exists
            await fs.ensureDir(this.tempDir);

            this.registerCommands();
            console.log('✅ Hugging Face plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Hugging Face plugin:', error);
            return false;
        }
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Text to image command
        this.bot.messageHandler.registerCommand('tti', this.textToImageCommand.bind(this), {
            description: 'Generate image from text using Stable Diffusion XL',
            usage: `${config.PREFIX}tti <your prompt>`,
            category: 'ai'
        });
    }

    /**
     * Text to Image Command
     */
    async textToImageCommand(messageInfo) {
        try {
            const apiKey = process.env.HF_API_KEY;
            if (!apiKey) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No API found, use .setenv HF_API_KEY=<key>\n\n🔑 Get your API key from: https://huggingface.co/settings/tokens');
                return;
            }

            let prompt = messageInfo.args.join(' ').trim();
            
            // Check if replying to a message
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (quotedMessage && !prompt) {
                // Extract text from quoted message
                if (quotedMessage.conversation) {
                    prompt = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    prompt = quotedMessage.extendedTextMessage.text;
                } else if (quotedMessage.imageMessage?.caption) {
                    prompt = quotedMessage.imageMessage.caption;
                } else if (quotedMessage.videoMessage?.caption) {
                    prompt = quotedMessage.videoMessage.caption;
                }
            }

            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a text prompt to generate an image.\nUsage: .tti <your prompt> OR reply to any text message with .tti');
                return;
            }

            if (prompt.length > 500) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Prompt too long. Please keep it under 500 characters.');
                return;
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🎨 Generating image with Stable Diffusion XL...');

            try {
                // Make request to Hugging Face API with proper parameters
                const response = await axios.post(this.apiUrl, {
                    inputs: prompt,
                    parameters: {
                        num_inference_steps: 20,
                        guidance_scale: 7.5,
                        width: 1024,
                        height: 1024
                    }
                }, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: 120000 // 2 minutes timeout for image generation
                });

                if (!response.data || response.data.length === 0) {
                    throw new Error('Empty response from Hugging Face API');
                }

                // Generate unique filename for temp storage
                const timestamp = Date.now();
                const outputPath = path.join(this.tempDir, `sdxl_${timestamp}.png`);
                
                // Check if response is JSON error
                if (response.headers['content-type']?.includes('application/json')) {
                    const errorData = response.data;
                    throw new Error(`API Error: ${errorData.error || 'Unknown error'}`);
                }
                
                let imageData = response.data;
                
                // Check if response is Base64-encoded
                if (Buffer.isBuffer(imageData)) {
                    const dataString = imageData.toString('utf8');
                    // If it starts with quote and contains Base64 PNG header
                    if (dataString.startsWith('"') && dataString.includes('iVBORw0KGgo')) {
                        console.log('📦 Detected Base64-encoded image, decoding...');
                        // Remove quotes and decode Base64
                        const base64String = dataString.replace(/^"/, '').replace(/"$/, '');
                        imageData = Buffer.from(base64String, 'base64');
                        console.log(`✅ Decoded: ${base64String.length} chars -> ${imageData.length} bytes`);
                    }
                }
                
                // Save decoded image data to temp file
                await fs.writeFile(outputPath, imageData);
                
                // Verify file was created and has content
                const stats = await fs.stat(outputPath);
                if (stats.size === 0) {
                    await fs.remove(outputPath);
                    throw new Error('Generated image file is empty');
                }

                console.log(`✅ Image saved to temp: ${outputPath} (${stats.size} bytes)`);

                // Create simple caption
                const caption = `_🔧 Generated by: ${config.BOT_NAME}_`;

                // Send the generated image using buffer (like other plugins)
                const imageBuffer = await fs.readFile(outputPath);
                
                // Send image with proper format
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: imageBuffer,
                    caption: caption
                });

                console.log(`✅ Image sent successfully, cleaning up temp file`);
                
                // Clean up temp file after sending
                await fs.remove(outputPath);
                console.log(`✅ Temp file deleted: ${outputPath}`);

            } catch (apiError) {
                console.error('Hugging Face API error:', apiError);
                
                let errorMessage = '❌ Error generating image. Please try again.';
                
                if (apiError.response?.status === 401) {
                    errorMessage = '❌ Invalid API key. Please check your HF_API_KEY.';
                } else if (apiError.response?.status === 429) {
                    errorMessage = '❌ API rate limit exceeded. Please try again later.';
                } else if (apiError.response?.status === 503) {
                    errorMessage = '❌ Model is loading. Please wait a moment and try again.';
                } else if (apiError.code === 'ECONNABORTED') {
                    errorMessage = '❌ Request timeout. The model might be busy, please try again.';
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in text-to-image command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
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
                if (file.startsWith('.')) continue;

                const filePath = path.join(this.tempDir, file);
                const stats = await fs.stat(filePath);

                // Remove files older than 1 hour
                if (now - stats.mtime.getTime() > 3600000) {
                    await fs.remove(filePath);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                console.log(`🧹 Cleaned ${cleaned} temporary HF files`);
            }
        } catch (error) {
            console.error('Error cleaning HF temporary files:', error);
        }

        console.log('🧹 Hugging Face plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new HuggingFacePlugin();
        await plugin.init(bot);
        return plugin;
    }
};
