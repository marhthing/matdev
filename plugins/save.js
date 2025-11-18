const config = require('../config');

class SavePlugin {
    constructor() {
        this.name = 'save';
        this.description = 'Save and forward messages to specified destinations';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.logger = bot.logger;
        this.registerCommands();

        console.log('✅ Save plugin loaded');
        return this;
    }

    /**
     * Register save commands
     */
    registerCommands() {
        // Register save command
        this.bot.messageHandler.registerCommand('save', this.handleSaveCommand.bind(this), {
            description: 'Forward any replied message to bot private chat or set default destination',
            usage: `${config.PREFIX}save [jid] - Set default destination or forward message`,
            category: 'utility'
        });
    }

    /**
     * Handle .save command to forward any replied message to bot private chat or set default destination
     */
    async handleSaveCommand(message) {
        try {
            // Extract JID information using centralized JID utils
            const jids = this.bot.jidUtils.extractJIDs(message);
            if (!jids) {
                console.error('Failed to extract JIDs from message');
                return;
            }

            // Check if this is just setting the default destination
            const args = message.message?.extendedTextMessage?.text?.split(' ') || 
                        message.message?.conversation?.split(' ') || [];

            if (args.length > 1 && args[1]) {
                // Check if this is NOT a reply (meaning user wants to set default destination)
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (!quotedMessage) {
                    // This is setting the default destination
                    let newDefaultJid = args[1];

                    // Normalize JID format
                    if (!newDefaultJid.includes('@')) {
                        newDefaultJid = `${newDefaultJid}@s.whatsapp.net`;
                    }

                    // Save the new default destination
                    this.bot.database.setData('saveDefaultDestination', newDefaultJid);
                    console.log(`✅ Default save destination set to: ${newDefaultJid}`);
                    return;
                }
            }

            // Check if this is a reply to any message
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;

            if (!quotedMessage) {
                console.log('❌ Please reply to any message with .save');
                return;
            }

            // Get saved default destination or fallback to bot private chat
            let targetJid = this.bot.database.getData('saveDefaultDestination') || `${config.OWNER_NUMBER}@s.whatsapp.net`;

            console.log(`💾 Forwarding message to ${targetJid}`);

            // Use WhatsApp's native forward mechanism - directly forward to destination
            await this.bot.sock.sendMessage(targetJid, {
                forward: {
                    key: contextInfo.stanzaId ? {
                        id: contextInfo.stanzaId,
                        remoteJid: contextInfo.remoteJid || jids.chat_jid,
                        participant: contextInfo.participant,
                        fromMe: false
                    } : undefined,
                    message: quotedMessage
                }
            });

            console.log(`✅ Message forwarded to destination`);

            // No confirmation message sent - using bot reactions instead

        } catch (error) {
            console.error(`Error in save command: ${error.message}`);
        }
    }

    /**
     * Extract media from any message type
     */
    async extractAnyMedia(quotedMessage) {
        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');

            // Handle different message structures
            let messageContent = quotedMessage.message || quotedMessage;
            let messageKey = quotedMessage.key || {};

            // Handle view once messages
            if (messageContent.viewOnceMessage) {
                messageContent = messageContent.viewOnceMessage.message;
            }

            // Create a mock message structure for baileys
            const mockMessage = {
                key: messageKey,
                message: messageContent
            };

            // Download media buffer
            const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
            return buffer;

        } catch (error) {
            console.error(`Error extracting media: ${error.message}`);
            throw error;
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new SavePlugin();
        await plugin.init(bot);
        return plugin;
    }
};