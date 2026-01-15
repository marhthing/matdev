/**
 * MATDEV Anti-StatusDelete Plugin
 * Detects deleted status updates and forwards them to a configured JID
 */

const config = require('../config');

class AntiStatusPlugin {
    constructor() {
        this.name = 'antistatus';
        this.description = 'Detect deleted status updates and forward them';
        this.version = '1.0.1';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupEventListeners();
        console.log('✅ Anti-status plugin loaded');
        return this;
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('antistatus', this.toggleAntiStatus.bind(this), {
            description: 'Toggle anti-status monitoring or set destination',
            usage: `${config.PREFIX}antistatus [on|off|jid]`,
            category: 'privacy',
            ownerOnly: true
        });
    }

    setupEventListeners() {
        // Wait for socket to be available
        if (this.bot.sock && this.bot.sock.ev) {
            this.registerSocketEvents();
        } else {
            const checkSocket = () => {
                if (this.bot.sock && this.bot.sock.ev) {
                    this.registerSocketEvents();
                } else {
                    setTimeout(checkSocket, 100);
                }
            };
            checkSocket();
        }
    }

    registerSocketEvents() {
        // Listen for status deletion events
        this.bot.sock.ev.on('messages.update', this.handleStatusUpdates.bind(this));
    }

    async handleStatusUpdates(updates) {
        try {
            for (const update of updates) {
                // Check if ANTI_STATUS is enabled
                if (!config.ANTI_STATUS) continue;

                // Detect status deletion (protocolMessage with type REVOKE for status@broadcast)
                // The update structure contains { key, update }
                const key = update.key;
                const updateData = update.update;

                // Check for REVOKE protocol message
                const isRevoke = updateData?.message?.protocolMessage?.type === 0 || // REVOKE = 0
                                updateData?.message?.protocolMessage?.type === 'REVOKE';
                
                // Check if it's a status broadcast deletion
                const isStatusBroadcast = key?.remoteJid === 'status@broadcast';
                
                // Alternative check: messageStubType for older versions
                const isStubRevoke = updateData?.messageStubType === 'REVOKE' || 
                                    updateData?.messageStubType === 68; // WAMessageStubType.REVOKE

                if ((isRevoke || isStubRevoke) && isStatusBroadcast) {
                    // The key contains the message ID and participant (who posted the status)
                    const messageId = key.id;
                    const participantJid = key.participant || key.fromMe ? this.bot.sock.user.id : null;
                    
                    if (messageId && participantJid) {
                        await this.handleStatusDeletion(messageId, participantJid);
                    }
                }
            }
        } catch (error) {
            console.error('❌ Error handling status updates:', error);
        }
    }

    async handleStatusDeletion(messageId, participantJid) {
        try {
            console.log('[ANTISTATUS] Status deletion detected:', { messageId, participantJid });
            
            // Get archived status message
            const archivedStatus = await this.bot.database.getArchivedMessage(messageId);
            if (!archivedStatus) {
                console.log('[ANTISTATUS] No archived status found for ID:', messageId);
                // Fallback: Try to find the media file directly in session/media
                const fs = require('fs-extra');
                const path = require('path');
                const mediaDir = path.join(__dirname, '..', 'session', 'media');
                const possibleExts = ['.jpg', '.jpeg', '.png', '.mp4', '.webp', '.bin', '.3gp', '.mov', '.avi', '.mp3', '.ogg', '.wav', '.aac', '.m4a', '.amr', '.opus', '.pdf', '.doc', '.docx', '.zip', '.txt'];
                try {
                    await new Promise(res => setTimeout(res, 200)); // Wait for file write
                    const files = await fs.readdir(mediaDir);
                    const matches = files.filter(f => f.includes(messageId));
                    console.log('[ANTISTATUS] Fallback file search for', messageId, 'found:', matches);
                    if (matches.length > 0) {
                        // Pick the first match
                        const filePath = path.join(mediaDir, matches[0]);
                        const buffer = await fs.readFile(filePath);
                        const ext = path.extname(matches[0]).toLowerCase();
                        let sendType = 'document';
                        if (['.jpg', '.jpeg', '.png'].includes(ext)) {
                            sendType = 'image';
                        } else if (['.mp4', '.3gp', '.mov', '.avi'].includes(ext)) {
                            sendType = 'video';
                        } else if (['.webp'].includes(ext)) {
                            sendType = 'sticker';
                        } else if (['.mp3', '.ogg', '.wav', '.aac', '.m4a', '.amr', '.opus'].includes(ext)) {
                            sendType = 'audio';
                        }
                        // Structure message like antidelete
                        const senderNumber = participantJid.split('@')[0];
                        const tagText = 'deletedStatus';
                        let msg = {
                            contextInfo: {
                                quotedMessage: { conversation: tagText },
                                participant: participantJid,
                                remoteJid: participantJid,
                                fromMe: false,
                                quotedMessageId: messageId
                            }
                        };
                        if (sendType === 'image') {
                            msg.image = buffer;
                        } else if (sendType === 'video') {
                            msg.video = buffer;
                        } else if (sendType === 'sticker') {
                            msg.sticker = buffer;
                        } else if (sendType === 'audio') {
                            msg.audio = buffer;
                            msg.mimetype = 'audio/mpeg';
                            msg.ptt = false;
                        } else {
                            msg.document = buffer;
                            msg.fileName = `deleted_status_${messageId}${ext}`;
                            msg.mimetype = 'application/octet-stream';
                        }
                        await this.bot.sock.sendMessage(
                            `${config.OWNER_NUMBER}@s.whatsapp.net`,
                            msg
                        );
                        return;
                    }
                } catch (fallbackErr) {
                    console.log('[ANTISTATUS] Fallback file search error:', fallbackErr.message);
                }
                return;
            }

            // Get destination JID (default to bot owner's private chat if not set)
            let targetJid = this.bot.database.getData('antiStatusDefaultDestination');
            if (!targetJid) {
                targetJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            }
            if (targetJid === 'ANTI_STATUS_SAME_USER') {
                targetJid = participantJid;
            }

            // Try to get media from database first
            let mediaData = null;
            if (archivedStatus.media_url) {
                mediaData = await this.bot.database.getArchivedMedia(archivedStatus.id);
            }
            
            // Fallback: Try to load from session/media if not found in DB
            if ((!mediaData || !mediaData.buffer || mediaData.buffer.length === 0) && archivedStatus.media_url) {
                const fs = require('fs-extra');
                const path = require('path');
                const mediaDir = path.join(__dirname, '..', 'session', 'media');
                
                try {
                    const files = await fs.readdir(mediaDir);
                    const match = files.find(f => f.includes(archivedStatus.id));
                    
                    if (match) {
                        const buffer = await fs.readFile(path.join(mediaDir, match));
                        // Guess type from extension if DB is missing it
                        let fallbackType = archivedStatus.message_type;
                        
                        if (!fallbackType || fallbackType === 'unknown') {
                            const ext = match.toLowerCase();
                            if (ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png')) 
                                fallbackType = 'imageMessage';
                            else if (ext.endsWith('.mp4') || ext.endsWith('.3gp') || ext.endsWith('.mov') || ext.endsWith('.avi')) 
                                fallbackType = 'videoMessage';
                            else if (ext.endsWith('.mp3') || ext.endsWith('.ogg') || ext.endsWith('.wav') || 
                                    ext.endsWith('.aac') || ext.endsWith('.m4a') || ext.endsWith('.amr') || ext.endsWith('.opus')) 
                                fallbackType = 'audioMessage';
                            else if (ext.endsWith('.pdf') || ext.endsWith('.doc') || ext.endsWith('.docx') || 
                                    ext.endsWith('.zip') || ext.endsWith('.txt')) 
                                fallbackType = 'documentMessage';
                            else if (ext.endsWith('.webp')) 
                                fallbackType = 'stickerMessage';
                        }
                        
                        mediaData = { buffer, fallbackType };
                    }
                } catch (fsError) {
                    console.log('[ANTISTATUS] Could not read media directory:', fsError.message);
                }
            }

            // Get sender info for context
            const senderNumber = participantJid.split('@')[0];
            const senderName = await this.getSenderName(participantJid);
            
            // Forward media or text
            if (mediaData && mediaData.buffer && mediaData.buffer.length > 0) {
                // Minimal caption for media (dot for iOS visibility)
                const mediaMessage = {
                    caption: '.',
                };
                // Use fallbackType if message_type is missing
                const type = archivedStatus.message_type || mediaData.fallbackType;
                switch (type) {
                    case 'imageMessage':
                        mediaMessage.image = mediaData.buffer;
                        break;
                    case 'videoMessage':
                        mediaMessage.video = mediaData.buffer;
                        break;
                    case 'audioMessage':
                        mediaMessage.audio = mediaData.buffer;
                        mediaMessage.mimetype = archivedStatus.media_type || 'audio/mpeg';
                        mediaMessage.ptt = false;
                        delete mediaMessage.caption;
                        break;
                    case 'documentMessage':
                        mediaMessage.document = mediaData.buffer;
                        mediaMessage.fileName = mediaData.filename || 'deleted_status_media';
                        mediaMessage.mimetype = archivedStatus.media_type || 'application/octet-stream';
                        break;
                    case 'stickerMessage':
                        mediaMessage.sticker = mediaData.buffer;
                        delete mediaMessage.caption;
                        break;
                    default:
                        mediaMessage.document = mediaData.buffer;
                        mediaMessage.fileName = 'deleted_status_media';
                        mediaMessage.mimetype = 'application/octet-stream';
                }
                await this.bot.sock.sendMessage(targetJid, mediaMessage);
            } else if (archivedStatus.media_url) {
                // Media was present but couldn't be recovered
                await this.bot.sock.sendMessage(targetJid, {
                    text: '🗑️ Deleted Status (Media Not Recovered)',
                });
            } else {
                // Text-only status: send as plain text, no contextInfo
                await this.bot.sock.sendMessage(targetJid, {
                    text: `🗑️ Deleted Status\n${archivedStatus.content || '(Empty status)'}`,
                });
            }
            
            console.log('[ANTISTATUS] Successfully forwarded deleted status');
            
        } catch (error) {
            console.error('❌ ANTI-STATUS: Error sending deleted status alert:', error);
        }
    }

    async getSenderName(jid) {
        try {
            // Try to get contact name
            const contact = await this.bot.sock.onWhatsApp(jid);
            if (contact && contact[0] && contact[0].notify) {
                return contact[0].notify;
            }
            // Fallback to phone number
            return jid.split('@')[0];
        } catch (error) {
            return jid.split('@')[0];
        }
    }

    async toggleAntiStatus(messageInfo) {
        try {
            const { args } = messageInfo;
            const firstArg = args[0]?.toLowerCase();
            
            if (firstArg === 'on') {
                config.ANTI_STATUS = true;
                if (this.bot.plugins && this.bot.plugins.system && this.bot.plugins.system.setEnvValue) {
                    await this.bot.plugins.system.setEnvValue('ANTI_STATUS', 'true');
                }
                await this.bot.messageHandler.reply(messageInfo, '✅ Anti-status monitoring enabled (persistent)');
                
            } else if (firstArg === 'off') {
                config.ANTI_STATUS = false;
                if (this.bot.plugins && this.bot.plugins.system && this.bot.plugins.system.setEnvValue) {
                    await this.bot.plugins.system.setEnvValue('ANTI_STATUS', 'false');
                }
                await this.bot.messageHandler.reply(messageInfo, '❌ Anti-status monitoring disabled (persistent)');
                
            } else if (!firstArg) {
                // Show current status
                const currentStatus = config.ANTI_STATUS ? 'ON ✅' : 'OFF ❌';
                const currentDestination = this.bot.database.getData('antiStatusDefaultDestination') || `${config.OWNER_NUMBER}@s.whatsapp.net`;
                const destinationNumber = currentDestination === 'ANTI_STATUS_SAME_USER' 
                    ? 'Same User (Private)' 
                    : currentDestination.split('@')[0];
                    
                await this.bot.messageHandler.reply(messageInfo,
                    `🗑️ *Anti-StatusDelete Status*\n\n` +
                    `📊 *Status:* ${currentStatus}\n` +
                    `📤 *Default Destination:* ${destinationNumber}\n\n` +
                    `*Usage:*\n` +
                    `• \`${config.PREFIX}antistatus on\` - Enable monitoring\n` +
                    `• \`${config.PREFIX}antistatus off\` - Disable monitoring\n` +
                    `• \`${config.PREFIX}antistatus <jid>\` - Set destination\n` +
                    `• \`${config.PREFIX}antistatus ANTI_STATUS_SAME_USER\` - Send to status owner`
                );
                
            } else {
                // Set destination JID
                let newDefaultJid = args[0];
                
                // Special case for sending to status owner
                if (newDefaultJid === 'ANTI_STATUS_SAME_USER') {
                    this.bot.database.setData('antiStatusDefaultDestination', newDefaultJid);
                    await this.bot.messageHandler.reply(messageInfo, 
                        '✅ Deleted statuses will be sent to their original owners (private)');
                } else {
                    // Add @s.whatsapp.net if not present
                    if (!newDefaultJid.includes('@')) {
                        newDefaultJid = `${newDefaultJid}@s.whatsapp.net`;
                    }
                    
                    this.bot.database.setData('antiStatusDefaultDestination', newDefaultJid);
                    await this.bot.messageHandler.reply(messageInfo, 
                        `✅ Default anti-status destination set to: ${newDefaultJid.split('@')[0]}`);
                }
                
                console.log(`✅ Default anti-status destination set to: ${newDefaultJid}`);
            }
            
        } catch (error) {
            console.error('Error with anti-status command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error with anti-status command: ' + error.message);
        }
    }
}

module.exports = {
    init: async (bot) => {
        const plugin = new AntiStatusPlugin();
        await plugin.init(bot);
        return plugin;
    }
};