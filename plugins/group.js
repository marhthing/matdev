/**
 * MATDEV Group Management Plugin
 * Group-specific features and utilities
 */

const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class GroupPlugin {
    constructor() {
        this.name = 'group';
        this.description = 'Group management and utilities';
        this.version = '1.0.0';
        // Do NOT call this.registerCommands() here
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;

        // Initialize storage for new features
        this.initializeStorage();

        // Register commands and events only after bot is set
        this.registerCommands();
        this.registerGroupEvents();
        this.registerMessageHandler();

        console.log('✅ Group plugin loaded');
    }

    /**
     * Initialize storage for group features
     */
    initializeStorage() {
        // Initialize group data storage for activity stats, etc.
        if (!this.bot.database) {
            console.warn('⚠️ Database not available for group plugin');
            return;
        }

        // Initialize default data structures
        this.ensureGroupData('activity_stats', {});
    }

    /**
     * Ensure group data structure exists
     */
    ensureGroupData(key, defaultValue) {
        try {
            if (!this.bot.database.getData(key)) {
                this.bot.database.setData(key, defaultValue);
            }
        } catch (error) {
            console.error(`Error initializing ${key}:`, error);
        }
    }

    /**
     * Register group commands
     */
    registerCommands() {
        // Defensive: do nothing if this.bot or this.bot.messageHandler is not set
        if (!this.bot || !this.bot.messageHandler) {
            console.error('GroupPlugin: this.bot or this.bot.messageHandler is not set before registerCommands(). Skipping command registration.');
            return;
        }
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


        // Add user command
        this.bot.messageHandler.registerCommand('add', this.addUser.bind(this), {
            description: 'Add a user to the group by JID or phone number (admin only)',
            usage: `${config.PREFIX}add <jid|phone>`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Promote user command
        this.bot.messageHandler.registerCommand('promote', this.promoteUser.bind(this), {
            description: 'Promote a user to admin (admin only)',
            usage: `${config.PREFIX}promote @user`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Demote user command
        this.bot.messageHandler.registerCommand('demote', this.demoteUser.bind(this), {
            description: 'Remove admin status from a user (admin only)',
            usage: `${config.PREFIX}demote @user`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Lock group command (admin only)
        this.bot.messageHandler.registerCommand('lock', this.lockGroup.bind(this), {
            description: 'Restrict messaging to admins only (admin only)',
            usage: `${config.PREFIX}lock`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Unlock group command (admin only)
        this.bot.messageHandler.registerCommand('unlock', this.unlockGroup.bind(this), {
            description: 'Allow everyone to send messages (admin only)',
            usage: `${config.PREFIX}unlock`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Greeting control command (admin only)
        this.bot.messageHandler.registerCommand('greeting', this.greetingCommand.bind(this), {
            description: 'Control welcome/goodbye messages (admin only)',
            usage: `${config.PREFIX}greeting [on/off] [welcome/goodbye] [on/off]`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Group info command
        this.bot.messageHandler.registerCommand('groupinfo', this.groupInfoCommand.bind(this), {
            description: 'Show group information and statistics',
            usage: `${config.PREFIX}groupinfo`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Set group name command (admin only)
        this.bot.messageHandler.registerCommand('setname', this.setGroupNameCommand.bind(this), {
            description: 'Change group name (admin only)',
            usage: `${config.PREFIX}setname <new name>`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Set group description command (admin only)
        this.bot.messageHandler.registerCommand('setdesc', this.setGroupDescCommand.bind(this), {
            description: 'Change group description (admin only)',
            usage: `${config.PREFIX}setdesc <new description>`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Get group invite link command (admin only)
        this.bot.messageHandler.registerCommand('grouplink', this.getGroupLinkCommand.bind(this), {
            description: 'Get group invite link (admin only)',
            usage: `${config.PREFIX}grouplink`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Revoke group invite link command (admin only)
        this.bot.messageHandler.registerCommand('revokelink', this.revokeGroupLinkCommand.bind(this), {
            description: 'Revoke current group invite link (admin only)',
            usage: `${config.PREFIX}revokelink`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });



        // Anti-link system command
        this.bot.messageHandler.registerCommand('antilink', this.antilinkCommand.bind(this), {
            description: 'Toggle anti-link protection (admin only)',
            usage: `${config.PREFIX}antilink [on/off]`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Set group profile picture command (admin only)
        this.bot.messageHandler.registerCommand('setpp', this.setGroupProfilePicture.bind(this), {
            description: 'Set group profile picture (admin only)',
            usage: `${config.PREFIX}setpp [tag an image or add to image caption]`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });


    }

    /**
     * Helper: Check if sender is allowed
     */
    isAllowedUser(senderJid) {
        const ownerJid = this.bot.sock.user?.id;
        // You can add allowed JIDs here
        const allowedUsers = [ownerJid, ...(this.bot.config.ALLOWED_USERS || [])];
        return allowedUsers.includes(senderJid);
    }

    /**
     * Helper: Check if sender is admin (LID/phoneNumber compatible)
     */
    async isUserAdmin(chat_jid, sender_jid, groupMetadata) {
        // Use improved admin detection for all cases
        return await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
    }

    /**
     * Improved admin detection for WhatsApp and LID accounts
     */
    async isUserAdminImproved(chat_jid, sender_jid, groupMetadata) {
        // If groupMetadata not provided, fetch it
        if (!groupMetadata) {
            groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        }
        if (!groupMetadata || !groupMetadata.participants) return false;

        // Direct match (JID)
        let senderParticipant = groupMetadata.participants.find(p => p.id === sender_jid);
        if (senderParticipant && (senderParticipant.admin === 'admin' || senderParticipant.admin === 'superadmin')) {
            return true;
        }

        // Try matching by phone number for WhatsApp JIDs
        if (sender_jid.endsWith('@s.whatsapp.net')) {
            const senderNum = sender_jid.replace('@s.whatsapp.net', '');
            senderParticipant = groupMetadata.participants.find(p => {
                if (!p.phoneNumber) return false;
                // phoneNumber can be '2348012345678@s.whatsapp.net'
                return p.phoneNumber.replace('@s.whatsapp.net', '') === senderNum && (p.admin === 'admin' || p.admin === 'superadmin');
            });
            if (senderParticipant) return true;
        }

        // Baileys LID fallback: try to match LID mapping if available
        if (sender_jid.endsWith('@lid')) {
            senderParticipant = groupMetadata.participants.find(p => {
                if (!p.phoneNumber) return false;
                // Try to match the phoneNumber field to the sender's phone
                return p.id === sender_jid && (p.admin === 'admin' || p.admin === 'superadmin');
            });
            if (senderParticipant) return true;
        }
        return false;
    }

    /**
     * Unified tag command - handles both everyone and admin tagging
     */
    async tagCommand(messageInfo) {
        // Only allow outgoing messages from owner or allowed users
        if (!messageInfo.key.fromMe && !this.isAllowedUser(messageInfo.sender_jid)) {
            return; // Ignore silently or reply with error
        }

        // Check if this is a group chat
        if (!messageInfo.is_group) {
            return; // Silently ignore if not in group
        }

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
        if (!messageInfo.key.fromMe && !this.isAllowedUser(messageInfo.sender_jid)) {
            return;
        }

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
        if (!messageInfo.key.fromMe && !this.isAllowedUser(messageInfo.sender_jid)) {
            return;
        }

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
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, message } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
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
     * Add user to group (admin only)
     */
    async addUser(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, args, message } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            let targetInput = null;
            let targetJid = null;

            // First, try to extract from quoted/tagged message
            const quotedMessage = message?.extendedTextMessage?.contextInfo?.quotedMessage;
            if (quotedMessage) {
                // Try to extract phone number from quoted message
                targetInput = await this.extractPhoneFromMessage(quotedMessage);

                if (targetInput) {
                    console.log(`📱 Extracted phone number from tagged message: ${targetInput}`);
                }
            }

            // If no phone found in quoted message, check args
            if (!targetInput && args && args.length > 0) {
                // First try the first argument
                targetInput = args[0];

                // If first argument looks incomplete (too short after cleaning), try joining all args
                const testClean = targetInput.replace(/\D/g, '');
                if (testClean.length < 8 && args.length > 1) {
                    // Join all arguments with spaces to handle "234 913 504 8063" format
                    targetInput = args.join(' ');
                    console.log(`📱 Joined all arguments: "${targetInput}"`);
                }
            }

            // If still no input, show usage
            if (!targetInput) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a JID or phone number to add, or tag a message containing a phone number/contact.\n\n' +
                    'Examples:\n' +
                    '• `.add 234701234567`\n' +
                    '• `.add 234701234567@s.whatsapp.net`\n' +
                    '• Tag a message with phone number and use `.add`\n' +
                    '• Tag a contact message and use `.add`'
                );
                return;
            }

            // Convert phone number to JID format if needed
            if (targetInput.includes('@')) {
                // Already in JID format
                targetJid = targetInput;
                console.log(`📱 Using provided JID: ${targetJid}`);
            } else {
                // Convert phone number to JID
                console.log(`📱 Raw input received: "${targetInput}"`);
                console.log(`📱 Input length: ${targetInput.length}`);
                console.log(`📱 Input characters: ${targetInput.split('').map(c => `'${c}'`).join(', ')}`);

                // Remove any non-digit characters (spaces, +, etc.)
                let cleanPhone = targetInput.replace(/\D/g, '');

                console.log(`📱 After cleaning: "${cleanPhone}"`);
                console.log(`📱 Clean phone length: ${cleanPhone.length}`);

                // Handle various international formats
                if (cleanPhone.length < 8) {
                    console.log(`❌ Phone validation failed: ${cleanPhone.length} digits (minimum 8 required)`);
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Invalid phone number. Please provide a valid phone number (minimum 8 digits) or JID.\n\n` +
                        `Received: "${targetInput}"\n` +
                        `Cleaned to: "${cleanPhone}" (${cleanPhone.length} digits)\n\n` +
                        'Examples:\n' +
                        '• `+234 913 504 8063`\n' +
                        '• `234913504063`\n' +
                        '• `2349135048063`'
                    );
                    return;
                }

                console.log(`✅ Phone validation passed: ${cleanPhone} (${cleanPhone.length} digits)`);
                targetJid = `${cleanPhone}@s.whatsapp.net`;
                // console.log(`📱 Final JID: ${targetJid}`);
            }

            // Check if user is already in the group
            const existingParticipant = groupMetadata.participants.find(p => p.id === targetJid);
            if (existingParticipant) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ User is already in this group.'
                );
                return;
            }

            // Get display name for the target user
            let displayName = targetJid;
            if (displayName.includes('@s.whatsapp.net')) {
                displayName = displayName.replace('@s.whatsapp.net', '');
            } else if (displayName.includes('@lid')) {
                displayName = displayName.split('@')[0];
            }

            try {
                // Attempt to add the user directly
                const addResult = await this.bot.sock.groupParticipantsUpdate(chat_jid, [targetJid], 'add');

                // Check if the add was successful
                if (addResult && addResult[0] && addResult[0].status === '200') {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `✅ User @${displayName} has been added to the group successfully.`
                    );
                } else {
                    // Add failed, try to send invitation link
                    await this.sendInvitationLink(messageInfo, targetJid, displayName, chat_jid);
                }

            } catch (addError) {
                console.error('Direct add failed:', addError);
                // Add failed, try to send invitation link
                await this.sendInvitationLink(messageInfo, targetJid, displayName, chat_jid);
            }

        } catch (error) {
            console.error('Error in addUser:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to add user. Please try again or check if I have admin permissions.'
            );
        }
    }

    /**
     * Promote user to admin (admin only)
     */
    async promoteUser(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, message } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
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
                    '❌ Please reply to a message or mention (@) the user you want to promote.'
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

            // Check if user is already an admin
            if (targetParticipant.admin === 'admin' || targetParticipant.admin === 'superadmin') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ User is already an admin.'
                );
                return;
            }

            // Prevent promoting yourself (redundant but safe)
            if (targetJid === sender_jid) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ You cannot promote yourself.'
                );
                return;
            }

            // Prevent promoting the bot
            if (targetJid === this.bot.sock.user?.id) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Cannot promote the bot.'
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

            // Perform the promotion
            await this.bot.sock.groupParticipantsUpdate(chat_jid, [targetJid], 'promote');

            // Send confirmation message with proper mention
            await this.bot.sock.sendMessage(chat_jid, {
                text: `✅ User @${displayName} has been promoted to admin.`,
                mentions: [targetJid]
            });

        } catch (error) {
            console.error('Error in promote user:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to promote user. Please try again or check if I have admin permissions.'
            );
        }
    }

    /**
     * Demote user from admin (admin only)
     */
    async demoteUser(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, message } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
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
                    '❌ Please reply to a message or mention (@) the user you want to demote.'
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

            // Check if user is actually an admin
            if (targetParticipant.admin !== 'admin' && targetParticipant.admin !== 'superadmin') {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ User is not an admin.'
                );
                return;
            }

            // Prevent demoting super admins (unless you're also superadmin)
            if (targetParticipant.admin === 'superadmin' && !await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Only super admins can demote other super admins.'
                );
                return;
            }

            // Prevent self-demotion
            if (targetJid === sender_jid) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ You cannot demote yourself.'
                );
                return;
            }

            // Prevent demoting the bot
            if (targetJid === this.bot.sock.user?.id) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Cannot demote the bot.'
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

            // Perform the demotion
            await this.bot.sock.groupParticipantsUpdate(chat_jid, [targetJid], 'demote');

            // Send confirmation message with proper mention
            await this.bot.sock.sendMessage(chat_jid, {
                text: `✅ User @${displayName} has been demoted from admin.`,
                mentions: [targetJid]
            });

        } catch (error) {
            console.error('Error in demote user:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to demote user. Please try again or check if I have admin permissions.'
            );
        }
    }

    /**
     * Lock group (admin only)
     */
    async lockGroup(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            // Check if group is already locked
            if (groupMetadata.announce) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '⚠️ Group is already locked. Only admins can send messages.'
                );
                return;
            }

            // Lock the group (announcement mode - only admins can send messages)
            await this.bot.sock.groupSettingUpdate(chat_jid, 'announcement');

        } catch (error) {
            console.error('Error in lock group:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to lock group. Please try again or check bot permissions.'
            );
        }
    }

    /**
     * Unlock group (admin only)
     */
    async unlockGroup(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            // Check if group is already unlocked
            if (!groupMetadata.announce) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '⚠️ Group is already unlocked. Everyone can send messages.'
                );
                return;
            }

            // Unlock the group (disable announcement mode - everyone can send messages)
            await this.bot.sock.groupSettingUpdate(chat_jid, 'not_announcement');

        } catch (error) {
            console.error('Error in unlock group:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to unlock group. Please try again or check bot permissions.'
            );
        }
    }

    /**
     * Greeting control command (admin only)
     */
    async greetingCommand(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, args } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            // If no arguments, show current status
            if (args.length === 0) {
                const status = `🎉 *Greeting Settings*\n\n` +
                    `📊 *Overall:* ${config.GREETING_ENABLED ? '✅ Enabled' : '❌ Disabled'}\n` +
                    `👋 *Welcome:* ${config.GREETING_WELCOME ? '✅ Enabled' : '❌ Disabled'}\n` +
                    `👋 *Goodbye:* ${config.GREETING_GOODBYE ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                    `*Usage:*\n` +
                    `• \`${config.PREFIX}greeting on/off\` - Toggle all greetings\n` +
                    `• \`${config.PREFIX}greeting welcome on/off\` - Toggle welcome only\n` +
                    `• \`${config.PREFIX}greeting goodbye on/off\` - Toggle goodbye only`;

                await this.bot.messageHandler.reply(messageInfo, status);
                return;
            }

            const command = args[0].toLowerCase();

            // Handle main greeting toggle
            if (command === 'on' || command === 'off') {
                const enabled = command === 'on';
                await this.updateEnvSetting('GREETING_ENABLED', enabled.toString());
                config.GREETING_ENABLED = enabled;

                await this.bot.messageHandler.reply(messageInfo, 
                    `🎉 Greetings ${enabled ? 'enabled' : 'disabled'} successfully!`
                );
                return;
            }

            // Handle specific greeting type toggles
            if (command === 'welcome' || command === 'goodbye') {
                if (args.length < 2) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Please specify on/off for ${command}.\nUsage: \`${config.PREFIX}greeting ${command} on/off\``
                    );
                    return;
                }

                const action = args[1].toLowerCase();
                if (action !== 'on' && action !== 'off') {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Invalid action. Use 'on' or 'off'.`
                    );
                    return;
                }

                const enabled = action === 'on';
                const envKey = command === 'welcome' ? 'GREETING_WELCOME' : 'GREETING_GOODBYE';

                await this.updateEnvSetting(envKey, enabled.toString());

                if (command === 'welcome') {
                    config.GREETING_WELCOME = enabled;
                } else {
                    config.GREETING_GOODBYE = enabled;
                }

                await this.bot.messageHandler.reply(messageInfo, 
                    `👋 ${command.charAt(0).toUpperCase() + command.slice(1)} messages ${enabled ? 'enabled' : 'disabled'} successfully!`
                );
                return;
            }

            // Invalid command
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Invalid usage. Use:\n` +
                `• \`${config.PREFIX}greeting\` - Show status\n` +
                `• \`${config.PREFIX}greeting on/off\` - Toggle all\n` +
                `• \`${config.PREFIX}greeting welcome on/off\`\n` +
                `• \`${config.PREFIX}greeting goodbye on/off\``
            );

        } catch (error) {
            console.error('Error in greeting command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to update greeting settings. Please try again.'
            );
        }
    }

    /**
     * Set group name (admin only)
     */
    async setGroupNameCommand(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, args } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            // Check if new name is provided
            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a new group name.\n\nUsage: \`${config.PREFIX}setname <new name>\``
                );
                return;
            }

            const newName = args.join(' ').trim();

            if (newName.length > 100) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Group name is too long. Maximum 100 characters allowed.'
                );
                return;
            }

            // Update group name
            await this.bot.sock.groupUpdateSubject(chat_jid, newName);

        } catch (error) {
            console.error('Error in setname command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to update group name. Please try again or check bot permissions.'
            );
        }
    }

    /**
     * Set group description (admin only)
     */
    async setGroupDescCommand(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, args } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            // Check if new description is provided
            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a new group description.\n\nUsage: \`${config.PREFIX}setdesc <new description>\``
                );
                return;
            }

            const newDesc = args.join(' ').trim();

            if (newDesc.length > 512) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Group description is too long. Maximum 512 characters allowed.'
                );
                return;
            }

            // Update group description
            await this.bot.sock.groupUpdateDescription(chat_jid, newDesc);

        } catch (error) {
            console.error('Error in setdesc command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to update group description. Please try again or check bot permissions.'
            );
        }
    }

    /**
     * Get group invite link (admin only)
     */
    async getGroupLinkCommand(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            // Get group invite code
            const inviteCode = await this.bot.sock.groupInviteCode(chat_jid);
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

            await this.bot.messageHandler.reply(messageInfo, inviteLink);

        } catch (error) {
            console.error('Error in grouplink command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to get group invite link. Please try again or check bot permissions.'
            );
        }
    }

    /**
     * Revoke group invite link (admin only)
     */
    async revokeGroupLinkCommand(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            // Revoke current invite link
            await this.bot.sock.groupRevokeInvite(chat_jid);

        } catch (error) {
            console.error('Error in revokelink command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to revoke group invite link. Please try again or check bot permissions.'
            );
        }
    }

    /**
     * Set group profile picture (admin only)
     */
    async setGroupProfilePicture(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            let imageMessage = null;
            let messageToDownload = null;

            // Check if this is an image with .setpp as caption
            const directImage = messageInfo.message?.imageMessage;

            if (directImage) {
                // Direct image with .setpp caption
                imageMessage = directImage;
                messageToDownload = {
                    key: messageInfo.key,
                    message: messageInfo.message
                };
            } else {
                // Check for quoted message
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                    messageInfo.message?.quotedMessage;

                if (!quotedMessage || !quotedMessage.imageMessage) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Please reply to an image or send an image with .setpp as caption.'
                    );
                    return;
                }

                imageMessage = quotedMessage.imageMessage;
                messageToDownload = {
                    key: messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage?.key || 
                         messageInfo.key,
                    message: quotedMessage
                };
            }

            try {
                // Download the image
                const imageBuffer = await downloadMediaMessage(messageToDownload, 'buffer', {});

                if (!imageBuffer || imageBuffer.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Failed to download image. Please try again.'
                    );
                    return;
                }

                // Set the group profile picture
                await this.bot.sock.updateProfilePicture(chat_jid, imageBuffer);

            } catch (error) {
                console.error('Error downloading quoted image:', error);
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to update group profile picture. Please ensure the image is valid and try again.'
                );
            }

        } catch (error) {
            console.error('Error in setGroupProfilePicture:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while updating the group profile picture.'
            );
        }
    }

    /**
     * Anti-link system command (admin only)
     */
    async antilinkCommand(messageInfo) {
        // Check admin permissions - support both bot owner and group admins
        const { chat_jid, sender_jid, args } = messageInfo;
        const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
        const isBotOwner = messageInfo.key.fromMe || this.isAllowedUser(sender_jid);
        const isAdmin = await this.isUserAdminImproved(chat_jid, sender_jid, groupMetadata);
        if (!isBotOwner && !isAdmin) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
            return;
        }
        if (!messageInfo.is_group) return;
        if (!groupMetadata || !groupMetadata.participants) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group information.');
            return;
        }

        try {
            if (args.length === 0) {
                // Show current status
                const enabled = await this.isAntilinkEnabled(chat_jid);
                await this.bot.messageHandler.reply(messageInfo, 
                    `🔗 *Anti-link Status*\n\n` +
                    `Status: ${enabled ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                    `Usage: ${config.PREFIX}antilink [on/off]`
                );
                return;
            }

            const action = args[0].toLowerCase();

            if (action === 'on' || action === 'off') {
                const enabled = action === 'on';
                await this.setAntilinkStatus(chat_jid, enabled);
                await this.bot.messageHandler.reply(messageInfo, 
                    `🔗 Anti-link protection ${enabled ? 'enabled' : 'disabled'} successfully!`
                );
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Invalid usage. Use: ${config.PREFIX}antilink [on/off]`
                );
            }

        } catch (error) {
            console.error('Error in antilink command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to process antilink command.');
        }
    }

    /**
     * Register group events (participant add/remove)
     */
    registerGroupEvents() {
        // Placeholder for group events
        console.log('📋 Group events registered');
    }

    /**
     * Register message handler for anti-link
     */
    registerMessageHandler() {
        // Placeholder for message handler
        console.log('📋 Message handler registered');
    }

    /**
     * Update environment setting
     */
    async updateEnvSetting(key, value) {
        try {
            const envPath = path.join(__dirname, '..', '.env');
            if (!fs.existsSync(envPath)) {
                console.warn('⚠️ .env file not found');
                return false;
            }
            
            let envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');
            let found = false;
            
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith(`${key}=`)) {
                    lines[i] = `${key}=${value}`;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                lines.push(`${key}=${value}`);
            }
            
            fs.writeFileSync(envPath, lines.join('\n'));
            process.env[key] = value;
            return true;
        } catch (error) {
            console.error('Error updating .env:', error);
            return false;
        }
    }

    /**
     * Extract phone from message
     */
    async extractPhoneFromMessage(message) {
        const text = message?.conversation || message?.extendedTextMessage?.text || '';
        const phoneMatch = text.match(/\+?\d[\d\s-]{7,}/);
        return phoneMatch ? phoneMatch[0] : null;
    }

    /**
     * Send invitation link
     */
    async sendInvitationLink(messageInfo, targetJid, displayName, chatJid) {
        try {
            const inviteCode = await this.bot.sock.groupInviteCode(chatJid);
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            
            await this.bot.sock.sendMessage(targetJid, {
                text: `📨 You've been invited to join the group!\n\n${inviteLink}`
            });
            
            await this.bot.messageHandler.reply(messageInfo, 
                `📨 Invitation link sent to @${displayName}`
            );
        } catch (error) {
            console.error('Error sending invitation:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to send invitation link.'
            );
        }
    }

    /**
     * Check if antilink is enabled for group
     */
    async isAntilinkEnabled(chatJid) {
        // Placeholder - implement with your database
        return false;
    }

    /**
     * Set antilink status for group
     */
    async setAntilinkStatus(chatJid, enabled) {
        // Placeholder - implement with your database
        console.log(`Antilink ${enabled ? 'enabled' : 'disabled'} for ${chatJid}`);
    }

    /**
     * Group info command
     */
    async groupInfoCommand(messageInfo) {
        try {
            const groupMetadata = await this.bot.sock.groupMetadata(messageInfo.chat_jid);
            const info = `📊 *Group Info*\n\n` +
                `Name: ${groupMetadata.subject}\n` +
                `Participants: ${groupMetadata.participants.length}\n` +
                `Created: ${new Date(groupMetadata.creation * 1000).toLocaleDateString()}`;
            
            await this.bot.messageHandler.reply(messageInfo, info);
        } catch (error) {
            console.error('Error in groupinfo:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get group info.');
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
