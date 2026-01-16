/**
 * Zushi Plugin - Group-wide command permission
 * Usage: .zushi <cmd> (admin only, allows all group members to use <cmd> in this group)
 */

const config = require('../config');
const fs = require('fs');
const path = require('path');
// Use session/storage for persistent permissions
const ZUSHI_PERM_PATH = path.join(__dirname, '../session/storage/zushi_permissions.json');

class ZushiPlugin {
    constructor() {
        this.name = 'zushi';
        this.description = 'Group-wide command permission';
        this.version = '1.0.0';
        this.zushiPerms = {};
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.loadPermissions();
        // Sync to bot database for compatibility
        this.bot.database.setData('zushi_permissions', this.zushiPerms);
        console.log('✅ Zushi plugin loaded');
    }

    loadPermissions() {
        try {
            if (fs.existsSync(ZUSHI_PERM_PATH)) {
                this.zushiPerms = JSON.parse(fs.readFileSync(ZUSHI_PERM_PATH, 'utf8'));
            } else {
                this.zushiPerms = {};
            }
        } catch (e) {
            console.error('Failed to load zushi permissions:', e);
            this.zushiPerms = {};
        }
    }

    savePermissions() {
        try {
            fs.writeFileSync(ZUSHI_PERM_PATH, JSON.stringify(this.zushiPerms, null, 2));
        } catch (e) {
            console.error('Failed to save zushi permissions:', e);
        }
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('zushi', this.zushiCommand.bind(this), {
            description: 'Allow all group members to use a command',
            usage: `${config.PREFIX}zushi <cmd>`,
            category: 'group',
            groupOnly: true,
            plugin: 'zushi',
            source: 'zushi.js'
            // adminOnly: true  // <-- removed adminOnly
        });
    }

    // .zushi <cmd> or .zushi remove <cmd>
    async zushiCommand(messageInfo) {
        const { args, chat_jid } = messageInfo;
        if (!messageInfo.is_group) {
            await this.bot.messageHandler.reply(messageInfo, '❌ This command can only be used in groups.');
            return;
        }
        if (!args || args.length === 0) {
            await this.bot.messageHandler.reply(messageInfo, `❌ Usage: ${config.PREFIX}zushi <cmd> | ${config.PREFIX}zushi remove <cmd>`);
            return;
        }
        // Support .zushi list
        if (args[0].toLowerCase() === 'list') {
            const groupPerms = this.zushiPerms[chat_jid] || [];
            if (groupPerms.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 'ℹ️ No group-wide commands are currently allowed in this group.');
            } else {
                await this.bot.messageHandler.reply(
                    messageInfo,
                    `📋 Group-allowed commands in this group:\n` + groupPerms.map(cmd => `• .${cmd}`).join('\n')
                );
            }
            return;
        }
        // Support .zushi remove <cmd>
        if (args[0].toLowerCase() === 'remove' && args[1]) {
            const cmd = args[1].replace(/^\./, '').toLowerCase();
            if (this.zushiPerms[chat_jid] && this.zushiPerms[chat_jid].includes(cmd)) {
                this.zushiPerms[chat_jid] = this.zushiPerms[chat_jid].filter(c => c !== cmd);
                if (this.zushiPerms[chat_jid].length === 0) delete this.zushiPerms[chat_jid];
                this.savePermissions();
                this.bot.database.setData('zushi_permissions', this.zushiPerms);
                await this.bot.messageHandler.reply(messageInfo, `❌ .${cmd} is no longer allowed for all members in this group.`);
            } else {
                await this.bot.messageHandler.reply(messageInfo, `ℹ️ .${cmd} was not group-allowed in this group.`);
            }
            return;
        }
        const cmd = args[0].replace(/^\./, '').toLowerCase();
        if (!cmd) {
            await this.bot.messageHandler.reply(messageInfo, `❌ Usage: ${config.PREFIX}zushi <cmd>`);
            return;
        }
        if (!this.zushiPerms[chat_jid]) this.zushiPerms[chat_jid] = [];
        if (!this.zushiPerms[chat_jid].includes(cmd)) {
            this.zushiPerms[chat_jid].push(cmd);
            this.savePermissions();
            this.bot.database.setData('zushi_permissions', this.zushiPerms); // keep in sync
            await this.bot.messageHandler.reply(messageInfo, `✅ All group members can now use .${cmd} in this group.`);
        } else {
            await this.bot.messageHandler.reply(messageInfo, `ℹ️ .${cmd} is already allowed for all members in this group.`);
        }
    }

    // Helper to check if a command is allowed for all in a group
    static isGroupCommandAllowed(bot, chat_jid, cmd) {
        // Try to get from plugin instance if possible
        let perms = bot.plugins?.zushi?.zushiPerms;
        if (!perms) {
            perms = bot.database.getData('zushi_permissions') || {};
        }
        return perms[chat_jid] && perms[chat_jid].includes(cmd);
    }
}

module.exports = {
    ZushiPlugin,
    init: async function(bot) {
        if (!bot.plugins) bot.plugins = {};
        bot.plugins.zushi = new ZushiPlugin();
        await bot.plugins.zushi.init(bot);
    }
};
