
/**
 * MATDEV Auto Bio Plugin
 * Automatically updates WhatsApp bio with customizable messages and intervals
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
        this.currentTemplate = null;
        this.bioTimer = null;
        
        // Pre-defined bio templates (fallback + AI-generated)
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

        // Generate AI templates if Gemini API is available
        await this.generateAIBioTemplates();

        // Start auto bio if enabled in config
        if (process.env.AUTO_BIO === 'true') {
            await this.enableAutoBio();
        }

        console.log('✅ Auto Bio plugin loaded');
        return this;
    }

    /**
     * Register all commands
     */
    registerCommands() {
        // Toggle auto bio
        this.bot.messageHandler.registerCommand('autobio', this.toggleAutoBioCommand.bind(this), {
            description: 'Toggle automatic bio updates on/off',
            usage: `${config.PREFIX}autobio [on/off]`,
            category: 'automation',
            plugin: 'autobio',
            source: 'autobio.js',
            ownerOnly: true
        });

        // Set custom bio template
        this.bot.messageHandler.registerCommand('setbio', this.setBioTemplateCommand.bind(this), {
            description: 'Set custom bio template (use {time} for timestamp)',
            usage: `${config.PREFIX}setbio <template>`,
            category: 'automation',
            plugin: 'autobio',
            source: 'autobio.js',
            ownerOnly: true
        });

        // Set bio update interval
        this.bot.messageHandler.registerCommand('bioint', this.setBioIntervalCommand.bind(this), {
            description: 'Set bio update interval in minutes',
            usage: `${config.PREFIX}bioint <minutes>`,
            category: 'automation',
            plugin: 'autobio',
            source: 'autobio.js',
            ownerOnly: true
        });

        // List bio templates
        this.bot.messageHandler.registerCommand('biotemplates', this.listTemplatesCommand.bind(this), {
            description: 'List available bio templates',
            usage: `${config.PREFIX}biotemplates`,
            category: 'automation',
            plugin: 'autobio',
            source: 'autobio.js',
            ownerOnly: true
        });

        // Manual bio update
        this.bot.messageHandler.registerCommand('updatebio', this.manualUpdateCommand.bind(this), {
            description: 'Manually update bio now',
            usage: `${config.PREFIX}updatebio [template]`,
            category: 'automation',
            plugin: 'autobio',
            source: 'autobio.js',
            ownerOnly: true
        });

        // Refresh AI templates
        this.bot.messageHandler.registerCommand('refreshbio', this.refreshTemplatesCommand.bind(this), {
            description: 'Generate new AI bio templates using Gemini',
            usage: `${config.PREFIX}refreshbio`,
            category: 'automation',
            plugin: 'autobio',
            source: 'autobio.js',
            ownerOnly: true
        });
    }

    /**
     * Toggle auto bio command
     */
    async toggleAutoBioCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                await this.enableAutoBio();
                await this.bot.messageHandler.reply(messageInfo, '✅ Auto bio updates *ENABLED*\n\n📝 Your bio will now update automatically!');
            } else if (action === 'off' || action === 'disable') {
                await this.disableAutoBio();
                await this.bot.messageHandler.reply(messageInfo, '❌ Auto bio updates *DISABLED*\n\n📝 Bio updates stopped.');
            } else {
                // Toggle current state
                if (this.isEnabled) {
                    await this.disableAutoBio();
                    await this.bot.messageHandler.reply(messageInfo, '❌ Auto bio updates *DISABLED*');
                } else {
                    await this.enableAutoBio();
                    await this.bot.messageHandler.reply(messageInfo, '✅ Auto bio updates *ENABLED*');
                }
            }
        } catch (error) {
            console.error('Error in toggleAutoBioCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling auto bio: ' + error.message);
        }
    }

    /**
     * Set bio template command
     */
    async setBioTemplateCommand(messageInfo) {
        try {
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a bio template.\n\n*Usage:* ${config.PREFIX}setbio <template>\n\n*Example:* ${config.PREFIX}setbio My custom bio - {time}\n\n*Note:* Use {time} for timestamp`);
                return;
            }

            const template = messageInfo.args.join(' ');
            this.currentTemplate = template;

            // Update bio immediately with new template
            await this.updateBio();

            await this.bot.messageHandler.reply(messageInfo, `✅ Bio template set successfully!\n\n📝 *Template:* ${template}\n\n🔄 Bio updated immediately.`);
        } catch (error) {
            console.error('Error in setBioTemplateCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting bio template: ' + error.message);
        }
    }

    /**
     * Set bio interval command
     */
    async setBioIntervalCommand(messageInfo) {
        try {
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide interval in minutes.\n\n*Usage:* ${config.PREFIX}bioint <minutes>\n\n*Example:* ${config.PREFIX}bioint 30 (for 30 minutes)`);
                return;
            }

            const minutes = parseInt(messageInfo.args[0]);
            if (isNaN(minutes) || minutes < 5) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide a valid number (minimum 5 minutes)');
                return;
            }

            this.updateInterval = minutes * 60 * 1000; // Convert to milliseconds

            // Restart timer with new interval
            if (this.isEnabled) {
                this.stopBioTimer();
                this.startBioTimer();
            }

            await this.bot.messageHandler.reply(messageInfo, `✅ Bio update interval set to *${minutes} minutes*\n\n⏰ ${this.isEnabled ? 'Timer restarted with new interval' : 'Enable auto bio to start timer'}`);
        } catch (error) {
            console.error('Error in setBioIntervalCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting bio interval: ' + error.message);
        }
    }

    /**
     * List templates command
     */
    async listTemplatesCommand(messageInfo) {
        try {
            let response = '*📝 AVAILABLE BIO TEMPLATES*\n\n';
            
            this.templates.forEach((template, index) => {
                response += `${index + 1}. ${template}\n`;
            });

            response += `\n*Current:* ${this.currentTemplate || 'Default random template'}\n`;
            response += `*Interval:* ${this.updateInterval / 60000} minutes\n`;
            response += `*Status:* ${this.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n`;
            response += `*Usage:* ${config.PREFIX}setbio <template>\n`;
            response += `*Note:* Use {time} for timestamp`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in listTemplatesCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing templates: ' + error.message);
        }
    }

    /**
     * Manual update command
     */
    async manualUpdateCommand(messageInfo) {
        try {
            let template = null;
            
            if (messageInfo.args.length) {
                template = messageInfo.args.join(' ');
            }

            await this.updateBio(template);
            await this.bot.messageHandler.reply(messageInfo, '✅ Bio updated successfully!\n\n🔄 Your WhatsApp bio has been refreshed.');
        } catch (error) {
            console.error('Error in manualUpdateCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error updating bio: ' + error.message);
        }
    }

    /**
     * Refresh templates command
     */
    async refreshTemplatesCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🤖 Generating new bio templates with AI...');
            
            const oldCount = this.templates.length;
            await this.generateAIBioTemplates();
            const newCount = this.templates.length;
            
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Bio templates refreshed!\n\n📊 *Templates:* ${oldCount} → ${newCount}\n🤖 *AI Status:* ${process.env.GEMINI_API_KEY ? 'Active' : 'Disabled'}\n\n💡 New templates will be used in next bio updates.`
            );
        } catch (error) {
            console.error('Error in refreshTemplatesCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error refreshing templates: ' + error.message);
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
     * Generate AI bio templates using Gemini
     */
    async generateAIBioTemplates() {
        try {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                console.log('⚠️ No Gemini API key found, using default templates');
                return;
            }

            console.log('🤖 Generating new bio templates with Gemini AI...');
            
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `Generate 10 short, mature, and motivational WhatsApp bio messages. Each should be:
- Maximum 25 words
- Motivational and inspiring
- Professional but approachable  
- No emojis at the end (I'll add them)
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
                    .map(line => line + ' ✨') // Add a simple emoji
                    .slice(0, 10); // Take only first 10

                if (newTemplates.length > 0) {
                    // Add new templates to existing ones, remove duplicates
                    const combinedTemplates = [...this.templates, ...newTemplates];
                    this.templates = [...new Set(combinedTemplates)]; // Remove duplicates
                    
                    console.log(`✅ Added ${newTemplates.length} AI-generated bio templates`);
                    console.log('📝 New templates:', newTemplates);
                } else {
                    console.log('⚠️ No valid templates generated, using defaults');
                }
            }
        } catch (error) {
            console.error('❌ Error generating AI bio templates:', error);
            console.log('📝 Falling back to default templates');
        }
    }

    /**
     * Update WhatsApp bio
     */
    async updateBio(customTemplate = null) {
        try {
            let template;
            
            if (customTemplate) {
                template = customTemplate;
            } else if (this.currentTemplate) {
                template = this.currentTemplate;
            } else {
                // Use random template
                template = this.templates[Math.floor(Math.random() * this.templates.length)];
            }

            // Use template as-is (no time replacement needed)
            const newBio = template;

            // Update bio using Baileys
            await this.bot.sock.updateProfileStatus(newBio);
            
            console.log(`📝 Bio updated: ${newBio}`);
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
            currentTemplate: this.currentTemplate,
            hasTimer: !!this.bioTimer
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
