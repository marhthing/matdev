const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class AIGeneratorPlugin {
    constructor() {
        this.name = 'ai-generator';
        this.description = 'AI content generator: images, text, and artistic styles using Pollinations.ai';
        this.version = '4.0.0';
        this.enabled = true;
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            // Register image generation command
            this.bot.messageHandler.registerCommand('image', this.imageCommand.bind(this), {
                description: 'Generate images using free AI services',
                usage: `${config.PREFIX}image <description>`,
                category: 'ai',
                plugin: 'ai-generator',
                source: 'ai-generator.js'
            });

            // Register video generation command - COMMENTED OUT (not working)
            // this.bot.messageHandler.registerCommand('video', this.videoCommand.bind(this), {
            //     description: 'Generate videos from text using free AI',
            //     usage: `${config.PREFIX}video <description>`,
            //     category: 'ai',
            //     plugin: 'image',
            //     source: 'image.js'
            // });

            // Register animate command (image-to-video) - COMMENTED OUT (not working)
            // this.bot.messageHandler.registerCommand('animate', this.animateCommand.bind(this), {
            //     description: 'Animate static images into videos',
            //     usage: `${config.PREFIX}animate (reply to image)`,
            //     category: 'ai',
            //     plugin: 'image',
            //     source: 'image.js'
            // });

            // Register text generation command
            this.bot.messageHandler.registerCommand('write', this.writeCommand.bind(this), {
                description: 'Generate creative text content',
                usage: `${config.PREFIX}write <prompt>`,
                category: 'ai',
                plugin: 'ai-generator',
                source: 'ai-generator.js'
            });

            // Register style transfer command
            this.bot.messageHandler.registerCommand('style', this.styleCommand.bind(this), {
                description: 'Apply artistic styles to images',
                usage: `${config.PREFIX}style <style> (reply to image)`,
                category: 'ai',
                plugin: 'ai-generator',
                source: 'ai-generator.js'
            });

            // Register music generation command - COMMENTED OUT (not working)
            // this.bot.messageHandler.registerCommand('music', this.musicCommand.bind(this), {
            //     description: 'Generate background music from text',
            //     usage: `${config.PREFIX}music <description>`,
            //     category: 'ai',
            //     plugin: 'image',
            //     source: 'image.js'
            // });

            console.log('✅ Pollinations AI plugin loaded (working commands: image, write, style)');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Pollinations AI plugin:', error);
            return false;
        }
    }

    /**
     * Handle image generation command
     */
    async imageCommand(messageInfo) {
        try {
            // Get the prompt from the message
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ Please provide an image description.\nUsage: .image <description>\n\nExamples:\n• .image a cat in a fancy restaurant\n• .image futuristic city with flying cars\n\n🆓 This uses completely FREE AI services!');
                return;
            }

            try {
                // Only use Pollinations.ai (remove broken HuggingFace fallback)
                console.log(`Generating image with Pollinations.ai...`);
                const result = await this.generateWithPollinations(prompt);
                
                if (!result || !result.success) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Image generation service is currently unavailable. Please try again later.');
                    return;
                }

                // Create temporary file path
                const tempFile = path.join(__dirname, '..', 'tmp', `generated_${Date.now()}.jpg`);

                // Ensure tmp directory exists
                await fs.ensureDir(path.dirname(tempFile));

                // Write image buffer to temp file
                await fs.writeFile(tempFile, result.imageBuffer);

                // Send the generated image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: tempFile },
                    caption: `_🔧 Generated by: ${config.BOT_NAME}_`
                });

                // Clean up temp file immediately after sending
                await fs.unlink(tempFile).catch(() => {});

                console.log('✅ Free image generated and sent');

            } catch (error) {
                console.error('Image generation error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error generating image. Please try again later.');
            }

        } catch (error) {
            console.error('Error in image command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your image request.');
        }
    }

    /**
     * Generate image using Pollinations (completely free, no auth)
     */
    async generateWithPollinations(prompt) {
        try {
            // Pollinations.ai - completely free image generation
            const encodedPrompt = encodeURIComponent(prompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 45000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/2.0'
                }
            });

            if (response.data && response.data.byteLength > 1000) {
                return {
                    success: true,
                    imageBuffer: Buffer.from(response.data),
                    serviceName: 'Pollinations.ai'
                };
            }

            throw new Error('Invalid image data received');

        } catch (error) {
            throw new Error(`Pollinations failed: ${error.message}`);
        }
    }



    /**
     * Handle video generation command
     */
    async videoCommand(messageInfo) {
        try {
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ Video generation is currently not supported.\n\n🔧 Try these alternatives:\n• Use .image to generate a static image\n• Use .animate to create a simple slideshow (when available)\n\n💡 Video generation requires advanced infrastructure that is not currently available.');
                return;
            }

            // Video generation is not available in current free APIs
            await this.bot.messageHandler.reply(messageInfo, 
                '🚧 Video generation is temporarily unavailable.\n\n' +
                '📸 Alternative: Use `.image ${prompt}` to generate a related image instead.\n\n' +
                '💡 True AI video generation requires specialized services that are currently not integrated.');

        } catch (error) {
            console.error('Error in video command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your video request.');
        }
    }

    /**
     * Handle animate command (image-to-video)
     */
    async animateCommand(messageInfo) {
        try {
            // Check for quoted message
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.imageMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image to animate it.');
                return;
            }

            // Animation is not available without proper video encoding tools
            await this.bot.messageHandler.reply(messageInfo, 
                '🚧 Image animation is temporarily unavailable.\n\n' +
                '📸 The image you replied to looks great as is!\n\n' +
                '💡 True image-to-video animation requires specialized video processing tools that are currently not available.');

        } catch (error) {
            console.error('Error in animate command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your animation request.');
        }
    }

    /**
     * Handle text generation command
     */
    async writeCommand(messageInfo) {
        try {
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ Please provide a writing prompt.\nUsage: .write <prompt>\n\nExamples:\n• .write a story about space cats\n• .write a poem about rain\n• .write a social media caption for coffee\n\n🆓 This uses completely FREE AI services!');
                return;
            }

            try {
                const result = await this.generateText(prompt);
                if (!result || !result.success) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Text generation service is currently unavailable. Please try again later.');
                    return;
                }

                // Send the generated text
                await this.bot.messageHandler.reply(messageInfo, `*📝 AI Generated Content:*\n\n${result.text}\n\n_🔧 Generated by: ${config.BOT_NAME}_`);

                console.log('✅ Text generated and sent');

            } catch (error) {
                console.error('Text generation error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error generating text. Please try again later.');
            }

        } catch (error) {
            console.error('Error in write command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your text request.');
        }
    }

    /**
     * Handle style transfer command
     */
    async styleCommand(messageInfo) {
        try {
            const style = messageInfo.args.join(' ').trim();
            if (!style) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ Please specify a style.\nUsage: .style <style>\n\nExamples:\n• .style anime\n• .style oil painting\n• .style cartoon\n• .style watercolor\n\n🎨 This creates a new image in your requested style!');
                return;
            }

            try {
                // await this.bot.messageHandler.reply(messageInfo, `🎨 Creating a ${style} style artwork...`);

                // Generate a new image with the requested style
                const result = await this.applyStyle('', style);

                if (!result || !result.success) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Style generation service is currently unavailable. Please try again later.');
                    return;
                }

                // Create temp file for output
                const tempOutputFile = path.join(__dirname, '..', 'tmp', `styled_${Date.now()}.jpg`);
                
                // Ensure tmp directory exists
                await fs.ensureDir(path.dirname(tempOutputFile));
                
                await fs.writeFile(tempOutputFile, result.imageBuffer);

                // Send the styled image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: tempOutputFile },
                    caption: `_🎨 ${style} style artwork - Generated by: ${config.BOT_NAME}_`
                });

                // Clean up temp files
                await fs.unlink(tempOutputFile).catch(() => {});

                console.log('✅ Style artwork generated and sent');

            } catch (error) {
                console.error('Style generation error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error generating style artwork. Please try again later.');
            }

        } catch (error) {
            console.error('Error in style command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your style request.');
        }
    }

    /**
     * Handle music generation command - currently not available
     */
    async musicCommand(messageInfo) {
        try {
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🎵 Music generation is currently unavailable.\n\nUsage: .music <description>\n\nExamples:\n• .music jazz piano solo\n• .music relaxing rain sounds\n• .music upbeat electronic\n\n💡 Music generation requires specialized paid services that are not currently configured.');
                return;
            }

            // Music generation not available without paid services
            await this.bot.messageHandler.reply(messageInfo, 
                '🚧 Music generation is currently unavailable.\n\n' +
                '💡 This feature requires paid audio generation services that are not currently integrated.\n\n' +
                '🎨 Try using `.image ${prompt}` to generate a visual representation instead!');

        } catch (error) {
            console.error('Error in music command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your music request.');
        }
    }


    /**
     * Generate text using Pollinations.ai (corrected API endpoint)
     */
    async generateText(prompt) {
        try {
            const encodedPrompt = encodeURIComponent(prompt);
            const textUrl = `https://text.pollinations.ai/${encodedPrompt}`;

            const response = await axios.get(textUrl, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/2.0',
                    'Accept': 'text/plain'
                }
            });

            if (response.data && typeof response.data === 'string' && response.data.length > 10) {
                return {
                    success: true,
                    text: response.data.trim()
                };
            }

            throw new Error('Invalid text data received');

        } catch (error) {
            throw new Error(`Text generation failed: ${error.message}`);
        }
    }

    /**
     * Apply style transfer using Pollinations.ai image generation with style description
     */
    async applyStyle(imagePath, style) {
        try {
            // Generate a new image with the requested style (no image input needed)
            const stylePrompt = `a ${style} style artwork, artistic ${style} interpretation, beautiful ${style} art`;
            const encodedPrompt = encodeURIComponent(stylePrompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&enhance=true`;

            const response = await axios.get(imageUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/2.0'
                }
            });

            if (response.data && response.data.byteLength > 1000) {
                return {
                    success: true,
                    imageBuffer: Buffer.from(response.data)
                };
            }

            throw new Error('Invalid styled image data received');

        } catch (error) {
            throw new Error(`Style transfer failed: ${error.message}`);
        }
    }

    /**
     * Generate music - currently not available without paid services
     */
    async generateMusic(prompt) {
        try {
            // Text-to-speech APIs require payment, return unavailable
            return {
                success: false,
                message: 'Audio generation requires paid API access which is not currently configured.'
            };

        } catch (error) {
            throw new Error(`Music generation failed: ${error.message}`);
        }
    }


    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Pollinations AI plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AIGeneratorPlugin();
        await plugin.init(bot);
        return plugin;
    }
};