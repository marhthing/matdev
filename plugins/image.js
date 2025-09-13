const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class ImagePlugin {
    constructor() {
        this.name = 'pollinations';
        this.description = 'Complete Pollinations.ai suite: images, videos, text, music & style transfer';
        this.version = '3.0.0';
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
                plugin: 'image',
                source: 'image.js'
            });

            // Register video generation command
            this.bot.messageHandler.registerCommand('video', this.videoCommand.bind(this), {
                description: 'Generate videos from text using free AI',
                usage: `${config.PREFIX}video <description>`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            // Register animate command (image-to-video)
            this.bot.messageHandler.registerCommand('animate', this.animateCommand.bind(this), {
                description: 'Animate static images into videos',
                usage: `${config.PREFIX}animate (reply to image)`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            // Register text generation command
            this.bot.messageHandler.registerCommand('write', this.writeCommand.bind(this), {
                description: 'Generate creative text content',
                usage: `${config.PREFIX}write <prompt>`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            // Register style transfer command
            this.bot.messageHandler.registerCommand('style', this.styleCommand.bind(this), {
                description: 'Apply artistic styles to images',
                usage: `${config.PREFIX}style <style> (reply to image)`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            // Register music generation command
            this.bot.messageHandler.registerCommand('music', this.musicCommand.bind(this), {
                description: 'Generate background music from text',
                usage: `${config.PREFIX}music <description>`,
                category: 'ai',
                plugin: 'image',
                source: 'image.js'
            });

            console.log('✅ Pollinations AI plugin loaded with full capabilities');
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
                // Try multiple free services in order
                const services = [
                    () => this.generateWithPollinations(prompt),
                    () => this.generateWithHuggingFace(prompt)
                ];

                let imageBuffer = null;
                let serviceName = '';
                
                for (const [index, service] of services.entries()) {
                    try {
                        console.log(`Trying free image service ${index + 1}...`);
                        const result = await service();
                        if (result && result.success) {
                            imageBuffer = result.imageBuffer;
                            serviceName = result.serviceName;
                            console.log(`✅ ${serviceName} succeeded`);
                            break;
                        }
                    } catch (serviceError) {
                        console.log(`❌ Service ${index + 1} failed: ${serviceError.message}`);
                        continue;
                    }
                }

                if (!imageBuffer) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ All free image services are currently unavailable. Please try again later.');
                    return;
                }

                // Create temporary file path
                const tempFile = path.join(__dirname, '..', 'tmp', `generated_${Date.now()}.jpg`);
                
                // Ensure tmp directory exists
                await fs.ensureDir(path.dirname(tempFile));
                
                // Write image buffer to temp file
                await fs.writeFile(tempFile, imageBuffer);

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
     * Generate image using Hugging Face (free tier, no auth)
     */
    async generateWithHuggingFace(prompt) {
        try {
            const models = [
                'runwayml/stable-diffusion-v1-5',        // Most reliable
                'stabilityai/stable-diffusion-2-1',      // Alternative
                'CompVis/stable-diffusion-v1-4'          // Backup
            ];

            for (const model of models) {
                try {
                    console.log(`Trying HF model: ${model}`);
                    
                    const response = await axios.post(
                        `https://api-inference.huggingface.co/models/${model}`,
                        { inputs: prompt },
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'x-wait-for-model': 'true'  // Wait for model to load
                            },
                            responseType: 'arraybuffer',
                            timeout: 120000  // 2 minutes for model loading
                        }
                    );

                    // Check if we got actual image data (not an error message)
                    if (response.data && response.data.byteLength > 1000) {
                        // Verify it's actually image data by checking magic bytes
                        const bytes = new Uint8Array(response.data.slice(0, 4));
                        const isImage = (bytes[0] === 0xFF && bytes[1] === 0xD8) || // JPEG
                                      (bytes[0] === 0x89 && bytes[1] === 0x50) || // PNG
                                      (bytes[0] === 0x47 && bytes[1] === 0x49);   // GIF
                        
                        if (isImage) {
                            return {
                                success: true,
                                imageBuffer: Buffer.from(response.data),
                                serviceName: 'Hugging Face'
                            };
                        }
                    }
                } catch (modelError) {
                    console.log(`HF model ${model} failed: ${modelError.message}`);
                    continue;
                }
            }

            throw new Error('All HF models failed');
            
        } catch (error) {
            throw new Error(`Hugging Face failed: ${error.message}`);
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
                    '❌ Please provide a video description.\nUsage: .video <description>\n\nExamples:\n• .video a cat playing in the rain\n• .video sunset over mountains\n• .video abstract colorful particles\n\n🆓 This uses completely FREE AI services!');
                return;
            }

            try {
                const result = await this.generateVideo(prompt);
                if (!result || !result.success) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Video generation service is currently unavailable. Please try again later.');
                    return;
                }

                // Create temporary file path
                const tempFile = path.join(__dirname, '..', 'tmp', `generated_video_${Date.now()}.mp4`);
                
                // Ensure tmp directory exists
                await fs.ensureDir(path.dirname(tempFile));
                
                // Write video buffer to temp file
                await fs.writeFile(tempFile, result.videoBuffer);

                // Send the generated video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: { url: tempFile },
                    caption: `_🔧 Generated by: ${config.BOT_NAME}_`
                });

                // Clean up temp file
                await fs.unlink(tempFile).catch(() => {});

                console.log('✅ Video generated and sent');

            } catch (error) {
                console.error('Video generation error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error generating video. Please try again later.');
            }

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

            try {
                // Download the image first
                const { downloadMediaMessage } = require('baileys');
                const imageBuffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

                // Create temp file for the image
                const tempImageFile = path.join(__dirname, '..', 'tmp', `temp_image_${Date.now()}.jpg`);
                await fs.ensureDir(path.dirname(tempImageFile));
                await fs.writeFile(tempImageFile, imageBuffer);

                // Generate animated video from image
                const result = await this.animateImage(tempImageFile);
                
                if (!result || !result.success) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Image animation service is currently unavailable. Please try again later.');
                    return;
                }

                // Create temp file for output video
                const tempVideoFile = path.join(__dirname, '..', 'tmp', `animated_${Date.now()}.mp4`);
                await fs.writeFile(tempVideoFile, result.videoBuffer);

                // Send the animated video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: { url: tempVideoFile },
                    caption: `_🔧 Animated by: ${config.BOT_NAME}_`
                });

                // Clean up temp files
                await fs.unlink(tempImageFile).catch(() => {});
                await fs.unlink(tempVideoFile).catch(() => {});

                console.log('✅ Image animated and sent');

            } catch (error) {
                console.error('Animation error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error animating image. Please try again later.');
            }

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
                    '❌ Please specify a style and reply to an image.\nUsage: .style <style> (reply to image)\n\nExamples:\n• .style anime\n• .style oil painting\n• .style cartoon\n• .style watercolor\n\n🆓 This uses completely FREE AI services!');
                return;
            }

            // Check for quoted message
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage || !quotedMessage.imageMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image to apply style transfer.');
                return;
            }

            try {
                // Download the image first
                const { downloadMediaMessage } = require('baileys');
                const imageBuffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

                // Create temp file for the image
                const tempImageFile = path.join(__dirname, '..', 'tmp', `temp_image_${Date.now()}.jpg`);
                await fs.ensureDir(path.dirname(tempImageFile));
                await fs.writeFile(tempImageFile, imageBuffer);

                // Apply style transfer
                const result = await this.applyStyle(tempImageFile, style);
                
                if (!result || !result.success) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Style transfer service is currently unavailable. Please try again later.');
                    return;
                }

                // Create temp file for output
                const tempOutputFile = path.join(__dirname, '..', 'tmp', `styled_${Date.now()}.jpg`);
                await fs.writeFile(tempOutputFile, result.imageBuffer);

                // Send the styled image
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: tempOutputFile },
                    caption: `_🔧 Style: ${style} - Generated by: ${config.BOT_NAME}_`
                });

                // Clean up temp files
                await fs.unlink(tempImageFile).catch(() => {});
                await fs.unlink(tempOutputFile).catch(() => {});

                console.log('✅ Style applied and sent');

            } catch (error) {
                console.error('Style transfer error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error applying style transfer. Please try again later.');
            }

        } catch (error) {
            console.error('Error in style command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your style request.');
        }
    }

    /**
     * Handle music generation command
     */
    async musicCommand(messageInfo) {
        try {
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a music description.\nUsage: .music <description>\n\nExamples:\n• .music jazz piano solo\n• .music relaxing rain sounds\n• .music upbeat electronic\n\n🆓 This uses completely FREE AI services!');
                return;
            }

            try {
                const result = await this.generateMusic(prompt);
                if (!result || !result.success) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Music generation service is currently unavailable. Please try again later.');
                    return;
                }

                // Create temporary file path
                const tempFile = path.join(__dirname, '..', 'tmp', `generated_music_${Date.now()}.mp3`);
                
                // Ensure tmp directory exists
                await fs.ensureDir(path.dirname(tempFile));
                
                // Write audio buffer to temp file
                await fs.writeFile(tempFile, result.audioBuffer);

                // Send the generated music
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    audio: { url: tempFile },
                    mimetype: 'audio/mpeg',
                    fileName: `music_${Date.now()}.mp3`,
                    caption: `_🔧 Generated by: ${config.BOT_NAME}_`
                });

                // Clean up temp file
                await fs.unlink(tempFile).catch(() => {});

                console.log('✅ Music generated and sent');

            } catch (error) {
                console.error('Music generation error:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error generating music. Please try again later.');
            }

        } catch (error) {
            console.error('Error in music command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your music request.');
        }
    }

    /**
     * Generate video using Pollinations.ai
     */
    async generateVideo(prompt) {
        try {
            const encodedPrompt = encodeURIComponent(prompt);
            const videoUrl = `https://video.pollinations.ai/prompt/${encodedPrompt}`;
            
            const response = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 120000, // 2 minutes for video generation
                headers: {
                    'User-Agent': 'MATDEV-Bot/2.0'
                }
            });

            if (response.data && response.data.byteLength > 1000) {
                return {
                    success: true,
                    videoBuffer: Buffer.from(response.data)
                };
            }

            throw new Error('Invalid video data received');
            
        } catch (error) {
            throw new Error(`Video generation failed: ${error.message}`);
        }
    }

    /**
     * Animate image using Pollinations.ai
     */
    async animateImage(imagePath) {
        try {
            // For image-to-video, we'll use a combination approach
            // Upload image and request animation
            const imageBuffer = await fs.readFile(imagePath);
            const base64Image = imageBuffer.toString('base64');
            
            // Use text-to-video with image reference
            const prompt = encodeURIComponent('animate this image with subtle motion and effects');
            const videoUrl = `https://video.pollinations.ai/prompt/${prompt}?image=${base64Image}`;
            
            const response = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 120000,
                headers: {
                    'User-Agent': 'MATDEV-Bot/2.0'
                }
            });

            if (response.data && response.data.byteLength > 1000) {
                return {
                    success: true,
                    videoBuffer: Buffer.from(response.data)
                };
            }

            throw new Error('Invalid animation data received');
            
        } catch (error) {
            throw new Error(`Image animation failed: ${error.message}`);
        }
    }

    /**
     * Generate text using Pollinations.ai
     */
    async generateText(prompt) {
        try {
            const encodedPrompt = encodeURIComponent(prompt);
            const textUrl = `https://text.pollinations.ai/prompt/${encodedPrompt}`;
            
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
     * Apply style transfer using Pollinations.ai
     */
    async applyStyle(imagePath, style) {
        try {
            const imageBuffer = await fs.readFile(imagePath);
            const base64Image = imageBuffer.toString('base64');
            
            // Use image generation with style prompt and reference image
            const stylePrompt = encodeURIComponent(`transform this image to ${style} style`);
            const styleUrl = `https://image.pollinations.ai/prompt/${stylePrompt}?image=${base64Image}&style=${encodeURIComponent(style)}`;
            
            const response = await axios.get(styleUrl, {
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
     * Generate music using Pollinations.ai
     */
    async generateMusic(prompt) {
        try {
            // Use the correct Pollinations.ai music/audio API
            const encodedPrompt = encodeURIComponent(prompt);
            const musicUrl = `https://audio.pollinations.ai/${encodedPrompt}`;
            
            const response = await axios.get(musicUrl, {
                responseType: 'arraybuffer',
                timeout: 120000, // 2 minutes for audio generation
                headers: {
                    'User-Agent': 'MATDEV-Bot/2.0',
                    'Accept': 'audio/mpeg, audio/wav, audio/*'
                }
            });

            if (response.data && response.data.byteLength > 1000) {
                return {
                    success: true,
                    audioBuffer: Buffer.from(response.data)
                };
            }

            throw new Error('Invalid audio data received');
            
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
        const plugin = new ImagePlugin();
        await plugin.init(bot);
        return plugin;
    }
};