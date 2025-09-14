/**
 * MATDEV Contact Manager Plugin
 * Comprehensive contact management for status posting
 * Supports CSV upload, auto-detect, and manual adding
 */

const config = require('../config');
const Utils = require('../lib/utils');
const JIDUtils = require('../lib/jid-utils');
const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');

const utils = new Utils();

class ContactManagerPlugin {
    constructor() {
        this.name = 'contact-manager';
        this.description = 'Comprehensive contact management for status posting';
        this.version = '1.0.0';
        this.contactsStoragePath = path.join(__dirname, '../session/storage/contacts.json');
        this.contacts = new Map(); // Map of normalized_jid -> contact_info
        this.jidUtils = new JIDUtils();
        this.autoDetectionSetup = false; // Prevent duplicate setup
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        await this.loadContacts();
        this.registerCommands();
        this.setupAutoDetection();
        
        console.log('✅ Contact Manager plugin loaded');
    }

    /**
     * Load contacts from persistent storage
     */
    async loadContacts() {
        try {
            if (await fs.pathExists(this.contactsStoragePath)) {
                const data = await fs.readJson(this.contactsStoragePath);
                
                // Convert array back to Map
                for (const contact of data) {
                    this.contacts.set(contact.jid, contact);
                }
                
                console.log(`📱 Loaded ${this.contacts.size} saved contacts`);
            } else {
                // Create empty contacts file
                await fs.ensureDir(path.dirname(this.contactsStoragePath));
                await this.saveContacts();
                console.log('📱 Created new contacts storage');
            }
        } catch (error) {
            console.warn('⚠️  Error loading contacts:', error.message);
            this.contacts = new Map();
        }
    }

    /**
     * Save contacts to persistent storage
     */
    async saveContacts() {
        try {
            const contactsArray = Array.from(this.contacts.values());
            await fs.writeJson(this.contactsStoragePath, contactsArray, { spaces: 2 });
        } catch (error) {
            console.error('❌ Error saving contacts:', error.message);
        }
    }

    /**
     * Normalize phone number to JID format
     * ONLY for phone number input, NOT for existing JIDs
     */
    normalizePhoneToJid(phoneNumber) {
        if (!phoneNumber) return null;
        
        // If it's already a JID, return as-is to preserve device suffixes
        if (phoneNumber.includes('@')) {
            return phoneNumber;
        }
        
        // Remove all non-numeric characters
        let cleaned = phoneNumber.replace(/[^\d]/g, '');
        
        // Handle different country code formats
        if (cleaned.startsWith('0')) {
            // Remove leading 0 for Nigerian numbers (+234)
            cleaned = '234' + cleaned.substring(1);
        } else if (!cleaned.startsWith('234') && cleaned.length === 11) {
            // Add Nigerian country code if missing
            cleaned = '234' + cleaned.substring(1);
        }
        
        return `${cleaned}@s.whatsapp.net`;
    }

    /**
     * Safely normalize any JID without corrupting device suffixes
     */
    safeNormalizeJid(jid) {
        if (!jid) return null;
        
        // Use the proper JIDUtils for JID normalization
        return this.jidUtils.normalizeJid(jid);
    }

    /**
     * Extract base phone number from JID (without device suffix)
     */
    getBaseJidFromUser(userJid) {
        if (!userJid) return null;
        
        // Extract base phone number from user JID (removes device suffix)
        const phoneNumber = userJid.split(':')[0];
        return `${phoneNumber}@s.whatsapp.net`;
    }

    /**
     * Add a contact to the system
     */
    async addContact(phoneNumber, name = null, source = 'manual') {
        try {
            const normalizedJid = this.normalizePhoneToJid(phoneNumber);
            if (!normalizedJid) {
                throw new Error('Invalid phone number format');
            }

            // Check if contact already exists
            if (this.contacts.has(normalizedJid)) {
                return { success: false, message: 'Contact already exists', jid: normalizedJid };
            }

            // Exclude bot's own number (properly extract base JID)
            const botBaseJid = this.getBaseJidFromUser(this.bot.sock?.user?.id);
            if (normalizedJid === botBaseJid) {
                return { success: false, message: 'Cannot add bot\'s own number as contact' };
            }

            // Create contact object
            const contact = {
                jid: normalizedJid,
                phoneNumber: phoneNumber,
                name: name || null,
                source: source, // 'manual', 'csv', 'auto'
                addedAt: new Date().toISOString(),
                lastSeen: source === 'auto' ? new Date().toISOString() : null
            };

            // Validate contact exists on WhatsApp (optional)
            if (source === 'manual' || source === 'csv') {
                try {
                    const exists = await this.validateContact(normalizedJid);
                    if (!exists) {
                        return { success: false, message: 'Phone number not found on WhatsApp' };
                    }
                } catch (validationError) {
                    console.warn('⚠️  Contact validation failed, adding anyway:', validationError.message);
                }
            }

            // Add to contacts
            this.contacts.set(normalizedJid, contact);
            await this.saveContacts();

            return { success: true, message: 'Contact added successfully', contact, jid: normalizedJid };

        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    /**
     * Validate if contact exists on WhatsApp
     */
    async validateContact(jid) {
        try {
            if (!this.bot.sock || !this.bot.sock.onWhatsApp) {
                return true; // Skip validation if not available
            }

            const results = await this.bot.sock.onWhatsApp(jid);
            return results.length > 0 && results[0].exists;
        } catch (error) {
            console.warn('Contact validation error:', error.message);
            return true; // Assume valid if validation fails
        }
    }

    /**
     * Parse CSV content and extract contacts
     */
    parseCSV(csvContent) {
        try {
            const lines = csvContent.split('\n').filter(line => line.trim());
            const contacts = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Support multiple CSV formats
                let name = null;
                let phoneNumber = null;

                // Try comma-separated format: Name,Phone or Phone,Name
                if (line.includes(',')) {
                    const parts = line.split(',').map(part => part.trim().replace(/['"]/g, ''));
                    
                    // Detect which part is the phone number
                    const phoneRegex = /[\d\+\-\s\(\)]{8,}/;
                    
                    if (phoneRegex.test(parts[0])) {
                        phoneNumber = parts[0];
                        name = parts[1] || null;
                    } else if (phoneRegex.test(parts[1])) {
                        name = parts[0];
                        phoneNumber = parts[1];
                    }
                } else {
                    // Single column - assume it's phone number
                    phoneNumber = line;
                }

                if (phoneNumber) {
                    contacts.push({ name, phoneNumber });
                }
            }

            return contacts;
        } catch (error) {
            throw new Error(`CSV parsing failed: ${error.message}`);
        }
    }

    /**
     * Setup auto-detection of contacts from incoming messages
     * Use event-based approach to avoid monkey-patching issues
     */
    setupAutoDetection() {
        // Prevent multiple setup on hot reload
        if (this.autoDetectionSetup) {
            return;
        }

        // Use event-based approach instead of monkey-patching
        if (this.bot.messageHandler && this.bot.messageHandler.on) {
            this.bot.messageHandler.on('message', this.autoDetectContact.bind(this));
        } else {
            // Fallback: Check if we can safely monkey-patch
            if (this.bot.messageHandler && !this.bot.messageHandler._contactManagerPatched) {
                const originalProcess = this.bot.messageHandler.process.bind(this.bot.messageHandler);
                
                this.bot.messageHandler.process = async (message) => {
                    // Auto-detect contact first
                    await this.autoDetectContact(message);
                    
                    // Then proceed with normal message processing
                    return await originalProcess(message);
                };
                
                // Mark as patched to prevent duplicate patching
                this.bot.messageHandler._contactManagerPatched = true;
            }
        }
        
        this.autoDetectionSetup = true;
    }

    /**
     * Auto-detect and save contact from incoming message
     */
    async autoDetectContact(message) {
        try {
            if (!message.key || message.key.fromMe) {
                return; // Skip outgoing messages
            }

            const senderJid = message.key.participant || message.key.remoteJid;
            
            // Only save personal contacts (not groups)
            if (!senderJid || !senderJid.endsWith('@s.whatsapp.net')) {
                return;
            }

            // Use proper JID normalization (preserves device suffixes)
            const normalizedJid = this.safeNormalizeJid(senderJid);
            const baseJid = this.getBaseJidFromUser(senderJid); // For storage key
            
            // Update existing contact or add new one
            if (this.contacts.has(baseJid)) {
                // Update last seen
                const contact = this.contacts.get(baseJid);
                contact.lastSeen = new Date().toISOString();
                this.contacts.set(baseJid, contact);
                await this.saveContacts();
            } else {
                // Add new auto-detected contact using base phone number
                const phoneNumber = senderJid.split('@')[0].split(':')[0];
                await this.addContact(phoneNumber, null, 'auto');
            }

        } catch (error) {
            console.warn('Auto-detection error:', error.message);
        }
    }

    /**
     * Get all contacts as status recipients
     */
    getStatusRecipients() {
        const recipients = [];
        const botBaseJid = this.getBaseJidFromUser(this.bot.sock?.user?.id);

        for (const [jid, contact] of this.contacts) {
            // Exclude bot's own number (compare base JIDs)
            if (jid !== botBaseJid) {
                recipients.push(jid);
            }
        }

        return recipients;
    }

    /**
     * Register all contact commands
     */
    registerCommands() {
        // Main contact command with subcommands
        this.bot.messageHandler.registerCommand('contact', this.contactCommand.bind(this), {
            description: 'Manage contacts for status posting',
            usage: `${config.PREFIX}contact [upload|add|list] [parameters]`,
            category: 'contacts',
            plugin: 'contact-manager',
            source: 'contact-manager.js'
        });
    }

    /**
     * Main contact command handler
     */
    async contactCommand(messageInfo) {
        const { args, message, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;

        try {
            if (!args || args.length === 0) {
                // Show help
                await this.showContactHelp(fromJid);
                return;
            }

            const subCommand = args[0].toLowerCase();

            switch (subCommand) {
                case 'upload':
                    await this.handleContactUpload(messageInfo);
                    break;
                
                case 'add':
                    await this.handleContactAdd(messageInfo);
                    break;
                
                case 'list':
                    await this.handleContactList(messageInfo);
                    break;
                
                default:
                    await this.showContactHelp(fromJid);
                    break;
            }

        } catch (error) {
            console.error('Error in contactCommand:', error);
            await this.bot.sock.sendMessage(fromJid, {
                text: '❌ Error processing contact command: ' + error.message
            });
        }
    }

    /**
     * Show contact command help
     */
    async showContactHelp(fromJid) {
        const helpText = `📱 *CONTACT MANAGEMENT*\n\n` +
                        `*Available commands:*\n\n` +
                        `📄 *${config.PREFIX}contact upload*\n` +
                        `Reply to a CSV file with this command to upload all contacts\n` +
                        `CSV format: Name,Phone or Phone,Name (one per line)\n\n` +
                        `➕ *${config.PREFIX}contact add +234XXXXXXXXX*\n` +
                        `Add a single contact manually\n\n` +
                        `📋 *${config.PREFIX}contact list*\n` +
                        `View all saved contacts\n\n` +
                        `🤖 *Auto-Detection:*\n` +
                        `Contacts are automatically saved when people message the bot\n\n` +
                        `💡 *Tips:*\n` +
                        `• CSV can have name (optional) and phone number\n` +
                        `• Phone format: +234XXXXXXXXX or 0XXXXXXXXX\n` +
                        `• Names are optional, WhatsApp shows saved names\n` +
                        `• Auto-detection works in background`;

        await this.bot.sock.sendMessage(fromJid, { text: helpText });
    }

    /**
     * Handle contact upload from CSV
     */
    async handleContactUpload(messageInfo) {
        const { message, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;

        try {
            // Check for quoted message using the same approach as sticker/photo plugins
            const quotedMessage = message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                  message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.sock.sendMessage(fromJid, {
                    text: '❌ Please reply to a CSV file with this command!\n\n' +
                          'Example: Upload your CSV file, then reply to it with:\n' +
                          `${config.PREFIX}contact upload`
                });
                return;
            }

            // Check for document messages (like CSV files)
            if (!quotedMessage.documentMessage && !quotedMessage.documentWithCaptionMessage) {
                await this.bot.sock.sendMessage(fromJid, {
                    text: '❌ Please reply to a document/CSV file with this command!\n\n' +
                          'Example: Upload your CSV file, then reply to it with:\n' +
                          `${config.PREFIX}contact upload`
                });
                return;
            }

            // Download the CSV file
            const csvPath = await this.downloadCSVFile(messageInfo, quotedMessage);
            
            if (!csvPath) {
                await this.bot.sock.sendMessage(fromJid, {
                    text: '❌ Failed to download CSV file. Please try again.'
                });
                return;
            }

            // Read and parse CSV
            const csvContent = await fs.readFile(csvPath, 'utf8');
            const parsedContacts = this.parseCSV(csvContent);

            if (parsedContacts.length === 0) {
                await this.bot.sock.sendMessage(fromJid, {
                    text: '❌ No valid contacts found in CSV file.\n\n' +
                          'Please ensure your CSV has the format:\n' +
                          'Name,Phone or Phone,Name (one per line)'
                });
                return;
            }

            // Add contacts
            let successCount = 0;
            let errorCount = 0;
            let duplicateCount = 0;

            const progressMessage = await this.bot.sock.sendMessage(fromJid, {
                text: `📤 Processing ${parsedContacts.length} contacts...`
            });

            for (const contactData of parsedContacts) {
                const result = await this.addContact(contactData.phoneNumber, contactData.name, 'csv');
                
                if (result.success) {
                    successCount++;
                } else if (result.message.includes('already exists')) {
                    duplicateCount++;
                } else {
                    errorCount++;
                    console.warn(`Failed to add contact ${contactData.phoneNumber}: ${result.message}`);
                }
            }

            // Save all changes
            await this.saveContacts();

            // Clean up CSV file
            this.cleanupFile(csvPath);

            // Send final report
            const reportText = `✅ *CSV UPLOAD COMPLETE*\n\n` +
                             `📊 *Results:*\n` +
                             `✅ Added: ${successCount} contacts\n` +
                             `🔄 Duplicates: ${duplicateCount} contacts\n` +
                             `❌ Errors: ${errorCount} contacts\n` +
                             `📱 Total contacts: ${this.contacts.size}\n\n` +
                             `💡 Use \`${config.PREFIX}contact list\` to view all contacts`;

            await this.bot.sock.sendMessage(fromJid, { text: reportText });

        } catch (error) {
            console.error('CSV upload error:', error);
            await this.bot.sock.sendMessage(fromJid, {
                text: '❌ CSV upload failed: ' + error.message
            });
        }
    }

    /**
     * Handle manual contact addition
     */
    async handleContactAdd(messageInfo) {
        const { args, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;

        if (args.length < 2) {
            await this.bot.sock.sendMessage(fromJid, {
                text: `❌ Please provide a phone number!\n\n` +
                      `*Usage:*\n${config.PREFIX}contact add +234XXXXXXXXX\n` +
                      `${config.PREFIX}contact add 08XXXXXXXXX`
            });
            return;
        }

        const phoneNumber = args[1];
        const name = args.slice(2).join(' ') || null;

        const result = await this.addContact(phoneNumber, name, 'manual');

        if (result.success) {
            await this.bot.sock.sendMessage(fromJid, {
                text: `✅ *Contact Added Successfully!*\n\n` +
                      `📱 Phone: ${phoneNumber}\n` +
                      `${name ? `👤 Name: ${name}\n` : ''}` +
                      `📊 Total contacts: ${this.contacts.size}`
            });
        } else {
            await this.bot.sock.sendMessage(fromJid, {
                text: `❌ Failed to add contact: ${result.message}`
            });
        }
    }

    /**
     * Handle contact list display
     */
    async handleContactList(messageInfo) {
        const { chat_jid } = messageInfo || {};
        const fromJid = chat_jid;

        if (this.contacts.size === 0) {
            await this.bot.sock.sendMessage(fromJid, {
                text: `📱 *No contacts saved yet!*\n\n` +
                      `Add contacts using:\n` +
                      `• ${config.PREFIX}contact add +234XXXXXXXXX\n` +
                      `• ${config.PREFIX}contact upload (reply to CSV)\n` +
                      `• Message the bot (auto-detection)`
            });
            return;
        }

        const contactsArray = Array.from(this.contacts.values());
        const recentContacts = contactsArray
            .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
            .slice(0, 20); // Show first 20

        let response = `📱 *SAVED CONTACTS (${this.contacts.size} total)*\n\n`;

        for (let i = 0; i < recentContacts.length; i++) {
            const contact = recentContacts[i];
            const phoneNumber = contact.phoneNumber || contact.jid.split('@')[0];
            const displayName = contact.name || 'No name';
            
            response += `${i + 1}. ${displayName}: 📱 ${phoneNumber}\n`;
        }

        if (this.contacts.size > 20) {
            response += `\n... and ${this.contacts.size - 20} more contacts`;
        }

        await this.bot.sock.sendMessage(fromJid, { text: response });
    }

    /**
     * Download CSV file from quoted message
     */
    async downloadCSVFile(messageInfo, quotedMessage) {
        try {
            const tempDir = path.join(__dirname, '../tmp');
            await fs.ensureDir(tempDir);

            const timestamp = Date.now();
            const filename = `contacts_${timestamp}.csv`;
            const filePath = path.join(tempDir, filename);

            // Handle different document message types
            let documentMessage = quotedMessage.documentMessage;
            
            // Check for documentWithCaptionMessage (like your CSV file)
            if (!documentMessage && quotedMessage.documentWithCaptionMessage) {
                documentMessage = quotedMessage.documentWithCaptionMessage.message.documentMessage;
            }

            if (!documentMessage) {
                console.error('No document message found in quoted message');
                return null;
            }

            // Create proper message structure for download - use the same pattern as other plugins
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            const messageToDownload = {
                key: contextInfo?.stanzaId ? {
                    id: contextInfo.stanzaId,
                    remoteJid: messageInfo.chat_jid,
                    fromMe: contextInfo.participant === this.bot.sock.user?.id,
                    participant: contextInfo.participant
                } : {
                    remoteJid: messageInfo.chat_jid,
                    fromMe: false,
                    id: 'csv-download-' + Date.now()
                },
                message: quotedMessage
            };

            // Download using Baileys downloadMediaMessage
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            if (buffer && buffer.length > 0) {
                await fs.writeFile(filePath, buffer);
                console.log(`📥 CSV file downloaded: ${buffer.length} bytes`);
                return filePath;
            }

            console.error('Downloaded buffer is empty or null');
            return null;

        } catch (error) {
            console.error('Error downloading CSV file:', error);
            return null;
        }
    }

    /**
     * Clean up temporary files
     */
    cleanupFile(filePath) {
        try {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Cleaned up temporary file: ${path.basename(filePath)}`);
            }
        } catch (error) {
            console.error('Error cleaning up file:', error);
        }
    }

    /**
     * Cleanup when plugin is stopped
     */
    stop() {
        // Clean up event listeners if using event-based approach
        if (this.bot.messageHandler && this.bot.messageHandler.removeListener) {
            this.bot.messageHandler.removeListener('message', this.autoDetectContact.bind(this));
        }
        
        // Reset auto-detection setup flag
        this.autoDetectionSetup = false;
        
        console.log('🛑 Contact Manager stopped and cleaned up');
    }

    /**
     * Destroy plugin and cleanup resources
     */
    destroy() {
        this.stop();
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ContactManagerPlugin();
        await plugin.init(bot);
        return plugin;
    }
};