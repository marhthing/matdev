/**
 * MATDEV Auto Bio Plugin
 * Automatically updates WhatsApp bio with AI-generated messages
 */

const config = require('../config');
const Utils = require('../lib/utils');
const moment = require('moment-timezone');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const utils = new Utils();

class AutoBioPlugin {
    constructor() {
        this.name = 'autobio';
        this.description = 'Auto bio update functionality';
        this.version = '1.0.0';

        // Bio update settings
        this.isEnabled = false;
        this.updateInterval = 60 * 60 * 1000; // Default 1 hour
        this.bioTimer = null;

        // Bio templates (fallback + AI-generated)
        this.templates = [
            'Living my best life ✨',
            'Building the future 💻',
            'Never give up 💪',
            'Coding is life 👨‍💻',
            'Stay positive ⭐',
            'Dream big, work hard 🌟',
            'Success is a journey, not a destination 🎯',
            'Every day is a new opportunity 🌅'
        ];
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Generate initial AI templates if Gemini API is available
        await this.generateAIBioTemplates();

        // Start auto bio if enabled in config
        if (process.env.AUTO_BIO === 'true') {
            await this.enableAutoBio();
        }

        console.log('✅ Auto Bio plugin loaded');
        return this;
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Main autobio command - status/toggle
        this.bot.messageHandler.registerCommand('autobio', this.autoBioCommand.bind(this), {
            description: 'Auto bio status and control (on/off)',
            usage: `${config.PREFIX}autobio [on/off]`,
            category: 'automation',
            plugin: 'autobio',
            source: 'autobio.js',
            ownerOnly: true
        });
    }

    /**
     * Main autobio command handler
     */
    async autoBioCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();

            if (action === 'on' || action === 'enable') {
                await this.enableAutoBio();
                await this.bot.messageHandler.reply(messageInfo,
                    '✅ *AUTO BIO ENABLED*\n\n' +
                    '🤖 AI bio generation: ' + (process.env.GEMINI_API_KEY ? '✅ Active' : '❌ Disabled') + '\n' +
                    '⏰ Update interval: ' + (this.updateInterval / 60000) + ' minutes\n' +
                    '📝 Bio templates: ' + this.templates.length + ' available\n\n' +
                    '💡 Your bio will now update automatically!'
                );
            } else if (action === 'off' || action === 'disable') {
                await this.disableAutoBio();
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ *AUTO BIO DISABLED*\n\n📝 Bio updates stopped.'
                );
            } else {
                // Show current status
                const status = this.getStatus();
                let response = `*🤖 AUTO BIO STATUS*\n\n`;
                response += `📊 *Current Status:* ${status.enabled ? '✅ Enabled' : '❌ Disabled'}\n`;
                response += `🤖 *AI Generation:* ${status.aiAvailable ? '✅ Active' : '❌ No API Key'}\n`;
                response += `⏰ *Update Interval:* ${status.interval} minutes\n`;
                response += `📝 *Templates Available:* ${status.templatesCount}\n`;
                response += `🔄 *Timer Status:* ${status.hasTimer ? '✅ Running' : '❌ Stopped'}\n\n`;
                response += `*Usage:*\n• \`${config.PREFIX}autobio on\` - Enable auto bio\n• \`${config.PREFIX}autobio off\` - Disable auto bio`;

                await this.bot.messageHandler.reply(messageInfo, response);
            }
        } catch (error) {
            console.error('Error in autoBioCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error in auto bio: ' + error.message);
        }
    }

    /**
     * Enable auto bio updates
     */
    async enableAutoBio() {
        this.isEnabled = true;
        this.startBioTimer();

        // Update bio immediately
        await this.updateBio();
    }

    /**
     * Disable auto bio updates
     */
    async disableAutoBio() {
        this.isEnabled = false;
        this.stopBioTimer();
    }

    /**
     * Start bio update timer
     */
    startBioTimer() {
        this.stopBioTimer(); // Clear any existing timer

        this.bioTimer = setInterval(async () => {
            try {
                await this.updateBio();
            } catch (error) {
                console.error('Error in auto bio timer:', error);
            }
        }, this.updateInterval);

        console.log(`🔄 Auto bio timer started (${this.updateInterval / 60000} minutes)`);
    }

    /**
     * Stop bio update timer
     */
    stopBioTimer() {
        if (this.bioTimer) {
            clearInterval(this.bioTimer);
            this.bioTimer = null;
            console.log('⏹️ Auto bio timer stopped');
        }
    }

    /**
     * Generate fresh AI bio from Gemini
     */
    async generateFreshBio() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.log('⚠️ No Gemini API key found, using fallback templates');
                return null;
            }

            console.log('🤖 Generating fresh bio with Gemini AI...');

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `Generate 1 short, mature, and motivational WhatsApp bio message. It should be:
- Maximum 20 words
- Motivational and inspiring
- Professional but approachable  
- No emojis included (I'll add them)
- Suitable for a tech-savvy person
- Different from typical generic bios

Return only the bio message, no extra text or formatting.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim();

            if (text && text.length > 0 && text.length <= 100) {
                const freshBio = text + ' ✨'; // Add emoji
                console.log(`✅ Generated fresh AI bio: ${freshBio}`);

                // Add to templates list if not already present
                if (!this.templates.includes(freshBio)) {
                    this.templates.push(freshBio);
                    console.log(`📝 Added new bio to templates (${this.templates.length} total)`);
                }

                return freshBio;
            } else {
                console.log('⚠️ Invalid AI response, using fallback');
                return null;
            }
        } catch (error) {
            console.error('❌ Error generating fresh bio:', error);
            return null;
        }
    }

    /**
     * Generate initial AI bio templates (for fallback)
     */
    async generateAIBioTemplates() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.log('⚠️ No Gemini API key found, using default templates');
                return;
            }

            console.log('🤖 Generating initial bio templates with Gemini AI...');

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `Generate 5 short, mature, and motivational WhatsApp bio messages. Each should be:
- Maximum 20 words
- Motivational and inspiring
- Professional but approachable  
- No emojis included (I'll add them)
- Suitable for a tech-savvy person
- Different themes (success, growth, positivity, etc.)

Return only the bio messages, one per line, no numbering or extra text.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            if (text && text.trim().length > 0) {
                const newTemplates = text.trim().split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && line.length <= 100)
                    .map(line => line + ' ✨') // Add emoji
                    .slice(0, 5); // Take only first 5

                if (newTemplates.length > 0) {
                    // Add new templates to existing ones, remove duplicates
                    const combinedTemplates = [...this.templates, ...newTemplates];
                    this.templates = [...new Set(combinedTemplates)]; // Remove duplicates

                    console.log(`✅ Added ${newTemplates.length} initial AI bio templates`);
                }
            }
        } catch (error) {
            console.error('❌ Error generating initial AI bio templates:', error);
            console.log('📝 Using default templates only');
        }
    }

    /**
     * Update WhatsApp bio
     */
    async updateBio() {
        try {
            let bioToUse = null;

            // Try to get fresh AI bio first
            if (process.env.GEMINI_API_KEY) {
                bioToUse = await this.generateFreshBio();
            }

            // Fallback to random template if AI fails
            if (!bioToUse) {
                bioToUse = this.templates[Math.floor(Math.random() * this.templates.length)];
                console.log(`📝 Using fallback template: ${bioToUse}`);
            }

            // Update bio using Baileys
            await this.bot.sock.updateProfileStatus(bioToUse);

            console.log(`📝 Bio updated: ${bioToUse}`);
            return true;
        } catch (error) {
            console.error('Error updating bio:', error);
            throw error;
        }
    }

    /**
     * Get status info
     */
    getStatus() {
        return {
            enabled: this.isEnabled,
            interval: this.updateInterval / 60000, // in minutes
            hasTimer: !!this.bioTimer,
            templatesCount: this.templates.length,
            aiAvailable: !!process.env.GEMINI_API_KEY
        };
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AutoBioPlugin();
        await plugin.init(bot);
        return plugin;
    }
};