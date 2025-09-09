
/**
 * MATDEV Auto React Plugin
 * Automatically reacts to chat messages with emojis based on keywords or random reactions
 */

const config = require('../config');

class AutoReactPlugin {
    constructor() {
        this.name = 'autoreact';
        this.description = 'Auto react to chat messages';
        this.version = '1.0.0';
        
        // Auto react settings
        this.isEnabled = false;
        this.reactionChance = 30; // 30% chance by default
        this.useKeywordReactions = true;
        this.useRandomReactions = true;
        
        // Keyword-based reactions
        this.keywordReactions = {
            // Greetings
            'hello': ['👋', '😊', '🙋‍♂️'],
            'hi': ['👋', '😊', '🙋‍♂️'],
            'good morning': ['🌅', '☀️', '😊'],
            'good night': ['🌙', '😴', '💤'],
            'good afternoon': ['☀️', '😊', '👋'],
            
            // Gratitude
            'thank you': ['🙏', '😊', '❤️'],
            'thanks': ['🙏', '😊', '❤️'],
            'appreciate': ['🙏', '💕', '😊'],
            
            // Emotions
            'love': ['❤️', '💕', '😍', '💖'],
            'happy': ['😊', '😄', '🎉', '✨'],
            'sad': ['😢', '💔', '🫂', '😔'],
            'angry': ['😠', '💢', '🤬'],
            'excited': ['🎉', '😆', '🤩', '⚡'],
            'tired': ['😴', '💤', '😮‍💨'],
            
            // Activities
            'work': ['💼', '👨‍💻', '📊', '⚡'],
            'study': ['📚', '🎓', '📖', '💡'],
            'food': ['🍽️', '😋', '🤤', '🍕'],
            'music': ['🎵', '🎶', '🎤', '🎸'],
            'game': ['🎮', '🕹️', '🎯', '⚡'],
            'movie': ['🎬', '🍿', '📺', '🎭'],
            
            // Achievements
            'success': ['🎉', '👏', '🔥', '⭐'],
            'win': ['🏆', '🎉', '👏', '⭐'],
            'lose': ['😔', '💔', '🫂'],
            'fail': ['😔', '💔', '🫂'],
            
            // Weather
            'sunny': ['☀️', '🌞', '😎'],
            'rain': ['🌧️', '☔', '💧'],
            'cold': ['🥶', '❄️', '🧊'],
            'hot': ['🔥', '🥵', '☀️'],
            
            // Social
            'party': ['🎉', '🥳', '🎊', '🍾'],
            'birthday': ['🎂', '🎉', '🥳', '🎈'],
            'congrats': ['🎉', '👏', '🔥', '⭐'],
            'sorry': ['😔', '🫂', '💔'],
            
            // Tech/Bot
            'bot': ['🤖', '⚡', '🔥'],
            'matdev': ['🚀', '⚡', '🤖', '🔥'],
            'code': ['👨‍💻', '💻', '⚡', '🔥'],
            'bug': ['🐛', '🔧', '💻'],
            'update': ['🔄', '⚡', '✨']
        };
        
        // Random reactions pool
        this.randomReactions = [
            '👍', '❤️', '😊', '🔥', '✨', '⭐', '💯', '👏',
            '😄', '😍', '🤩', '💪', '🙌', '👌', '⚡', '💎',
            '🎉', '🎊', '🌟', '💫', '🚀', '💝', '💖', '🔆'
        ];
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupMessageListener();

        // Auto-enable if set in environment
        if (process.env.AUTO_REACT === 'true') {
            this.isEnabled = true;
            console.log('🔥 Auto react enabled from environment');
        }

        console.log('✅ Auto React plugin loaded');
        return this;
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Toggle auto react
        this.bot.messageHandler.registerCommand('autoreact', this.toggleAutoReactCommand.bind(this), {
            description: 'Toggle automatic message reactions on/off',
            usage: `${config.PREFIX}autoreact [on/off]`,
            category: 'automation',
            plugin: 'autoreact',
            source: 'autoreact.js',
            ownerOnly: true
        });

        // Set reaction chance
        this.bot.messageHandler.registerCommand('reactchance', this.setReactionChanceCommand.bind(this), {
            description: 'Set reaction chance percentage (1-100)',
            usage: `${config.PREFIX}reactchance <percentage>`,
            category: 'automation',
            plugin: 'autoreact',
            source: 'autoreact.js',
            ownerOnly: true
        });

        // Toggle keyword reactions
        this.bot.messageHandler.registerCommand('keywordreact', this.toggleKeywordReactCommand.bind(this), {
            description: 'Toggle keyword-based reactions on/off',
            usage: `${config.PREFIX}keywordreact [on/off]`,
            category: 'automation',
            plugin: 'autoreact',
            source: 'autoreact.js',
            ownerOnly: true
        });

        // Add custom keyword reaction
        this.bot.messageHandler.registerCommand('addreaction', this.addKeywordReactionCommand.bind(this), {
            description: 'Add custom keyword reaction',
            usage: `${config.PREFIX}addreaction <keyword> <emoji>`,
            category: 'automation',
            plugin: 'autoreact',
            source: 'autoreact.js',
            ownerOnly: true
        });

        // List keyword reactions
        this.bot.messageHandler.registerCommand('reactions', this.listReactionsCommand.bind(this), {
            description: 'List all keyword reactions',
            usage: `${config.PREFIX}reactions`,
            category: 'automation',
            plugin: 'autoreact',
            source: 'autoreact.js',
            ownerOnly: true
        });

        // Auto react status
        this.bot.messageHandler.registerCommand('reactstatus', this.statusCommand.bind(this), {
            description: 'Show auto react status and settings',
            usage: `${config.PREFIX}reactstatus`,
            category: 'automation',
            plugin: 'autoreact',
            source: 'autoreact.js',
            ownerOnly: true
        });
    }

    /**
     * Setup message listener for auto reactions
     */
    setupMessageListener() {
        // Hook into bot's message handling
        if (this.bot.sock) {
            this.bot.sock.ev.on('messages.upsert', async ({ messages }) => {
                for (const message of messages) {
                    await this.processMessageForReaction(message);
                }
            });
        }
    }

    /**
     * Process message for potential reaction
     */
    async processMessageForReaction(message) {
        try {
            // Skip if auto react is disabled
            if (!this.isEnabled) return;
            
            // Skip our own messages
            if (message.key.fromMe) return;
            
            // Skip status messages
            if (message.key.remoteJid === 'status@broadcast') return;
            
            // Check reaction chance
            if (Math.random() * 100 > this.reactionChance) return;
            
            // Get message text
            const text = this.extractMessageText(message);
            if (!text) return;
            
            // Find appropriate reaction
            const reaction = await this.findReaction(text);
            if (!reaction) return;
            
            // Send reaction with delay to seem natural
            setTimeout(async () => {
                try {
                    await this.bot.sock.sendMessage(message.key.remoteJid, {
                        react: {
                            text: reaction,
                            key: message.key
                        }
                    });
                    
                    console.log(`💝 Auto reacted with ${reaction} to message in ${message.key.remoteJid}`);
                } catch (error) {
                    console.error('Error sending auto reaction:', error);
                }
            }, 500 + Math.random() * 2000); // 0.5-2.5 second delay
            
        } catch (error) {
            console.error('Error in processMessageForReaction:', error);
        }
    }

    /**
     * Extract text from message
     */
    extractMessageText(message) {
        const msg = message.message;
        if (!msg) return null;
        
        return msg.conversation || 
               msg.extendedTextMessage?.text || 
               msg.imageMessage?.caption ||
               msg.videoMessage?.caption ||
               msg.documentMessage?.caption ||
               null;
    }

    /**
     * Find appropriate reaction for text
     */
    async findReaction(text) {
        const lowerText = text.toLowerCase();
        
        // Keyword-based reactions
        if (this.useKeywordReactions) {
            for (const [keyword, reactions] of Object.entries(this.keywordReactions)) {
                if (lowerText.includes(keyword)) {
                    return reactions[Math.floor(Math.random() * reactions.length)];
                }
            }
        }
        
        // Random reactions
        if (this.useRandomReactions) {
            return this.randomReactions[Math.floor(Math.random() * this.randomReactions.length)];
        }
        
        return null;
    }

    /**
     * Toggle auto react command
     */
    async toggleAutoReactCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                this.isEnabled = true;
                await this.bot.messageHandler.reply(messageInfo, '✅ Auto reactions *ENABLED*\n\n💝 Bot will now react to messages automatically!');
            } else if (action === 'off' || action === 'disable') {
                this.isEnabled = false;
                await this.bot.messageHandler.reply(messageInfo, '❌ Auto reactions *DISABLED*\n\n💝 Reactions stopped.');
            } else {
                // Toggle current state
                this.isEnabled = !this.isEnabled;
                await this.bot.messageHandler.reply(messageInfo, 
                    this.isEnabled ? '✅ Auto reactions *ENABLED*' : '❌ Auto reactions *DISABLED*'
                );
            }
        } catch (error) {
            console.error('Error in toggleAutoReactCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling auto reactions: ' + error.message);
        }
    }

    /**
     * Set reaction chance command
     */
    async setReactionChanceCommand(messageInfo) {
        try {
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a percentage (1-100).\n\n*Usage:* ${config.PREFIX}reactchance <percentage>\n\n*Example:* ${config.PREFIX}reactchance 50`);
                return;
            }

            const chance = parseInt(messageInfo.args[0]);
            if (isNaN(chance) || chance < 1 || chance > 100) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide a valid percentage between 1 and 100');
                return;
            }

            this.reactionChance = chance;
            await this.bot.messageHandler.reply(messageInfo, `✅ Reaction chance set to *${chance}%*\n\n💝 Bot will react to approximately ${chance}% of messages.`);
        } catch (error) {
            console.error('Error in setReactionChanceCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting reaction chance: ' + error.message);
        }
    }

    /**
     * Toggle keyword react command
     */
    async toggleKeywordReactCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                this.useKeywordReactions = true;
            } else if (action === 'off' || action === 'disable') {
                this.useKeywordReactions = false;
            } else {
                this.useKeywordReactions = !this.useKeywordReactions;
            }

            await this.bot.messageHandler.reply(messageInfo, 
                `${this.useKeywordReactions ? '✅' : '❌'} Keyword reactions *${this.useKeywordReactions ? 'ENABLED' : 'DISABLED'}*\n\n💭 ${this.useKeywordReactions ? 'Bot will use keyword-based reactions' : 'Only random reactions will be used'}`
            );
        } catch (error) {
            console.error('Error in toggleKeywordReactCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling keyword reactions: ' + error.message);
        }
    }

    /**
     * Add keyword reaction command
     */
    async addKeywordReactionCommand(messageInfo) {
        try {
            if (messageInfo.args.length < 2) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide keyword and emoji.\n\n*Usage:* ${config.PREFIX}addreaction <keyword> <emoji>\n\n*Example:* ${config.PREFIX}addreaction awesome 🔥`);
                return;
            }

            const keyword = messageInfo.args[0].toLowerCase();
            const emoji = messageInfo.args[1];

            if (!this.keywordReactions[keyword]) {
                this.keywordReactions[keyword] = [];
            }

            this.keywordReactions[keyword].push(emoji);

            await this.bot.messageHandler.reply(messageInfo, `✅ Added reaction *${emoji}* for keyword "*${keyword}*"\n\n💝 Bot will now react with this emoji when the keyword is mentioned.`);
        } catch (error) {
            console.error('Error in addKeywordReactionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error adding keyword reaction: ' + error.message);
        }
    }

    /**
     * List reactions command
     */
    async listReactionsCommand(messageInfo) {
        try {
            let response = '*💝 KEYWORD REACTIONS*\n\n';
            
            let count = 0;
            for (const [keyword, reactions] of Object.entries(this.keywordReactions)) {
                if (count >= 15) { // Limit to prevent long messages
                    response += `\n_...and ${Object.keys(this.keywordReactions).length - count} more_\n`;
                    break;
                }
                response += `*${keyword}:* ${reactions.join(' ')}\n`;
                count++;
            }

            response += `\n*📊 SETTINGS*\n`;
            response += `Status: ${this.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n`;
            response += `Chance: ${this.reactionChance}%\n`;
            response += `Keywords: ${this.useKeywordReactions ? '✅' : '❌'}\n`;
            response += `Random: ${this.useRandomReactions ? '✅' : '❌'}\n\n`;
            response += `*Usage:* ${config.PREFIX}addreaction <keyword> <emoji>`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in listReactionsCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing reactions: ' + error.message);
        }
    }

    /**
     * Status command
     */
    async statusCommand(messageInfo) {
        try {
            const response = `*💝 AUTO REACT STATUS*\n\n` +
                `*Status:* ${this.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                `*Reaction Chance:* ${this.reactionChance}%\n` +
                `*Keyword Reactions:* ${this.useKeywordReactions ? '✅ Enabled' : '❌ Disabled'}\n` +
                `*Random Reactions:* ${this.useRandomReactions ? '✅ Enabled' : '❌ Disabled'}\n` +
                `*Keywords Count:* ${Object.keys(this.keywordReactions).length}\n` +
                `*Random Pool:* ${this.randomReactions.length} emojis\n\n` +
                `*Commands:*\n` +
                `${config.PREFIX}autoreact [on/off]\n` +
                `${config.PREFIX}reactchance <percentage>\n` +
                `${config.PREFIX}reactions - View all keywords`;

            await this.bot.messageHandler.reply(messageInfo, response);
        } catch (error) {
            console.error('Error in statusCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error getting status: ' + error.message);
        }
    }
}

module.exports = AutoReactPlugin;
