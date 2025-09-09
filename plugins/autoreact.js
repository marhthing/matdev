/**
 * MATDEV Auto React Plugin
 * Automatically reacts to chat messages and status updates with emojis
 * Simplified version with enhanced emoji list and status support
 */

const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class AutoReactPlugin {
    constructor() {
        this.name = 'autoreact';
        this.description = 'Auto react to messages and status updates';
        this.version = '2.0.0';
        
        // Auto react settings for messages
        this.isEnabled = false;
        this.reactDelayMode = 'nodelay'; // 'delay' or 'nodelay'
        
        // Status auto react settings
        this.statusReactEnabled = false;
        this.statusReactionDelay = { min: 30000, max: 300000 }; // 30s to 5min delay
        this.statusReactDelayMode = 'nodelay'; // 'delay' or 'nodelay'
        
        // Keep track of reacted statuses to avoid duplicates
        this.reactedStatuses = new Set();
        
        // Enhanced keyword-based reactions for messages
        this.keywordReactions = {
            // Greetings & Social
            'hello': ['👋', '😊', '🙋‍♂️', '🤝', '✨'],
            'hi': ['👋', '😊', '🙋‍♂️', '🌟', '💫'],
            'good morning': ['🌅', '☀️', '😊', '🌻', '🌞'],
            'good night': ['🌙', '😴', '💤', '⭐', '🌃'],
            'good afternoon': ['☀️', '😊', '👋', '🌤️', '💫'],
            'welcome': ['🤗', '👋', '🎉', '✨', '💫'],
            'goodbye': ['👋', '😢', '💔', '✋', '🫂'],
            'bye': ['👋', '😊', '✋', '💫', '🌟'],
            
            // Gratitude & Appreciation
            'thank you': ['🙏', '😊', '❤️', '💕', '🤗'],
            'thanks': ['🙏', '😊', '❤️', '✨', '💫'],
            'appreciate': ['🙏', '💕', '😊', '🤗', '🌟'],
            'grateful': ['🙏', '❤️', '😊', '💖', '🌸'],
            'bless': ['🙏', '✨', '💫', '😇', '💛'],
            
            // Emotions & Feelings
            'love': ['❤️', '💕', '😍', '💖', '💝', '💗', '🥰'],
            'happy': ['😊', '😄', '🎉', '✨', '🌟', '😁', '🥳'],
            'sad': ['😢', '💔', '🫂', '😔', '💙', '🤗', '😞'],
            'angry': ['😠', '💢', '🤬', '😡', '👿'],
            'excited': ['🎉', '😆', '🤩', '⚡', '🔥', '🚀', '🌟'],
            'tired': ['😴', '💤', '😮‍💨', '😪', '🥱'],
            'stressed': ['😰', '😫', '💆‍♂️', '🫂', '😟'],
            'relaxed': ['😌', '😊', '🧘‍♂️', '✨', '🌸'],
            'proud': ['🏆', '👏', '🎉', '💪', '⭐', '🔥'],
            'nervous': ['😰', '😬', '🫣', '😟', '💆‍♂️'],
            
            // Activities & Hobbies
            'work': ['💼', '👨‍💻', '📊', '⚡', '💪', '🔥'],
            'study': ['📚', '🎓', '📖', '💡', '🧠', '✏️'],
            'food': ['🍽️', '😋', '🤤', '🍕', '🍔', '🍜', '🥘'],
            'cooking': ['👨‍🍳', '🍳', '🔥', '😋', '🍽️', '👩‍🍳'],
            'music': ['🎵', '🎶', '🎤', '🎸', '🎹', '🎧', '🔊'],
            'game': ['🎮', '🕹️', '🎯', '⚡', '🔥', '🏆', '👾'],
            'movie': ['🎬', '🍿', '📺', '🎭', '🎪', '📽️'],
            'travel': ['✈️', '🌍', '🗺️', '📸', '🧳', '🏖️'],
            'shopping': ['🛍️', '💳', '🛒', '💸', '👗', '👠'],
            'exercise': ['💪', '🏋️‍♂️', '🏃‍♀️', '🔥', '⚡', '🏆'],
            'yoga': ['🧘‍♀️', '🧘‍♂️', '✨', '🌸', '😌', '💆‍♀️'],
            
            // Achievements & Success
            'success': ['🎉', '👏', '🔥', '⭐', '🏆', '💪', '🚀'],
            'win': ['🏆', '🎉', '👏', '⭐', '🥇', '🔥', '💪'],
            'victory': ['🏆', '🎉', '👏', '🥇', '⚡', '🔥'],
            'achievement': ['🏆', '⭐', '🎉', '👏', '💪', '🔥'],
            'goal': ['🎯', '🏆', '⭐', '🔥', '💪', '🚀'],
            'complete': ['✅', '🎉', '👏', '💯', '🔥', '⭐'],
            'finish': ['✅', '🎉', '👏', '🏁', '💯', '🔥'],
            'lose': ['😔', '💔', '🫂', '😞', '🤗', '💙'],
            'fail': ['😔', '💔', '🫂', '💪', '🤗', '💙'],
            
            // Weather & Nature
            'sunny': ['☀️', '🌞', '😎', '🌻', '🌤️', '✨'],
            'rain': ['🌧️', '☔', '💧', '🌦️', '⛈️', '💙'],
            'cold': ['🥶', '❄️', '🧊', '🌨️', '☃️', '🧥'],
            'hot': ['🔥', '🥵', '☀️', '🌞', '💦', '🌡️'],
            'snow': ['❄️', '🌨️', '☃️', '⛄', '🛷', '🧊'],
            'wind': ['💨', '🌬️', '🍃', '🌪️', '⛈️'],
            
            // Social Events & Celebrations
            'party': ['🎉', '🥳', '🎊', '🍾', '🎈', '🪩', '💃'],
            'birthday': ['🎂', '🎉', '🥳', '🎈', '🎁', '🍰', '🎊'],
            'anniversary': ['💕', '🎉', '🥂', '💖', '🎊', '✨'],
            'wedding': ['💒', '👰', '🤵', '💕', '🎉', '💐'],
            'graduation': ['🎓', '🎉', '👏', '📚', '🏆', '⭐'],
            'celebration': ['🎉', '🥳', '🎊', '🍾', '🎈', '✨'],
            'congrats': ['🎉', '👏', '🔥', '⭐', '🏆', '💪', '🥳'],
            'congratulations': ['🎉', '👏', '🔥', '⭐', '🏆', '🥳'],
            
            // Apologies & Support
            'sorry': ['😔', '🫂', '💔', '🤗', '💙', '😞'],
            'apologize': ['😔', '🫂', '💔', '🤗', '💙'],
            'forgive': ['🫂', '💙', '🤗', '💕', '😊', '✨'],
            'support': ['🫂', '💪', '❤️', '🤗', '💙', '⚡'],
            'help': ['🤝', '💪', '🫂', '⚡', '🔧', '💙'],
            
            // Tech & Development
            'bot': ['🤖', '⚡', '🔥', '💻', '🚀', '⭐'],
            'matdev': ['🚀', '⚡', '🤖', '🔥', '💻', '⭐', '💎'],
            'code': ['👨‍💻', '💻', '⚡', '🔥', '🚀', '💎'],
            'programming': ['👨‍💻', '💻', '🔥', '⚡', '🚀'],
            'update': ['🔄', '⚡', '✨', '🚀', '💫', '🔥'],
            'bug': ['🐛', '🔧', '💻', '😅', '🛠️'],
            'fix': ['🔧', '✅', '💪', '⚡', '🛠️', '🔥'],
            'deploy': ['🚀', '⚡', '🔥', '💻', '✨', '🌟'],
            'launch': ['🚀', '🎉', '⚡', '🔥', '⭐', '💫'],
            
            // Money & Business
            'money': ['💰', '💸', '💳', '💵', '🤑', '💎'],
            'business': ['💼', '📊', '💰', '🚀', '⚡', '📈'],
            'profit': ['📈', '💰', '🤑', '💵', '🚀', '💎'],
            'investment': ['📈', '💰', '💎', '🚀', '📊'],
            'sale': ['💸', '🛍️', '💰', '🤑', '💳', '🎉'],
            
            // Health & Wellness
            'health': ['💪', '🏥', '❤️', '🧘‍♀️', '🍎', '✨'],
            'sick': ['🤒', '😷', '🫂', '💊', '🏥', '🤗'],
            'medicine': ['💊', '🏥', '🩺', '❤️', '💪', '✨'],
            'doctor': ['👨‍⚕️', '🏥', '🩺', '💊', '❤️'],
            'hospital': ['🏥', '👨‍⚕️', '🩺', '💊', '❤️', '🫂'],
            'better': ['💪', '😊', '❤️', '✨', '🎉', '👏'],
            
            // Time & Calendar
            'morning': ['🌅', '☀️', '🌞', '☕', '🌻', '✨'],
            'afternoon': ['☀️', '🌤️', '😊', '💫', '🌟'],
            'evening': ['🌅', '🌇', '✨', '💫', '🌟'],
            'night': ['🌙', '⭐', '🌃', '✨', '💫', '😴'],
            'weekend': ['🎉', '😎', '🏖️', '🎮', '🍿', '✨'],
            'monday': ['☕', '💪', '⚡', '🔥', '🚀', '💼'],
            'friday': ['🎉', '😎', '🍻', '🎊', '✨', '🥳'],
            
            // Random Positive
            'amazing': ['🤩', '🔥', '⭐', '💫', '✨', '🚀'],
            'awesome': ['🔥', '🤩', '⭐', '💪', '🚀', '💎'],
            'fantastic': ['🌟', '🔥', '🤩', '⭐', '✨', '🚀'],
            'incredible': ['🤩', '🔥', '⭐', '💫', '🚀', '💎'],
            'wonderful': ['✨', '🌟', '😊', '💫', '🤩', '💕'],
            'perfect': ['💯', '🔥', '⭐', '👌', '✨', '🚀'],
            'excellent': ['🔥', '⭐', '💯', '👏', '🚀', '💎'],
            'beautiful': ['😍', '✨', '🌸', '💕', '🌟', '💖'],
            'cute': ['🥰', '😍', '💕', '🌸', '✨', '💖'],
            'cool': ['😎', '🔥', '⚡', '🚀', '✨', '👌'],
            'nice': ['👍', '😊', '✨', '💫', '🌟', '👌'],
            'great': ['👍', '🔥', '⭐', '💪', '🚀', '✨'],
            'good': ['👍', '😊', '✨', '🌟', '💫', '👌']
        };
        
        // Enhanced random reactions pool for messages
        this.randomReactions = [
            // Classic positive
            '👍', '❤️', '😊', '🔥', '✨', '⭐', '💯', '👏',
            '😄', '😍', '🤩', '💪', '🙌', '👌', '⚡', '💎',
            
            // Celebration & Energy
            '🎉', '🎊', '🌟', '💫', '🚀', '💝', '💖', '🔆',
            '🥳', '🎈', '🎁', '🌈', '💐', '🌸', '🌺', '🌻',
            
            // Support & Love
            '🤗', '🫂', '💕', '💗', '💙', '💚', '💛', '🧡',
            '💜', '🤍', '🖤', '💋', '😘', '🥰', '😇', '🤭',
            
            // Fun & Playful
            '😂', '🤣', '😁', '😆', '🙃', '😋', '🤪', '🥴',
            '🤠', '🥶', '🤯', '🤓', '😎', '🥸', '🤩', '🥳',
            
            // Animals & Nature
            '🐶', '🐱', '🦄', '🐝', '🦋', '🌙', '☀️', '🌞',
            '🌍', '🏔️', '🌊', '🌲', '🍀', '🌿', '🌷', '🌹',
            
            // Objects & Symbols
            '💡', '🔮', '💰', '🏆', '🎯', '🎪', '🎭', '🎨',
            '🎵', '🎶', '📚', '✏️', '🖊️', '📝', '🔖', '📌'
        ];
        
        // Fixed status reactions (non-configurable)
        this.statusReactions = config.STATUS_AUTO_REACT_EMOJIS.split('');
        
        // Cleanup interval for reacted statuses
        this.cleanupInterval = null;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupMessageListener();
        this.setupStatusListener();
        this.startCleanupTimer();

        // Auto-enable from environment
        if (config.AUTO_REACT) {
            this.isEnabled = true;
            console.log('🔥 Auto react enabled from environment');
        }
        
        if (config.STATUS_AUTO_REACT) {
            this.statusReactEnabled = true;
            console.log('🔥 Auto status react enabled from environment');
        }
        
        // Initialize delay settings from config
        this.reactDelayMode = config.REACT_DELAY;
        this.statusReactDelayMode = config.STATUS_REACT_DELAY;

        console.log('✅ Auto React plugin loaded');
        return this;
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Message auto react toggle
        this.bot.messageHandler.registerCommand('autoreact', this.toggleAutoReactCommand.bind(this), {
            description: 'Toggle automatic message reactions on/off or show status',
            usage: `${config.PREFIX}autoreact [on/off]`,
            category: 'automation',
            plugin: 'autoreact',
            source: 'autoreact.js',
            ownerOnly: true
        });

        // Status auto react toggle
        this.bot.messageHandler.registerCommand('sautoreact', this.toggleStatusReactCommand.bind(this), {
            description: 'Toggle automatic status reactions on/off or show status',
            usage: `${config.PREFIX}sautoreact [on/off]`,
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
        if (this.bot.sock) {
            this.bot.sock.ev.on('messages.upsert', async ({ messages }) => {
                for (const message of messages) {
                    // Process regular messages (not status)
                    if (message.key.remoteJid !== 'status@broadcast') {
                        await this.processMessageForReaction(message);
                    }
                }
            });
        }
    }

    /**
     * Setup status message listener
     */
    setupStatusListener() {
        if (this.bot.sock) {
            this.bot.sock.ev.on('messages.upsert', async ({ messages }) => {
                for (const message of messages) {
                    // Process status messages
                    if (message.key.remoteJid === 'status@broadcast') {
                        await this.processStatusForReaction(message);
                    }
                }
            });
        }
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
     * Update .env file with new setting
     */
    updateEnvFile(key, value) {
        try {
            const envPath = path.join(__dirname, '..', '.env');
            
            if (!fs.existsSync(envPath)) {
                console.warn('⚠️ .env file not found, cannot save setting');
                return false;
            }
            
            let envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');
            let keyFound = false;
            
            // Update existing key or add new one
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith(`${key}=`)) {
                    lines[i] = `${key}=${value}`;
                    keyFound = true;
                    break;
                }
            }
            
            // Add key if not found
            if (!keyFound) {
                lines.push(`${key}=${value}`);
            }
            
            // Write back to file
            fs.writeFileSync(envPath, lines.join('\n'));
            
            // Update process.env for immediate effect
            process.env[key] = value;
            
            return true;
        } catch (error) {
            console.error('Error updating .env file:', error);
            return false;
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
            
            
            
            // Get message text
            const text = this.extractMessageText(message);
            if (!text) return;
            
            // Find appropriate reaction
            const reaction = await this.findReaction(text);
            if (!reaction) return;
            
            // Send reaction based on delay mode
            const delay = this.reactDelayMode === 'delay' ? (500 + Math.random() * 2000) : 0;
            
            setTimeout(async () => {
                try {
                    await this.bot.sock.sendMessage(message.key.remoteJid, {
                        react: {
                            text: reaction,
                            key: message.key
                        }
                    });
                    
                    // console.log(`💝 Auto reacted with ${reaction} to message`);
                } catch (error) {
                    console.error('Error sending auto reaction:', error);
                }
            }, delay);
            
        } catch (error) {
            console.error('Error in processMessageForReaction:', error);
        }
    }

    /**
     * Process status message for potential reaction
     */
    async processStatusForReaction(message) {
        try {
            // Skip if auto status react is disabled
            if (!this.statusReactEnabled) return;
            
            // Skip our own status
            if (message.key.fromMe) return;
            
            // Create unique identifier for this status
            const statusId = `${message.key.participant || message.key.remoteJid}_${message.key.id}`;
            
            // Skip if we already reacted to this status
            if (this.reactedStatuses.has(statusId)) return;
            
            
            
            // Get random status reaction
            const reaction = this.statusReactions[Math.floor(Math.random() * this.statusReactions.length)];
            if (!reaction) return;
            
            // Mark as processed to avoid duplicate reactions
            this.reactedStatuses.add(statusId);
            
            // Calculate delay based on delay mode
            const delay = this.statusReactDelayMode === 'delay' ? 
                         (this.statusReactionDelay.min + Math.random() * (this.statusReactionDelay.max - this.statusReactionDelay.min)) : 0;
            
            // Schedule the reaction
            setTimeout(async () => {
                try {
                    await this.bot.sock.sendMessage(message.key.remoteJid, {
                        react: {
                            text: reaction,
                            key: message.key
                        }
                    });
                    
                    // console.log(`💝 Auto reacted to status with ${reaction}`);
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
        for (const [keyword, reactions] of Object.entries(this.keywordReactions)) {
            if (lowerText.includes(keyword)) {
                return reactions[Math.floor(Math.random() * reactions.length)];
            }
        }
        
        // Random reactions as fallback
        return this.randomReactions[Math.floor(Math.random() * this.randomReactions.length)];
    }

    /**
     * Toggle auto react command
     */
    async toggleAutoReactCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                this.isEnabled = true;
                this.updateEnvFile('AUTO_REACT', 'true');
                await this.bot.messageHandler.reply(messageInfo, `✅ *MESSAGE AUTO REACTIONS ENABLED*`);
            } else if (action === 'off' || action === 'disable') {
                this.isEnabled = false;
                this.updateEnvFile('AUTO_REACT', 'false');
                await this.bot.messageHandler.reply(messageInfo, '❌ *MESSAGE AUTO REACTIONS DISABLED*');
            } else if (action === 'delay') {
                this.reactDelayMode = 'delay';
                this.updateEnvFile('REACT_DELAY', 'delay');
                await this.bot.messageHandler.reply(messageInfo, '⏰ *MESSAGE REACTION DELAY ENABLED*\n\n🕐 Bot will now wait 0.5-2.5 seconds before reacting to messages.');
            } else if (action === 'nodelay') {
                this.reactDelayMode = 'nodelay';
                this.updateEnvFile('REACT_DELAY', 'nodelay');
                await this.bot.messageHandler.reply(messageInfo, '⚡ *MESSAGE REACTION DELAY DISABLED*\n\n💨 Bot will now react to messages instantly.');
            } else {
                // Show status
                const response = `*MESSAGE AUTO REACT* ${this.isEnabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                    `*Commands:*\n` +
                    `${config.PREFIX}autoreact on/off/delay/nodelay`;
                
                await this.bot.messageHandler.reply(messageInfo, response);
            }
        } catch (error) {
            console.error('Error in toggleAutoReactCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling auto reactions: ' + error.message);
        }
    }

    /**
     * Toggle status react command
     */
    async toggleStatusReactCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                this.statusReactEnabled = true;
                this.updateEnvFile('STATUS_AUTO_REACT', 'true');
                await this.bot.messageHandler.reply(messageInfo, `✅ *STATUS AUTO REACTIONS ENABLED*`);
            } else if (action === 'off' || action === 'disable') {
                this.statusReactEnabled = false;
                this.updateEnvFile('STATUS_AUTO_REACT', 'false');
                await this.bot.messageHandler.reply(messageInfo, '❌ *STATUS AUTO REACTIONS DISABLED*');
            } else if (action === 'delay') {
                this.statusReactDelayMode = 'delay';
                this.updateEnvFile('STATUS_REACT_DELAY', 'delay');
                await this.bot.messageHandler.reply(messageInfo, '⏰ *STATUS REACTION DELAY ENABLED*\n\n🕐 Bot will now wait 30s-5min before reacting to status updates.');
            } else if (action === 'nodelay') {
                this.statusReactDelayMode = 'nodelay';
                this.updateEnvFile('STATUS_REACT_DELAY', 'nodelay');
                await this.bot.messageHandler.reply(messageInfo, '⚡ *STATUS REACTION DELAY DISABLED*\n\n💨 Bot will now react to status updates instantly.');
            } else {
                // Show status
                const delayStatus = this.statusReactDelayMode === 'delay' ? 
                    `⏰ Delayed (${this.statusReactionDelay.min/1000}s-${this.statusReactionDelay.max/1000}s)` : 
                    '⚡ Instant';
                
                const response = `*👁️ STATUS AUTO REACT STATUS*\n\n` +
                    `*Status:* ${this.statusReactEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                    `*Timing:* ${delayStatus}\n` +
                    `*Reactions:* ${this.statusReactions.join('')}\n` +
                    `*Cache:* ${this.reactedStatuses.size} statuses\n\n` +
                    `*Commands:*\n` +
                    `${config.PREFIX}sautoreact on/off/delay/nodelay`;
                
                await this.bot.messageHandler.reply(messageInfo, response);
            }
        } catch (error) {
            console.error('Error in toggleStatusReactCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling status reactions: ' + error.message);
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AutoReactPlugin();
        await plugin.init(bot);
        return plugin;
    }
};