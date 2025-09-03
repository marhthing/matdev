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
            
            // Determine chat JID (where the conversation is happening)
            // For business accounts, normalize to phone number format for consistency
            let chat_jid = remoteJid;
            if (key.senderPn && remoteJid.endsWith('@lid')) {
                // Business account - use the actual phone number for chat consistency
                chat_jid = key.senderPn;
            }
            
            // Determine sender JID (who actually sent the message)
            let sender_jid;
            if (fromMe) {
                // Outgoing message - sender is the bot/owner
                sender_jid = this.getBotJid();
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
                participant_jid = this.getBotJid();
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
            
            this.logger.debug(`JID extraction: ${JSON.stringify(result)}`);
            return result;
            
        } catch (error) {
            this.logger.error('Error extracting JIDs:', error);
            return null;
        }
    }

    /**
     * Get bot's JID (requires config or can be detected from message context)
     */
    getBotJid() {
        // This should be set by the main bot when initializing
        return global.botJid || '2347046040727@s.whatsapp.net';
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