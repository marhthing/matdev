/**
 * MATDEV Auto-Reply Plugin
 * Set custom auto-replies for specific keywords
 */

const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class AutoReplyPlugin {
    constructor() {
        this.name = 'auto-reply';
        this.description = 'Custom auto-reply system for keywords';
        this.version = '1.0.0';
        this.enabled = true;
        this.autoReplies = new Map();
        this.storageFile = path.join(__dirname, '..', 'session', 'auto-replies.json');
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            // Load existing auto-replies
            await this.loadAutoReplies();

            // Register commands
            this.bot.messageHandler.registerCommand('autoreply', this.autoReplyCommand.bind(this), {
                description: 'Manage auto-replies',
                usage: `${config.PREFIX}autoreply <add/remove/list> [keyword] [reply]`,
                category: 'utility',
                plugin: 'auto-reply',
                source: 'auto-reply.js'
            });

            this.bot.messageHandler.registerCommand('ar', this.autoReplyCommand.bind(this), {
                description: 'Manage auto-replies (short)',
                usage: `${config.PREFIX}ar <add/remove/list> [keyword] [reply]`,
                category: 'utility',
                plugin: 'auto-reply',
                source: 'auto-reply.js'
            });

            // Register message listener for auto-replies
            this.registerMessageListener();

            console.log('✅ Auto-Reply plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Auto-Reply plugin:', error);
            return false;
        }
    }

    /**
     * Load auto-replies from storage
     */
    async loadAutoReplies() {
        try {
            if (await fs.pathExists(this.storageFile)) {
                const data = await fs.readJson(this.storageFile);
                this.autoReplies = new Map(Object.entries(data));
                console.log(`📂 Loaded ${this.autoReplies.size} auto-replies`);
            }
        } catch (error) {
            console.error('Error loading auto-replies:', error);
        }
    }

    /**
     * Save auto-replies to storage
     */
    async saveAutoReplies() {
        try {
            await fs.ensureDir(path.dirname(this.storageFile));
            const data = Object.fromEntries(this.autoReplies);
            await fs.writeJson(this.storageFile, data, { spaces: 2 });
        } catch (error) {
            console.error('Error saving auto-replies:', error);
            throw error;
        }
    }

    /**
     * Register message listener for auto-replies
     */
    registerMessageListener() {
        // Register a safe middleware-style message processor
        if (!this.bot.messageHandler.autoReplyProcessors) {
            this.bot.messageHandler.autoReplyProcessors = [];
        }
        
        // Add our processor to the list
        this.bot.messageHandler.autoReplyProcessors.push(this.processAutoReply.bind(this));
        
        // Store reference to original process method
        const originalProcess = this.bot.messageHandler.process.bind(this.bot.messageHandler);
        
        // Only override if not already overridden by auto-reply system
        if (!this.bot.messageHandler._autoReplySystemEnabled) {
            this.bot.messageHandler._autoReplySystemEnabled = true;
            
            // Safe override that supports multiple plugins
            this.bot.messageHandler.process = async (message) => {
                // First call original process to get normal message processing
                await originalProcess(message);
                
                // Then run all auto-reply processors
                if (this.bot.messageHandler.autoReplyProcessors && this.bot.messageHandler.autoReplyProcessors.length > 0) {
                    const jids = this.bot.messageHandler.jidUtils.extractJIDs(message);
                    if (jids && message.message) {
                        // Extract message content - same logic as MessageHandler
                        const messageTypes = Object.keys(message.message || {});
                        let text = '';
                        
                        // Handle media messages with captions first
                        for (const type of messageTypes) {
                            const content = message.message[type];
                            if ((type === 'imageMessage' || type === 'videoMessage' || type === 'documentMessage') && content?.caption) {
                                text = content.caption.trim();
                                break;
                            }
                        }
                        
                        // If no media caption found, try other message types
                        if (!text) {
                            for (const type of messageTypes) {
                                const content = message.message[type];
                                if (typeof content === 'string') {
                                    text = content;
                                    break;
                                } else if (content?.text) {
                                    text = content.text;
                                    break;
                                } else if (content?.caption && !['imageMessage', 'videoMessage', 'documentMessage'].includes(type)) {
                                    text = content.caption;
                                    break;
                                } else if (type === 'editedMessage' && content?.message) {
                                    // Handle edited messages
                                    let editedContent = content.message;
                                    if (editedContent.editedMessage && editedContent.editedMessage.message) {
                                        editedContent = editedContent.editedMessage.message;
                                    }
                                    const editedTypes = Object.keys(editedContent || {});
                                    for (const editedType of editedTypes) {
                                        const editedText = editedContent[editedType];
                                        if (typeof editedText === 'string') {
                                            text = editedText;
                                            break;
                                        } else if (editedText?.text) {
                                            text = editedText.text;
                                            break;
                                        } else if (editedText?.caption) {
                                            text = editedText.caption;
                                            break;
                                        }
                                    }
                                    if (text) break;
                                }
                            }
                        }
                        
                        if (text && text.trim()) {
                            const messageInfo = {
                                content: text.trim(),
                                chat_jid: jids.chat_jid,
                                sender_jid: jids.sender_jid,
                                sender_name: jids.sender_name || 'User',
                                chat_name: jids.chat_name || 'Chat'
                            };
                            
                            // Run all registered auto-reply processors
                            for (const processor of this.bot.messageHandler.autoReplyProcessors) {
                                try {
                                    await processor(messageInfo);
                                } catch (error) {
                                    console.error('Error in auto-reply processor:', error);
                                }
                            }
                        }
                    }
                }
            };
        }
    }

    /**
     * Process incoming messages for auto-replies
     */
    async processAutoReply(messageInfo) {
        try {
            // Skip if message is a command
            if (messageInfo.content && messageInfo.content.startsWith(config.PREFIX)) {
                return;
            }

            // Skip if no content
            if (!messageInfo.content || typeof messageInfo.content !== 'string') {
                return;
            }

            // Check for keyword matches (case-insensitive)
            const content = messageInfo.content.toLowerCase().trim();
            
            for (const [keyword, reply] of this.autoReplies) {
                if (content.includes(keyword.toLowerCase())) {
                    // Process reply variables
                    const processedReply = this.processReplyVariables(reply, messageInfo);
                    
                    // Send auto-reply
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: processedReply
                    });
                    
                    console.log(`🤖 Auto-reply triggered: "${keyword}" -> "${processedReply}"`);
                    break; // Only trigger first match
                }
            }
        } catch (error) {
            console.error('Error processing auto-reply:', error);
        }
    }

    /**
     * Process variables in reply text
     */
    processReplyVariables(reply, messageInfo) {
        let processed = reply;
        
        // Available variables:
        // {name} - Sender's name
        // {chat} - Chat name
        // {time} - Current time
        // {bot} - Bot name
        
        try {
            // Get sender name
            const senderName = messageInfo.sender_name || 'User';
            processed = processed.replace(/\{name\}/g, senderName);
            
            // Get chat name
            const chatName = messageInfo.chat_name || 'Chat';
            processed = processed.replace(/\{chat\}/g, chatName);
            
            // Current time
            const currentTime = new Date().toLocaleTimeString();
            processed = processed.replace(/\{time\}/g, currentTime);
            
            // Bot name
            processed = processed.replace(/\{bot\}/g, config.BOT_NAME);
            
        } catch (error) {
            console.error('Error processing reply variables:', error);
        }
        
        return processed;
    }

    /**
     * Handle auto-reply command
     */
    async autoReplyCommand(messageInfo) {
        try {
            const args = messageInfo.args;
            
            if (!args || args.length === 0) {
                const help = `🤖 *Auto-Reply Management*\n\n` +
                    `*Commands:*\n` +
                    `${config.PREFIX}autoreply add <keyword> <reply> - Add auto-reply\n` +
                    `${config.PREFIX}autoreply remove <keyword> - Remove auto-reply\n` +
                    `${config.PREFIX}autoreply list - List all auto-replies\n\n` +
                    `*Variables in replies:*\n` +
                    `{name} - Sender's name\n` +
                    `{chat} - Chat name\n` +
                    `{time} - Current time\n` +
                    `{bot} - Bot name\n\n` +
                    `*Example:*\n` +
                    `${config.PREFIX}ar add hello Hello {name}! Welcome to {chat}`;
                
                await this.bot.messageHandler.reply(messageInfo, help);
                return;
            }

            const action = args[0].toLowerCase();

            switch (action) {
                case 'add':
                    await this.addAutoReply(messageInfo, args.slice(1));
                    break;
                case 'remove':
                case 'delete':
                    await this.removeAutoReply(messageInfo, args.slice(1));
                    break;
                case 'list':
                    await this.listAutoReplies(messageInfo);
                    break;
                default:
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Invalid action. Use: add, remove, or list\nExample: ${config.PREFIX}ar add hello Hello there!`);
            }

        } catch (error) {
            console.error('Error in auto-reply command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing auto-reply command.');
        }
    }

    /**
     * Add new auto-reply
     */
    async addAutoReply(messageInfo, args) {
        if (args.length < 2) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please provide keyword and reply.\nUsage: ${config.PREFIX}ar add <keyword> <reply>\nExample: ${config.PREFIX}ar add hello Hello {name}!`);
            return;
        }

        const keyword = args[0].toLowerCase();
        const reply = args.slice(1).join(' ');

        // Check if keyword already exists
        if (this.autoReplies.has(keyword)) {
            await this.bot.messageHandler.reply(messageInfo, 
                `⚠️ Auto-reply for "${keyword}" already exists. Use remove first or choose a different keyword.`);
            return;
        }

        try {
            // Add to memory
            this.autoReplies.set(keyword, reply);
            
            // Save to storage
            await this.saveAutoReplies();
            
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Auto-reply added!\n\n*Keyword:* ${keyword}\n*Reply:* ${reply}\n\nNow when someone mentions "${keyword}", the bot will automatically reply.`);
                
        } catch (error) {
            console.error('Error adding auto-reply:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to add auto-reply. Please try again.');
        }
    }

    /**
     * Remove auto-reply
     */
    async removeAutoReply(messageInfo, args) {
        if (args.length === 0) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please provide keyword to remove.\nUsage: ${config.PREFIX}ar remove <keyword>`);
            return;
        }

        const keyword = args[0].toLowerCase();

        if (!this.autoReplies.has(keyword)) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Auto-reply for "${keyword}" not found.`);
            return;
        }

        try {
            // Remove from memory
            const removedReply = this.autoReplies.get(keyword);
            this.autoReplies.delete(keyword);
            
            // Save to storage
            await this.saveAutoReplies();
            
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Auto-reply removed!\n\n*Keyword:* ${keyword}\n*Reply:* ${removedReply}`);
                
        } catch (error) {
            console.error('Error removing auto-reply:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to remove auto-reply. Please try again.');
        }
    }

    /**
     * List all auto-replies
     */
    async listAutoReplies(messageInfo) {
        if (this.autoReplies.size === 0) {
            await this.bot.messageHandler.reply(messageInfo, 
                `📝 No auto-replies configured.\n\nAdd one with: ${config.PREFIX}ar add <keyword> <reply>`);
            return;
        }

        let text = `🤖 *Auto-Replies (${this.autoReplies.size})*\n\n`;
        
        let count = 1;
        for (const [keyword, reply] of this.autoReplies) {
            text += `${count}. *${keyword}*\n   → ${reply}\n\n`;
            count++;
            
            // Prevent message too long
            if (text.length > 3000) {
                text += '... (list truncated due to length)';
                break;
            }
        }
        
        text += `_To remove: ${config.PREFIX}ar remove <keyword>_`;
        
        await this.bot.messageHandler.reply(messageInfo, text);
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        // Save any pending changes
        await this.saveAutoReplies();
        console.log('🧹 Auto-Reply plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AutoReplyPlugin();
        await plugin.init(bot);
        return plugin;
    }
};