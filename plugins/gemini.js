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

            // Get the prompt from the message args
            let prompt = messageInfo.args.join(' ').trim();
            
            // If no prompt provided, check if this is a reply to a message
            if (!prompt) {
                // Check for quoted message in context
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                
                if (quotedMessage) {
                    // Extract text from the quoted message
                    const messageTypes = Object.keys(quotedMessage);
                    let quotedText = '';
                    
                    for (const type of messageTypes) {
                        const content = quotedMessage[type];
                        if (typeof content === 'string') {
                            quotedText = content;
                            break;
                        } else if (content?.text) {
                            quotedText = content.text;
                            break;
                        } else if (content?.caption) {
                            quotedText = content.caption;
                            break;
                        } else if (type === 'conversation') {
                            quotedText = content;
                            break;
                        }
                    }
                    
                    if (quotedText) {
                        prompt = quotedText;
                    }
                }
            }
            
            // If still no prompt found, show usage message
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a question or prompt.\nUsage: \n• `.gemini <your question>`\n• Reply to a message with `.gemini`');
                return;
            }

            // Send typing indicator
            const thinkingMsg = await this.bot.messageHandler.reply(messageInfo, '🤖 Thinking...');

            try {
                // Initialize Gemini AI
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

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