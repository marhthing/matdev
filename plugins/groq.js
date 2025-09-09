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

        // Advanced AI with Compound system
        this.bot.messageHandler.registerCommand('compound', this.compoundCommand.bind(this), {
            description: 'Advanced AI with web search and code execution',
            usage: `${config.PREFIX}compound <your question>`,
            category: 'ai'
        });

        // Tool Use AI for function calling
        this.bot.messageHandler.registerCommand('tools', this.toolUseCommand.bind(this), {
            description: 'AI with function calling capabilities',
            usage: `${config.PREFIX}tools <your request>`,
            category: 'ai'
        });

        // Model selection command
        this.bot.messageHandler.registerCommand('models', this.listModelsCommand.bind(this), {
            description: 'List available Groq models',
            usage: `${config.PREFIX}models`,
            category: 'ai'
        });

        // Text to Speech with real TTS
        this.bot.messageHandler.registerCommand('tts', this.textToSpeechCommand.bind(this), {
            description: 'Convert text to speech using Groq TTS',
            usage: `${config.PREFIX}tts <text>`,
            category: 'ai'
        });

        // Speech to Text with enhanced Whisper
        this.bot.messageHandler.registerCommand('stt', this.speechToTextCommand.bind(this), {
            description: 'Convert audio to text using Groq Whisper',
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
                    model: 'llama-3.3-70b-versatile', // Latest Llama 3.3 model
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

            let text = messageInfo.args.join(' ').trim();
            
            // If no direct text provided, check if replying to a message
            if (!text) {
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                    messageInfo.message?.quotedMessage;

                if (quotedMessage) {
                    // Extract text from quoted message
                    if (quotedMessage.conversation) {
                        text = quotedMessage.conversation;
                    } else if (quotedMessage.extendedTextMessage?.text) {
                        text = quotedMessage.extendedTextMessage.text;
                    } else if (quotedMessage.imageMessage?.caption) {
                        text = quotedMessage.imageMessage.caption;
                    } else if (quotedMessage.videoMessage?.caption) {
                        text = quotedMessage.videoMessage.caption;
                    }
                }
            }

            if (!text) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide text to convert or reply to a message.\nUsage: .tts <text> OR reply to any text message with .tts');
                return;
            }

            if (text.length > 4000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long. Please keep it under 4000 characters.');
                return;
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🎤 Converting text to speech...');

            try {
                // Use Groq TTS API
                const ttsResponse = await groq.audio.speech.create({
                    model: 'playai-tts',
                    voice: 'alloy',
                    input: text
                });

                const audioBuffer = Buffer.from(await ttsResponse.arrayBuffer());
                const audioPath = path.join(this.tempDir, `tts_${Date.now()}.mp3`);
                await fs.writeFile(audioPath, audioBuffer);

                // Send audio file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    audio: { url: audioPath },
                    mimetype: 'audio/mpeg',
                    ptt: false
                });

                // Clean up temp file
                await fs.remove(audioPath);
                
                const response = `🎤 *Text converted to speech successfully!*`;

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

                // Transcribe using Groq (using faster turbo model)
                const transcription = await groq.audio.transcriptions.create({
                    file: fs.createReadStream(tempFile),
                    model: 'whisper-large-v3-turbo',
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
                    model: 'llama-3.3-70b-versatile', // Using multimodal capabilities
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
                    model: 'llama-3.3-70b-versatile', // Using multimodal capabilities
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
     * Compound AI Command - Advanced AI with web search and code execution
     */
    async compoundCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a question or request.\nUsage: .compound <your question>');
                return;
            }

            const thinkingMsg = await this.bot.messageHandler.reply(messageInfo, '🧠 Processing with advanced AI...');

            try {
                const completion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are MATDEV Compound AI, an advanced assistant with web search and code execution capabilities. Be comprehensive and helpful.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    model: 'groq/compound',
                    temperature: 0.7,
                    max_tokens: 2048
                });

                const response = completion.choices[0]?.message?.content;
                if (!response) {
                    throw new Error('Empty response from Compound AI');
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🧠 *MATDEV Compound AI:*\n\n${response}`,
                    edit: thinkingMsg.key
                });

            } catch (apiError) {
                console.error('Compound AI error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Error with Compound AI. Falling back to standard model...',
                    edit: thinkingMsg.key
                });
                
                // Fallback to standard model
                return this.groqChatCommand(messageInfo);
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in compound command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing compound AI request.');
            }
        }
    }

    /**
     * Tool Use Command - AI with function calling capabilities
     */
    async toolUseCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a request that requires function calling.\nUsage: .tools <your request>');
                return;
            }

            const thinkingMsg = await this.bot.messageHandler.reply(messageInfo, '🛠️ AI analyzing tools needed...');

            try {
                const completion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: 'system',
                            content: 'You are MATDEV Tool AI, specialized in function calling and tool usage. Break down complex tasks and explain what tools would be needed.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    model: 'llama-3.3-70b-versatile', // Using versatile model for tool analysis
                    temperature: 0.3,
                    max_tokens: 1024
                });

                const response = completion.choices[0]?.message?.content;
                if (!response) {
                    throw new Error('Empty response from Tool AI');
                }

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🛠️ *MATDEV Tool AI:*\n\n${response}`,
                    edit: thinkingMsg.key
                });

            } catch (apiError) {
                console.error('Tool AI error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Error with Tool AI. Falling back to standard model...',
                    edit: thinkingMsg.key
                });
                
                // Fallback to standard model
                return this.groqChatCommand(messageInfo);
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in tools command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error processing tool AI request.');
            }
        }
    }

    /**
     * List Available Models Command
     */
    async listModelsCommand(messageInfo) {
        try {
            const groq = this.getGroqClient();

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '📋 Fetching available models...');

            try {
                // Get available models from Groq API (using axios for consistency)
                const axios = require('axios');
                const response = await axios.get('https://api.groq.com/openai/v1/models', {
                    headers: {
                        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });

                const data = response.data;
                const models = data.data || [];

                let modelsList = '📋 *Available Groq Models:*\n\n';
                
                // Group models by type
                const chatModels = models.filter(m => m.id.includes('llama') || m.id.includes('gpt') || m.id.includes('qwen') || m.id.includes('kimi'));
                const systemModels = models.filter(m => m.id.includes('compound'));
                const audioModels = models.filter(m => m.id.includes('whisper') || m.id.includes('tts'));
                
                if (chatModels.length > 0) {
                    modelsList += '*🤖 Chat Models:*\n';
                    chatModels.slice(0, 8).forEach(model => {
                        modelsList += `• ${model.id}\n`;
                    });
                    modelsList += '\n';
                }

                if (systemModels.length > 0) {
                    modelsList += '*🧠 AI Systems:*\n';
                    systemModels.forEach(model => {
                        modelsList += `• ${model.id}\n`;
                    });
                    modelsList += '\n';
                }

                if (audioModels.length > 0) {
                    modelsList += '*🎵 Audio Models:*\n';
                    audioModels.forEach(model => {
                        modelsList += `• ${model.id}\n`;
                    });
                    modelsList += '\n';
                }

                modelsList += `*Total Models:* ${models.length}\n`;
                modelsList += '*Usage:* Use model names with .groq, .compound, .tools commands';

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: modelsList,
                    edit: processingMsg.key
                });

            } catch (apiError) {
                console.error('Models API error:', apiError);
                
                // Fallback to hardcoded list
                const fallbackList = `📋 *Available Groq Models:*\n\n*🤖 Chat Models:*\n• llama-3.3-70b-versatile (Latest)\n• llama-3.1-8b-instant (Fast)\n• openai/gpt-oss-120b (Flagship)\n• qwen/qwen3-32b\n\n*🧠 AI Systems:*\n• groq/compound (Web search + Code)\n• groq/compound-mini (Lightweight)\n\n*🎵 Audio Models:*\n• whisper-large-v3-turbo (STT)\n• playai-tts (TTS)\n\n*Usage:* Use with .groq, .compound, .tools commands`;

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: fallbackList,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            if (error.message.includes('No API found')) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${error.message}`);
            } else {
                console.error('Error in models command:', error);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error fetching models list.');
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