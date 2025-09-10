/**
 * MATDEV Group Management Plugin
 * Group-specific features and utilities
 */

const config = require('../config');

class GroupPlugin {
    constructor() {
        this.name = 'group';
        this.description = 'Group management and utilities';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Group plugin loaded');
    }

    /**
     * Register group commands
     */
    registerCommands() {
        // Tag everyone command
        this.bot.messageHandler.registerCommand('tag', this.tagEveryone.bind(this), {
            description: 'Tag everyone in the group',
            usage: `${config.PREFIX}tag [message]`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });
    }

    /**
     * Tag everyone in the group
     */
    async tagEveryone(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
            // Check if this is a group chat
            if (!chat_jid.endsWith('@g.us')) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ This command can only be used in group chats.'
                );
                return;
            }

            // Get group metadata to get participants
            const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
            
            if (!groupMetadata || !groupMetadata.participants) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to get group information.'
                );
                return;
            }

            // Get all participants (excluding bots if needed)
            const participants = groupMetadata.participants.filter(participant => {
                // Exclude the bot itself from mentions
                return participant.id !== this.bot.sock.user?.id;
            });

            if (participants.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No participants found to tag.'
                );
                return;
            }

            // Build mentions array
            const mentions = participants.map(participant => participant.id);
            
            // Build message with optional custom text
            let messageText = '';
            if (args.length > 0) {
                messageText = args.join(' ') + '\n\n';
            }
            
            messageText += `👥 *Tagging Everyone* (${participants.length} members)\n\n`;
            
            // Add mentions in numbered list format
            for (let i = 0; i < participants.length; i++) {
                const phoneNumber = participants[i].id.replace('@s.whatsapp.net', '');
                messageText += `${i + 1}. @${phoneNumber}\n`;
            }

            // Send message with mentions
            await this.bot.sock.sendMessage(chat_jid, {
                text: messageText.trim(),
                mentions: mentions
            });

        } catch (error) {
            console.error('Error in tag everyone:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to tag everyone. Please try again.'
            );
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Group plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new GroupPlugin();
        await plugin.init(bot);
        return plugin;
    }
};