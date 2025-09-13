const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class StatusPlugin {
    constructor() {
        this.name = 'status';
        this.description = 'WhatsApp status auto-view, auto-send, and monitoring functionality';
        this.version = '2.0.0';
        
        // Store bound handlers to prevent duplicates on hot reload
        this.boundHandleMessagesUpsert = this.handleMessagesUpsert.bind(this);
        this.boundHandleStatusMonitoring = this.handleStatusMonitoring.bind(this);
        
        // Status settings storage file
        this.statusSettingsFile = path.join(__dirname, '..', 'session', 'storage', 'status_settings.json');
        this.statusSettings = this.loadStatusSettings();
        
        // Message deduplication set
        this.processedMessages = new Set();
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.logger = bot.logger;
        this.registerCommands();

        // Setup event listeners when socket becomes available
        this.setupEventListeners();

        console.log('✅ Status plugin loaded');
        return this;
    }

    /**
     * Load status settings from JSON file
     */
    loadStatusSettings() {
        try {
            // Ensure storage directory exists
            const storageDir = path.dirname(this.statusSettingsFile);
            fs.ensureDirSync(storageDir);
            
            if (fs.existsSync(this.statusSettingsFile)) {
                const settings = fs.readJsonSync(this.statusSettingsFile);
                return {
                    enabled: settings.enabled || false,
                    autoDownload: settings.autoDownload !== false, // default true
                    viewMode: settings.viewMode || 'all', // 'all', 'except', 'only'
                    filterJids: settings.filterJids || [],
                    forwardDestination: settings.forwardDestination || `${config.OWNER_NUMBER}@s.whatsapp.net`,
                    ...settings
                };
            }
        } catch (error) {
            console.error('Error loading status settings:', error);
        }
        
        // Default settings
        return {
            enabled: false,
            autoDownload: true,
            viewMode: 'all',
            filterJids: [],
            forwardDestination: `${config.OWNER_NUMBER}@s.whatsapp.net`
        };
    }

    /**
     * Save status settings to JSON file
     */
    saveStatusSettings() {
        try {
            fs.writeJsonSync(this.statusSettingsFile, this.statusSettings, { spaces: 2 });
            console.log('💾 Status settings saved');
        } catch (error) {
            console.error('Error saving status settings:', error);
        }
    }

    /**
     * Setup event listeners when socket is available
     */
    setupEventListeners() {
        // Check if socket is already available
        if (this.bot.sock && this.bot.sock.ev) {
            this.registerSocketEvents();
        } else {
            // Wait for socket to be available
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

    /**
     * Register socket events
     */
    registerSocketEvents() {
        try {
            // Register message handler for auto-send functionality and auto-view
            this.bot.sock.ev.on('messages.upsert', this.boundHandleMessagesUpsert);

            // Monitor status updates for auto-saving
            this.bot.sock.ev.on('messages.upsert', this.boundHandleStatusMonitoring);

            console.log('✅ Status plugin socket events registered');
        } catch (error) {
            console.error('Error registering status plugin events:', error);
        }
    }

    /**
     * Register all status commands
     */
    registerCommands() {
        // Register comprehensive status command
        this.bot.messageHandler.registerCommand('status', this.handleStatusCommand.bind(this), {
            description: 'Manage automatic status viewing, downloading, and forwarding',
            usage: `${config.PREFIX}status <jid>|on|off [no-dl] [except-view|only-view <jid,...>]`,
            category: 'status'
        });
    }

    /**
     * Handle comprehensive status command
     */
    async handleStatusCommand(messageInfo) {
        try {
            const args = messageInfo.args;
            
            if (args.length === 0) {
                // Show current status
                return await this.showStatusInfo(messageInfo);
            }

            const action = args[0].toLowerCase();

            if (action === 'off') {
                // Turn off status features
                this.statusSettings.enabled = false;
                this.saveStatusSettings();
                
                return await this.bot.messageHandler.reply(messageInfo, 
                    '🔴 Status auto-view and auto-download disabled');
            }

            if (action === 'on') {
                // Parse complex on command arguments
                return await this.handleStatusOnCommand(messageInfo, args);
            }

            // Check if this is a JID to set destination (like .save <jid> or .vv <jid>)
            if (args.length === 1) {
                // This is setting the forwarding destination
                const newDestination = this.normalizeJid(args[0]);
                this.statusSettings.forwardDestination = newDestination;
                this.saveStatusSettings();
                
                return await this.bot.messageHandler.reply(messageInfo, 
                    `📤 Status forwarding destination set to: ${newDestination}`);
            }

            // Invalid action
            return await this.bot.messageHandler.reply(messageInfo, 
                `❌ Invalid action. Use:\n` +
                `${config.PREFIX}status <jid> - Set forwarding destination\n` +
                `${config.PREFIX}status on|off [no-dl] [except-view|only-view <jid,...>]`);

        } catch (error) {
            console.error('Status command error:', error);
            return await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing status command');
        }
    }

    /**
     * Handle "status on" command with all its variations
     */
    async handleStatusOnCommand(messageInfo, args) {
        try {
            // Reset to defaults
            this.statusSettings.enabled = true;
            this.statusSettings.autoDownload = true;
            this.statusSettings.viewMode = 'all';
            this.statusSettings.filterJids = [];
            
            let i = 1; // Start after "on"
            let responseMsg = '🟢 Status auto-view enabled';

            // Parse arguments
            while (i < args.length) {
                const arg = args[i].toLowerCase();

                if (arg === 'no-dl') {
                    this.statusSettings.autoDownload = false;
                    responseMsg += '\n📱 Auto-download disabled';
                    i++;
                    continue;
                }

                if (arg === 'except-view') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing JID list for except-view');
                    }
                    
                    const jidList = args[i + 1].split(',').map(jid => jid.trim());
                    this.statusSettings.viewMode = 'except';
                    this.statusSettings.filterJids = this.normalizeJids(jidList);
                    responseMsg += `\n🚫 Excluding ${this.statusSettings.filterJids.length} JIDs from auto-view`;
                    i += 2;
                    continue;
                }

                if (arg === 'only-view') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing JID list for only-view');
                    }
                    
                    const jidList = args[i + 1].split(',').map(jid => jid.trim());
                    this.statusSettings.viewMode = 'only';
                    this.statusSettings.filterJids = this.normalizeJids(jidList);
                    responseMsg += `\n✅ Only viewing ${this.statusSettings.filterJids.length} specified JIDs`;
                    i += 2;
                    continue;
                }

                if (arg === 'destination') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing destination JID');
                    }
                    
                    this.statusSettings.forwardDestination = this.normalizeJid(args[i + 1]);
                    responseMsg += `\n📤 Forward destination set`;
                    i += 2;
                    continue;
                }

                // Unknown argument
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unknown argument: ${args[i]}`);
            }

            // Save settings
            this.saveStatusSettings();

            return await this.bot.messageHandler.reply(messageInfo, '🟢 Enabled');

        } catch (error) {
            console.error('Status on command error:', error);
            return await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing status on command');
        }
    }

    /**
     * Show current status configuration
     */
    async showStatusInfo(messageInfo) {
        try {
            let info = `📊 *Status Configuration*\n\n`;
            info += `🔘 Status: ${this.statusSettings.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n`;
            info += `📤 Forward to: ${this.statusSettings.forwardDestination}\n\n`;
            info += `💡 Usage:\n`;
            info += `${config.PREFIX}status <jid> - Set forwarding destination\n`;
            info += `${config.PREFIX}status on | off | no-dl | except-view <jid,...> | only-view <jid,...>`;

            return await this.bot.messageHandler.reply(messageInfo, info);
        } catch (error) {
            console.error('Status info error:', error);
        }
    }

    /**
     * Normalize JID format
     */
    normalizeJid(jid) {
        if (!jid.includes('@')) {
            return `${jid}@s.whatsapp.net`;
        }
        return jid;
    }

    /**
     * Normalize array of JIDs
     */
    normalizeJids(jidList) {
        return jidList.map(jid => this.normalizeJid(jid));
    }

    /**
     * Update environment variable
     */
    updateEnvVar(key, value) {
        try {
            // This would be handled by system plugin in production
            // For now just update the config object
            config[key] = value === 'true';
            console.log(`🔧 Updated ${key} = ${value}`);
        } catch (error) {
            console.error(`Error updating ${key}:`, error);
        }
    }

    async handleMessagesUpsert({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                // Handle auto status view first
                await this.handleAutoStatusView(message);

                // Extract JID information using centralized JID utils
                const jids = this.bot.jidUtils.extractJIDs(message);
                if (!jids) continue;

                // Get message text
                const messageType = Object.keys(message.message || {})[0];
                const content = message.message[messageType];
                let text = '';

                if (typeof content === 'string') {
                    text = content;
                } else if (content?.text) {
                    text = content.text;
                }

                if (!text) continue;

                // Check if this is a reply to a status
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const contextInfo = message.message?.extendedTextMessage?.contextInfo;

                if (quotedMessage && this.isStatusReply({ quotedMessage, contextInfo })) {
                    // Handle auto-send functionality for bot owner's status
                    if (this.shouldAutoSend(text.toLowerCase(), contextInfo, jids)) {
                        await this.handleAutoSend(quotedMessage, jids.chat_jid);
                    }
                }
            } catch (error) {
                // console.error(`Error in status message handler: ${error.message}`);
            }
        }
    }

    /**
     * Handle auto status view functionality
     */
    async handleAutoStatusView(message) {
        try {
            // Check if this is a status update and auto-view is enabled
            if (message.key?.remoteJid === 'status@broadcast' && 
                !message.key.fromMe && 
                this.statusSettings.enabled) {
                
                const participantJid = message.key.participant;
                const messageId = `${message.key.remoteJid}_${message.key.id}_${participantJid}`;
                
                // Check for message deduplication
                if (this.processedMessages.has(messageId)) {
                    return;
                }
                
                // Apply JID filtering based on viewMode
                if (!this.shouldViewStatus(participantJid)) {
                    this.logger.debug('🚫 Skipped viewing status from:', participantJid, '(filtered)');
                    return;
                }
                
                // Mark message as processed
                this.processedMessages.add(messageId);
                
                // Clean up old processed messages (keep last 1000)
                if (this.processedMessages.size > 1000) {
                    const firstEntry = this.processedMessages.values().next().value;
                    this.processedMessages.delete(firstEntry);
                }
                
                // Auto-view the status
                await this.bot.sock.readMessages([message.key]);
                this.logger.debug('👁️ Auto-viewed status from:', participantJid);
                
                // Handle auto-download and forwarding if enabled
                if (this.statusSettings.autoDownload) {
                    await this.handleAutoDownloadAndForward(message);
                }
            }
        } catch (error) {
            this.logger.error('Error auto-viewing status:', error.message);
        }
    }

    /**
     * Check if a status should be viewed based on filtering settings
     */
    shouldViewStatus(participantJid) {
        if (!participantJid) return false;
        
        switch (this.statusSettings.viewMode) {
            case 'all':
                return true;
            case 'except':
                return !this.statusSettings.filterJids.includes(participantJid);
            case 'only':
                return this.statusSettings.filterJids.includes(participantJid);
            default:
                return true;
        }
    }

    /**
     * Handle auto-download and forwarding functionality
     */
    async handleAutoDownloadAndForward(message) {
        try {
            const participantJid = message.key.participant;
            
            // Extract and download media if present
            const mediaData = await this.extractStatusMedia(message);
            const textContent = this.extractStatusText(message);
            
            if (mediaData || textContent) {
                // Forward to destination
                const destination = this.statusSettings.forwardDestination;
                
                if (mediaData) {
                    // Add source info to caption
                    const originalCaption = mediaData.caption || '';
                    const sourceInfo = `\n\n📱 Status from: ${participantJid.replace('@s.whatsapp.net', '')}`;
                    
                    if (mediaData.image) {
                        await this.bot.sock.sendMessage(destination, {
                            image: mediaData.image,
                            caption: originalCaption + sourceInfo
                        });
                    } else if (mediaData.video) {
                        await this.bot.sock.sendMessage(destination, {
                            video: mediaData.video,
                            caption: originalCaption + sourceInfo
                        });
                    } else if (mediaData.audio) {
                        await this.bot.sock.sendMessage(destination, {
                            audio: mediaData.audio,
                            mimetype: mediaData.mimetype
                        });
                        // Send source info separately for audio
                        await this.bot.sock.sendMessage(destination, {
                            text: `🎵 Audio status from: ${participantJid.replace('@s.whatsapp.net', '')}`
                        });
                    } else if (mediaData.document) {
                        await this.bot.sock.sendMessage(destination, {
                            document: mediaData.document,
                            mimetype: mediaData.mimetype,
                            fileName: mediaData.fileName
                        });
                        await this.bot.sock.sendMessage(destination, {
                            text: `📄 Document status from: ${participantJid.replace('@s.whatsapp.net', '')}`
                        });
                    } else if (mediaData.sticker) {
                        await this.bot.sock.sendMessage(destination, {
                            sticker: mediaData.sticker
                        });
                        await this.bot.sock.sendMessage(destination, {
                            text: `🎭 Sticker status from: ${participantJid.replace('@s.whatsapp.net', '')}`
                        });
                    }
                    
                    this.logger.debug(`📤 Auto-forwarded status media from ${participantJid} to ${destination}`);
                    
                } else if (textContent) {
                    // Forward text status
                    const sourceInfo = `📱 Status from: ${participantJid.replace('@s.whatsapp.net', '')}\n\n`;
                    await this.bot.sock.sendMessage(destination, {
                        text: sourceInfo + textContent
                    });
                    
                    this.logger.debug(`📤 Auto-forwarded status text from ${participantJid} to ${destination}`);
                }
            }
        } catch (error) {
            this.logger.error('Error in auto-download and forward:', error.message);
        }
    }

    /**
     * Check if message is a reply to WhatsApp status
     */
    isStatusReply(messageData) {
        // Check if message has quoted message and it's from status
        if (!messageData.quotedMessage) return false;

        // Status messages have specific characteristics:
        // 1. They come from status@broadcast
        // 2. Or have specific contextInfo indicating status
        const contextInfo = messageData.contextInfo;
        const isStatusBroadcast = contextInfo?.remoteJid?.includes('status@broadcast') ||
                                 contextInfo?.participant?.includes('status@broadcast') ||
                                 messageData.quotedMessage.key?.remoteJid?.includes('status@broadcast');

        return isStatusBroadcast;
    }

    /**
     * Check if user wants auto-send (contains 'send' keyword)
     */
    shouldAutoSend(text, contextInfo, jids) {
        // Only auto-send if replying to bot owner's status
        const botOwnerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
        const isReplyingToBotOwner = contextInfo?.participant === botOwnerJid;

        // Don't auto-send to the bot owner themselves
        if (jids.participant_jid === botOwnerJid) {
            return false;
        }

        // Check for 'send' keyword variations (more comprehensive)
        const hasSendKeyword = text.includes('send') ||
                              text.includes('please send') ||
                              text.includes('send please') ||
                              text.includes('pls send') ||
                              text.includes('send pls') ||
                              text.includes('plz send') ||
                              text.includes('send plz') ||
                              text.match(/\bsend\b/);

        console.log(`🔍 Auto-send check: Bot owner status: ${isReplyingToBotOwner}, Has send keyword: ${hasSendKeyword}, Text: "${text}"`);

        return isReplyingToBotOwner && hasSendKeyword;
    }

    /**
     * Auto-send status media to user who replied with 'send'
     */
    async handleAutoSend(quotedMessage, userJid) {
        try {
            // Extract media from quoted status
            const mediaData = await this.extractStatusMedia(quotedMessage);

            if (mediaData) {
                // Send the media to the user
                await this.bot.sock.sendMessage(userJid, mediaData);
                console.log(`📤 Auto-sent status media to ${userJid}`);
            } else {
                // If no media, send text content
                const textContent = this.extractStatusText(quotedMessage);
                if (textContent) {
                    await this.bot.sock.sendMessage(userJid, { text: textContent });
                    console.log(`📤 Auto-sent status text to ${userJid}`);
                }
            }
        } catch (error) {
            console.error(`Error in auto-send: ${error.message}`);
        }
    }

    /**
     * Monitor status updates for auto-saving own status
     */
    async handleStatusMonitoring({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                // Check if this is a status update from the bot owner
                if (message.key.remoteJid === 'status@broadcast' &&
                    message.key.participant === `${config.OWNER_NUMBER}@s.whatsapp.net`) {

                    // Status is already saved automatically in session/media by WhatsApp
                    // No need to forward to private chat
                    console.log('📱 Detected own status update (auto-save to chat disabled)');
                }
            } catch (error) {
                console.error(`Error in status monitoring: ${error.message}`);
            }
        }
    }


    /**
     * Extract media from status message
     */
    async extractStatusMedia(messageOrQuoted) {
        try {
            const { downloadMediaMessage } = require('baileys');
            
            // Handle both direct message and quoted message formats
            let messageContent, messageKey;
            
            if (messageOrQuoted.message) {
                // Direct message format
                messageContent = messageOrQuoted.message;
                messageKey = messageOrQuoted.key;
            } else {
                // Quoted message format
                messageContent = messageOrQuoted.message || messageOrQuoted;
                messageKey = messageOrQuoted.key || {};
            }

            // Create a proper message structure for baileys
            const mockMessage = {
                key: messageKey,
                message: messageContent
            };

            // Check for different media types
            if (messageContent.imageMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    image: buffer,
                    caption: messageContent.imageMessage.caption || ''
                };
            }

            if (messageContent.videoMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    video: buffer,
                    caption: messageContent.videoMessage.caption || ''
                };
            }

            if (messageContent.audioMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    audio: buffer,
                    mimetype: messageContent.audioMessage.mimetype
                };
            }

            if (messageContent.documentMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    document: buffer,
                    mimetype: messageContent.documentMessage.mimetype,
                    fileName: messageContent.documentMessage.fileName
                };
            }

            if (messageContent.stickerMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    sticker: buffer
                };
            }

            return null;
        } catch (error) {
            console.error(`Error extracting status media: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract text content from status
     */
    extractStatusText(messageOrQuoted) {
        try {
            // Handle both direct message and quoted message formats
            let messageContent;
            
            if (messageOrQuoted.message) {
                // Direct message format
                messageContent = messageOrQuoted.message;
            } else {
                // Quoted message format  
                messageContent = messageOrQuoted.message || messageOrQuoted;
            }

            if (messageContent.conversation) {
                return messageContent.conversation;
            }

            if (messageContent.extendedTextMessage) {
                return messageContent.extendedTextMessage.text;
            }

            // Check for text in media messages
            if (messageContent.imageMessage?.caption) {
                return messageContent.imageMessage.caption;
            }

            if (messageContent.videoMessage?.caption) {
                return messageContent.videoMessage.caption;
            }

            return null;
        } catch (error) {
            console.error(`Error extracting status text: ${error.message}`);
            return null;
        }
    }

    /**
     * Clean up event listeners to prevent duplicates on hot reload
     */
    destroy() {
        try {
            if (this.bot.sock?.ev) {
                this.bot.sock.ev.off('messages.upsert', this.boundHandleMessagesUpsert);
                this.bot.sock.ev.off('messages.upsert', this.boundHandleStatusMonitoring);
                console.log('🗑️ Status plugin event listeners cleaned up');
            }
        } catch (error) {
            console.error('Error cleaning up status plugin events:', error);
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new StatusPlugin();
        await plugin.init(bot);
        return plugin;
    }
};