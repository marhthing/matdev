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

            let prompt = messageInfo.args.join(' ').trim();
            let contextText = '';
            
            // Check if replying to a message
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (quotedMessage) {
                // Extract text from quoted message
                if (quotedMessage.conversation) {
                    contextText = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    contextText = quotedMessage.extendedTextMessage.text;
                } else if (quotedMessage.imageMessage?.caption) {
                    contextText = quotedMessage.imageMessage.caption;
                } else if (quotedMessage.videoMessage?.caption) {
                    contextText = quotedMessage.videoMessage.caption;
                }
                
                // If replying to a message but no additional prompt, use a default
                if (!prompt && contextText) {
                    prompt = 'Please analyze or respond to this message:';
                }
            }

            if (!prompt && !contextText) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a message or reply to any message.\nUsage: .groq <your message> OR reply to any message with .groq');
                return;
            }
            
            // Combine context and prompt
            const fullPrompt = contextText ? `${prompt}\n\nMessage to analyze: "${contextText}"` : prompt;

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
                            content: fullPrompt
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

            if (text.length > 10000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long. Please keep it under 10,000 characters.');
                return;
            }

            try {
                // Use Groq TTS API with latest format from documentation
                const response = await groq.audio.speech.create({
                    model: "playai-tts",
                    voice: "Fritz-PlayAI",
                    input: text,
                    response_format: "mp3"
                });

                // Get the audio buffer properly
                const buffer = Buffer.from(await response.arrayBuffer());
                const audioPath = path.join(this.tempDir, `tts_${Date.now()}.mp3`);
                
                // Write the buffer to file
                await fs.writeFile(audioPath, buffer);

                // Verify file was created successfully
                const fileExists = await fs.pathExists(audioPath);
                if (!fileExists) {
                    throw new Error('Failed to create audio file');
                }

                // Send as voice note with proper audio options
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    audio: fs.readFileSync(audioPath),
                    mimetype: 'audio/mp4',
                    ptt: true
                });

                // Delete temp file immediately after sending
                await fs.remove(audioPath);

            } catch (error) {
                console.error('TTS processing error:', error);
                
                // Only show error messages when something actually fails
                if (error.message && error.message.includes('model_terms_required')) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ TTS model requires terms acceptance. Admin must accept terms at https://console.groq.com/playground?model=playai-tts');
                } else if (error.message && error.message.includes('quota')) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ TTS API quota exceeded. Please try again later.');
                } else if (error.message && error.message.includes('API_KEY_INVALID')) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Invalid GROQ_API_KEY.');
                } else {
                    await this.bot.messageHandler.reply(messageInfo, '❌ TTS service temporarily unavailable.');
                }
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

            try {
                // Create a proper message object for download
                const messageToDownload = {
                    key: messageInfo.message.extendedTextMessage?.contextInfo?.quotedMessage?.key || {},
                    message: quotedMessage
                };

                // Download audio using the proper message structure
                const audioBuffer = await downloadMediaMessage(
                    messageToDownload, 
                    'buffer', 
                    {}
                );

                if (!audioBuffer || audioBuffer.length === 0) {
                    throw new Error('Failed to download audio');
                }

                // Save to temp file with proper extension for Groq API
                const tempFile = path.join(this.tempDir, `audio_${Date.now()}.wav`);
                await fs.writeFile(tempFile, audioBuffer);

                // Transcribe using Groq with latest API format
                const transcription = await groq.audio.transcriptions.create({
                    file: fs.createReadStream(tempFile),
                    model: 'whisper-large-v3-turbo',
                    response_format: 'text',
                    temperature: 0.0
                });

                // Clean up temp file
                await fs.remove(tempFile);

                const transcribedText = transcription;
                if (!transcribedText || transcribedText.trim().length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ No speech detected in audio.');
                    return;
                }

                await this.bot.messageHandler.reply(messageInfo, `🎧 *Audio Transcription:*\n\n${transcribedText}`);

            } catch (error) {
                console.error('STT processing error:', error);
                
                let errorMessage = '❌ Error transcribing audio.';
                
                if (error.message && error.message.includes('No message present')) {
                    errorMessage = '❌ Unable to download audio. Please try replying to the audio message again.';
                } else if (error.message && error.message.includes('quota')) {
                    errorMessage = '❌ STT API quota exceeded. Please try again later.';
                } else if (error.message && error.message.includes('API_KEY_INVALID')) {
                    errorMessage = '❌ Invalid GROQ_API_KEY.';
                } else if (error.message && error.message.includes('No speech detected')) {
                    errorMessage = '❌ No speech detected in the audio file.';
                }
                
                await this.bot.messageHandler.reply(messageInfo, errorMessage);
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

            let question = messageInfo.args.join(' ').trim();
            let contextText = '';
            
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            // Handle both image analysis and text analysis
            if (quotedMessage) {
                if (quotedMessage.imageMessage) {
                    // Image analysis mode
                    if (!question) {
                        question = 'What do you see in this image? Please describe it in detail.';
                    }
                } else {
                    // Text analysis mode
                    if (quotedMessage.conversation) {
                        contextText = quotedMessage.conversation;
                    } else if (quotedMessage.extendedTextMessage?.text) {
                        contextText = quotedMessage.extendedTextMessage.text;
                    } else if (quotedMessage.imageMessage?.caption) {
                        contextText = quotedMessage.imageMessage.caption;
                    } else if (quotedMessage.videoMessage?.caption) {
                        contextText = quotedMessage.videoMessage.caption;
                    }
                    
                    if (!question && contextText) {
                        question = 'Please analyze this text and provide insights:';
                    }
                }
            }

            if (!question && !contextText && (!quotedMessage || !quotedMessage.imageMessage)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a question or reply to an image/message.\nUsage: .vision <question> (reply to image/text)');
                return;
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '👁️ Analyzing image...');

            try {
                if (quotedMessage && quotedMessage.imageMessage) {
                    // Image analysis mode
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
                        model: 'llama-3.3-70b-versatile',
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
                } else if (contextText) {
                    // Text analysis mode
                    const fullPrompt = `${question}\n\nText to analyze: "${contextText}"`;
                    
                    const completion = await groq.chat.completions.create({
                        messages: [
                            {
                                role: 'system',
                                content: 'You are MATDEV Vision AI, specialized in detailed analysis and insights. Provide comprehensive analysis of the given content.'
                            },
                            {
                                role: 'user',
                                content: fullPrompt
                            }
                        ],
                        model: 'llama-3.3-70b-versatile',
                        temperature: 0.7,
                        max_tokens: 1024
                    });

                    const response = completion.choices[0]?.message?.content;
                    if (!response) {
                        throw new Error('Empty response from vision model');
                    }

                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: `👁️ *Vision Text Analysis:*\n\n**Question:** ${question}\n\n**Analysis:** ${response}`,
                        edit: processingMsg.key
                    });
                } else {
                    throw new Error('No image or text content found');
                }

            } catch (error) {
                console.error('Vision processing error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Error analyzing content. Please ensure the image is clear or text is readable.',
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

            let prompt = messageInfo.args.join(' ').trim();
            let contextText = '';
            
            // Check if replying to a message
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (quotedMessage) {
                // Extract text from quoted message
                if (quotedMessage.conversation) {
                    contextText = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    contextText = quotedMessage.extendedTextMessage.text;
                } else if (quotedMessage.imageMessage?.caption) {
                    contextText = quotedMessage.imageMessage.caption;
                } else if (quotedMessage.videoMessage?.caption) {
                    contextText = quotedMessage.videoMessage.caption;
                }
                
                // If replying to a message but no additional prompt, use a default
                if (!prompt && contextText) {
                    prompt = 'Please provide a comprehensive analysis with web search for this:';
                }
            }

            if (!prompt && !contextText) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a question or reply to any message.\nUsage: .compound <your question> OR reply to any message with .compound');
                return;
            }
            
            // Combine context and prompt
            const fullPrompt = contextText ? `${prompt}\n\nContent to analyze: "${contextText}"` : prompt;

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
                            content: fullPrompt
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

            let prompt = messageInfo.args.join(' ').trim();
            let contextText = '';
            
            // Check if replying to a message
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (quotedMessage) {
                // Extract text from quoted message
                if (quotedMessage.conversation) {
                    contextText = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    contextText = quotedMessage.extendedTextMessage.text;
                } else if (quotedMessage.imageMessage?.caption) {
                    contextText = quotedMessage.imageMessage.caption;
                } else if (quotedMessage.videoMessage?.caption) {
                    contextText = quotedMessage.videoMessage.caption;
                }
                
                // If replying to a message but no additional prompt, use a default
                if (!prompt && contextText) {
                    prompt = 'Analyze what tools or steps would be needed for this task:';
                }
            }

            if (!prompt && !contextText) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a request or reply to any message.\nUsage: .tools <your request> OR reply to any message with .tools');
                return;
            }
            
            // Combine context and prompt
            const fullPrompt = contextText ? `${prompt}\n\nTask to analyze: "${contextText}"` : prompt;

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
                            content: fullPrompt
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