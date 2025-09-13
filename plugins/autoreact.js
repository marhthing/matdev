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
        
        // Simple 5-reaction system with smart analysis
        this.basicReactions = {
            love: '❤️',      // Love, appreciation, positive emotions
            sad: '😢',       // Sadness, disappointment, sympathy
            angry: '😠',     // Anger, frustration, annoyance
            laugh: '😂',     // Humor, funny content, jokes
            neutral: '👍'    // General approval, neutral positive
        };
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupMessageListener();

        // Force reload environment variables
        require('dotenv').config();
        
        // Auto-enable from environment with debug info
        // console.log('🔍 Environment Check:', {
        //     AUTO_REACT: process.env.AUTO_REACT,
        //     STATUS_AUTO_REACT: process.env.STATUS_AUTO_REACT,
        //     configAUTO_REACT: config.AUTO_REACT,
        //     configSTATUS_AUTO_REACT: config.STATUS_AUTO_REACT
        // });
        
        if (config.AUTO_REACT || process.env.AUTO_REACT === 'true') {
            this.isEnabled = true;
            // console.log('🔥 Auto react enabled from environment');
        }
        
        // Initialize delay settings from config
        this.reactDelayMode = config.REACT_DELAY;

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
            const delay = this.reactDelayMode === 'delay' ? (30000 + Math.random() * 150000) : 0; // 30s to 3min
            
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

}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AutoReactPlugin();
        await plugin.init(bot);
        return plugin;
    }
};