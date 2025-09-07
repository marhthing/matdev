/**
 * MATDEV Scheduling Plugin
 * Schedule messages with persistent storage and restart survival
 */

const config = require('../config');
const Utils = require('../lib/utils');
const fs = require('fs-extra');
const path = require('path');
const moment = require('moment-timezone');

const utils = new Utils();

class SchedulePlugin {
    constructor() {
        this.name = 'schedule';
        this.description = 'Schedule messages with persistent storage';
        this.version = '1.0.0';
        this.schedulePath = path.join(__dirname, '../session/storage/schedules.json');
        this.schedules = new Map();
        this.checkInterval = null;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.loadSchedules();
        this.startScheduleChecker();
        this.registerCommands();
        
        console.log('✅ Schedule plugin loaded');
    }

    /**
     * Load schedules from persistent storage
     */
    loadSchedules() {
        try {
            if (fs.existsSync(this.schedulePath)) {
                const data = fs.readJsonSync(this.schedulePath);
                
                // Convert array back to Map and validate dates
                for (const schedule of data) {
                    const scheduleTime = moment.tz(schedule.time, config.TIMEZONE);
                    
                    // Only load future schedules
                    if (scheduleTime.isAfter(moment())) {
                        this.schedules.set(schedule.id, {
                            ...schedule,
                            time: scheduleTime.toISOString()
                        });
                    }
                }
                
                console.log(`📅 Loaded ${this.schedules.size} pending schedules`);
            } else {
                // Create empty schedules file
                fs.ensureDirSync(path.dirname(this.schedulePath));
                this.saveSchedules();
            }
        } catch (error) {
            console.warn('⚠️  Error loading schedules:', error.message);
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
            console.error('❌ Error saving schedules:', error.message);
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
     * Check for schedules that need to be sent
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
                await this.sendScheduledMessage(schedule);
                this.schedules.delete(id);
                console.log(`✅ Sent scheduled message ${id}`);
            } catch (error) {
                console.error(`❌ Failed to send scheduled message ${id}:`, error.message);
                // Remove failed schedules to prevent infinite retries
                this.schedules.delete(id);
            }
        }
        
        if (toSend.length > 0) {
            this.saveSchedules();
        }
    }

    /**
     * Send a scheduled message
     */
    async sendScheduledMessage(schedule) {
        const { jid, message, fromJid } = schedule;
        
        // Add a small indicator that this is a scheduled message
        const scheduledMessage = `📅 *Scheduled Message*\n\n${message}`;
        
        await this.bot.sock.sendMessage(jid, { text: scheduledMessage });
    }

    /**
     * Register all schedule commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('schedule', this.scheduleCommand.bind(this), {
            description: 'Schedule a message to be sent at a specific time',
            usage: `${config.PREFIX}schedule dd:mm:yyyy hh:mm <jid> [message] or reply to a message`,
            category: 'utility',
            plugin: 'schedule',
            source: 'schedule.js'
        });

        this.bot.messageHandler.registerCommand('schedules', this.listSchedules.bind(this), {
            description: 'List all pending schedules',
            usage: `${config.PREFIX}schedules`,
            category: 'utility',
            plugin: 'schedule',
            source: 'schedule.js'
        });

        this.bot.messageHandler.registerCommand('cancelschedule', this.cancelSchedule.bind(this), {
            description: 'Cancel a scheduled message',
            usage: `${config.PREFIX}cancelschedule <schedule_id>`,
            category: 'utility',
            plugin: 'schedule',
            source: 'schedule.js'
        });
    }

    /**
     * Schedule command handler
     */
    async scheduleCommand(sock, messageInfo) {
        const { args, quotedMessage, fromJid } = messageInfo;
        
        if (args.length < 3) {
            await sock.sendMessage(fromJid, { 
                text: `❌ Invalid format!\n\n*Usage:*\n${config.PREFIX}schedule dd:mm:yyyy hh:mm <jid> [message]\n\n*Or reply to a message:*\n${config.PREFIX}schedule dd:mm:yyyy hh:mm <jid>\n\n*Example:*\n${config.PREFIX}schedule 25:12:2024 15:30 2347012345678@s.whatsapp.net Happy Birthday!` 
            });
            return;
        }

        try {
            const dateStr = args[0];
            const timeStr = args[1];
            const targetJid = args[2];
            
            // Parse date and time
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
            if (scheduleTime.isSameOrBefore(moment())) {
                await sock.sendMessage(fromJid, { 
                    text: '❌ Cannot schedule messages in the past!' 
                });
                return;
            }
            
            // Get message content
            let messageContent = '';
            
            if (quotedMessage) {
                // Use quoted message content
                messageContent = quotedMessage.conversation || 
                               quotedMessage.extendedTextMessage?.text ||
                               quotedMessage.imageMessage?.caption ||
                               quotedMessage.videoMessage?.caption ||
                               'Media message (will be sent as text notification)';
            } else if (args.length > 3) {
                // Use provided message
                messageContent = args.slice(3).join(' ');
            } else {
                await sock.sendMessage(fromJid, { 
                    text: '❌ No message content provided! Either reply to a message or include message text.' 
                });
                return;
            }
            
            // Generate unique ID
            const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Create schedule object
            const schedule = {
                id: scheduleId,
                time: scheduleTime.toISOString(),
                jid: targetJid,
                message: messageContent,
                fromJid,
                createdAt: moment().toISOString(),
                createdBy: messageInfo.senderName || 'Unknown'
            };
            
            // Save schedule
            this.schedules.set(scheduleId, schedule);
            this.saveSchedules();
            
            // Confirmation message
            const confirmation = `✅ *Message Scheduled Successfully!*\n\n` +
                               `📅 *Date & Time:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos Time)\n` +
                               `👤 *Target:* ${targetJid}\n` +
                               `📝 *Message:* ${messageContent.length > 50 ? messageContent.substring(0, 50) + '...' : messageContent}\n` +
                               `🆔 *Schedule ID:* ${scheduleId}\n\n` +
                               `⏰ *Time until send:* ${moment().to(scheduleTime)}`;
            
            await sock.sendMessage(fromJid, { text: confirmation });
            
            console.log(`📅 New schedule created: ${scheduleId} for ${scheduleTime.format('DD/MM/YYYY HH:mm')}`);
            
        } catch (error) {
            await sock.sendMessage(fromJid, { 
                text: `❌ Error creating schedule: ${error.message}\n\n*Please check your date/time format:*\ndd:mm:yyyy hh:mm (e.g., 25:12:2024 15:30)` 
            });
        }
    }

    /**
     * List all pending schedules
     */
    async listSchedules(sock, messageInfo) {
        const { fromJid } = messageInfo;
        
        if (this.schedules.size === 0) {
            await sock.sendMessage(fromJid, { 
                text: '📅 No pending schedules found.' 
            });
            return;
        }
        
        let response = `📅 *Pending Schedules (${this.schedules.size})*\n\n`;
        
        // Sort schedules by time
        const sortedSchedules = Array.from(this.schedules.values())
            .sort((a, b) => new Date(a.time) - new Date(b.time));
        
        for (const schedule of sortedSchedules) {
            const scheduleTime = moment(schedule.time).tz(config.TIMEZONE);
            const timeUntil = moment().to(scheduleTime);
            
            response += `🆔 *ID:* ${schedule.id}\n`;
            response += `📅 *Time:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos)\n`;
            response += `👤 *Target:* ${schedule.jid}\n`;
            response += `📝 *Message:* ${schedule.message.length > 30 ? schedule.message.substring(0, 30) + '...' : schedule.message}\n`;
            response += `⏰ *Status:* ${timeUntil}\n`;
            response += `─────────────────\n`;
        }
        
        await sock.sendMessage(fromJid, { text: response });
    }

    /**
     * Cancel a scheduled message
     */
    async cancelSchedule(sock, messageInfo) {
        const { args, fromJid } = messageInfo;
        
        if (args.length === 0) {
            await sock.sendMessage(fromJid, { 
                text: `❌ Please provide a schedule ID!\n\nUsage: ${config.PREFIX}cancelschedule <schedule_id>` 
            });
            return;
        }
        
        const scheduleId = args[0];
        
        if (this.schedules.has(scheduleId)) {
            const schedule = this.schedules.get(scheduleId);
            this.schedules.delete(scheduleId);
            this.saveSchedules();
            
            const scheduleTime = moment(schedule.time).tz(config.TIMEZONE);
            
            await sock.sendMessage(fromJid, { 
                text: `✅ *Schedule Cancelled Successfully!*\n\n` +
                      `📅 *Was scheduled for:* ${scheduleTime.format('DD/MM/YYYY HH:mm')} (Lagos Time)\n` +
                      `📝 *Message:* ${schedule.message.length > 50 ? schedule.message.substring(0, 50) + '...' : schedule.message}` 
            });
            
            console.log(`🗑️  Schedule cancelled: ${scheduleId}`);
        } else {
            await sock.sendMessage(fromJid, { 
                text: `❌ Schedule ID not found: ${scheduleId}\n\nUse ${config.PREFIX}schedules to see all pending schedules.` 
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
        const plugin = new SchedulePlugin();
        await plugin.init(bot);
        return plugin;
    }
};