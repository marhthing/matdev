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
        this.nextId = 1; // Simple counter for IDs
        this.triggeredReminders = new Set(); // Track triggered reminders to manage delivery
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Load existing reminders
            await this.loadReminders();

            this.bot.messageHandler.registerCommand('remind', this.remindCommand.bind(this), {
                description: 'Manage reminders',
                usage: `${config.PREFIX}remind | ${config.PREFIX}remind <time> <message> | ${config.PREFIX}remind cancel <id>`,
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
            const args = messageInfo.args;
            
            // No arguments - show all reminders
            if (args.length === 0) {
                return await this.showReminders(messageInfo);
            }
            
            // Check if first argument is "cancel"
            if (args[0].toLowerCase() === 'cancel') {
                return await this.cancelReminder(messageInfo, args[1]);
            }
            
            // Otherwise, create a reminder
            const fullArgs = args.join(' ').trim();
            const parsed = this.parseReminderInput(fullArgs);
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
            const confirmMessage = await this.bot.messageHandler.reply(messageInfo,
                `⏰ **Reminder Set**\n\n` +
                `**ID:** ${reminderId}\n` +
                `**Time:** ${timeStr}\n` +
                `**Message:** ${parsed.message}\n\n` +
                `🔔 You'll be notified when it's time!`);
            
            // Pin the confirmation message
            if (confirmMessage && confirmMessage.key) {
                try {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        pin: confirmMessage.key
                    });
                } catch (pinError) {
                    console.log('Could not pin confirmation message:', pinError.message);
                }
            }

        } catch (error) {
            console.error('Error in remind command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing reminder.');
        }
    }

    async showReminders(messageInfo) {
        try {
            // Check if this is bot's private chat
            const isBotPrivateChat = messageInfo.chat_jid === messageInfo.sender_jid;
            
            const userReminders = Array.from(this.reminders.values())
                .filter(reminder => {
                    // Must be user's reminder and still active
                    if (reminder.userId !== messageInfo.sender_jid || reminder.datetime <= Date.now()) {
                        return false;
                    }
                    
                    // If bot private chat, show ALL user reminders
                    if (isBotPrivateChat) {
                        return true;
                    }
                    
                    // Otherwise, only show reminders from this specific chat
                    return reminder.chatId === messageInfo.chat_jid;
                })
                .sort((a, b) => a.datetime - b.datetime);

            if (userReminders.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '📅 **No Active Reminders**\n\n' +
                    '**Usage:**\n' +
                    '• `.remind <time> <message>` - Set reminder\n' +
                    '• `.remind cancel <id>` - Cancel reminder\n\n' +
                    '**Examples:**\n' +
                    '• `.remind 30min Call mom`\n' +
                    '• `.remind 1h Meeting`\n' +
                    '• `.remind tomorrow 9am Doctor`');
                return;
            }

            let message = '📅 **Your Reminders**\n\n';
            
            userReminders.forEach((reminder, index) => {
                const timeStr = this.formatDateTime(reminder.datetime);
                message += `**${reminder.id}** - ${timeStr}\n${reminder.message}\n\n`;
            });

            message += `Use .remind cancel <id> to cancel a reminder`;
            
            await this.bot.messageHandler.reply(messageInfo, message);

        } catch (error) {
            console.error('Error showing reminders:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error listing reminders.');
        }
    }

    async cancelReminder(messageInfo, reminderId) {
        try {
            if (!reminderId) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Usage: .remind cancel <id>\n\nUse .remind to see your reminder IDs');
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
            console.error('Error cancelling reminder:', error);
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
            // Prevent duplicate triggers
            if (this.triggeredReminders.has(reminderId)) {
                return;
            }
            
            const reminder = this.reminders.get(reminderId);
            if (!reminder) return;

            // Mark as triggered to manage delivery
            this.triggeredReminders.add(reminderId);

            const reminderText = `⏰ **REMINDER**\n\n${reminder.message}\n\n_Set on: ${this.formatDateTime(reminder.created)}_`;
            
            // Send reminder 3 times with delays to avoid WhatsApp blocking
            for (let i = 0; i < 3; i++) {
                setTimeout(async () => {
                    try {
                        const message = await this.bot.sock.sendMessage(reminder.chatId, {
                            text: reminderText
                        });

                        // Pin the first reminder message
                        if (i === 0 && message && message.key) {
                            try {
                                await this.bot.sock.sendMessage(reminder.chatId, {
                                    pin: message.key
                                });
                            } catch (pinError) {
                                console.log('Could not pin reminder message:', pinError.message);
                            }
                        }
                    } catch (sendError) {
                        console.error(`Error sending reminder ${i + 1}/3:`, sendError);
                    }
                }, i * 2000); // 2 second delay between each send
            }

            // Remove the completed reminder after 10 seconds (after all sends)
            setTimeout(async () => {
                this.reminders.delete(reminderId);
                this.intervals.delete(reminderId);
                this.triggeredReminders.delete(reminderId);
                await this.saveReminders();
            }, 10000);

        } catch (error) {
            console.error('Error triggering reminder:', error);
        }
    }

    startReminderChecker() {
        // Check for overdue reminders every minute
        setInterval(() => {
            const now = Date.now();
            for (const [id, reminder] of this.reminders.entries()) {
                if (reminder.datetime <= now && !this.intervals.has(id) && !this.triggeredReminders.has(id)) {
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
                
                let maxId = 0;
                Object.entries(data.reminders || {}).forEach(([id, reminder]) => {
                    this.reminders.set(id, reminder);
                    
                    // Track highest ID for next counter
                    const idNum = parseInt(id);
                    if (!isNaN(idNum) && idNum > maxId) {
                        maxId = idNum;
                    }
                    
                    // Set timeout if reminder is in future
                    const delay = reminder.datetime - Date.now();
                    if (delay > 0) {
                        const timeout = setTimeout(() => {
                            this.triggerReminder(id);
                        }, delay);
                        this.intervals.set(id, timeout);
                    }
                });
                
                // Set next ID to be one higher than the highest found
                this.nextId = maxId + 1;
                
                // Load nextId from saved data if it exists
                if (data.nextId && data.nextId > this.nextId) {
                    this.nextId = data.nextId;
                }
            }
        } catch (error) {
            console.error('Error loading reminders:', error);
        }
    }

    async saveReminders() {
        try {
            await fs.ensureDir(path.dirname(this.remindersFile));
            const data = {
                nextId: this.nextId,
                reminders: Object.fromEntries(this.reminders)
            };
            await fs.writeJson(this.remindersFile, data, { spaces: 2 });
        } catch (error) {
            console.error('Error saving reminders:', error);
        }
    }

    generateId() {
        const id = this.nextId.toString();
        this.nextId++;
        return id;
    }

    formatDateTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            timeZone: 'Africa/Lagos',
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