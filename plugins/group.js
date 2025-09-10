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
        // Tag admins only command
        this.bot.messageHandler.registerCommand('tag', this.tagCommand.bind(this), {
            description: 'Tag everyone or admins only',
            usage: `${config.PREFIX}tag [admin]`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Kick user command
        this.bot.messageHandler.registerCommand('kick', this.kickUser.bind(this), {
            description: 'Remove a user from the group (admin only)',
            usage: `${config.PREFIX}kick @user`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Temporary kick user command
        this.bot.messageHandler.registerCommand('tempkick', this.tempKickUser.bind(this), {
            description: 'Temporarily remove a user from the group for 5 minutes (admin only)',
            usage: `${config.PREFIX}tempkick @user`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });
    }

    /**
     * Unified tag command - handles both everyone and admin tagging
     */
    async tagCommand(messageInfo) {
        const { args } = messageInfo;
        
        // Check if first argument is "admin"
        if (args.length > 0 && args[0].toLowerCase() === 'admin') {
            return this.tagAdmins(messageInfo);
        } else {
            // Call regular tag everyone
            return this.tagEveryone(messageInfo);
        }
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
            
            // Build message
            let messageText = `👥 *Tagging Everyone* (${participants.length} members)\n\n`;
            
            // Add mentions in numbered list format
            for (let i = 0; i < participants.length; i++) {
                let displayName = participants[i].id;
                
                // Clean up display for different account types
                if (displayName.includes('@lid')) {
                    // For business accounts, try to get a cleaner display
                    displayName = displayName.split('@')[0];
                } else if (displayName.includes('@s.whatsapp.net')) {
                    // For regular accounts, show phone number
                    displayName = displayName.replace('@s.whatsapp.net', '');
                }
                
                messageText += `${i + 1}. @${displayName}\n`;
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
     * Tag only group admins
     */
    async tagAdmins(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
            // Check if this is a group chat
            if (!chat_jid.endsWith('@g.us')) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ This command can only be used in group chats.'
                );
                return;
            }

            // Get group metadata to get participants and their roles
            const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
            
            if (!groupMetadata || !groupMetadata.participants) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to get group information.'
                );
                return;
            }

            // Filter only admins and super admins
            const admins = groupMetadata.participants.filter(participant => {
                return participant.admin === 'admin' || participant.admin === 'superadmin';
            });

            if (admins.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ No admins found in this group.'
                );
                return;
            }

            // Build mentions array
            const mentions = admins.map(admin => admin.id);
            
            // Build message
            let messageText = `👑 *Tagging Admins* (${admins.length} admins)\n\n`;
            
            // Add mentions in numbered list format
            for (let i = 0; i < admins.length; i++) {
                let displayName = admins[i].id;
                
                // Clean up display for different account types
                if (displayName.includes('@lid')) {
                    // For business accounts, try to get a cleaner display
                    displayName = displayName.split('@')[0];
                } else if (displayName.includes('@s.whatsapp.net')) {
                    // For regular accounts, show phone number
                    displayName = displayName.replace('@s.whatsapp.net', '');
                }
                
                const adminLevel = admins[i].admin === 'superadmin' ? '👑' : '⭐';
                messageText += `${i + 1}. ${adminLevel} @${displayName}\n`;
            }

            // Send message with mentions
            await this.bot.sock.sendMessage(chat_jid, {
                text: messageText.trim(),
                mentions: mentions
            });

        } catch (error) {
            console.error('Error in tag admins:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to tag admins. Please try again.'
            );
        }
    }

    /**
     * Kick user from group (admin only)
     */
    async kickUser(messageInfo) {
        try {
            const { chat_jid, sender_jid, message } = messageInfo;
            
            // Check if this is a group chat
            if (!chat_jid.endsWith('@g.us')) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ This command can only be used in group chats.'
                );
                return;
            }

            // Get group metadata to check admin status
            const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
            
            if (!groupMetadata || !groupMetadata.participants) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to get group information.'
                );
                return;
            }

            // Check if the command sender is an admin
            const senderParticipant = groupMetadata.participants.find(p => p.id === sender_jid);
            if (!senderParticipant || (senderParticipant.admin !== 'admin' && senderParticipant.admin !== 'superadmin')) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Only group admins can use this command.'
                );
                return;
            }

            // Get target user from quoted message or mentions
            let targetJid = null;

            // Check for quoted message first
            const quotedMessage = message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage) {
                const quotedParticipant = message?.extendedTextMessage?.contextInfo?.participant;
                if (quotedParticipant) {
                    targetJid = quotedParticipant;
                }
            }

            // Check for mentions if no quoted message
            if (!targetJid && message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = message.extendedTextMessage.contextInfo.mentionedJid[0];
            }

            if (!targetJid) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a message or mention (@) the user you want to kick.'
                );
                return;
            }

            // Check if target is in the group
            const targetParticipant = groupMetadata.participants.find(p => p.id === targetJid);
            if (!targetParticipant) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ User is not in this group.'
                );
                return;
            }

            // Prevent kicking other admins (unless you're superadmin)
            if (targetParticipant.admin === 'superadmin') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Cannot kick a super admin.'
                );
                return;
            }

            if (targetParticipant.admin === 'admin' && senderParticipant.admin !== 'superadmin') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Only super admins can kick other admins.'
                );
                return;
            }

            // Prevent self-kick
            if (targetJid === sender_jid) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ You cannot kick yourself.'
                );
                return;
            }

            // Prevent kicking the bot
            if (targetJid === this.bot.sock.user?.id) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Cannot kick the bot.'
                );
                return;
            }

            // Get display name for the target user
            let displayName = targetJid;
            if (displayName.includes('@lid')) {
                displayName = displayName.split('@')[0];
            } else if (displayName.includes('@s.whatsapp.net')) {
                displayName = displayName.replace('@s.whatsapp.net', '');
            }

            // Perform the kick
            await this.bot.sock.groupParticipantsUpdate(chat_jid, [targetJid], 'remove');

            // Send confirmation message
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ User @${displayName} has been removed from the group.`
            );

        } catch (error) {
            console.error('Error in kick user:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to kick user. Please try again or check if I have admin permissions.'
            );
        }
    }

    /**
     * Temporarily kick user from group (admin only)
     */
    async tempKickUser(messageInfo) {
        try {
            const { chat_jid, sender_jid, message } = messageInfo;
            
            // Check if this is a group chat
            if (!chat_jid.endsWith('@g.us')) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ This command can only be used in group chats.'
                );
                return;
            }

            // Get group metadata to check admin status
            const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
            
            if (!groupMetadata || !groupMetadata.participants) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to get group information.'
                );
                return;
            }

            // Check if the command sender is an admin
            const senderParticipant = groupMetadata.participants.find(p => p.id === sender_jid);
            if (!senderParticipant || (senderParticipant.admin !== 'admin' && senderParticipant.admin !== 'superadmin')) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Only group admins can use this command.'
                );
                return;
            }

            // Get target user from quoted message or mentions
            let targetJid = null;

            // Check for quoted message first
            const quotedMessage = message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage) {
                const quotedParticipant = message?.extendedTextMessage?.contextInfo?.participant;
                if (quotedParticipant) {
                    targetJid = quotedParticipant;
                }
            }

            // Check for mentions if no quoted message
            if (!targetJid && message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = message.extendedTextMessage.contextInfo.mentionedJid[0];
            }

            if (!targetJid) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a message or mention (@) the user you want to temporarily kick.'
                );
                return;
            }

            // Check if target is in the group
            const targetParticipant = groupMetadata.participants.find(p => p.id === targetJid);
            if (!targetParticipant) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ User is not in this group.'
                );
                return;
            }

            // Prevent kicking other admins (unless you're superadmin)
            if (targetParticipant.admin === 'superadmin') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Cannot temporarily kick a super admin.'
                );
                return;
            }

            if (targetParticipant.admin === 'admin' && senderParticipant.admin !== 'superadmin') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Only super admins can temporarily kick other admins.'
                );
                return;
            }

            // Prevent self-kick
            if (targetJid === sender_jid) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ You cannot temporarily kick yourself.'
                );
                return;
            }

            // Prevent kicking the bot
            if (targetJid === this.bot.sock.user?.id) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Cannot temporarily kick the bot.'
                );
                return;
            }

            // Get display name for the target user
            let displayName = targetJid;
            if (displayName.includes('@lid')) {
                displayName = displayName.split('@')[0];
            } else if (displayName.includes('@s.whatsapp.net')) {
                displayName = displayName.replace('@s.whatsapp.net', '');
            }

            // Perform the temporary kick
            await this.bot.sock.groupParticipantsUpdate(chat_jid, [targetJid], 'remove');

            // Send confirmation message
            await this.bot.messageHandler.reply(messageInfo, 
                `⏰ User @${displayName} has been temporarily removed from the group.\nThey will be added back in 5 minutes.`
            );

            // Set timeout to add them back after 5 minutes (300,000 milliseconds)
            setTimeout(async () => {
                try {
                    // Add the user back to the group
                    await this.bot.sock.groupParticipantsUpdate(chat_jid, [targetJid], 'add');
                    
                    // Send notification
                    await this.bot.sock.sendMessage(chat_jid, {
                        text: `✅ User @${displayName} has been added back to the group after temporary kick.`,
                        mentions: [targetJid]
                    });
                } catch (error) {
                    console.error('Error adding user back after temp kick:', error);
                    
                    // Notify about the error
                    await this.bot.sock.sendMessage(chat_jid, {
                        text: `❌ Failed to add @${displayName} back to the group automatically. Please add them back manually.`
                    });
                }
            }, 5 * 60 * 1000); // 5 minutes

        } catch (error) {
            console.error('Error in temp kick user:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to temporarily kick user. Please try again or check if I have admin permissions.'
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