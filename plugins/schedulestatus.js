/**
 * MATDEV Schedule Status Plugin
 * Post status immediately or schedule status updates with persistent storage
 */

const config = require('../config');
const Utils = require('../lib/utils');
const JIDUtils = require('../lib/jid-utils');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');
const { downloadMediaMessage } = require('baileys');

const utils = new Utils();

class ScheduleStatusPlugin {
    constructor() {
        this.name = 'schedulestatus';
        this.description = 'Post status immediately or schedule status updates';
        this.version = '1.0.0';
        this.statusSchedulePath = path.join(__dirname, '../session/storage/status_schedules.json');
        this.statusSchedules = new Map();
        this.checkInterval = null;
        this.jidUtils = new JIDUtils();
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.nextId = 1; // Start counter for simple IDs
        this.loadStatusSchedules();
        this.startStatusScheduleChecker();
        this.registerCommands();
        
        console.log('✅ Schedule Status plugin loaded');
    }

    /**
     * Load status schedules from persistent storage
     */
    loadStatusSchedules() {
        try {
            if (fs.existsSync(this.statusSchedulePath)) {
                const data = fs.readJsonSync(this.statusSchedulePath);
                
                let maxId = 0;
                // Convert array back to Map and validate dates
                for (const schedule of data) {
                    const scheduleTime = moment.tz(schedule.time, config.TIMEZONE);
                    
                    // Track highest ID for next counter
                    const idNum = parseInt(schedule.id);
                    if (!isNaN(idNum) && idNum > maxId) {
                        maxId = idNum;
                    }
                    
                    // Only load future schedules
                    if (scheduleTime.isAfter(moment())) {
                        this.statusSchedules.set(schedule.id, {
                            ...schedule,
                            time: scheduleTime.toISOString()
                        });
                    }
                }
                
                // Set next ID to be one higher than the highest found
                this.nextId = maxId + 1;
                
                console.log(`📅 Loaded ${this.statusSchedules.size} pending status schedules`);
            } else {
                // Create empty status schedules file
                fs.ensureDirSync(path.dirname(this.statusSchedulePath));
                this.saveStatusSchedules();
            }
        } catch (error) {
            console.warn('⚠️  Error loading status schedules:', error.message);
            this.statusSchedules = new Map();
        }
    }

    /**
     * Save status schedules to persistent storage
     */
    saveStatusSchedules() {
        try {
            const schedulesArray = Array.from(this.statusSchedules.values());
            fs.writeJsonSync(this.statusSchedulePath, schedulesArray, { spaces: 2 });
        } catch (error) {
            console.error('❌ Error saving status schedules:', error.message);
        }
    }

    /**
     * Start the status schedule checker (runs every minute)
     */
    startStatusScheduleChecker() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.checkInterval = setInterval(() => {
            this.checkPendingStatusSchedules();
        }, 60000); // Check every minute
        
        // Also check immediately on startup
        setTimeout(() => this.checkPendingStatusSchedules(), 5000);
    }

    /**
     * Check for status schedules that need to be posted
     */
    async checkPendingStatusSchedules() {
        const now = moment().tz(config.TIMEZONE);
        const toPost = [];
        
        for (const [id, schedule] of this.statusSchedules) {
            const scheduleTime = moment(schedule.time);
            
            if (now.isSameOrAfter(scheduleTime)) {
                toPost.push({ id, schedule });
            }
        }
        
        for (const { id, schedule } of toPost) {
            try {
                await this.postScheduledStatus(schedule);
                this.statusSchedules.delete(id);
                console.log(`✅ Posted scheduled status ${id}`);
            } catch (error) {
                console.error(`❌ Failed to post scheduled status ${id}:`, error.message);
                // Remove failed schedules to prevent infinite retries
                this.statusSchedules.delete(id);
            }
        }
        
        if (toPost.length > 0) {
            this.saveStatusSchedules();
        }
    }

    /**
     * Post a scheduled status
     */
    async postScheduledStatus(schedule) {
        const { type, content, caption, mediaPath } = schedule;
        
        try {
            // Get status recipients - all contacts or fallback to owner
            const statusJidList = await this.getStatusRecipients();
            
            // Check if we have recipients
            if (statusJidList.length === 0) {
                console.error('❌ No recipients found for scheduled status. Status will not be visible.');
                throw new Error('No recipients available for status posting');
            }
            
            if (type === 'text') {
                await this.bot.sock.sendMessage('status@broadcast', {
                    text: content
                }, {
                    statusJidList
                });
            } else if (type === 'image') {
                await this.bot.sock.sendMessage('status@broadcast', {
                    image: { url: mediaPath },
                    caption: caption || content
                }, {
                    statusJidList
                });
            } else if (type === 'video') {
                await this.bot.sock.sendMessage('status@broadcast', {
                    video: { url: mediaPath },
                    caption: caption || content
                }, {
                    statusJidList
                });
            }
            
            console.log(`✅ Scheduled status posted to ${statusJidList.length} recipients`);
            
            // Clean up media file after successful posting
            if (mediaPath) {
                this.cleanupFile(mediaPath);
            }
        } catch (error) {
            console.error('Error posting scheduled status:', error);
            throw error;
        }
    }

    /**
     * Post status immediately
     */
    async postStatusNow(type, content, mediaPath = null, caption = null) {
        try {
            // Get status recipients - all contacts or fallback to owner
            const statusJidList = await this.getStatusRecipients();
            
            // Check if we have recipients
            if (statusJidList.length === 0) {
                console.error('❌ No recipients found for status posting. Status will not be visible.');
                return false;
            }
            
            if (type === 'text') {
                await this.bot.sock.sendMessage('status@broadcast', {
                    text: content
                }, {
                    statusJidList
                });
            } else if (type === 'image') {
                await this.bot.sock.sendMessage('status@broadcast', {
                    image: { url: mediaPath },
                    caption: caption || content
                }, {
                    statusJidList
                });
            } else if (type === 'video') {
                await this.bot.sock.sendMessage('status@broadcast', {
                    video: { url: mediaPath },
                    caption: caption || content
                }, {
                    statusJidList
                });
            }
            
            console.log(`✅ Status posted to ${statusJidList.length} recipients`);
            return true;
        } catch (error) {
            console.error('Error posting status:', error);
            return false;
        }
    }

    /**
     * Register all status commands
     */
    registerCommands() {
        // Register immediate status posting command
        this.bot.messageHandler.registerCommand('poststatus', this.postStatusCommand.bind(this), {
            description: 'Post text or media to status immediately',
            usage: `${config.PREFIX}poststatus <text> | Reply to media with caption`,
            category: 'status',
            plugin: 'schedulestatus',
            source: 'schedulestatus.js'
        });

        

        // Register status scheduling command
        this.bot.messageHandler.registerCommand('schedulestatus', this.scheduleStatusCommand.bind(this), {
            description: 'Schedule a status update or list pending status schedules',
            usage: `${config.PREFIX}schedulestatus [dd:mm:yyyy hh:mm <text>] or reply to media`,
            category: 'status',
            plugin: 'schedulestatus',
            source: 'schedulestatus.js'
        });

        // Register cancel status schedule command
        this.bot.messageHandler.registerCommand('cancelstatus', this.cancelStatusSchedule.bind(this), {
            description: 'Cancel a scheduled status',
            usage: `${config.PREFIX}cancelstatus <schedule_id>`,
            category: 'status',
            plugin: 'schedulestatus',
            source: 'schedulestatus.js'
        });

        // Register list status schedules command
        this.bot.messageHandler.registerCommand('statusschedules', this.listStatusSchedules.bind(this), {
            description: 'List all pending status schedules',
            usage: `${config.PREFIX}statusschedules`,
            category: 'status',
            plugin: 'schedulestatus',
            source: 'schedulestatus.js'
        });
    }

    /**
     * Handle immediate status posting
     */
    async postStatusCommand(messageInfo) {
        const { args, message, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;

        try {
            // Check if this is a reply to a media message
            const contextInfo = message?.extendedTextMessage?.contextInfo;
            const quotedMessage = contextInfo?.quotedMessage;

            if (quotedMessage) {
                // Handle media status posting
                const mediaType = this.getMediaType(quotedMessage);
                
                if (mediaType) {
                    // Download the media
                    const mediaPath = await this.downloadQuotedMedia(messageInfo, quotedMessage, mediaType);
                    
                    if (mediaPath) {
                        const caption = args && args.length > 0 ? args.join(' ') : '';
                        const success = await this.postStatusNow(mediaType, caption, mediaPath, caption);
                        
                        if (success) {
                            await this.bot.sock.sendMessage(fromJid, {
                                text: `✅ *${mediaType.toUpperCase()} STATUS POSTED!*\n\n📱 Your ${mediaType} has been posted to your status${caption ? `\n💬 Caption: ${caption}` : ''}`
                            });
                        } else {
                            await this.bot.sock.sendMessage(fromJid, {
                                text: '❌ Failed to post media status. Please try again.'
                            });
                        }
                        
                        // Clean up downloaded file
                        this.cleanupFile(mediaPath);
                    } else {
                        await this.bot.sock.sendMessage(fromJid, {
                            text: '❌ Failed to download media. Please try again.'
                        });
                    }
                } else {
                    await this.bot.sock.sendMessage(fromJid, {
                        text: '❌ Unsupported media type. Please use images or videos.'
                    });
                }
            } else if (args && args.length > 0) {
                // Handle text status posting
                const statusText = args.join(' ');
                const success = await this.postStatusNow('text', statusText);
                
                if (success) {
                    await this.bot.sock.sendMessage(fromJid, {
                        text: `✅ *TEXT STATUS POSTED!*\n\n📝 "${statusText}"`
                    });
                } else {
                    await this.bot.sock.sendMessage(fromJid, {
                        text: '❌ Failed to post text status. Please try again.'
                    });
                }
            } else {
                await this.bot.sock.sendMessage(fromJid, {
                    text: `❌ *Invalid usage!*\n\n*For text status:*\n${config.PREFIX}poststatus Your status text here\n\n*For media status:*\nReply to an image/video with:\n${config.PREFIX}poststatus [optional caption]`
                });
            }
        } catch (error) {
            console.error('Error in postStatusCommand:', error);
            await this.bot.sock.sendMessage(fromJid, {
                text: '❌ Error posting status: ' + error.message
            });
        }
    }

    /**
     * Handle status scheduling
     */
    async scheduleStatusCommand(messageInfo) {
        const { args, message, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;
        
        // If no arguments provided, list all status schedules
        if (!args || !Array.isArray(args) || args.length === 0) {
            await this.listStatusSchedules(messageInfo);
            return;
        }
        
        // Ensure args has minimum required length for scheduling
        if (args.length < 2) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Invalid format!\n\n*Usage:*\n${config.PREFIX}schedulestatus dd:mm:yyyy hh:mm <text>\n\n*Or reply to media:*\n${config.PREFIX}schedulestatus dd:mm:yyyy hh:mm [caption]\n\n*Example:*\n${config.PREFIX}schedulestatus 25:12:2024 15:30 Happy New Year!\n\n*List schedules:*\n${config.PREFIX}statusschedules` 
            });
            return;
        }

        try {
            const dateStr = args[0];
            const timeStr = args[1];
            
            // Parse date and time first to validate format
            const [day, month, year] = dateStr.split(':').map(Number);
            const [hour, minute] = timeStr.split(':').map(Number);
            
            // Validate date/time format
            if (!day || !month || !year || hour === undefined || minute === undefined) {
                throw new Error('Invalid date/time format');
            }
            
            // Create moment object in Lagos timezone (UTC+1)
            const scheduleTime = moment.tz({ 
                year, 
                month: month - 1, // moment months are 0-indexed
                day, 
                hour, 
                minute, 
                second: 0 
            }, config.TIMEZONE);
            
            // Check if the scheduled time is in the future
            if (scheduleTime.isSameOrBefore(moment().tz(config.TIMEZONE))) {
                await this.bot.sock.sendMessage(fromJid, { 
                    text: '❌ Cannot schedule status in the past!' 
                });
                return;
            }
            
            // Check for quoted message (media)
            const contextInfo = message?.extendedTextMessage?.contextInfo;
            const quotedMessage = contextInfo?.quotedMessage;
            
            let statusType = 'text';
            let content = '';
            let mediaPath = null;
            let caption = null;
            
            if (quotedMessage) {
                // Handle media status scheduling
                const mediaType = this.getMediaType(quotedMessage);
                
                if (mediaType) {
                    statusType = mediaType;
                    
                    // Download and save media for future posting
                    mediaPath = await this.downloadQuotedMedia(messageInfo, quotedMessage, mediaType, true);
                    
                    if (!mediaPath) {
                        await this.bot.sock.sendMessage(fromJid, {
                            text: '❌ Failed to download media for scheduling.'
                        });
                        return;
                    }
                    
                    caption = args.length > 2 ? args.slice(2).join(' ') : '';
                    content = caption || `${mediaType} status`;
                } else {
                    await this.bot.sock.sendMessage(fromJid, {
                        text: '❌ Unsupported media type for scheduling.'
                    });
                    return;
                }
            } else {
                // Handle text status scheduling
                if (args.length < 3) {
                    await this.bot.sock.sendMessage(fromJid, {
                        text: '❌ Please provide status text!\n\n*Usage:*\n' +
                              `${config.PREFIX}schedulestatus dd:mm:yyyy hh:mm <status text>`
                    });
                    return;
                }
                
                content = args.slice(2).join(' ');
            }
            
            // Generate simple incremental ID
            const scheduleId = this.nextId.toString();
            this.nextId++; // Increment for next schedule
            
            // Create schedule object
            const schedule = {
                id: scheduleId,
                time: scheduleTime.toISOString(),
                type: statusType,
                content,
                caption,
                mediaPath,
                fromJid,
                createdAt: moment().toISOString(),
                createdBy: messageInfo.participant_jid?.split('@')[0] || 'Unknown'
            };
            
            // Save schedule
            this.statusSchedules.set(scheduleId, schedule);
            this.saveStatusSchedules();
            
            // Confirmation message
            const confirmation = `✅ *STATUS SCHEDULED SUCCESSFULLY!*\n\n` +
                               `📅 *Date & Time:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos Time)\n` +
                               `📱 *Type:* ${statusType.toUpperCase()}\n` +
                               `📝 *Content:* ${content.length > 50 ? content.substring(0, 50) + '...' : content}\n` +
                               `🆔 *Schedule ID:* ${scheduleId}\n\n` +
                               `⏰ *Time until post:* ${moment().to(scheduleTime)}`;
            
            await this.bot.sock.sendMessage(fromJid, { text: confirmation });
            
            console.log(`📅 New status schedule created: ${scheduleId} for ${scheduleTime.format('DD/MM/YYYY HH:mm')}`);
            
        } catch (error) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Error creating status schedule: ${error.message}\n\n*Please check your date/time format:*\ndd:mm:yyyy hh:mm (e.g., 25:12:2024 15:30)` 
            });
        }
    }

    /**
     * List all pending status schedules
     */
    async listStatusSchedules(messageInfo) {
        const { chat_jid } = messageInfo || {};
        const fromJid = chat_jid;
        
        if (this.statusSchedules.size === 0) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: '📅 No pending status schedules found.' 
            });
            return;
        }
        
        let response = `📅 *PENDING STATUS SCHEDULES (${this.statusSchedules.size})*\n\n`;
        
        // Sort schedules by time
        const sortedSchedules = Array.from(this.statusSchedules.values())
            .sort((a, b) => new Date(a.time) - new Date(b.time));
        
        for (const schedule of sortedSchedules) {
            const scheduleTime = moment(schedule.time).tz(config.TIMEZONE);
            const timeUntil = moment().to(scheduleTime);
            
            response += `🆔 *ID:* ${schedule.id}\n`;
            response += `📅 *Time:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos)\n`;
            response += `📱 *Type:* ${schedule.type.toUpperCase()}\n`;
            response += `📝 *Content:* ${schedule.content.length > 30 ? schedule.content.substring(0, 30) + '...' : schedule.content}\n`;
            response += `⏰ *Status:* ${timeUntil}\n`;
            response += `─────────────────\n`;
        }
        
        response += `\n💡 *Commands:*\n`;
        response += `${config.PREFIX}cancelstatus <id> - Cancel schedule\n`;
        response += `${config.PREFIX}poststatus <text> - Post status now`;
        
        await this.bot.sock.sendMessage(fromJid, { text: response });
    }

    /**
     * Cancel a scheduled status
     */
    async cancelStatusSchedule(messageInfo) {
        const { args, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;
        
        if (!args || args.length === 0) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Please provide a schedule ID!\n\nUsage: ${config.PREFIX}cancelstatus <schedule_id>` 
            });
            return;
        }
        
        const scheduleId = args[0];
        
        if (this.statusSchedules.has(scheduleId)) {
            const schedule = this.statusSchedules.get(scheduleId);
            
            // Clean up media file if exists
            if (schedule.mediaPath) {
                this.cleanupFile(schedule.mediaPath);
            }
            
            this.statusSchedules.delete(scheduleId);
            this.saveStatusSchedules();
            
            const scheduleTime = moment(schedule.time).tz(config.TIMEZONE);
            
            await this.bot.sock.sendMessage(fromJid, { 
                text: `✅ *STATUS SCHEDULE CANCELLED!*\n\n` +
                      `📅 *Was scheduled for:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos Time)\n` +
                      `📱 *Type:* ${schedule.type.toUpperCase()}\n` +
                      `📝 *Content:* ${schedule.content.length > 50 ? schedule.content.substring(0, 50) + '...' : schedule.content}` 
            });
            
            console.log(`🗑️  Status schedule cancelled: ${scheduleId}`);
        } else {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Schedule ID not found: ${scheduleId}\n\nUse ${config.PREFIX}statusschedules to see all pending schedules.` 
            });
        }
    }

    /**
     * Get media type from quoted message
     */
    getMediaType(quotedMessage) {
        if (quotedMessage.imageMessage) {
            return 'image';
        }
        if (quotedMessage.videoMessage) {
            return 'video';
        }
        return null;
    }

    /**
     * Download quoted media for immediate or scheduled posting
     */
    async downloadQuotedMedia(messageInfo, quotedMessage, mediaType, forScheduling = false) {
        try {
            // Create appropriate directory
            const mediaDir = forScheduling ? 
                path.join(__dirname, '../session/storage/scheduled_media') : 
                path.join(__dirname, '../tmp');
            
            await fs.ensureDir(mediaDir);
            
            // Generate filename
            const timestamp = Date.now();
            const extension = mediaType === 'image' ? 'jpg' : 'mp4';
            const filename = forScheduling ? 
                `scheduled_${timestamp}.${extension}` : 
                `status_${timestamp}.${extension}`;
            
            const filePath = path.join(mediaDir, filename);
            
            // Create proper message structure for downloadMediaMessage using the original quoted message
            const messageToDownload = {
                key: messageInfo.message.extendedTextMessage.contextInfo.stanzaId ? {
                    remoteJid: messageInfo.chat_jid,
                    fromMe: false,
                    id: messageInfo.message.extendedTextMessage.contextInfo.stanzaId
                } : {
                    remoteJid: messageInfo.chat_jid,
                    fromMe: false,
                    id: messageInfo.message_id || 'fake-id-' + Date.now()
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
            console.error('Error downloading media:', error);
            return null;
        }
    }

    /**
     * Get status recipients using the contact manager
     */
    async getStatusRecipients() {
        try {
            // First, try to get contacts from the contact manager
            const contactManager = this.getContactManager();
            
            if (contactManager) {
                const recipients = contactManager.getStatusRecipients();
                if (recipients.length > 0) {
                    console.log(`📱 Using ${recipients.length} contacts from Contact Manager for status posting`);
                    return recipients.slice(0, 200); // Limit to 200 to prevent issues
                } else {
                    console.log('📱 Contact Manager has no saved contacts yet');
                }
            }
            
            // Fallback to old method if contact manager not available or has no contacts
            return await this.getFallbackRecipients();
            
        } catch (error) {
            console.error('Error getting status recipients:', error);
            // Try fallback method
            return await this.getFallbackRecipients();
        }
    }
    
    /**
     * Get contact manager instance
     */
    getContactManager() {
        // Look for the contact manager plugin in the bot's plugins
        if (this.bot.plugins) {
            // bot.plugins is a plain object, use Object.values() to iterate
            for (const plugin of Object.values(this.bot.plugins)) {
                if (plugin && plugin.name === 'contact-manager') {
                    return plugin;
                }
            }
        }
        return null;
    }
    
    /**
     * Fallback method for getting recipients (old method)
     */
    async getFallbackRecipients() {
        const statusJidList = [];
        
        try {
            // Get base self JID for comparison (remove device suffix)
            const selfJid = this.bot.sock.user?.id;
            const normalizedSelf = selfJid ? this.getBaseJidFromUser(selfJid) : null;
            
            console.log(`🤖 Fallback mode - Bot JID: ${selfJid}, normalized: ${normalizedSelf}`);
            
            // Get contacts from multiple sources
            const allCandidates = new Set();
            
            // From sock.contacts
            if (this.bot.sock && this.bot.sock.contacts) {
                const contactJids = Object.keys(this.bot.sock.contacts);
                contactJids.forEach(jid => {
                    if (jid.endsWith('@s.whatsapp.net')) {
                        allCandidates.add(jid);
                    }
                });
                console.log(`📱 Found ${contactJids.length} contacts from sock.contacts`);
            }
            
            // From store.contacts if available
            if (this.bot.store && this.bot.store.contacts) {
                const storeContactJids = Object.keys(this.bot.store.contacts);
                storeContactJids.forEach(jid => {
                    if (jid.endsWith('@s.whatsapp.net')) {
                        allCandidates.add(jid);
                    }
                });
                console.log(`📱 Found ${storeContactJids.length} contacts from store.contacts`);
            }
            
            // From chats if available
            if (this.bot.store && this.bot.store.chats) {
                const chatJids = Object.keys(this.bot.store.chats);
                chatJids.forEach(jid => {
                    if (jid.endsWith('@s.whatsapp.net')) {
                        allCandidates.add(jid);
                    }
                });
                console.log(`💬 Found ${chatJids.length} personal chats from store.chats`);
            }
            
            // Filter out self and normalize
            const filteredContacts = Array.from(allCandidates).filter(jid => {
                const baseJid = this.getBaseJidFromUser(jid);
                return baseJid !== normalizedSelf;
            });
            
            console.log(`📋 Total candidates: ${allCandidates.size}, after excluding self: ${filteredContacts.length}`);
            
            if (filteredContacts.length > 0) {
                console.log(`📱 Using ${filteredContacts.length} fallback contacts for status posting`);
                return filteredContacts.slice(0, 200);
            }
            
            // Check if owner is different from bot
            if (config.OWNER_NUMBER) {
                const ownerJid = config.OWNER_NUMBER.includes('@') ? 
                    config.OWNER_NUMBER : 
                    `${config.OWNER_NUMBER}@s.whatsapp.net`;
                    
                const normalizedOwner = this.getBaseJidFromUser(ownerJid);
                
                // Only use owner if it's different from the bot itself
                if (normalizedOwner !== normalizedSelf) {
                    statusJidList.push(ownerJid);
                    console.log('📱 Using owner number for status posting (different from bot)');
                    return statusJidList;
                } else {
                    console.warn('⚠️ Owner number is same as bot number - cannot use for status posting');
                }
            }
            
            // If we reach here, no valid recipients found
            console.error('❌ No valid contacts found for status posting. Use the contact manager to add contacts.');
            throw new Error('No valid recipients available for status posting. Please add contacts using the contact manager (.contact help).');
            
        } catch (error) {
            console.error('Error in fallback recipients:', error);
            throw error;
        }
    }
    
    /**
     * Normalize JID for comparison (preserves device suffixes)
     */
    normalizeJid(jid) {
        if (!jid) return null;
        
        // Use proper JIDUtils to preserve device suffixes
        return this.jidUtils.normalizeJid(jid);
    }

    /**
     * Get base JID from user JID (removes device suffix for comparison)
     */
    getBaseJidFromUser(userJid) {
        if (!userJid) return null;
        
        // Extract base phone number from user JID
        const phoneNumber = userJid.split(':')[0];
        return `${phoneNumber}@s.whatsapp.net`;
    }
    
    /**
     * Validate that contacts are real WhatsApp users
     */
    async validateContacts(contacts) {
        try {
            if (!this.bot.sock || !this.bot.sock.onWhatsApp) {
                return contacts; // Skip validation if not available
            }
            
            // Batch validation to avoid rate limits
            const batchSize = 10;
            const validatedContacts = [];
            
            for (let i = 0; i < contacts.length; i += batchSize) {
                const batch = contacts.slice(i, i + batchSize);
                try {
                    const results = await this.bot.sock.onWhatsApp(...batch);
                    const validJids = results
                        .filter(result => result.exists)
                        .map(result => result.jid);
                    validatedContacts.push(...validJids);
                    
                    // Small delay between batches to avoid rate limiting
                    if (i + batchSize < contacts.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } catch (batchError) {
                    console.warn(`⚠️ Batch validation failed for batch ${i}-${i+batchSize}:`, batchError.message);
                    // Add batch contacts without validation as fallback
                    validatedContacts.push(...batch);
                }
            }
            
            return validatedContacts;
        } catch (error) {
            console.warn('⚠️ Contact validation failed:', error.message);
            return contacts; // Return original list if validation fails
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
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
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
        const plugin = new ScheduleStatusPlugin();
        await plugin.init(bot);
        return plugin;
    }
};