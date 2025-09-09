/**
 * MATDEV Auto Bio Plugin
 * Automatically updates WhatsApp bio with customizable messages and intervals
 */

const config = require('../config');
const Utils = require('../lib/utils');
const moment = require('moment-timezone');

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
        
        // Pre-defined bio templates
        this.templates = [
            'Last updated: {time} | MATDEV Bot Active 🚀',
            '{time} | Living my best life ✨',
            'Updated: {time} | Building the future 💻',
            '{time} | Never give up 💪',
            'MATDEV Bot | Last seen: {time} 🤖',
            '{time} | Coding is life 👨‍💻',
            'Active since: {time} | Stay positive ⭐',
            '{time} | Dream big, work hard 🌟'
        ];
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Start auto bio if enabled in config
        if (process.env.AUTO_BIO === 'true') {
            await this.enableAutoBio();
        }

        console.log('✅ Auto Bio plugin loaded');
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

            // Replace {time} placeholder with current time
            const currentTime = moment().tz(config.TIMEZONE).format('DD/MM/YY HH:mm');
            const newBio = template.replace(/{time}/g, currentTime);

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

module.exports = AutoBioPlugin;