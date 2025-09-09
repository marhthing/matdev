/**
 * MATDEV Groq AI Plugin
 * Advanced AI capabilities including TTS, STT, Vision, and Chat
 */

const Groq = require('groq-sdk');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');
const { downloadMediaMessage } = require('baileys');

class GroqPlugin {
    constructor() {
        this.name = 'groq';
        this.description = 'Groq AI integration for TTS, STT, Vision, and Chat';
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

            this.registerCommands();
            console.log('✅ Groq AI plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Groq plugin:', error);
            return false;
        }
    }

    /**
     * Register all Groq commands
     */
    registerCommands() {
        // Chat command
        this.bot.messageHandler.registerCommand('groq', this.groqChatCommand.bind(this), {
            description: 'Chat with Groq AI',
            usage: `${config.PREFIX}groq <your message>`,
            category: 'ai'
        });

        // Text to Speech
        this.bot.messageHandler.registerCommand('tts', this.textToSpeechCommand.bind(this), {
            description: 'Convert text to speech using Groq',
            usage: `${config.PREFIX}tts <text>`,
            category: 'ai'
        });

        // Speech to Text
        this.bot.messageHandler.registerCommand('stt', this.speechToTextCommand.bind(this), {
            description: 'Convert audio to text using Groq',
            usage: `${config.PREFIX}stt (reply to audio)`,
            category: 'ai'
        });

        // Vision/Image Analysis
        this.bot.messageHandler.registerCommand('vision', this.visionCommand.bind(this), {
            description: 'Analyze images using Groq Vision',
            usage: `${config.PREFIX}vision <question> (reply to image)`,
            category: 'ai'
        });

        // Image Description
        this.bot.messageHandler.registerCommand('describe', this.describeImageCommand.bind(this), {
            description: 'Describe an image using Groq Vision',
            usage: `${config.PREFIX}describe (reply to image)`,
            category: 'ai'
        });
    }

    /**
     * Initialize Groq client
     */
    getGroqClient() {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
            throw new Error('No API found, use .setenv GROQ_API_KEY=<key>');
        }
        return new Groq({ apiKey });
    }

    /**
     * Groq Chat Command
     */
    async groqChatCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a message.\nUsage: .groq <your message>');
                return;
            }

            const thinkingMsg = await this.bot.messageHandler.reply(messageInfo, '🤖 Thinking...');

            try {
                const completion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are MATDEV AI, a helpful WhatsApp bot assistant. Be concise and helpful.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    model: 'llama3-70b-8192', // Available Groq model
                    temperature: 0.7,
                    max_tokens: 1024
                });

                const response = completion.choices[0]?.message?.content;
                if (!response) {
                    throw new Error('Empty response from Groq');
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🤖 *MATDEV AI Response:*\n\n${response}`,
                    edit: thinkingMsg.key
                });

            } catch (apiError) {
                console.error('Groq API error:', apiError);
                let errorMessage = '❌ Error communicating with Groq AI. Please try again.';

                if (apiError.message.includes('API_KEY_INVALID')) {
                    errorMessage = '❌ Invalid API key. Please check your GROQ_API_KEY.';
                } else if (apiError.message.includes('quota')) {
                    errorMessage = '❌ API quota exceeded. Please try again later.';
                } else if (apiError.message.includes('model is not available')) {
                    errorMessage = '❌ The requested model is not available. Please check the model name or try again later.';
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: errorMessage,
                    edit: thinkingMsg.key
                });
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in groq chat command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
            }
        }
    }

    /**
     * Text to Speech Command
     */
    async textToSpeechCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const text = messageInfo.args.join(' ').trim();
            if (!text) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide text to convert.\nUsage: .tts <text>');
                return;
            }

            if (text.length > 4000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long. Please keep it under 4000 characters.');
                return;
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🎤 Converting text to speech...');

            try {
                // Use external TTS API (you can integrate with services like ElevenLabs, OpenAI TTS, etc.)
                // For now, we'll provide the text formatted for TTS usage
                const response = `🎤 *Text for Speech:*\n\n"${text}"\n\n⚠️ _Note: For actual audio generation, integrate with a TTS service like ElevenLabs or OpenAI TTS API._`;
                
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: response,
                    edit: processingMsg.key
                });

            } catch (error) {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Error processing text-to-speech request.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in TTS command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing TTS request.');
            }
        }
    }

    /**
     * Speech to Text Command
     */
    async speechToTextCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio message.');
                return;
            }

            if (!quotedMessage.audioMessage && !quotedMessage.pttMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio message.');
                return;
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🎧 Transcribing audio...');

            try {
                // Download audio
                const audioBuffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

                if (!audioBuffer || audioBuffer.length === 0) {
                    throw new Error('Failed to download audio');
                }

                // Save to temp file
                const tempFile = path.join(this.tempDir, `audio_${Date.now()}.ogg`);
                await fs.writeFile(tempFile, audioBuffer);

                // Transcribe using Groq
                const transcription = await groq.audio.transcriptions.create({
                    file: fs.createReadStream(tempFile),
                    model: 'whisper-large-v3',
                    language: 'en'
                });

                // Clean up temp file
                await fs.remove(tempFile);

                const transcribedText = transcription.text;
                if (!transcribedText || transcribedText.trim().length === 0) {
                    throw new Error('No speech detected in audio');
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🎧 *Audio Transcription:*\n\n${transcribedText}`,
                    edit: processingMsg.key
                });

            } catch (error) {
                console.error('STT processing error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Error transcribing audio. Please ensure the audio is clear and in a supported format.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in STT command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing speech-to-text request.');
            }
        }
    }

    /**
     * Vision Command - Ask questions about images
     */
    async visionCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const question = messageInfo.args.join(' ').trim();
            if (!question) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a question about the image.\nUsage: .vision <question> (reply to image)');
                return;
            }

            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.imageMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image.');
                return;
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '👁️ Analyzing image...');

            try {
                // Download image
                const imageBuffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

                if (!imageBuffer || imageBuffer.length === 0) {
                    throw new Error('Failed to download image');
                }

                // Convert to base64
                const base64Image = imageBuffer.toString('base64');
                const mimeType = quotedMessage.imageMessage.mimetype || 'image/jpeg';

                // Analyze with Groq Vision
                const completion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: question
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${mimeType};base64,${base64Image}`
                                    }
                                }
                            ]
                        }
                    ],
                    model: 'llama-3.2-11b-vision-preview', // Available Groq vision model
                    max_tokens: 1024
                });

                const response = completion.choices[0]?.message?.content;
                if (!response) {
                    throw new Error('Empty response from vision model');
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `👁️ *Vision Analysis:*\n\n**Question:** ${question}\n\n**Answer:** ${response}`,
                    edit: processingMsg.key
                });

            } catch (error) {
                console.error('Vision processing error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Error analyzing image. Please ensure the image is clear and in a supported format.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in vision command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing vision request.');
            }
        }
    }

    /**
     * Describe Image Command - Simple image description
     */
    async describeImageCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.imageMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image.');
                return;
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🖼️ Describing image...');

            try {
                // Download image
                const imageBuffer = await downloadMediaMessage(quotedMessage, 'buffer', {});

                if (!imageBuffer || imageBuffer.length === 0) {
                    throw new Error('Failed to download image');
                }

                // Convert to base64
                const base64Image = imageBuffer.toString('base64');
                const mimeType = quotedMessage.imageMessage.mimetype || 'image/jpeg';

                // Describe with Groq Vision
                const completion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: 'Describe this image in detail. What do you see?'
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${mimeType};base64,${base64Image}`
                                    }
                                }
                            ]
                        }
                    ],
                    model: 'llama-3.2-11b-vision-preview', // Available Groq vision model
                    max_tokens: 1024
                });

                const description = completion.choices[0]?.message?.content;
                if (!description) {
                    throw new Error('Empty response from vision model');
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🖼️ *Image Description:*\n\n${description}`,
                    edit: processingMsg.key
                });

            } catch (error) {
                console.error('Image description error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Error describing image. Please ensure the image is clear and in a supported format.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in describe command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing image description request.');
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
                console.log(`🧹 Cleaned ${cleaned} temporary Groq files`);
            }
        } catch (error) {
            console.error('Error cleaning Groq temporary files:', error);
        }

        console.log('🧹 Groq plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new GroqPlugin();
        await plugin.init(bot);
        return plugin;
    }
};