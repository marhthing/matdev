
/**
 * MATDEV Auto Status React Plugin
 * Automatically reacts to WhatsApp status updates from friends
 */

const config = require('../config');

class AutoStatusReactPlugin {
    constructor() {
        this.name = 'autostatusreact';
        this.description = 'Auto react to WhatsApp status updates';
        this.version = '1.0.0';
        
        // Status reaction settings
        this.isEnabled = false;
        this.reactionChance = 60; // 60% chance by default for status
        this.reactionDelay = { min: 30000, max: 300000 }; // 30s to 5min delay
        
        // Reactions for different types of status
        this.statusReactions = {
            // Photo/Image status
            photo: ['😍', '🔥', '❤️', '😊', '👍', '✨', '🤩', '💯'],
            
            // Video status
            video: ['🎬', '🔥', '👏', '😍', '💯', '⚡', '🎉', '👌'],
            
            // Text status
            text: ['👍', '❤️', '😊', '🔥', '💯', '⚡', '✨', '👏'],
            
            // General reactions (fallback)
            general: ['❤️', '👍', '😊', '🔥', '✨', '💯', '👏', '⚡']
        };
        
        // Keep track of reacted statuses to avoid duplicates
        this.reactedStatuses = new Set();
        
        // Cleanup interval for reacted statuses (24 hours)
        this.cleanupInterval = null;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupStatusListener();
        this.startCleanupTimer();

        // Auto-enable if set in environment
        if (process.env.AUTO_STATUS_REACT === 'true') {
            this.isEnabled = true;
            console.log('🔥 Auto status react enabled from environment');
        }

        console.log('✅ Auto Status React plugin loaded');
        return this;
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Toggle auto status react
        this.bot.messageHandler.registerCommand('autostatusreact', this.toggleAutoStatusReactCommand.bind(this), {
            description: 'Toggle automatic status reactions on/off',
            usage: `${config.PREFIX}autostatusreact [on/off]`,
            category: 'automation',
            plugin: 'autostatusreact',
            source: 'autostatusreact.js',
            ownerOnly: true
        });

        // Set status reaction chance
        this.bot.messageHandler.registerCommand('statusreactchance', this.setStatusReactionChanceCommand.bind(this), {
            description: 'Set status reaction chance percentage (1-100)',
            usage: `${config.PREFIX}statusreactchance <percentage>`,
            category: 'automation',
            plugin: 'autostatusreact',
            source: 'autostatusreact.js',
            ownerOnly: true
        });

        // Set reaction delay
        this.bot.messageHandler.registerCommand('statusdelay', this.setReactionDelayCommand.bind(this), {
            description: 'Set reaction delay range in seconds (min max)',
            usage: `${config.PREFIX}statusdelay <min> <max>`,
            category: 'automation',
            plugin: 'autostatusreact',
            source: 'autostatusreact.js',
            ownerOnly: true
        });

        // Add custom status reaction
        this.bot.messageHandler.registerCommand('addstatusreaction', this.addStatusReactionCommand.bind(this), {
            description: 'Add custom status reaction for type (photo/video/text)',
            usage: `${config.PREFIX}addstatusreaction <type> <emoji>`,
            category: 'automation',
            plugin: 'autostatusreact',
            source: 'autostatusreact.js',
            ownerOnly: true
        });

        // List status reactions
        this.bot.messageHandler.registerCommand('statusreactions', this.listStatusReactionsCommand.bind(this), {
            description: 'List all status reactions',
            usage: `${config.PREFIX}statusreactions`,
            category: 'automation',
            plugin: 'autostatusreact',
            source: 'autostatusreact.js',
            ownerOnly: true
        });

        // Auto status react status
        this.bot.messageHandler.registerCommand('statusreactstatus', this.statusCommand.bind(this), {
            description: 'Show auto status react status and settings',
            usage: `${config.PREFIX}statusreactstatus`,
            category: 'automation',
            plugin: 'autostatusreact',
            source: 'autostatusreact.js',
            ownerOnly: true
        });

        // Clear reacted statuses cache
        this.bot.messageHandler.registerCommand('clearstatuscache', this.clearCacheCommand.bind(this), {
            description: 'Clear reacted statuses cache',
            usage: `${config.PREFIX}clearstatuscache`,
            category: 'automation',
            plugin: 'autostatusreact',
            source: 'autostatusreact.js',
            ownerOnly: true
        });
    }

    /**
     * Setup status message listener
     */
    setupStatusListener() {
        if (this.bot.sock) {
            this.bot.sock.ev.on('messages.upsert', async ({ messages }) => {
                for (const message of messages) {
                    // Check if it's a status message
                    if (message.key.remoteJid === 'status@broadcast') {
                        await this.processStatusForReaction(message);
                    }
                }
            });
        }
    }

    /**
     * Process status message for potential reaction
     */
    async processStatusForReaction(message) {
        try {
            // Skip if auto status react is disabled
            if (!this.isEnabled) return;
            
            // Skip our own status
            if (message.key.fromMe) return;
            
            // Create unique identifier for this status
            const statusId = `${message.key.participant || message.key.remoteJid}_${message.key.id}`;
            
            // Skip if we already reacted to this status
            if (this.reactedStatuses.has(statusId)) return;
            
            // Check reaction chance
            if (Math.random() * 100 > this.reactionChance) return;
            
            // Determine status type and get appropriate reaction
            const statusType = this.getStatusType(message);
            const reaction = this.getRandomReaction(statusType);
            
            if (!reaction) return;
            
            // Mark as processed to avoid duplicate reactions
            this.reactedStatuses.add(statusId);
            
            // Calculate random delay to seem natural
            const delay = this.reactionDelay.min + 
                         Math.random() * (this.reactionDelay.max - this.reactionDelay.min);
            
            // Schedule the reaction
            setTimeout(async () => {
                try {
                    await this.bot.sock.sendMessage(message.key.remoteJid, {
                        react: {
                            text: reaction,
                            key: message.key
                        }
                    });
                    
                    const contact = message.key.participant || 'Unknown';
                    console.log(`💝 Auto reacted to status from ${contact} with ${reaction} (${statusType})`);
                } catch (error) {
                    console.error('Error sending status reaction:', error);
                    // Remove from cache if reaction failed
                    this.reactedStatuses.delete(statusId);
                }
            }, delay);
            
        } catch (error) {
            console.error('Error in processStatusForReaction:', error);
        }
    }

    /**
     * Get status type based on message content
     */
    getStatusType(message) {
        const msg = message.message;
        if (!msg) return 'general';
        
        if (msg.imageMessage) return 'photo';
        if (msg.videoMessage) return 'video';
        if (msg.conversation || msg.extendedTextMessage) return 'text';
        
        return 'general';
    }

    /**
     * Get random reaction for status type
     */
    getRandomReaction(statusType) {
        const reactions = this.statusReactions[statusType] || this.statusReactions.general;
        return reactions[Math.floor(Math.random() * reactions.length)];
    }

    /**
     * Start cleanup timer for old reacted statuses
     */
    startCleanupTimer() {
        // Clean up every 6 hours
        this.cleanupInterval = setInterval(() => {
            console.log(`🧹 Cleaning up reacted status cache (${this.reactedStatuses.size} entries)`);
            this.reactedStatuses.clear();
        }, 6 * 60 * 60 * 1000);
    }

    /**
     * Toggle auto status react command
     */
    async toggleAutoStatusReactCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                this.isEnabled = true;
                await this.bot.messageHandler.reply(messageInfo, '✅ Auto status reactions *ENABLED*\n\n👁️ Bot will now react to friends\' status updates automatically!');
            } else if (action === 'off' || action === 'disable') {
                this.isEnabled = false;
                await this.bot.messageHandler.reply(messageInfo, '❌ Auto status reactions *DISABLED*\n\n👁️ Status reactions stopped.');
            } else {
                // Toggle current state
                this.isEnabled = !this.isEnabled;
                await this.bot.messageHandler.reply(messageInfo, 
                    this.isEnabled ? '✅ Auto status reactions *ENABLED*' : '❌ Auto status reactions *DISABLED*'
                );
            }
        } catch (error) {
            console.error('Error in toggleAutoStatusReactCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling auto status reactions: ' + error.message);
        }
    }

    /**
     * Set status reaction chance command
     */
    async setStatusReactionChanceCommand(messageInfo) {
        try {
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a percentage (1-100).\n\n*Usage:* ${config.PREFIX}statusreactchance <percentage>\n\n*Example:* ${config.PREFIX}statusreactchance 70`);
                return;
            }

            const chance = parseInt(messageInfo.args[0]);
            if (isNaN(chance) || chance < 1 || chance > 100) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide a valid percentage between 1 and 100');
                return;
            }

            this.reactionChance = chance;
            await this.bot.messageHandler.reply(messageInfo, `✅ Status reaction chance set to *${chance}%*\n\n👁️ Bot will react to approximately ${chance}% of status updates.`);
        } catch (error) {
            console.error('Error in setStatusReactionChanceCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting status reaction chance: ' + error.message);
        }
    }

    /**
     * Set reaction delay command
     */
    async setReactionDelayCommand(messageInfo) {
        try {
            if (messageInfo.args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide min and max delay in seconds.\n\n*Usage:* ${config.PREFIX}statusdelay <min> <max>\n\n*Example:* ${config.PREFIX}statusdelay 30 300 (30s to 5min)`);
                return;
            }

            const minSeconds = parseInt(messageInfo.args[0]);
            const maxSeconds = parseInt(messageInfo.args[1]);

            if (isNaN(minSeconds) || isNaN(maxSeconds) || minSeconds < 1 || maxSeconds < minSeconds) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide valid delay values (min must be less than max, both > 0)');
                return;
            }

            this.reactionDelay = {
                min: minSeconds * 1000,
                max: maxSeconds * 1000
            };

            await this.bot.messageHandler.reply(messageInfo, `✅ Status reaction delay set to *${minSeconds}s - ${maxSeconds}s*\n\n⏱️ Bot will wait random time between these values before reacting.`);
        } catch (error) {
            console.error('Error in setReactionDelayCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting reaction delay: ' + error.message);
        }
    }

    /**
     * Add status reaction command
     */
    async addStatusReactionCommand(messageInfo) {
        try {
            if (messageInfo.args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide type and emoji.\n\n*Usage:* ${config.PREFIX}addstatusreaction <type> <emoji>\n\n*Types:* photo, video, text, general\n*Example:* ${config.PREFIX}addstatusreaction photo 🔥`);
                return;
            }

            const type = messageInfo.args[0].toLowerCase();
            const emoji = messageInfo.args[1];

            if (!['photo', 'video', 'text', 'general'].includes(type)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid type. Use: photo, video, text, or general');
                return;
            }

            if (!this.statusReactions[type]) {
                this.statusReactions[type] = [];
            }

            this.statusReactions[type].push(emoji);

            await this.bot.messageHandler.reply(messageInfo, `✅ Added reaction *${emoji}* for *${type}* status updates\n\n👁️ Bot will now use this emoji for ${type} statuses.`);
        } catch (error) {
            console.error('Error in addStatusReactionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error adding status reaction: ' + error.message);
        }
    }

    /**
     * List status reactions command
     */
    async listStatusReactionsCommand(messageInfo) {
        try {
            let response = '*👁️ STATUS REACTIONS*\n\n';
            
            for (const [type, reactions] of Object.entries(this.statusReactions)) {
                response += `*${type.toUpperCase()}:* ${reactions.join(' ')}\n`;
            }

            response += `\n*📊 SETTINGS*\n`;
            response += `Status: ${this.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n`;
            response += `Chance: ${this.reactionChance}%\n`;
            response += `Delay: ${this.reactionDelay.min/1000}s - ${this.reactionDelay.max/1000}s\n`;
            response += `Cache: ${this.reactedStatuses.size} statuses\n\n`;
            response += `*Usage:* ${config.PREFIX}addstatusreaction <type> <emoji>`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in listStatusReactionsCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing status reactions: ' + error.message);
        }
    }

    /**
     * Status command
     */
    async statusCommand(messageInfo) {
        try {
            const response = `*👁️ AUTO STATUS REACT STATUS*\n\n` +
                `*Status:* ${this.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                `*Reaction Chance:* ${this.reactionChance}%\n` +
                `*Delay Range:* ${this.reactionDelay.min/1000}s - ${this.reactionDelay.max/1000}s\n` +
                `*Reacted Cache:* ${this.reactedStatuses.size} statuses\n` +
                `*Photo Reactions:* ${this.statusReactions.photo.length}\n` +
                `*Video Reactions:* ${this.statusReactions.video.length}\n` +
                `*Text Reactions:* ${this.statusReactions.text.length}\n` +
                `*General Reactions:* ${this.statusReactions.general.length}\n\n` +
                `*Commands:*\n` +
                `${config.PREFIX}autostatusreact [on/off]\n` +
                `${config.PREFIX}statusreactchance <percentage>\n` +
                `${config.PREFIX}statusreactions - View all reactions`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in statusCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting status: ' + error.message);
        }
    }

    /**
     * Clear cache command
     */
    async clearCacheCommand(messageInfo) {
        try {
            const oldSize = this.reactedStatuses.size;
            this.reactedStatuses.clear();
            
            await this.bot.messageHandler.reply(messageInfo, `✅ Cleared reacted status cache\n\n🧹 Removed ${oldSize} entries. Bot can now react to previously seen statuses again.`);
        } catch (error) {
            console.error('Error in clearCacheCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error clearing cache: ' + error.message);
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AutoStatusReactPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
