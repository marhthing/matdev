const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class ReminderSystemPlugin {
    constructor() {
        this.name = 'reminder-system';
        this.description = 'Set reminders with date/time notifications';
        this.version = '1.0.0';
        this.enabled = true;
        
        this.remindersFile = path.join(__dirname, '..', 'session', 'storage', 'reminders.json');
        this.reminders = new Map();
        this.intervals = new Map();
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Load existing reminders
            await this.loadReminders();

            this.bot.messageHandler.registerCommand('remind', this.remindCommand.bind(this), {
                description: 'Set a reminder',
                usage: `${config.PREFIX}remind <time> <message>`,
                category: 'utility',
                plugin: 'reminder-system',
                source: 'reminder-system.js'
            });

            this.bot.messageHandler.registerCommand('reminders', this.listRemindersCommand.bind(this), {
                description: 'List all your reminders',
                usage: `${config.PREFIX}reminders`,
                category: 'utility',
                plugin: 'reminder-system',
                source: 'reminder-system.js'
            });

            this.bot.messageHandler.registerCommand('cancelremind', this.cancelReminderCommand.bind(this), {
                description: 'Cancel a reminder',
                usage: `${config.PREFIX}cancelremind <id>`,
                category: 'utility',
                plugin: 'reminder-system',
                source: 'reminder-system.js'
            });

            // Start reminder checker
            this.startReminderChecker();

            console.log('✅ Reminder System plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Reminder System plugin:', error);
            return false;
        }
    }

    async remindCommand(messageInfo) {
        try {
            const args = messageInfo.args.join(' ').trim();
            if (!args) {
                await this.bot.messageHandler.reply(messageInfo,
                    '⏰ Usage: .remind <time> <message>\n\n' +
                    '**Time formats:**\n• 5min, 30min, 1h, 2h\n• tomorrow, today 6pm\n• 2024-12-25 10:30\n\n' +
                    'Examples:\n• .remind 30min Call mom\n• .remind 1h Meeting with team\n• .remind tomorrow 9am Doctor appointment');
                return;
            }

            const parsed = this.parseReminderInput(args);
            if (!parsed.success) {
                await this.bot.messageHandler.reply(messageInfo, `❌ ${parsed.error}`);
                return;
            }

            const reminderId = await this.createReminder(
                messageInfo.sender_jid,
                messageInfo.chat_jid,
                parsed.datetime,
                parsed.message
            );

            const timeStr = this.formatDateTime(parsed.datetime);
            await this.bot.messageHandler.reply(messageInfo,
                `⏰ **Reminder Set**\n\n` +
                `**ID:** ${reminderId}\n` +
                `**Time:** ${timeStr}\n` +
                `**Message:** ${parsed.message}\n\n` +
                `🔔 You'll be notified when it's time!`);

        } catch (error) {
            console.error('Error in remind command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error setting reminder.');
        }
    }

    async listRemindersCommand(messageInfo) {
        try {
            const userReminders = Array.from(this.reminders.values())
                .filter(reminder => reminder.userId === messageInfo.sender_jid && reminder.datetime > Date.now())
                .sort((a, b) => a.datetime - b.datetime);

            if (userReminders.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '📅 You have no active reminders.');
                return;
            }

            let message = '📅 **Your Reminders**\n\n';
            
            userReminders.forEach((reminder, index) => {
                const timeStr = this.formatDateTime(reminder.datetime);
                message += `**${reminder.id}** - ${timeStr}\n${reminder.message}\n\n`;
            });

            message += `Use .cancelremind <id> to cancel a reminder`;
            
            await this.bot.messageHandler.reply(messageInfo, message);

        } catch (error) {
            console.error('Error in reminders command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing reminders.');
        }
    }

    async cancelReminderCommand(messageInfo) {
        try {
            const reminderId = messageInfo.args[0];
            if (!reminderId) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Usage: .cancelremind <id>\n\nUse .reminders to see your reminder IDs');
                return;
            }

            const reminder = this.reminders.get(reminderId);
            if (!reminder) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Reminder ${reminderId} not found.`);
                return;
            }

            if (reminder.userId !== messageInfo.sender_jid) {
                await this.bot.messageHandler.reply(messageInfo, '❌ You can only cancel your own reminders.');
                return;
            }

            this.reminders.delete(reminderId);
            if (this.intervals.has(reminderId)) {
                clearTimeout(this.intervals.get(reminderId));
                this.intervals.delete(reminderId);
            }

            await this.saveReminders();
            
            await this.bot.messageHandler.reply(messageInfo, `✅ Reminder ${reminderId} cancelled.`);

        } catch (error) {
            console.error('Error in cancelremind command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error cancelling reminder.');
        }
    }

    parseReminderInput(input) {
        try {
            // Extract time part and message part
            const timeFormats = [
                /^(\d+)(min|minutes?)\s+(.+)$/i,
                /^(\d+)(h|hour|hours?)\s+(.+)$/i,
                /^(tomorrow)\s+(\d{1,2})(am|pm)?\s+(.+)$/i,
                /^(today)\s+(\d{1,2})(am|pm)?\s+(.+)$/i,
                /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})\s+(.+)$/
            ];

            const now = new Date();
            let datetime, message;

            // Try minutes format
            let match = input.match(/^(\d+)(min|minutes?)\s+(.+)$/i);
            if (match) {
                const minutes = parseInt(match[1]);
                datetime = new Date(now.getTime() + minutes * 60 * 1000);
                message = match[3];
                return { success: true, datetime: datetime.getTime(), message };
            }

            // Try hours format
            match = input.match(/^(\d+)(h|hour|hours?)\s+(.+)$/i);
            if (match) {
                const hours = parseInt(match[1]);
                datetime = new Date(now.getTime() + hours * 60 * 60 * 1000);
                message = match[3];
                return { success: true, datetime: datetime.getTime(), message };
            }

            // Try tomorrow format
            match = input.match(/^tomorrow\s+(\d{1,2})(am|pm)?\s+(.+)$/i);
            if (match) {
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                let hour = parseInt(match[1]);
                if (match[2]?.toLowerCase() === 'pm' && hour !== 12) hour += 12;
                if (match[2]?.toLowerCase() === 'am' && hour === 12) hour = 0;
                tomorrow.setHours(hour, 0, 0, 0);
                message = match[3];
                return { success: true, datetime: tomorrow.getTime(), message };
            }

            return {
                success: false,
                error: 'Invalid time format. Use: 30min, 1h, tomorrow 9am, etc.'
            };

        } catch (error) {
            return {
                success: false,
                error: 'Could not parse reminder time'
            };
        }
    }

    async createReminder(userId, chatId, datetime, message) {
        const reminderId = this.generateId();
        const reminder = {
            id: reminderId,
            userId,
            chatId,
            datetime,
            message,
            created: Date.now()
        };

        this.reminders.set(reminderId, reminder);
        await this.saveReminders();

        // Set timeout for the reminder
        const delay = datetime - Date.now();
        if (delay > 0) {
            const timeout = setTimeout(() => {
                this.triggerReminder(reminderId);
            }, delay);
            this.intervals.set(reminderId, timeout);
        }

        return reminderId;
    }

    async triggerReminder(reminderId) {
        try {
            const reminder = this.reminders.get(reminderId);
            if (!reminder) return;

            await this.bot.sock.sendMessage(reminder.chatId, {
                text: `⏰ **REMINDER**\n\n${reminder.message}\n\n_Set on: ${this.formatDateTime(reminder.created)}_`
            });

            // Remove the completed reminder
            this.reminders.delete(reminderId);
            this.intervals.delete(reminderId);
            await this.saveReminders();

        } catch (error) {
            console.error('Error triggering reminder:', error);
        }
    }

    startReminderChecker() {
        // Check for overdue reminders every minute
        setInterval(() => {
            const now = Date.now();
            for (const [id, reminder] of this.reminders.entries()) {
                if (reminder.datetime <= now && !this.intervals.has(id)) {
                    this.triggerReminder(id);
                }
            }
        }, 60000);
    }

    async loadReminders() {
        try {
            await fs.ensureDir(path.dirname(this.remindersFile));
            if (await fs.pathExists(this.remindersFile)) {
                const data = await fs.readJson(this.remindersFile);
                Object.entries(data).forEach(([id, reminder]) => {
                    this.reminders.set(id, reminder);
                    
                    // Set timeout if reminder is in future
                    const delay = reminder.datetime - Date.now();
                    if (delay > 0) {
                        const timeout = setTimeout(() => {
                            this.triggerReminder(id);
                        }, delay);
                        this.intervals.set(id, timeout);
                    }
                });
            }
        } catch (error) {
            console.error('Error loading reminders:', error);
        }
    }

    async saveReminders() {
        try {
            await fs.ensureDir(path.dirname(this.remindersFile));
            const data = Object.fromEntries(this.reminders);
            await fs.writeJson(this.remindersFile, data, { spaces: 2 });
        } catch (error) {
            console.error('Error saving reminders:', error);
        }
    }

    generateId() {
        return Math.random().toString(36).substr(2, 6).toUpperCase();
    }

    formatDateTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    }

    async cleanup() {
        // Clear all timeouts
        for (const timeout of this.intervals.values()) {
            clearTimeout(timeout);
        }
        this.intervals.clear();
        
        console.log('🧹 Reminder System plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ReminderSystemPlugin();
        await plugin.init(bot);
        return plugin;
    }
};