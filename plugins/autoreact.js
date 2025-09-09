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
        
        // Simple 5-reaction system with smart analysis
        this.basicReactions = {
            love: '❤️',      // Love, appreciation, positive emotions
            sad: '😢',       // Sadness, disappointment, sympathy
            angry: '😠',     // Anger, frustration, annoyance
            laugh: '😂',     // Humor, funny content, jokes
            neutral: '👍'    // General approval, neutral positive
        };
        
        // Fixed status reactions (non-configurable) - properly split emojis
        this.statusReactions = ['❤️', '💙', '💚'];
        
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

        // Force reload environment variables
        require('dotenv').config();
        
        // Auto-enable from environment with debug info
        console.log('🔍 Environment Check:', {
            AUTO_REACT: process.env.AUTO_REACT,
            STATUS_AUTO_REACT: process.env.STATUS_AUTO_REACT,
            configAUTO_REACT: config.AUTO_REACT,
            configSTATUS_AUTO_REACT: config.STATUS_AUTO_REACT
        });
        
        if (config.AUTO_REACT || process.env.AUTO_REACT === 'true') {
            this.isEnabled = true;
            console.log('🔥 Auto react enabled from environment');
        }
        
        if (config.STATUS_AUTO_REACT || process.env.STATUS_AUTO_REACT === 'true') {
            this.statusReactEnabled = true;
            console.log('🔥 Auto status react enabled from environment');
        }
        
        // Debug status reaction configuration
        console.log('📊 Status Reaction Config:', {
            enabled: this.statusReactEnabled,
            reactions: this.statusReactions,
            delayMode: this.statusReactDelayMode
        });
        
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
     * Setup status message listener with updated method
     */
    setupStatusListener() {
        if (this.bot.sock) {
            // Create a unique listener identifier to prevent duplicates
            const listenerKey = 'status-autoreact-' + Date.now();
            
            this.bot.sock.ev.on('messages.upsert', async ({ type, messages }) => {
                // Only process notify type messages (new messages)
                if (type === 'notify') {
                    for (const message of messages) {
                        // Check for status messages using multiple identifiers
                        const jid = message.key.remoteJid;
                        if (this.isStatusMessage(message)) {
                            console.log('📟 Status message detected, processing for reaction...');
                            // Add small delay to prevent race conditions
                            setTimeout(() => {
                                this.processStatusForReaction(message);
                            }, 100);
                        }
                    }
                }
            });
            
            console.log('✅ Status listener set up successfully');
        }
    }

    /**
     * Check if message is a status message using multiple methods
     */
    isStatusMessage(message) {
        if (!message || !message.key) return false;
        
        const jid = message.key.remoteJid;
        
        // Multiple checks for status messages
        return (
            jid === 'status@broadcast' ||           // Traditional method
            jid?.endsWith('@broadcast') ||          // Updated method
            jid?.includes('status') ||              // Alternative check
            message.key.id?.startsWith('status_')   // ID-based check
        );
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
            // Skip if auto status react is disabled - double check both ways
            const isEnabled = this.statusReactEnabled || process.env.STATUS_AUTO_REACT === 'true';
            if (!isEnabled) {
                console.log('⏭️ Status auto-react disabled, skipping...', {
                    statusReactEnabled: this.statusReactEnabled,
                    envVar: process.env.STATUS_AUTO_REACT
                });
                return;
            }
            
            // Skip our own status
            if (message.key.fromMe) {
                console.log('⏭️ Skipping own status message');
                return;
            }
            
            // Create unique identifier for this status
            const statusId = `${message.key.participant || message.key.remoteJid}_${message.key.id}`;
            
            // Skip if we already reacted to this status
            if (this.reactedStatuses.has(statusId)) {
                console.log('⏭️ Already reacted to this status, skipping...');
                return;
            }
            
            // Mark as processed IMMEDIATELY to prevent duplicates
            this.reactedStatuses.add(statusId);
            
            console.log('📟 Processing status for reaction:', {
                jid: message.key.remoteJid,
                id: message.key.id,
                participant: message.key.participant,
                fromMe: message.key.fromMe
            });
            
            // Log complete message structure for debugging
            console.log('🔍 Complete message key structure:', JSON.stringify(message.key, null, 2));
            
            // Get random status reaction
            const reaction = this.statusReactions[Math.floor(Math.random() * this.statusReactions.length)];
            if (!reaction) {
                console.log('❌ No reaction emoji available');
                return;
            }
            
            // Already marked as processed above to prevent race conditions
            
            // Calculate delay based on delay mode
            const delay = this.statusReactDelayMode === 'delay' ? 
                         (this.statusReactionDelay.min + Math.random() * (this.statusReactionDelay.max - this.statusReactionDelay.min)) : 0;
            
            console.log(`⏰ Scheduling status reaction with ${reaction} (delay: ${delay}ms)`);
            
            // Schedule the reaction
            setTimeout(async () => {
                try {
                    // Try multiple reaction methods
                    await this.sendStatusReaction(message, reaction);
                    console.log(`💝 Successfully reacted to status with ${reaction}`);
                } catch (error) {
                    console.error('❌ Error sending status reaction:', error.message);
                    // Remove from cache if reaction failed
                    this.reactedStatuses.delete(statusId);
                    
                    // Try alternative method
                    try {
                        await this.sendAlternativeStatusReaction(message, reaction);
                        console.log(`💝 Successfully sent alternative status reaction with ${reaction}`);
                    } catch (altError) {
                        console.error('❌ Alternative status reaction also failed:', altError.message);
                    }
                }
            }, delay);
            
        } catch (error) {
            console.error('❌ Error in processStatusForReaction:', error);
        }
    }

    /**
     * Send status reaction using primary method
     */
    async sendStatusReaction(message, reaction) {
        console.log('🔍 Trying primary method - original key structure');
        return await this.bot.sock.sendMessage(message.key.remoteJid, {
            react: {
                text: reaction,
                key: message.key
            }
        });
    }

    /**
     * Send status reaction using alternative method
     */
    async sendAlternativeStatusReaction(message, reaction) {
        console.log('🔍 Trying alternative methods for status reaction...');
        
        // Method 1: React to participant directly
        if (message.key.participant) {
            console.log('📱 Method 1: Reacting to participant JID');
            try {
                return await this.bot.sock.sendMessage(message.key.participant, {
                    react: {
                        text: reaction,
                        key: {
                            remoteJid: message.key.participant,
                            id: message.key.id,
                            fromMe: false
                        }
                    }
                });
            } catch (error) {
                console.log('❌ Method 1 failed:', error.message);
            }
        }
        
        // Method 2: Use status@broadcast with participant info
        console.log('📱 Method 2: Modified key structure');
        try {
            return await this.bot.sock.sendMessage('status@broadcast', {
                react: {
                    text: reaction,
                    key: {
                        remoteJid: 'status@broadcast',
                        id: message.key.id,
                        participant: message.key.participant,
                        fromMe: false
                    }
                }
            });
        } catch (error) {
            console.log('❌ Method 2 failed:', error.message);
        }
        
        // Method 3: Direct status reaction attempt
        console.log('📱 Method 3: Direct status reaction');
        return await this.bot.sock.sendMessage(message.key.remoteJid, {
            react: {
                text: reaction,
                key: {
                    remoteJid: message.key.remoteJid,
                    id: message.key.id,
                    participant: message.key.participant
                }
            }
        });
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
     * Find appropriate reaction for text with smart 5-reaction analysis
     */
    async findReaction(text) {
        const lowerText = text.toLowerCase();
        
        // Analyze sentiment and return appropriate reaction
        const sentiment = this.analyzeAdvancedSentiment(lowerText);
        return this.basicReactions[sentiment];
    }

    /**
     * Advanced sentiment analysis for 5-reaction system
     */
    analyzeAdvancedSentiment(text) {
        // Love/Heart reactions - strong positive emotions, love, appreciation
        const loveWords = [
            'love', 'adore', 'amazing', 'awesome', 'fantastic', 'incredible', 'wonderful',
            'perfect', 'beautiful', 'gorgeous', 'stunning', 'brilliant', 'excellent',
            'outstanding', 'magnificent', 'spectacular', 'marvelous', 'fabulous',
            'thank', 'thanks', 'grateful', 'appreciate', 'bless', 'heart', 'sweet',
            'cute', 'adorable', 'precious', 'dear', 'honey', 'baby', 'darling',
            'celebration', 'celebrate', 'victory', 'win', 'success', 'achievement',
            'proud', 'congratulations', 'congrats', 'birthday', 'anniversary',
            'wedding', 'graduation', 'party', 'excited', 'thrilled', 'joy', 'happy'
        ];
        
        // Sad reactions - sadness, disappointment, sympathy, loss
        const sadWords = [
            'sad', 'cry', 'crying', 'tears', 'hurt', 'pain', 'heartbroken', 'broken',
            'depressed', 'down', 'blue', 'upset', 'disappointed', 'devastated',
            'tragic', 'tragedy', 'loss', 'lost', 'miss', 'missing', 'gone', 'died',
            'death', 'funeral', 'goodbye', 'farewell', 'leaving', 'alone', 'lonely',
            'sorry', 'apologize', 'regret', 'mistake', 'failed', 'failure', 'lose',
            'disaster', 'terrible', 'awful', 'horrible', 'worst', 'bad news',
            'sick', 'ill', 'hospital', 'disease', 'cancer', 'emergency', 'accident'
        ];
        
        // Angry reactions - anger, frustration, annoyance
        const angryWords = [
            'angry', 'mad', 'furious', 'rage', 'hate', 'stupid', 'idiot', 'moron',
            'annoying', 'annoyed', 'frustrated', 'irritated', 'pissed', 'damn',
            'hell', 'shit', 'fuck', 'wtf', 'bullshit', 'nonsense', 'ridiculous',
            'outrageous', 'unacceptable', 'disgusting', 'pathetic', 'useless',
            'worthless', 'trash', 'garbage', 'scam', 'fake', 'lie', 'liar',
            'cheat', 'steal', 'thief', 'criminal', 'wrong', 'unfair', 'injustice',
            'discrimination', 'racist', 'sexist', 'abuse', 'violence', 'fight',
            'war', 'conflict', 'argue', 'argument', 'disagree', 'oppose'
        ];
        
        // Laugh reactions - humor, funny content, jokes
        const laughWords = [
            'haha', 'lol', 'lmao', 'rofl', 'lmfao', 'funny', 'hilarious', 'joke',
            'comedy', 'humor', 'laugh', 'giggle', 'chuckle', 'smile', 'grin',
            'amusing', 'entertaining', 'witty', 'clever', 'silly', 'crazy',
            'weird', 'strange', 'odd', 'bizarre', 'ridiculous', 'absurd',
            'meme', 'viral', 'trending', 'epic', 'legendary', 'iconic',
            'classic', 'gold', 'comedy', 'clown', 'joking', 'kidding',
            'sarcasm', 'sarcastic', 'ironic', 'irony', 'troll', 'trolling'
        ];
        
        // Check for strong emotional indicators first
        let loveScore = 0;
        let sadScore = 0;
        let angryScore = 0;
        let laughScore = 0;
        
        // Count word matches with weighted scoring
        loveWords.forEach(word => {
            if (text.includes(word)) {
                loveScore += word.length > 6 ? 2 : 1; // Longer words get higher weight
            }
        });
        
        sadWords.forEach(word => {
            if (text.includes(word)) {
                sadScore += word.length > 6 ? 2 : 1;
            }
        });
        
        angryWords.forEach(word => {
            if (text.includes(word)) {
                angryScore += word.length > 4 ? 2 : 1;
            }
        });
        
        laughWords.forEach(word => {
            if (text.includes(word)) {
                laughScore += word.length > 4 ? 2 : 1;
            }
        });
        
        // Check for punctuation patterns that indicate emotion
        const exclamationCount = (text.match(/!/g) || []).length;
        const questionCount = (text.match(/\?/g) || []).length;
        const capsWords = (text.match(/[A-Z]{2,}/g) || []).length;
        
        // Boost scores based on punctuation
        if (exclamationCount > 0) {
            loveScore += exclamationCount;
            angryScore += exclamationCount;
            laughScore += exclamationCount;
        }
        
        if (capsWords > 0) {
            angryScore += capsWords * 2; // ALL CAPS usually indicates anger or excitement
            loveScore += capsWords;
        }
        
        // Emoticon and emoji detection
        if (text.includes(':(') || text.includes(':(') || text.includes('😢') || text.includes('😭')) {
            sadScore += 3;
        }
        
        if (text.includes(':)') || text.includes('😂') || text.includes('🤣') || text.includes('😄')) {
            laughScore += 3;
        }
        
        if (text.includes('<3') || text.includes('❤️') || text.includes('💕') || text.includes('🥰')) {
            loveScore += 3;
        }
        
        if (text.includes('>:(') || text.includes('😡') || text.includes('😠') || text.includes('🤬')) {
            angryScore += 3;
        }
        
        // Determine the dominant sentiment
        const maxScore = Math.max(loveScore, sadScore, angryScore, laughScore);
        
        // Only react with specific emotions if there's a clear winner and sufficient score
        if (maxScore >= 2) {
            if (loveScore === maxScore) return 'love';
            if (sadScore === maxScore) return 'sad';
            if (angryScore === maxScore) return 'angry';
            if (laughScore === maxScore) return 'laugh';
        }
        
        // Special case: Questions usually get neutral reactions
        if (questionCount > 0 && maxScore < 3) {
            return 'neutral';
        }
        
        // Default to neutral for ambiguous or mild content
        return 'neutral';
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