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
        
        // Initialize tempkick system
        await this.initializeTempKickSystem();
        
        // Initialize participant mapping system
        await this.initializeParticipantMapping();
        
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

            // Resolve LID to proper JID using stored mappings
            let resolvedJid = this.getRealJidFromLid(targetJid);
            let displayName = resolvedJid;
            
            // Extract display name from JID
            if (displayName.includes('@s.whatsapp.net')) {
                displayName = displayName.replace('@s.whatsapp.net', '');
            } else if (displayName.includes('@lid')) {
                displayName = displayName.split('@')[0];
            }
            
            // Log resolution status
            if (targetJid.includes('@lid') && resolvedJid !== targetJid) {
                console.log(`📱 Resolved LID ${targetJid} to JID ${resolvedJid} using stored mapping`);
            } else if (targetJid.includes('@lid')) {
                console.log(`⚠️ No mapping found for LID ${targetJid} - tempkick may fail during restoration`);
                // Don't proceed with tempkick if we can't resolve LID to JID
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Cannot temporarily kick this user. No stored phone number mapping available for business account. They need to send a message first for mapping to be captured.`
                );
                return;
            }

            // Perform the temporary kick
            await this.bot.sock.groupParticipantsUpdate(chat_jid, [targetJid], 'remove');

            // Send confirmation message
            await this.bot.messageHandler.reply(messageInfo, 
                `⏰ User @${displayName} has been temporarily removed from the group.\nThey will be added back in 5 minutes.`
            );

            // Save tempkick data persistently instead of using setTimeout
            const kickTime = Date.now();
            const restoreTime = kickTime + (5 * 60 * 1000); // 5 minutes from now
            
            await this.saveTempKick({
                userJid: targetJid,           // Original JID used for kicking  
                resolvedJid: resolvedJid,     // Resolved JID for adding back (from mapping)
                groupJid: chat_jid,
                displayName: displayName,
                kickTime: kickTime,
                restoreTime: restoreTime,
                kickedBy: sender_jid
            });

        } catch (error) {
            console.error('Error in temp kick user:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to temporarily kick user. Please try again or check if I have admin permissions.'
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
                console.log(`📱 Final JID: ${targetJid}`);
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

            // Send confirmation message
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ User @${displayName} has been promoted to admin.`
            );

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

            // Send confirmation message
            await this.bot.messageHandler.reply(messageInfo, 
                `✅ User @${displayName} has been demoted from admin.`
            );

        } catch (error) {
            console.error('Error in demote user:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to demote user. Please try again or check if I have admin permissions.'
            );
        }
    }

    /**
     * Initialize tempkick system
     */
    async initializeTempKickSystem() {
        try {
            // Start periodic checker for pending tempkicks (every 30 seconds)
            this.tempKickInterval = setInterval(async () => {
                await this.checkPendingTempKicks();
            }, 30 * 1000);
            
            // Check for any pending tempkicks from previous session on startup
            setTimeout(async () => {
                await this.checkPendingTempKicks();
            }, 5000); // Wait 5 seconds after startup to ensure connection is stable
            
            console.log('⏰ TempKick persistence system initialized');
        } catch (error) {
            console.error('Error initializing tempkick system:', error);
        }
    }

    /**
     * Initialize participant mapping system to track LID->JID mappings
     */
    async initializeParticipantMapping() {
        try {
            // Listen for messages to capture JID mappings
            this.bot.sock.ev.on('messages.upsert', ({ messages }) => {
                messages.forEach(msg => this.captureParticipantMapping(msg));
            });

            // Listen for group participant updates
            this.bot.sock.ev.on('group-participants.update', async (event) => {
                await this.updateParticipantMappings(event);
            });

            // Capture initial group metadata for existing groups
            setTimeout(async () => {
                await this.captureExistingGroupMappings();
            }, 10000);

            console.log('🗺️  Participant mapping system initialized');
        } catch (error) {
            console.error('Error initializing participant mapping:', error);
        }
    }

    /**
     * Capture participant mappings from messages
     */
    captureParticipantMapping(message) {
        try {
            const { key } = message;
            const { remoteJid, participant, fromMe } = key;

            // Skip bot's own messages
            if (fromMe) return;

            // Only process group messages
            if (!remoteJid || !remoteJid.endsWith('@g.us')) return;

            // Debug logging to see what we're receiving
            console.log(`🔍 Processing message - RemoteJID: ${remoteJid}, Participant: ${participant}, Type: ${participant ? (participant.includes('@s.whatsapp.net') ? 'JID' : participant.includes('@lid') ? 'LID' : 'OTHER') : 'NONE'}`);

            // If we have a participant (group message), store the mapping
            if (participant) {
                const participantMappings = this.bot.database.getData('participantMappings') || {};
                let mappingAdded = false;
                
                // If participant is in JID format, store it
                if (participant.includes('@s.whatsapp.net')) {
                    const phoneNumber = participant.split('@')[0];
                    const lidFormat = `${phoneNumber}@lid`;
                    
                    // Store both LID->JID and JID->JID mappings
                    participantMappings[lidFormat] = participant;
                    participantMappings[participant] = participant;
                    mappingAdded = true;
                    
                    console.log(`✅ Stored mapping: ${lidFormat} -> ${participant}`);
                }
                
                // If participant is already in LID format, check if we have context
                else if (participant.includes('@lid')) {
                    // Try to get JID from message context
                    const participantPn = message?.message?.extendedTextMessage?.contextInfo?.participantPn;
                    const senderPn = message?.message?.extendedTextMessage?.contextInfo?.senderPn;
                    
                    if (participantPn && participantPn.includes('@s.whatsapp.net')) {
                        participantMappings[participant] = participantPn;
                        participantMappings[participantPn] = participantPn;
                        mappingAdded = true;
                        console.log(`✅ Stored LID mapping from context: ${participant} -> ${participantPn}`);
                    } else if (senderPn && senderPn.includes('@s.whatsapp.net')) {
                        participantMappings[participant] = senderPn;
                        participantMappings[senderPn] = senderPn;
                        mappingAdded = true;
                        console.log(`✅ Stored LID mapping from sender: ${participant} -> ${senderPn}`);
                    } else {
                        console.log(`⚠️ Cannot resolve LID ${participant} - no context available`);
                    }
                }
                
                if (mappingAdded) {
                    this.bot.database.setData('participantMappings', participantMappings);
                }
            }
        } catch (error) {
            console.error('Error in captureParticipantMapping:', error);
        }
    }

    /**
     * Update participant mappings from group events
     */
    async updateParticipantMappings(event) {
        try {
            const { id: groupJid, participants, action } = event;
            
            if (action === 'add') {
                // Store mappings for newly added participants
                const participantMappings = this.bot.database.getData('participantMappings') || {};
                
                participants.forEach(participant => {
                    if (participant.includes('@s.whatsapp.net')) {
                        const phoneNumber = participant.split('@')[0];
                        const lidFormat = `${phoneNumber}@lid`;
                        
                        participantMappings[lidFormat] = participant;
                        participantMappings[participant] = participant;
                    }
                });
                
                this.bot.database.setData('participantMappings', participantMappings);
            }
        } catch (error) {
            console.error('Error updating participant mappings:', error);
        }
    }

    /**
     * Capture existing group mappings on startup
     */
    async captureExistingGroupMappings() {
        try {
            const groups = await this.bot.sock.groupFetchAllParticipating();
            const participantMappings = this.bot.database.getData('participantMappings') || {};
            
            for (const group of Object.values(groups)) {
                if (group.participants) {
                    group.participants.forEach(participant => {
                        const participantJid = participant.id;
                        
                        if (participantJid.includes('@s.whatsapp.net')) {
                            const phoneNumber = participantJid.split('@')[0];
                            const lidFormat = `${phoneNumber}@lid`;
                            
                            participantMappings[lidFormat] = participantJid;
                            participantMappings[participantJid] = participantJid;
                        }
                    });
                }
            }
            
            this.bot.database.setData('participantMappings', participantMappings);
            console.log('📝 Captured existing group participant mappings');
        } catch (error) {
            console.error('Error capturing existing group mappings:', error);
        }
    }

    /**
     * Get real JID from LID using stored mappings
     */
    getRealJidFromLid(lidOrJid) {
        const participantMappings = this.bot.database.getData('participantMappings') || {};
        
        // Return stored mapping if available, otherwise return original
        return participantMappings[lidOrJid] || lidOrJid;
    }

    /**
     * Save tempkick data persistently
     */
    async saveTempKick(tempKickData) {
        try {
            const tempKicks = this.bot.database.getData('tempKicks') || {};
            const kickId = `${tempKickData.groupJid}_${tempKickData.userJid}_${tempKickData.kickTime}`;
            
            tempKicks[kickId] = tempKickData;
            
            this.bot.database.setData('tempKicks', tempKicks);
            console.log(`💾 Saved tempkick: ${tempKickData.displayName} in ${tempKickData.groupJid}`);
        } catch (error) {
            console.error('Error saving tempkick data:', error);
        }
    }

    /**
     * Remove tempkick data after restoration
     */
    async removeTempKick(kickId) {
        try {
            const tempKicks = this.bot.database.getData('tempKicks') || {};
            delete tempKicks[kickId];
            this.bot.database.setData('tempKicks', tempKicks);
        } catch (error) {
            console.error('Error removing tempkick data:', error);
        }
    }

    /**
     * Check for pending tempkicks and restore users when time is up
     */
    async checkPendingTempKicks() {
        try {
            const tempKicks = this.bot.database.getData('tempKicks') || {};
            const currentTime = Date.now();
            const restored = [];
            
            for (const [kickId, tempKickData] of Object.entries(tempKicks)) {
                if (currentTime >= tempKickData.restoreTime) {
                    try {
                        // For business accounts (@lid), try multiple approaches
                        let addResult = null;
                        let jidToAdd = tempKickData.resolvedJid || tempKickData.userJid;
                        
                        // First, try with resolved JID (if we have a phone number)
                        if (tempKickData.resolvedJid && tempKickData.resolvedJid !== tempKickData.userJid) {
                            try {
                                addResult = await this.bot.sock.groupParticipantsUpdate(
                                    tempKickData.groupJid, 
                                    [tempKickData.resolvedJid], 
                                    'add'
                                );
                                console.log(`✅ Successfully added back ${tempKickData.displayName} using resolved JID: ${tempKickData.resolvedJid}`);
                            } catch (resolvedError) {
                                console.log(`⚠️ Failed to add back using resolved JID ${tempKickData.resolvedJid}, trying original JID`);
                                // Try with original JID if resolved fails
                                addResult = await this.bot.sock.groupParticipantsUpdate(
                                    tempKickData.groupJid, 
                                    [tempKickData.userJid], 
                                    'add'
                                );
                                jidToAdd = tempKickData.userJid;
                                console.log(`✅ Successfully added back ${tempKickData.displayName} using original JID: ${tempKickData.userJid}`);
                            }
                        } else {
                            // Use original JID if no resolved JID available
                            addResult = await this.bot.sock.groupParticipantsUpdate(
                                tempKickData.groupJid, 
                                [tempKickData.userJid], 
                                'add'
                            );
                            jidToAdd = tempKickData.userJid;
                            console.log(`✅ Successfully added back ${tempKickData.displayName} using original JID: ${tempKickData.userJid}`);
                        }
                        
                        // Send notification
                        await this.bot.sock.sendMessage(tempKickData.groupJid, {
                            text: `✅ User @${tempKickData.displayName} has been added back to the group after temporary kick.`,
                            mentions: [jidToAdd]
                        });
                        
                        // Remove from storage
                        await this.removeTempKick(kickId);
                        restored.push(tempKickData.displayName);
                        
                        console.log(`✅ Restored tempkick: ${tempKickData.displayName} to ${tempKickData.groupJid}`);
                        
                    } catch (error) {
                        console.error(`Error restoring tempkick for ${tempKickData.displayName}:`, error);
                        
                        // Notify about the error in the group
                        try {
                            await this.bot.sock.sendMessage(tempKickData.groupJid, {
                                text: `❌ Failed to add @${tempKickData.displayName} back to the group automatically. Please add them back manually.`
                            });
                        } catch (notifyError) {
                            console.error('Error sending restoration failure notification:', notifyError);
                        }
                        
                        // Remove from storage even if restoration failed to prevent repeated attempts
                        await this.removeTempKick(kickId);
                    }
                }
            }
            
            if (restored.length > 0) {
                console.log(`⏰ Restored ${restored.length} tempkicked users: ${restored.join(', ')}`);
            }
        } catch (error) {
            console.error('Error checking pending tempkicks:', error);
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        // Clear tempkick interval
        if (this.tempKickInterval) {
            clearInterval(this.tempKickInterval);
        }
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