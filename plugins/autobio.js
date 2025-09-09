
/**
 * MATDEV Auto Bio Plugin
 * Automatically updates WhatsApp bio with AI-generated messages
 */

const config = require('../config');
const Utils = require('../lib/utils');
const moment = require('moment-timezone');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs-extra');
const path = require('path');

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

        // Bio templates storage
        this.templates = [];
        this.bioTemplatesFile = path.join(__dirname, '../session/storage/bio_templates.json');
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Load existing bio templates from JSON file
        await this.loadBioTemplates();

        // Generate AI templates if Gemini API is available and we have few templates
        if (this.templates.length < 10) {
            await this.generateAIBioTemplates();
        }

        // Start auto bio if enabled in config
        if (process.env.AUTO_BIO === 'true') {
            await this.enableAutoBio();
        }

        console.log('✅ Auto Bio plugin loaded');
        return this;
    }

    /**
     * Load bio templates from JSON file
     */
    async loadBioTemplates() {
        try {
            if (await fs.pathExists(this.bioTemplatesFile)) {
                const data = await fs.readJson(this.bioTemplatesFile);
                this.templates = data.templates || [];
                console.log(`📁 Loaded ${this.templates.length} bio templates from storage`);
            } else {
                // Create initial templates if file doesn't exist
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
                await this.saveBioTemplates();
                console.log(`📝 Created initial bio templates file with ${this.templates.length} templates`);
            }
        } catch (error) {
            console.error('❌ Error loading bio templates:', error);
            // Fallback to basic templates
            this.templates = [
                'Living my best life ✨',
                'Building the future 💻',
                'Never give up 💪',
                'Coding is life 👨‍💻'
            ];
        }
    }

    /**
     * Save bio templates to JSON file
     */
    async saveBioTemplates() {
        try {
            const data = {
                templates: this.templates,
                lastUpdated: Date.now(),
                totalGenerated: this.templates.length
            };
            await fs.writeJson(this.bioTemplatesFile, data, { spaces: 2 });
            console.log(`💾 Saved ${this.templates.length} bio templates to storage`);
        } catch (error) {
            console.error('❌ Error saving bio templates:', error);
        }
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
                    '📝 Bio templates: ' + this.templates.length + ' available\n' +
                    '💾 Templates stored in: bio_templates.json\n\n' +
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
                const statusText = status.enabled ? '✅ Enabled' : '❌ Disabled';
                
                let response = `🤖 AUTO BIO STATUS ${statusText}\n\n`;
                response += `📊 *Current Stats:*\n`;
                response += `• Bio templates: ${this.templates.length}\n`;
                response += `• AI available: ${status.aiAvailable ? '✅' : '❌'}\n`;
                response += `• Update interval: ${status.interval} minutes\n\n`;
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

        // Save setting to .env file
        if (this.bot.plugins && this.bot.plugins.system) {
            await this.bot.plugins.system.setEnvValue('AUTO_BIO', 'true');
        }

        // Update bio immediately
        await this.updateBio();
    }

    /**
     * Disable auto bio updates
     */
    async disableAutoBio() {
        this.isEnabled = false;
        this.stopBioTimer();

        // Save setting to .env file
        if (this.bot.plugins && this.bot.plugins.system) {
            await this.bot.plugins.system.setEnvValue('AUTO_BIO', 'false');
        }
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
     * Generate fresh AI bio from Gemini and add to templates
     */
    async generateFreshBio() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.log('⚠️ No Gemini API key found, using stored templates');
                return this.getRandomTemplate();
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
                    await this.saveBioTemplates(); // Save to JSON file
                    console.log(`📝 Added new bio to templates (${this.templates.length} total)`);
                }

                return freshBio;
            } else {
                console.log('⚠️ Invalid AI response, using stored template');
                return this.getRandomTemplate();
            }
        } catch (error) {
            console.error('❌ Error generating fresh bio:', error);
            return this.getRandomTemplate();
        }
    }

    /**
     * Get random template from stored templates
     */
    getRandomTemplate() {
        if (this.templates.length === 0) {
            return 'Living my best life ✨'; // Emergency fallback
        }
        const randomTemplate = this.templates[Math.floor(Math.random() * this.templates.length)];
        console.log(`📝 Using stored template: ${randomTemplate}`);
        return randomTemplate;
    }

    /**
     * Generate initial AI bio templates (for bulk generation)
     */
    async generateAIBioTemplates() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.log('⚠️ No Gemini API key found, using stored templates only');
                return;
            }

            console.log('🤖 Generating additional bio templates with Gemini AI...');

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `Generate 10 short, mature, and motivational WhatsApp bio messages. Each should be:
- Maximum 20 words
- Motivational and inspiring
- Professional but approachable  
- No emojis included (I'll add them)
- Suitable for a tech-savvy person
- Different themes (success, growth, positivity, innovation, etc.)
- Unique and not generic

Return only the bio messages, one per line, no numbering or extra text.`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            if (text && text.trim().length > 0) {
                const newTemplates = text.trim().split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0 && line.length <= 100)
                    .map(line => line + ' ✨') // Add emoji
                    .slice(0, 10); // Take only first 10

                if (newTemplates.length > 0) {
                    // Add new templates to existing ones, remove duplicates
                    const combinedTemplates = [...this.templates, ...newTemplates];
                    this.templates = [...new Set(combinedTemplates)]; // Remove duplicates

                    await this.saveBioTemplates(); // Save to JSON file
                    console.log(`✅ Added ${newTemplates.length} AI bio templates (${this.templates.length} total)`);
                }
            }
        } catch (error) {
            console.error('❌ Error generating AI bio templates:', error);
            console.log('📝 Using stored templates only');
        }
    }

    /**
     * Update WhatsApp bio
     */
    async updateBio() {
        try {
            // Use fresh AI bio generation (which includes fallback to stored templates)
            const bioToUse = await this.generateFreshBio();

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
