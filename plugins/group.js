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
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        
        // Initialize storage for new features
        this.initializeStorage();
        
        this.registerCommands();
        this.registerGroupEvents();
        this.registerMessageHandler();
        
        console.log('✅ Group plugin loaded');
    }

    /**
     * Initialize storage for group features
     */
    initializeStorage() {
        // Initialize group data storage for filters, warnings, mutes, etc.
        if (!this.bot.database) {
            console.warn('⚠️ Database not available for group plugin');
            return;
        }
        
        // Initialize default data structures
        this.ensureGroupData('filters', {});
        this.ensureGroupData('filter_settings', {});
        this.ensureGroupData('warnings', {});
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

        // Filter system commands
        this.bot.messageHandler.registerCommand('filter', this.filterCommand.bind(this), {
            description: 'Manage word filters (admin only)',
            usage: `${config.PREFIX}filter [add/remove <word>] [on/off] [<warn_count>warn] [kick]`,
            category: 'group',
            plugin: 'group',
            source: 'group.js',
            groupOnly: true
        });

        // Warning system commands
        this.bot.messageHandler.registerCommand('warn', this.warnCommand.bind(this), {
            description: 'Warning system for users (admin only)',
            usage: `${config.PREFIX}warn [@user] [clear @user] [list @user]`,
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
     * Add user to group (admin only)
     */
    async addUser(messageInfo) {
        try {
            const { chat_jid, sender_jid, args, message } = messageInfo;
            
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
                
                // Remove any non-digit characters (spaces, +, -, etc.)
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
            console.error('Error in add user:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to add user. Please try again or check if I have admin permissions.'
            );
        }
    }

    /**
     * Extract phone number from various message types
     */
    async extractPhoneFromMessage(quotedMessage) {
        try {
            // Handle contact messages
            if (quotedMessage.contactMessage) {
                const contact = quotedMessage.contactMessage;
                
                // Try to extract from vCard
                if (contact.vcard) {
                    const vcard = contact.vcard;
                    
                    // Look for phone numbers in vCard format
                    const phoneMatch = vcard.match(/TEL[^:]*:[\+]?([0-9\s\-\(\)]+)/i);
                    if (phoneMatch) {
                        const phone = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
                        console.log(`📇 Extracted phone from vCard: ${phone}`);
                        return phone;
                    }
                }
                
                // Try display name if it contains numbers
                if (contact.displayName) {
                    const nameMatch = contact.displayName.match(/[\+]?([0-9]{10,15})/);
                    if (nameMatch) {
                        const phone = nameMatch[1];
                        console.log(`📇 Extracted phone from contact display name: ${phone}`);
                        return phone;
                    }
                }
            }

            // Handle contact array messages
            if (quotedMessage.contactsArrayMessage && quotedMessage.contactsArrayMessage.contacts) {
                for (const contact of quotedMessage.contactsArrayMessage.contacts) {
                    if (contact.vcard) {
                        const phoneMatch = contact.vcard.match(/TEL[^:]*:[\+]?([0-9\s\-\(\)]+)/i);
                        if (phoneMatch) {
                            const phone = phoneMatch[1].replace(/[\s\-\(\)]/g, '');
                            console.log(`📇 Extracted phone from contacts array: ${phone}`);
                            return phone;
                        }
                    }
                }
            }

            // Handle regular text messages with phone numbers
            let messageText = '';
            
            if (quotedMessage.conversation) {
                messageText = quotedMessage.conversation;
            } else if (quotedMessage.extendedTextMessage?.text) {
                messageText = quotedMessage.extendedTextMessage.text;
            } else if (quotedMessage.imageMessage?.caption) {
                messageText = quotedMessage.imageMessage.caption;
            } else if (quotedMessage.videoMessage?.caption) {
                messageText = quotedMessage.videoMessage.caption;
            } else if (quotedMessage.documentMessage?.caption) {
                messageText = quotedMessage.documentMessage.caption;
            }

            if (messageText) {
                // Look for phone numbers in text
                // Support various phone number formats
                const phonePatterns = [
                    /(?:\+?234)?[\s\-]?([0-9]{10,11})/g,           // Nigerian numbers
                    /(?:\+?1)?[\s\-]?([0-9]{10})/g,               // US numbers
                    /(?:\+?44)?[\s\-]?([0-9]{10,11})/g,           // UK numbers
                    /(?:\+?91)?[\s\-]?([0-9]{10})/g,              // Indian numbers
                    /(?:\+?[0-9]{1,4})?[\s\-]?([0-9]{8,15})/g     // General international
                ];

                for (const pattern of phonePatterns) {
                    const matches = messageText.match(pattern);
                    if (matches) {
                        // Get the longest match (most likely to be complete)
                        const longestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
                        const cleanPhone = longestMatch.replace(/[\s\-\+]/g, '');
                        
                        if (cleanPhone.length >= 10) {
                            console.log(`📱 Extracted phone from message text: ${cleanPhone}`);
                            return cleanPhone;
                        }
                    }
                }
            }

            return null;

        } catch (error) {
            console.error('Error extracting phone from message:', error);
            return null;
        }
    }

    /**
     * Send invitation link when direct add fails
     */
    async sendInvitationLink(messageInfo, targetJid, displayName, chat_jid) {
        try {
            // Generate group invitation link
            const inviteCode = await this.bot.sock.groupInviteCode(chat_jid);
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

            // Try to send the invitation link to the target user
            try {
                await this.bot.sock.sendMessage(targetJid, {
                    text: `🎉 You've been invited to join a WhatsApp group!\n\n` +
                          `Click the link below to join:\n${inviteLink}\n\n` +
                          `If the link doesn't work, please ask the group admin to add you manually.`
                });

                // Notify in the group that invitation was sent
                await this.bot.messageHandler.reply(messageInfo, 
                    `📩 Could not add @${displayName} directly. An invitation link has been sent to them privately.\n\n` +
                    `Invitation link: ${inviteLink}`
                );

            } catch (sendError) {
                console.error('Failed to send invitation privately:', sendError);
                
                // If we can't send privately, just show the link in the group
                await this.bot.messageHandler.reply(messageInfo, 
                    `📩 Could not add @${displayName} directly or send invitation privately.\n\n` +
                    `Please share this invitation link with them:\n${inviteLink}`
                );
            }

        } catch (inviteError) {
            console.error('Failed to generate invitation link:', inviteError);
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Could not add @${displayName} and failed to generate invitation link. ` +
                `Please try adding them manually or check group settings.`
            );
        }
    }

    /**
     * Promote user to admin (admin only)
     */
    async promoteUser(messageInfo) {
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
            if (targetParticipant.admin === 'superadmin' && senderParticipant.admin !== 'superadmin') {
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
     * Register group event handlers
     */
    registerGroupEvents() {
        // Listen for group participants update events
        this.bot.sock.ev.on('group-participants.update', async (update) => {
            try {
                await this.handleGroupParticipantsUpdate(update);
            } catch (error) {
                console.error('Error handling group participants update:', error);
            }
        });
    }

    /**
     * Handle group participants update (join/leave/promote/demote)
     */
    async handleGroupParticipantsUpdate(update) {
        try {
            const { id: groupJid, participants, action } = update;

            // Only handle group chats
            if (!groupJid.endsWith('@g.us')) return;

            for (const participantJid of participants) {
                // Get display name for participant
                let displayName = participantJid;
                if (displayName.includes('@lid')) {
                    displayName = displayName.split('@')[0];
                } else if (displayName.includes('@s.whatsapp.net')) {
                    displayName = displayName.replace('@s.whatsapp.net', '');
                }

                switch (action) {
                    case 'add':
                        await this.sendWelcomeMessage(groupJid, participantJid, displayName);
                        break;
                    case 'remove':
                        await this.sendGoodbyeMessage(groupJid, participantJid, displayName);
                        break;
                }
            }
        } catch (error) {
            console.error('Error in handleGroupParticipantsUpdate:', error);
        }
    }

    /**
     * Send welcome message for new group member
     */
    async sendWelcomeMessage(groupJid, participantJid, displayName) {
        try {
            // Don't welcome the bot itself
            if (participantJid === this.bot.sock.user?.id) return;

            // Check if greetings are enabled
            if (!config.GREETING_ENABLED || !config.GREETING_WELCOME) {
                return;
            }

            // Simplified welcome message
            const welcomeMessage = `@${displayName}! Welcome 👏`;

            try {
                // Try to get user's profile picture
                const profilePicUrl = await this.bot.sock.profilePictureUrl(participantJid, 'image');
                
                if (profilePicUrl) {
                    // Send profile picture with welcome message as caption
                    await this.bot.sock.sendMessage(groupJid, {
                        image: { url: profilePicUrl },
                        caption: welcomeMessage,
                        mentions: [participantJid]
                    });
                } else {
                    // Fallback to text message if no profile picture
                    await this.bot.sock.sendMessage(groupJid, {
                        text: welcomeMessage,
                        mentions: [participantJid]
                    });
                }
            } catch (profileError) {
                console.log('Profile picture not available, using text message');
                // Fallback to text message if profile picture fails
                await this.bot.sock.sendMessage(groupJid, {
                    text: welcomeMessage,
                    mentions: [participantJid]
                });
            }

        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    }

    /**
     * Send goodbye message when member leaves/removed
     */
    async sendGoodbyeMessage(groupJid, participantJid, displayName) {
        try {
            // Don't send goodbye for the bot itself
            if (participantJid === this.bot.sock.user?.id) return;

            // Check if greetings are enabled
            if (!config.GREETING_ENABLED || !config.GREETING_GOODBYE) {
                return;
            }

            // Simplified goodbye message
            const goodbyeMessage = `@${displayName} Goodbye 👋`;

            try {
                // Try to get user's profile picture
                const profilePicUrl = await this.bot.sock.profilePictureUrl(participantJid, 'image');
                
                if (profilePicUrl) {
                    // Send profile picture with goodbye message as caption
                    await this.bot.sock.sendMessage(groupJid, {
                        image: { url: profilePicUrl },
                        caption: goodbyeMessage,
                        mentions: [participantJid]
                    });
                } else {
                    // Fallback to text message if no profile picture
                    await this.bot.sock.sendMessage(groupJid, {
                        text: goodbyeMessage,
                        mentions: [participantJid]
                    });
                }
            } catch (profileError) {
                console.log('Profile picture not available, using text message');
                // Fallback to text message if profile picture fails
                await this.bot.sock.sendMessage(groupJid, {
                    text: goodbyeMessage,
                    mentions: [participantJid]
                });
            }

        } catch (error) {
            console.error('Error sending goodbye message:', error);
        }
    }

    /**
     * Lock group - restrict messaging to admins only (admin only)
     */
    async lockGroup(messageInfo) {
        try {
            const { chat_jid, sender_jid } = messageInfo;
            
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
     * Unlock group - allow everyone to send messages (admin only)
     */
    async unlockGroup(messageInfo) {
        try {
            const { chat_jid, sender_jid } = messageInfo;
            
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
     * Greeting control command
     */
    async greetingCommand(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
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
     * Group info command - show group information and statistics
     */
    async groupInfoCommand(messageInfo) {
        try {
            const { chat_jid } = messageInfo;
            
            // Check if this is a group chat
            if (!chat_jid.endsWith('@g.us')) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ This command can only be used in group chats.'
                );
                return;
            }

            // Get group metadata
            const groupMetadata = await this.bot.sock.groupMetadata(chat_jid);
            
            if (!groupMetadata) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to get group information.'
                );
                return;
            }

            // Count participants by role
            const participants = groupMetadata.participants || [];
            const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
            const superAdmins = participants.filter(p => p.admin === 'superadmin');
            const members = participants.filter(p => !p.admin);

            // Format creation date
            const creationTime = groupMetadata.creation ? new Date(groupMetadata.creation * 1000).toLocaleDateString() : 'Unknown';
            
            // Build group info message
            const groupInfo = `📋 *Group Information*\n\n` +
                `📝 *Name:* ${groupMetadata.subject || 'No name'}\n` +
                `🆔 *ID:* ${chat_jid.split('@')[0]}\n` +
                `📅 *Created:* ${creationTime}\n` +
                `👥 *Total Members:* ${participants.length}\n` +
                `👑 *Super Admins:* ${superAdmins.length}\n` +
                `⭐ *Admins:* ${admins.length - superAdmins.length}\n` +
                `👤 *Members:* ${members.length}\n` +
                `🔒 *Announcement Mode:* ${groupMetadata.announce ? 'Enabled' : 'Disabled'}\n` +
                `🔐 *Restricted:* ${groupMetadata.restrict ? 'Yes' : 'No'}\n\n`;

            // Add description if available
            let fullMessage = groupInfo;
            if (groupMetadata.desc) {
                fullMessage += `📄 *Description:*\n${groupMetadata.desc}\n\n`;
            }

            fullMessage += `_Group info retrieved by MATDEV_`;

            await this.bot.messageHandler.reply(messageInfo, fullMessage);

        } catch (error) {
            console.error('Error in groupinfo command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to retrieve group information. Please try again.'
            );
        }
    }

    /**
     * Set group name command (admin only)
     */
    async setGroupNameCommand(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
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
     * Set group description command (admin only)
     */
    async setGroupDescCommand(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
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
     * Get group invite link command (admin only)
     */
    async getGroupLinkCommand(messageInfo) {
        try {
            const { chat_jid, sender_jid } = messageInfo;
            
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
     * Revoke group invite link command (admin only)
     */
    async revokeGroupLinkCommand(messageInfo) {
        try {
            const { chat_jid, sender_jid } = messageInfo;
            
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

            // Revoke current invite link
            await this.bot.sock.groupRevokeInvite(chat_jid);

            // await this.bot.messageHandler.reply(messageInfo, 
            //     `✅ Group Invite Link Revoked`
            // );

        } catch (error) {
            console.error('Error in revokelink command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to revoke group invite link. Please try again or check bot permissions.'
            );
        }
    }

    /**
     * Update environment setting and .env file
     */
    async updateEnvSetting(key, value) {
        try {
            // Update process.env
            process.env[key] = value;

            // Update .env file
            const path = require('path');
            const fs = require('fs-extra');
            const envPath = path.join(__dirname, '../.env');
            
            let envContent = '';
            if (await fs.pathExists(envPath)) {
                envContent = await fs.readFile(envPath, 'utf8');
            }

            const lines = envContent.split('\n');
            let keyExists = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith(`${key}=`)) {
                    lines[i] = `${key}=${value}`;
                    keyExists = true;
                    break;
                }
            }

            if (!keyExists) {
                lines.push(`${key}=${value}`);
            }

            await fs.writeFile(envPath, lines.join('\n'));
            console.log(`📝 Updated .env: ${key}=${value}`);

        } catch (error) {
            console.error(`Failed to update .env setting ${key}:`, error);
        }
    }

    /**
     * Register message handler for filtering and moderation
     */
    registerMessageHandler() {
        // Listen to all messages for filtering, antilink, and mute checks
        this.bot.sock.ev.on('messages.upsert', async (messageUpdate) => {
            try {
                await this.handleIncomingMessage(messageUpdate);
            } catch (error) {
                console.error('Error handling incoming message for group moderation:', error);
            }
        });
    }

    /**
     * Handle incoming messages for moderation features
     */
    async handleIncomingMessage(messageUpdate) {
        const { messages } = messageUpdate;
        
        for (const message of messages) {
            // Skip if not a group message or if it's from the bot
            if (!message.key?.remoteJid?.endsWith('@g.us') || 
                message.key?.fromMe || 
                !message.message) {
                continue;
            }
            
            const chatJid = message.key.remoteJid;
            const senderJid = message.key.participant || message.key.remoteJid;
            const messageText = this.extractMessageText(message.message);
            
            if (!messageText) continue;
            
            // Track message activity for statistics
            await this.trackUserActivity(chatJid, senderJid, messageText);
            
            // Check antilink
            if (await this.isAntilinkEnabled(chatJid) && this.containsLink(messageText)) {
                await this.handleAntilinkViolation(chatJid, senderJid, message.key);
                continue;
            }
            
            // Check word filters
            const filterViolation = await this.checkWordFilters(chatJid, messageText);
            if (filterViolation) {
                await this.handleFilterViolation(chatJid, senderJid, message.key, filterViolation);
            }
        }
    }

    /**
     * Extract text from message
     */
    extractMessageText(message) {
        if (message.conversation) {
            return message.conversation;
        }
        if (message.extendedTextMessage?.text) {
            return message.extendedTextMessage.text;
        }
        if (message.imageMessage?.caption) {
            return message.imageMessage.caption;
        }
        if (message.videoMessage?.caption) {
            return message.videoMessage.caption;
        }
        return null;
    }

    /**
     * Filter command implementation
     */
    async filterCommand(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
            // Check admin permissions
            if (!(await this.isUserAdmin(chat_jid, sender_jid))) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
                return;
            }
            
            if (args.length === 0) {
                // Show current filters
                await this.showFilters(messageInfo);
                return;
            }
            
            const action = args[0].toLowerCase();
            
            switch (action) {
                case 'add':
                    if (args.length < 2) {
                        await this.bot.messageHandler.reply(messageInfo, `❌ Usage: ${config.PREFIX}filter add <word>`);
                        return;
                    }
                    await this.addFilter(messageInfo, args.slice(1).join(' '));
                    break;
                    
                case 'remove':
                    if (args.length < 2) {
                        await this.bot.messageHandler.reply(messageInfo, `❌ Usage: ${config.PREFIX}filter remove <word>`);
                        return;
                    }
                    await this.removeFilter(messageInfo, args.slice(1).join(' '));
                    break;
                    
                case 'on':
                    await this.setFilterMode(messageInfo, args.slice(1));
                    break;
                    
                case 'off':
                    await this.disableFilters(messageInfo);
                    break;
                    
                default:
                    await this.showFilterUsage(messageInfo);
            }
            
        } catch (error) {
            console.error('Error in filter command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to process filter command.');
        }
    }

    /**
     * Warning command implementation
     */
    async warnCommand(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
            // Check admin permissions
            if (!(await this.isUserAdmin(chat_jid, sender_jid))) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
                return;
            }
            
            if (args.length === 0) {
                await this.showWarnUsage(messageInfo);
                return;
            }
            
            const action = args[0].toLowerCase();
            
            switch (action) {
                case 'clear':
                    const clearTargetJid = this.getTargetUser(messageInfo);
                    if (!clearTargetJid) {
                        await this.bot.messageHandler.reply(messageInfo, '❌ Please mention or reply to a user to clear warnings.');
                        return;
                    }
                    await this.clearWarnings(messageInfo, clearTargetJid);
                    break;
                    
                case 'list':
                    const listTargetJid = this.getTargetUser(messageInfo);
                    if (!listTargetJid) {
                        await this.bot.messageHandler.reply(messageInfo, '❌ Please mention or reply to a user to view warnings.');
                        return;
                    }
                    await this.listWarnings(messageInfo, listTargetJid);
                    break;
                    
                default:
                    // Direct warn - first arg might be the user mention
                    const targetJid = this.getTargetUser(messageInfo);
                    if (!targetJid) {
                        await this.bot.messageHandler.reply(messageInfo, '❌ Please mention or reply to a user to warn.');
                        return;
                    }
                    await this.warnUser(messageInfo, targetJid);
            }
            
        } catch (error) {
            console.error('Error in warn command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to process warning command.');
        }
    }

    /**
     * Antilink command implementation
     */
    async antilinkCommand(messageInfo) {
        try {
            const { args, chat_jid, sender_jid } = messageInfo;
            
            // Check admin permissions
            if (!(await this.isUserAdmin(chat_jid, sender_jid))) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Only group admins can use this command.');
                return;
            }
            
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

    

    

    

    // =================================================================
    // FILTER SYSTEM IMPLEMENTATION
    // =================================================================

    /**
     * Show current filters
     */
    async showFilters(messageInfo) {
        const { chat_jid } = messageInfo;
        const filters = this.getGroupFilters(chat_jid);
        const settings = this.getGroupFilterSettings(chat_jid);
        
        if (filters.length === 0) {
            await this.bot.messageHandler.reply(messageInfo, 
                `📝 *Word Filters*\n\n` +
                `No filters configured.\n\n` +
                `*Usage:*\n` +
                `• ${config.PREFIX}filter add <word> - Add filter\n` +
                `• ${config.PREFIX}filter remove <word> - Remove filter\n` +
                `• ${config.PREFIX}filter on [3warn] [kick] - Enable filtering\n` +
                `• ${config.PREFIX}filter off - Disable filtering`
            );
            return;
        }
        
        const filterList = filters.map((word, index) => `${index + 1}. ${word}`).join('\n');
        const status = settings.enabled ? '✅ Enabled' : '❌ Disabled';
        const mode = settings.enabled ? 
            (settings.warnCount ? `${settings.warnCount} warnings${settings.kickAfterWarn ? ' + kick' : ''}` : 'Delete only') : 
            'Disabled';
        
        await this.bot.messageHandler.reply(messageInfo, 
            `📝 *Word Filters*\n\n` +
            `*Status:* ${status}\n` +
            `*Mode:* ${mode}\n\n` +
            `*Filtered Words:*\n${filterList}\n\n` +
            `*Usage:*\n` +
            `• ${config.PREFIX}filter add <word>\n` +
            `• ${config.PREFIX}filter remove <word>\n` +
            `• ${config.PREFIX}filter on [2warn] [kick]\n` +
            `• ${config.PREFIX}filter off`
        );
    }

    /**
     * Add word filter
     */
    async addFilter(messageInfo, word) {
        const { chat_jid } = messageInfo;
        const filters = this.getGroupFilters(chat_jid);
        
        const normalizedWord = word.toLowerCase().trim();
        if (filters.includes(normalizedWord)) {
            await this.bot.messageHandler.reply(messageInfo, `❌ "${word}" is already in the filter list.`);
            return;
        }
        
        filters.push(normalizedWord);
        this.saveGroupFilters(chat_jid, filters);
        
        await this.bot.messageHandler.reply(messageInfo, `✅ Added "${word}" to filter list.`);
    }

    /**
     * Remove word filter
     */
    async removeFilter(messageInfo, word) {
        const { chat_jid } = messageInfo;
        const filters = this.getGroupFilters(chat_jid);
        
        const normalizedWord = word.toLowerCase().trim();
        const index = filters.indexOf(normalizedWord);
        
        if (index === -1) {
            await this.bot.messageHandler.reply(messageInfo, `❌ "${word}" is not in the filter list.`);
            return;
        }
        
        filters.splice(index, 1);
        this.saveGroupFilters(chat_jid, filters);
        
        await this.bot.messageHandler.reply(messageInfo, `✅ Removed "${word}" from filter list.`);
    }

    /**
     * Set filter mode
     */
    async setFilterMode(messageInfo, args) {
        const { chat_jid } = messageInfo;
        
        let warnCount = 0;
        let kickAfterWarn = false;
        
        // Parse arguments for warn count and kick
        for (const arg of args) {
            if (arg.endsWith('warn')) {
                const count = parseInt(arg.replace('warn', ''));
                if (count > 0) {
                    warnCount = count;
                }
            } else if (arg.toLowerCase() === 'kick') {
                kickAfterWarn = true;
            }
        }
        
        const settings = {
            enabled: true,
            warnCount: warnCount,
            kickAfterWarn: kickAfterWarn
        };
        
        this.saveGroupFilterSettings(chat_jid, settings);
        
        let modeDesc = 'Delete messages';
        if (warnCount > 0) {
            modeDesc += ` + ${warnCount} warnings`;
            if (kickAfterWarn) {
                modeDesc += ' + kick';
            }
        }
        
        await this.bot.messageHandler.reply(messageInfo, 
            `✅ Filter system enabled!\n*Mode:* ${modeDesc}`
        );
    }

    /**
     * Disable filters
     */
    async disableFilters(messageInfo) {
        const { chat_jid } = messageInfo;
        
        const settings = {
            enabled: false,
            warnCount: 0,
            kickAfterWarn: false
        };
        
        this.saveGroupFilterSettings(chat_jid, settings);
        
        await this.bot.messageHandler.reply(messageInfo, '✅ Filter system disabled.');
    }

    /**
     * Check word filters in message
     */
    async checkWordFilters(chatJid, messageText) {
        const settings = this.getGroupFilterSettings(chatJid);
        if (!settings.enabled) return null;
        
        const filters = this.getGroupFilters(chatJid);
        if (filters.length === 0) return null;
        
        const lowerText = messageText.toLowerCase();
        for (const filter of filters) {
            if (lowerText.includes(filter)) {
                return filter;
            }
        }
        
        return null;
    }

    /**
     * Handle filter violation
     */
    async handleFilterViolation(chatJid, senderJid, messageKey, violatedWord) {
        try {
            // Delete the message
            await this.deleteMessage(chatJid, messageKey);
            
            const settings = this.getGroupFilterSettings(chatJid);
            if (!settings.warnCount) return;
            
            // Add warning
            const warningCount = await this.addWarningToUser(chatJid, senderJid, `Used filtered word: ${violatedWord}`);
            
            // Send warning message
            const displayName = this.getDisplayName(senderJid);
            let warningMessage = `⚠️ @${displayName} received a warning for using filtered word.\n`;
            warningMessage += `Warnings: ${warningCount}/${settings.warnCount}`;
            
            await this.bot.sock.sendMessage(chatJid, {
                text: warningMessage,
                mentions: [senderJid]
            });
            
            // Check if user should be kicked
            if (settings.kickAfterWarn && warningCount >= settings.warnCount) {
                await this.kickUserAfterWarnings(chatJid, senderJid);
            }
            
        } catch (error) {
            console.error('Error handling filter violation:', error);
        }
    }

    // =================================================================
    // WARNING SYSTEM IMPLEMENTATION
    // =================================================================

    /**
     * Warn a user
     */
    async warnUser(messageInfo, targetJid) {
        const { chat_jid } = messageInfo;
        const warningCount = await this.addWarningToUser(chat_jid, targetJid, 'Manual warning by admin');
        
        const displayName = this.getDisplayName(targetJid);
        await this.bot.sock.sendMessage(chat_jid, {
            text: `⚠️ @${displayName} has been warned.\nTotal warnings: ${warningCount}`,
            mentions: [targetJid]
        });
    }

    /**
     * Clear warnings for user
     */
    async clearWarnings(messageInfo, targetJid) {
        const { chat_jid } = messageInfo;
        this.clearUserWarnings(chat_jid, targetJid);
        
        const displayName = this.getDisplayName(targetJid);
        await this.bot.sock.sendMessage(chat_jid, {
            text: `✅ Cleared all warnings for @${displayName}`,
            mentions: [targetJid]
        });
    }

    /**
     * List user warnings
     */
    async listWarnings(messageInfo, targetJid) {
        const { chat_jid } = messageInfo;
        const warnings = this.getUserWarnings(chat_jid, targetJid);
        
        const displayName = this.getDisplayName(targetJid);
        
        if (warnings.length === 0) {
            await this.bot.sock.sendMessage(chat_jid, {
                text: `📄 @${displayName} has no warnings.`,
                mentions: [targetJid]
            });
            return;
        }
        
        let warningList = `📄 *Warnings for @${displayName}*\n\n`;
        warnings.forEach((warning, index) => {
            const date = new Date(warning.timestamp).toLocaleDateString();
            warningList += `${index + 1}. ${warning.reason} (${date})\n`;
        });
        
        await this.bot.sock.sendMessage(chat_jid, {
            text: warningList,
            mentions: [targetJid]
        });
    }

    /**
     * Show warning usage
     */
    async showWarnUsage(messageInfo) {
        await this.bot.messageHandler.reply(messageInfo, 
            `⚠️ *Warning System*\n\n` +
            `*Usage:*\n` +
            `• ${config.PREFIX}warn @user - Warn a user\n` +
            `• ${config.PREFIX}warn clear @user - Clear warnings\n` +
            `• ${config.PREFIX}warn list @user - View warnings`
        );
    }

    // =================================================================
    // ANTILINK SYSTEM IMPLEMENTATION
    // =================================================================

    /**
     * Check if antilink is enabled for group
     */
    async isAntilinkEnabled(chatJid) {
        const groupData = this.bot.database.getData('antilink_settings') || {};
        return groupData[chatJid] || false;
    }

    /**
     * Set antilink status for group
     */
    async setAntilinkStatus(chatJid, enabled) {
        const groupData = this.bot.database.getData('antilink_settings') || {};
        groupData[chatJid] = enabled;
        this.bot.database.setData('antilink_settings', groupData);
        
        // Also update global .env setting
        await this.updateEnvSetting('ANTILINK_ENABLED', enabled.toString());
    }

    /**
     * Check if message contains links
     */
    containsLink(messageText) {
        const linkRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}[^\s]*)/gi;
        return linkRegex.test(messageText);
    }

    /**
     * Handle antilink violation
     */
    async handleAntilinkViolation(chatJid, senderJid, messageKey) {
        try {
            // Delete the message silently - no notification
            await this.deleteMessage(chatJid, messageKey);
            
        } catch (error) {
            console.error('Error handling antilink violation:', error);
        }
    }

    // =================================================================
    // STATISTICS SYSTEM IMPLEMENTATION
    // =================================================================

    /**
     * Track user activity for statistics
     */
    async trackUserActivity(chatJid, userJid, messageText) {
        try {
            const activityData = this.bot.database.getData('activity_stats') || {};
            if (!activityData[chatJid]) {
                activityData[chatJid] = {};
            }
            
            const now = Date.now();
            if (!activityData[chatJid][userJid]) {
                activityData[chatJid][userJid] = {
                    messageCount: 0,
                    firstActivity: now,
                    lastActivity: now,
                    totalCharacters: 0
                };
            }
            
            // Update activity data
            activityData[chatJid][userJid].messageCount++;
            activityData[chatJid][userJid].lastActivity = now;
            activityData[chatJid][userJid].totalCharacters += messageText.length;
            
            this.bot.database.setData('activity_stats', activityData);
        } catch (error) {
            console.error('Error tracking user activity:', error);
        }
    }

    /**
     * Get group statistics
     */
    async getGroupStats(chatJid) {
        try {
            const activityData = this.bot.database.getData('activity_stats') || {};
            const groupData = activityData[chatJid] || {};
            
            const groupMetadata = await this.bot.sock.groupMetadata(chatJid);
            const totalMembers = groupMetadata.participants.length;
            
            const activeMembers = Object.keys(groupData).length;
            const totalMessages = Object.values(groupData).reduce((sum, user) => sum + user.messageCount, 0);
            
            // Calculate period (from first activity to now)
            const firstActivities = Object.values(groupData)
                .map(user => user.firstActivity)
                .filter(time => time);
            
            let period = 'Today';
            if (firstActivities.length > 0) {
                const firstActivity = Math.min(...firstActivities);
                const daysSinceFirst = Math.floor((Date.now() - firstActivity) / (1000 * 60 * 60 * 24));
                period = daysSinceFirst === 0 ? 'Today' : 
                        daysSinceFirst === 1 ? 'Yesterday' : 
                        `${daysSinceFirst} days`;
            }
            
            return {
                totalMessages,
                totalMembers,
                activeMembers,
                period
            };
        } catch (error) {
            console.error('Error getting group stats:', error);
            return null;
        }
    }

    /**
     * Get activity leaderboard
     */
    async getLeaderboard(chatJid) {
        try {
            const activityData = this.bot.database.getData('activity_stats') || {};
            const groupData = activityData[chatJid] || {};
            
            const leaderboard = Object.entries(groupData)
                .map(([jid, data]) => ({
                    jid,
                    messageCount: data.messageCount,
                    lastActivity: data.lastActivity
                }))
                .sort((a, b) => b.messageCount - a.messageCount);
            
            return leaderboard;
        } catch (error) {
            console.error('Error getting leaderboard:', error);
            return [];
        }
    }

    /**
     * Get inactive members
     */
    async getInactiveMembers(chatJid, days) {
        try {
            const groupMetadata = await this.bot.sock.groupMetadata(chatJid);
            const activityData = this.bot.database.getData('activity_stats') || {};
            const groupData = activityData[chatJid] || {};
            
            const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
            const inactiveMembers = [];
            
            for (const participant of groupMetadata.participants) {
                const userJid = participant.id;
                const userData = groupData[userJid];
                
                // Skip bot
                if (userJid === this.bot.sock.user?.id) continue;
                
                if (!userData || userData.lastActivity < cutoffTime) {
                    inactiveMembers.push({
                        jid: userJid,
                        lastActivity: userData?.lastActivity || null
                    });
                }
            }
            
            return inactiveMembers.sort((a, b) => {
                if (!a.lastActivity && !b.lastActivity) return 0;
                if (!a.lastActivity) return 1;
                if (!b.lastActivity) return -1;
                return a.lastActivity - b.lastActivity;
            });
        } catch (error) {
            console.error('Error getting inactive members:', error);
            return [];
        }
    }

    /**
     * Format time ago
     */
    formatTimeAgo(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor(diff / (1000 * 60));
        
        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else {
            return 'Just now';
        }
    }

    // =================================================================
    // UTILITY METHODS
    // =================================================================

    /**
     * Check if user is admin
     */
    async isUserAdmin(chatJid, userJid) {
        try {
            const groupMetadata = await this.bot.sock.groupMetadata(chatJid);
            const participant = groupMetadata.participants.find(p => p.id === userJid);
            return participant && (participant.admin === 'admin' || participant.admin === 'superadmin');
        } catch (error) {
            return false;
        }
    }

    /**
     * Get target user from message (supports both @mentions and message replies)
     */
    getTargetUser(messageInfo) {
        const { message } = messageInfo;
        
        // Method 1: Check for quoted/replied message first (like promote/demote)
        const contextInfo = message?.extendedTextMessage?.contextInfo || message?.contextInfo;
        if (contextInfo?.quotedMessage) {
            const quotedParticipant = contextInfo.participant;
            if (quotedParticipant) {
                return quotedParticipant;
            }
        }
        
        // Method 2: Check for mentions in the current message
        if (contextInfo?.mentionedJid?.length > 0) {
            return contextInfo.mentionedJid[0];
        }
        
        // Method 3: Check for mentions in regular text message
        if (message?.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
            return message.extendedTextMessage.contextInfo.mentionedJid[0];
        }
        
        // Method 4: Check for mentions in conversation message
        if (message?.conversation && messageInfo.mentionedJid?.length > 0) {
            return messageInfo.mentionedJid[0];
        }
        
        return null;
    }

    /**
     * Get display name for user
     */
    getDisplayName(userJid) {
        let displayName = userJid;
        if (displayName.includes('@lid')) {
            displayName = displayName.split('@')[0];
        } else if (displayName.includes('@s.whatsapp.net')) {
            displayName = displayName.replace('@s.whatsapp.net', '');
        }
        return displayName;
    }

    /**
     * Delete a message
     */
    async deleteMessage(chatJid, messageKey) {
        try {
            await this.bot.sock.sendMessage(chatJid, { delete: messageKey });
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }

    /**
     * Get group filters
     */
    getGroupFilters(chatJid) {
        const allFilters = this.bot.database.getData('filters') || {};
        return allFilters[chatJid] || [];
    }

    /**
     * Save group filters
     */
    saveGroupFilters(chatJid, filters) {
        const allFilters = this.bot.database.getData('filters') || {};
        allFilters[chatJid] = filters;
        this.bot.database.setData('filters', allFilters);
    }

    /**
     * Get group filter settings
     */
    getGroupFilterSettings(chatJid) {
        const allSettings = this.bot.database.getData('filter_settings') || {};
        return allSettings[chatJid] || { enabled: false, warnCount: 0, kickAfterWarn: false };
    }

    /**
     * Save group filter settings
     */
    saveGroupFilterSettings(chatJid, settings) {
        const allSettings = this.bot.database.getData('filter_settings') || {};
        allSettings[chatJid] = settings;
        this.bot.database.setData('filter_settings', allSettings);
    }

    /**
     * Add warning to user
     */
    async addWarningToUser(chatJid, userJid, reason) {
        const allWarnings = this.bot.database.getData('warnings') || {};
        if (!allWarnings[chatJid]) allWarnings[chatJid] = {};
        if (!allWarnings[chatJid][userJid]) allWarnings[chatJid][userJid] = [];
        
        allWarnings[chatJid][userJid].push({
            reason: reason,
            timestamp: Date.now()
        });
        
        this.bot.database.setData('warnings', allWarnings);
        return allWarnings[chatJid][userJid].length;
    }

    /**
     * Get user warnings
     */
    getUserWarnings(chatJid, userJid) {
        const allWarnings = this.bot.database.getData('warnings') || {};
        return allWarnings[chatJid]?.[userJid] || [];
    }

    /**
     * Clear user warnings
     */
    clearUserWarnings(chatJid, userJid) {
        const allWarnings = this.bot.database.getData('warnings') || {};
        if (allWarnings[chatJid]) {
            delete allWarnings[chatJid][userJid];
            this.bot.database.setData('warnings', allWarnings);
        }
    }

    /**
     * Kick user after reaching warning limit
     */
    async kickUserAfterWarnings(chatJid, userJid) {
        try {
            await this.bot.sock.groupParticipantsUpdate(chatJid, [userJid], 'remove');
            
            const displayName = this.getDisplayName(userJid);
            await this.bot.sock.sendMessage(chatJid, {
                text: `🚫 @${displayName} has been kicked for exceeding warning limits.`,
                mentions: [userJid]
            });
            
            // Clear warnings after kick
            this.clearUserWarnings(chatJid, userJid);
            
        } catch (error) {
            console.error('Error kicking user after warnings:', error);
        }
    }

    /**
     * Show filter usage
     */
    async showFilterUsage(messageInfo) {
        await this.bot.messageHandler.reply(messageInfo, 
            `📝 *Filter System Usage*\n\n` +
            `*Commands:*\n` +
            `• ${config.PREFIX}filter - Show current filters\n` +
            `• ${config.PREFIX}filter add <word> - Add word filter\n` +
            `• ${config.PREFIX}filter remove <word> - Remove filter\n` +
            `• ${config.PREFIX}filter on - Enable delete only\n` +
            `• ${config.PREFIX}filter on 3warn - Enable with 3 warnings\n` +
            `• ${config.PREFIX}filter on 3warn kick - Enable with warnings + kick\n` +
            `• ${config.PREFIX}filter off - Disable filtering`
        );
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