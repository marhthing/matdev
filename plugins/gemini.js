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

            // Get the prompt from the message
            const prompt = messageInfo.args.join(' ').trim();
            if (!prompt) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a question or prompt.\nUsage: .gemini <your question>');
                return;
            }

            // Send typing indicator
            await this.bot.messageHandler.reply(messageInfo, '🤖 Thinking...');

            try {
                // Initialize Gemini AI
                const genAI = new GoogleGenerativeAI(apiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

                // Generate response
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();

                if (!text || text.trim().length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Gemini returned an empty response.');
                    return;
                }

                // Send the AI response
                await this.bot.messageHandler.reply(messageInfo, `🤖 *Gemini AI Response:*\n\n${text}`);
                console.log('✅ Gemini response sent');

            } catch (apiError) {
                console.error('Gemini API error:', apiError);
                
                if (apiError.message.includes('API_KEY_INVALID')) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Invalid API key. Please check your GEMINI_API_KEY.');
                } else if (apiError.message.includes('QUOTA_EXCEEDED')) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ API quota exceeded. Please try again later.');
                } else {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Error communicating with Gemini AI. Please try again.');
                }
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