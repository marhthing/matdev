
/**
 * MATDEV Status Scheduling Plugin
 * Schedule status updates (images, videos, text) with persistent storage
 */

const config = require('../config');
const Utils = require('../lib/utils');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');

const utils = new Utils();

class StatusSchedulePlugin {
    constructor() {
        this.name = 'statusschedule';
        this.description = 'Schedule status updates with media support';
        this.version = '1.0.0';
        this.schedulePath = path.join(__dirname, '../session/storage/status_schedules.json');
        this.mediaPath = path.join(__dirname, '../session/storage/status_media');
        this.schedules = new Map();
        this.checkInterval = null;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.nextId = 1; // Start counter for simple IDs
        
        // Ensure media storage directory exists
        await fs.ensureDir(this.mediaPath);
        
        this.loadSchedules();
        this.startScheduleChecker();
        this.registerCommands();
        
        console.log('✅ Status Schedule plugin loaded');
    }

    /**
     * Load schedules from persistent storage
     */
    loadSchedules() {
        try {
            if (fs.existsSync(this.schedulePath)) {
                const data = fs.readJsonSync(this.schedulePath);
                
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
                        this.schedules.set(schedule.id, {
                            ...schedule,
                            time: scheduleTime.toISOString()
                        });
                    }
                }
                
                // Set next ID to be one higher than the highest found
                this.nextId = maxId + 1;
                
                console.log(`📱 Loaded ${this.schedules.size} pending status schedules`);
            } else {
                // Create empty schedules file
                fs.ensureDirSync(path.dirname(this.schedulePath));
                this.saveSchedules();
            }
        } catch (error) {
            console.warn('⚠️  Error loading status schedules:', error.message);
            this.schedules = new Map();
        }
    }

    /**
     * Save schedules to persistent storage
     */
    saveSchedules() {
        try {
            const schedulesArray = Array.from(this.schedules.values());
            fs.writeJsonSync(this.schedulePath, schedulesArray, { spaces: 2 });
        } catch (error) {
            console.error('❌ Error saving status schedules:', error.message);
        }
    }

    /**
     * Start the schedule checker (runs every minute)
     */
    startScheduleChecker() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.checkInterval = setInterval(() => {
            this.checkPendingSchedules();
        }, 60000); // Check every minute
        
        // Also check immediately on startup
        setTimeout(() => this.checkPendingSchedules(), 5000);
    }

    /**
     * Check for schedules that need to be posted
     */
    async checkPendingSchedules() {
        const now = moment().tz(config.TIMEZONE);
        const toSend = [];
        
        for (const [id, schedule] of this.schedules) {
            const scheduleTime = moment(schedule.time);
            
            if (now.isSameOrAfter(scheduleTime)) {
                toSend.push({ id, schedule });
            }
        }
        
        for (const { id, schedule } of toSend) {
            try {
                await this.postScheduledStatus(schedule);
                this.schedules.delete(id);
                console.log(`✅ Posted scheduled status ${id}`);
                
                // Clean up media file if exists
                if (schedule.mediaPath && fs.existsSync(schedule.mediaPath)) {
                    await fs.remove(schedule.mediaPath);
                }
            } catch (error) {
                console.error(`❌ Failed to post scheduled status ${id}:`, error.message);
                // Remove failed schedules to prevent infinite retries
                this.schedules.delete(id);
                
                // Clean up media file on failure too
                if (schedule.mediaPath && fs.existsSync(schedule.mediaPath)) {
                    await fs.remove(schedule.mediaPath);
                }
            }
        }
        
        if (toSend.length > 0) {
            this.saveSchedules();
        }
    }

    /**
     * Post a scheduled status update
     */
    async postScheduledStatus(schedule) {
        const { type, content, caption, mediaPath } = schedule;
        
        try {
            // Get bot's own JID for statusJidList (critical for status visibility)
            const botJid = global.botJid || this.bot.sock?.user?.id?.split(':')[0] + '@s.whatsapp.net';
            const statusJidList = botJid ? [botJid] : [];
            
            console.log(`🔍 Debug - global.botJid: ${global.botJid}`);
            console.log(`🔍 Debug - sock.user.id: ${this.bot.sock?.user?.id}`);
            console.log(`🔍 Debug - botJid: ${botJid}`);
            console.log(`🔍 Debug - statusJidList: ${JSON.stringify(statusJidList)}`);
            
            if (type === 'text') {
                // Post text status
                await this.bot.sock.sendMessage('status@broadcast', { 
                    text: content 
                }, {
                    backgroundColor: '#000000', // Optional: set background color
                    statusJidList: statusJidList // Include bot JID for visibility
                });
                console.log(`📱 Posted text status: ${content.substring(0, 50)}...`);
            } else if (type === 'image' && mediaPath && fs.existsSync(mediaPath)) {
                // Post image status
                const buffer = await fs.readFile(mediaPath);
                await this.bot.sock.sendMessage('status@broadcast', { 
                    image: buffer, 
                    caption: caption || '' 
                }, {
                    statusJidList: statusJidList // Include bot JID for visibility
                });
                console.log(`📱 Posted image status with caption: ${caption || 'No caption'}`);
            } else if (type === 'video' && mediaPath && fs.existsSync(mediaPath)) {
                // Post video status
                const buffer = await fs.readFile(mediaPath);
                await this.bot.sock.sendMessage('status@broadcast', { 
                    video: buffer, 
                    caption: caption || '' 
                }, {
                    statusJidList: statusJidList // Include bot JID for visibility
                });
                console.log(`📱 Posted video status with caption: ${caption || 'No caption'}`);
            }
        } catch (error) {
            console.error(`❌ Error posting status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Register all status schedule commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('sschedule', this.statusScheduleCommand.bind(this), {
            description: 'Schedule a status update (image, video, or text) to be posted at a specific time',
            usage: `${config.PREFIX}sschedule dd:mm:yyyy hh:mm [caption] - Reply to media or text message`,
            category: 'status',
            plugin: 'statusschedule',
            source: 'statusschedule.js'
        });

        this.bot.messageHandler.registerCommand('sschedules', this.listStatusSchedules.bind(this), {
            description: 'List all pending status schedules',
            usage: `${config.PREFIX}sschedules`,
            category: 'status',
            plugin: 'statusschedule',
            source: 'statusschedule.js'
        });

        this.bot.messageHandler.registerCommand('cancelsstatus', this.cancelStatusSchedule.bind(this), {
            description: 'Cancel a scheduled status update',
            usage: `${config.PREFIX}cancelsstatus <schedule_id>`,
            category: 'status',
            plugin: 'statusschedule',
            source: 'statusschedule.js'
        });
    }

    /**
     * Status schedule command handler
     */
    async statusScheduleCommand(messageInfo) {
        const { args, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;
        
        // Ensure args exists and has minimum required length
        if (!args || !Array.isArray(args) || args.length < 2) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Invalid format!\n\n*Usage:*\n${config.PREFIX}sschedule dd:mm:yyyy hh:mm [caption]\n\n*Reply to a message (image/video/text) and use this command*\n\n*Example:*\n${config.PREFIX}sschedule 25:12:2024 15:30 Happy New Year!` 
            });
            return;
        }

        try {
            const dateStr = args[0];
            const timeStr = args[1];
            const caption = args.slice(2).join(' ') || '';
            
            // Parse date and time first to validate format
            const [day, month, year] = dateStr.split(':').map(Number);
            const [hour, minute] = timeStr.split(':').map(Number);
            
            // Validate date/time format
            if (!day || !month || !year || hour === undefined || minute === undefined) {
                throw new Error('Invalid date/time format');
            }
            
            // Create moment object in Lagos timezone
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
                    text: '❌ Cannot schedule status updates in the past!' 
                });
                return;
            }
            
            // Check for quoted message (required)
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            const quotedMessage = contextInfo?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.sock.sendMessage(fromJid, { 
                    text: '❌ Please reply to a message (image, video, or text) to schedule as status!\n\n*Usage:*\n' +
                          `${config.PREFIX}sschedule dd:mm:yyyy hh:mm [caption]`
                });
                return;
            }
            
            // Extract content from quoted message
            const statusData = await this.extractStatusContent(quotedMessage, caption);
            if (!statusData) {
                await this.bot.sock.sendMessage(fromJid, { 
                    text: '❌ Unable to extract content from the replied message!' 
                });
                return;
            }
            
            // Generate simple incremental ID
            const scheduleId = this.nextId.toString();
            this.nextId++; // Increment for next schedule
            
            // Create schedule object
            const schedule = {
                id: scheduleId,
                time: scheduleTime.toISOString(),
                type: statusData.type,
                content: statusData.content,
                caption: statusData.caption,
                mediaPath: statusData.mediaPath,
                fromJid,
                createdAt: moment().toISOString(),
                createdBy: messageInfo.participant_jid?.split('@')[0] || 'Unknown'
            };
            
            // Save schedule
            this.schedules.set(scheduleId, schedule);
            this.saveSchedules();
            
            // Confirmation message
            const confirmation = `✅ *Status Scheduled Successfully!*\n\n` +
                               `📅 *Date & Time:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos Time)\n` +
                               `📱 *Type:* ${statusData.type.charAt(0).toUpperCase() + statusData.type.slice(1)} Status\n` +
                               `📝 *Content:* ${statusData.type === 'text' ? (statusData.content.length > 50 ? statusData.content.substring(0, 50) + '...' : statusData.content) : (statusData.caption || 'Media with no caption')}\n` +
                               `🆔 *Schedule ID:* ${scheduleId}\n\n` +
                               `⏰ *Time until post:* ${moment().to(scheduleTime)}`;
            
            await this.bot.sock.sendMessage(fromJid, { text: confirmation });
            
            console.log(`📱 New status schedule created: ${scheduleId} for ${scheduleTime.format('DD/MM/YYYY HH:mm')}`);
            
        } catch (error) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Error creating status schedule: ${error.message}\n\n*Please check your date/time format:*\ndd:mm:yyyy hh:mm (e.g., 25:12:2024 15:30)` 
            });
        }
    }

    /**
     * Extract content from quoted message for status
     */
    async extractStatusContent(quotedMessage, userCaption) {
        try {
            // Handle text messages
            if (quotedMessage.conversation || quotedMessage.extendedTextMessage?.text) {
                return {
                    type: 'text',
                    content: quotedMessage.conversation || quotedMessage.extendedTextMessage.text,
                    caption: null,
                    mediaPath: null
                };
            }
            
            // Handle image messages
            if (quotedMessage.imageMessage) {
                const buffer = await this.downloadQuotedMedia(quotedMessage);
                if (buffer) {
                    const filename = `status_${Date.now()}.jpg`;
                    const mediaPath = path.join(this.mediaPath, filename);
                    await fs.writeFile(mediaPath, buffer);
                    
                    return {
                        type: 'image',
                        content: null,
                        caption: userCaption || quotedMessage.imageMessage.caption || '',
                        mediaPath
                    };
                }
            }
            
            // Handle video messages
            if (quotedMessage.videoMessage) {
                const buffer = await this.downloadQuotedMedia(quotedMessage);
                if (buffer) {
                    const filename = `status_${Date.now()}.mp4`;
                    const mediaPath = path.join(this.mediaPath, filename);
                    await fs.writeFile(mediaPath, buffer);
                    
                    return {
                        type: 'video',
                        content: null,
                        caption: userCaption || quotedMessage.videoMessage.caption || '',
                        mediaPath
                    };
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error extracting status content:', error);
            return null;
        }
    }

    /**
     * Download media from quoted message
     */
    async downloadQuotedMedia(quotedMessage) {
        try {
            const { downloadMediaMessage } = require('baileys');
            
            // Create a mock message structure for baileys
            const mockMessage = {
                key: {},
                message: quotedMessage
            };
            
            // Download media buffer
            const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
            return buffer;
        } catch (error) {
            console.error(`Error downloading quoted media: ${error.message}`);
            return null;
        }
    }

    /**
     * List all pending status schedules
     */
    async listStatusSchedules(messageInfo) {
        const { chat_jid } = messageInfo || {};
        const fromJid = chat_jid;
        
        if (this.schedules.size === 0) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: '📱 No pending status schedules found.' 
            });
            return;
        }
        
        let response = `📱 *Pending Status Schedules (${this.schedules.size})*\n\n`;
        
        // Sort schedules by time
        const sortedSchedules = Array.from(this.schedules.values())
            .sort((a, b) => new Date(a.time) - new Date(b.time));
        
        for (const schedule of sortedSchedules) {
            const scheduleTime = moment(schedule.time).tz(config.TIMEZONE);
            const timeUntil = moment().to(scheduleTime);
            
            response += `🆔 *ID:* ${schedule.id}\n`;
            response += `📅 *Time:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos)\n`;
            response += `📱 *Type:* ${schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1)} Status\n`;
            
            if (schedule.type === 'text') {
                response += `📝 *Content:* ${schedule.content.length > 30 ? schedule.content.substring(0, 30) + '...' : schedule.content}\n`;
            } else {
                response += `📝 *Caption:* ${schedule.caption || 'No caption'}\n`;
            }
            
            response += `⏰ *Status:* ${timeUntil}\n`;
            response += `─────────────────\n`;
        }
        
        await this.bot.sock.sendMessage(fromJid, { text: response });
    }

    /**
     * Cancel a scheduled status update
     */
    async cancelStatusSchedule(messageInfo) {
        const { args, chat_jid } = messageInfo || {};
        const fromJid = chat_jid;
        
        if (!args || args.length === 0) {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Please provide a schedule ID!\n\nUsage: ${config.PREFIX}cancelsstatus <schedule_id>` 
            });
            return;
        }
        
        const scheduleId = args[0];
        
        if (this.schedules.has(scheduleId)) {
            const schedule = this.schedules.get(scheduleId);
            this.schedules.delete(scheduleId);
            this.saveSchedules();
            
            // Clean up media file if exists
            if (schedule.mediaPath && fs.existsSync(schedule.mediaPath)) {
                await fs.remove(schedule.mediaPath);
            }
            
            const scheduleTime = moment(schedule.time).tz(config.TIMEZONE);
            
            await this.bot.sock.sendMessage(fromJid, { 
                text: `✅ *Status Schedule Cancelled Successfully!*\n\n` +
                      `📅 *Was scheduled for:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos Time)\n` +
                      `📱 *Type:* ${schedule.type.charAt(0).toUpperCase() + schedule.type.slice(1)} Status` 
            });
            
            console.log(`🗑️  Status schedule cancelled: ${scheduleId}`);
        } else {
            await this.bot.sock.sendMessage(fromJid, { 
                text: `❌ Status schedule ID not found: ${scheduleId}\n\nUse ${config.PREFIX}sschedules to see all pending status schedules.` 
            });
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
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new StatusSchedulePlugin();
        await plugin.init(bot);
        return plugin;
    }
};
