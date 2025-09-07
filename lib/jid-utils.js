/**
 * Centralized JID detection utility for MATDEV WhatsApp Bot
 * Handles business accounts, regular accounts, groups, and all edge cases
 */

class JIDUtils {
    constructor(logger) {
        this.logger = logger || console;
    }

    /**
     * Extract all JID information from a WhatsApp message
     * Returns standardized JID object with chat_jid, sender_jid, participant_jid
     */
    extractJIDs(message) {
        try {
            const key = message.key;
            const remoteJid = key.remoteJid;
            const fromMe = key.fromMe;
            
            // this.logger.info(`🔍 JID extraction starting for: ${remoteJid}, fromMe: ${fromMe}`);
            
            // Determine chat JID (where the conversation is happening)
            // For business accounts, use the actual phone number instead of LID
            let chat_jid;
            if (key.senderPn && remoteJid.endsWith('@lid')) {
                // Business account - use actual phone number for chat_jid
                chat_jid = key.senderPn;
            } else {
                // Regular chat - use the original remoteJid
                chat_jid = remoteJid;
            }
            
            // Determine sender JID (who actually sent the message)
            let sender_jid;
            if (fromMe) {
                // Outgoing message - sender is the bot/owner
                sender_jid = this.getBotJid() || global.botJid || 'unknown@s.whatsapp.net';
            } else {
                // Incoming message - use business account detection
                if (key.senderPn && remoteJid.endsWith('@lid')) {
                    // Business account - use actual phone number
                    sender_jid = key.senderPn;
                } else if (remoteJid.endsWith('@g.us') && key.participant) {
                    // Group message - sender is the participant
                    sender_jid = key.participant;
                } else {
                    // Regular private message
                    sender_jid = remoteJid;
                }
            }
            
            // Determine participant JID (who should get credit/blame for permissions)
            let participant_jid;
            if (fromMe) {
                // For outgoing messages, participant is the bot/owner
                participant_jid = this.getBotJid() || global.botJid || 'unknown@s.whatsapp.net';
            } else {
                // For incoming messages, participant is same as sender
                participant_jid = sender_jid;
            }
            
            const result = {
                chat_jid,
                sender_jid, 
                participant_jid,
                is_business: key.senderPn && remoteJid.endsWith('@lid'),
                is_group: remoteJid.endsWith('@g.us'),
                from_me: fromMe
            };
            
            // this.logger.info(`✅ JID extraction successful:`, result);
            return result;
            
        } catch (error) {
            this.logger.error('❌ Error extracting JIDs:', error);
            // Return a fallback instead of null to prevent processing from stopping
            return {
                chat_jid: message.key.remoteJid,
                sender_jid: message.key.remoteJid,
                participant_jid: message.key.participant || message.key.remoteJid,
                is_business: false,
                is_group: message.key.remoteJid.endsWith('@g.us'),
                from_me: message.key.fromMe
            };
        }
    }

    /**
     * Get bot's JID (requires config or can be detected from message context)
     */
    getBotJid() {
        // This should be set by the main bot when initializing
        return global.botJid || null;
    }

    /**
     * Normalize JID to standard format
     */
    normalizeJid(jid) {
        if (!jid) return null;
        if (!jid.includes('@')) {
            return `${jid}@s.whatsapp.net`;
        }
        return jid;
    }

    /**
     * Check if JID is a business account format
     */
    isBusinessAccount(jid) {
        return jid && jid.endsWith('@lid');
    }

    /**
     * Check if JID is a group
     */
    isGroup(jid) {
        return jid && jid.endsWith('@g.us');
    }

    /**
     * Convert business account LID to phone number format (if possible)
     */
    businessToPhone(lidJid, senderPn) {
        if (this.isBusinessAccount(lidJid) && senderPn) {
            return senderPn;
        }
        return lidJid;
    }
}

module.exports = JIDUtils;