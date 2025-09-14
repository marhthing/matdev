/**
 * MATDEV Contact Manager Plugin
 * Comprehensive contact management for status posting
 * Supports CSV upload, auto-detect, and manual adding
 */

const config = require('../config');
const Utils = require('../lib/utils');
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
     */
    normalizeJid(phoneNumber) {
        if (!phoneNumber) return null;
        
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
     * Add a contact to the system
     */
    async addContact(phoneNumber, name = null, source = 'manual') {
        try {
            const normalizedJid = this.normalizeJid(phoneNumber);
            if (!normalizedJid) {
                throw new Error('Invalid phone number format');
            }

            // Check if contact already exists
            if (this.contacts.has(normalizedJid)) {
                return { success: false, message: 'Contact already exists', jid: normalizedJid };
            }

            // Exclude bot's own number
            const botJid = this.normalizeJid(this.bot.sock?.user?.id);
            if (normalizedJid === botJid) {
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
     */
    setupAutoDetection() {
        // Hook into message processing
        if (this.bot.messageHandler) {
            const originalProcess = this.bot.messageHandler.process.bind(this.bot.messageHandler);
            
            this.bot.messageHandler.process = async (message) => {
                // Auto-detect contact first
                await this.autoDetectContact(message);
                
                // Then proceed with normal message processing
                return await originalProcess(message);
            };
        }
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

            const normalizedJid = this.normalizeJid(senderJid);
            
            // Update existing contact or add new one
            if (this.contacts.has(normalizedJid)) {
                // Update last seen
                const contact = this.contacts.get(normalizedJid);
                contact.lastSeen = new Date().toISOString();
                this.contacts.set(normalizedJid, contact);
            } else {
                // Add new auto-detected contact
                const phoneNumber = senderJid.split('@')[0];
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
        const botJid = this.normalizeJid(this.bot.sock?.user?.id);

        for (const [jid, contact] of this.contacts) {
            // Exclude bot's own number
            if (jid !== botJid) {
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
            // Check if this is a reply to a document
            const contextInfo = message?.extendedTextMessage?.contextInfo;
            const quotedMessage = contextInfo?.quotedMessage;

            if (!quotedMessage || !quotedMessage.documentMessage) {
                await this.bot.sock.sendMessage(fromJid, {
                    text: '❌ Please reply to a CSV file with this command!\n\n' +
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
            const source = contact.source || 'unknown';
            
            response += `${i + 1}. ${displayName}\n`;
            response += `   📱 ${phoneNumber}\n`;
            response += `   📥 Source: ${source}\n\n`;
        }

        if (this.contacts.size > 20) {
            response += `... and ${this.contacts.size - 20} more contacts\n\n`;
        }

        response += `💡 *Sources:*\n`;
        response += `• auto = Message auto-detection\n`;
        response += `• manual = Added via command\n`;
        response += `• csv = Uploaded from CSV file`;

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

            // Create proper message structure for download
            const messageToDownload = {
                key: {
                    remoteJid: messageInfo.chat_jid,
                    fromMe: false,
                    id: messageInfo.message.extendedTextMessage.contextInfo.stanzaId || 'fake-id-' + Date.now()
                },
                message: quotedMessage
            };

            // Download using Baileys downloadMediaMessage
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {});

            if (buffer) {
                await fs.writeFile(filePath, buffer);
                return filePath;
            }

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
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.error('Error cleaning up file:', error);
        }
    }

    /**
     * Cleanup when plugin is stopped
     */
    stop() {
        // Cleanup if needed
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