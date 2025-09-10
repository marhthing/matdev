/**
 * MATDEV Password Generator Plugin
 * Generate secure passwords with customizable options
 */

const crypto = require('crypto');
const config = require('../config');

class PasswordGeneratorPlugin {
    constructor() {
        this.name = 'passwordgen';
        this.description = 'Generate secure passwords';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Password Generator plugin loaded');
    }

    /**
     * Register password generator commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('pg', this.generatePassword.bind(this), {
            description: 'Generate secure password',
            usage: `${config.PREFIX}pg [length] [options]`,
            category: 'utility',
            plugin: 'passwordgen',
            source: 'passwordgen.js'
        });

        this.bot.messageHandler.registerCommand('pg help', this.showHelp.bind(this), {
            description: 'Show password generator help',
            usage: `${config.PREFIX}pg help`,
            category: 'utility',
            plugin: 'passwordgen',
            source: 'passwordgen.js'
        });
    }

    /**
     * Generate secure password
     */
    async generatePassword(messageInfo) {
        try {
            const { args } = messageInfo;
            
            // Check if help is requested
            if (args.length > 0 && args[0].toLowerCase() === 'help') {
                return await this.showHelp(messageInfo);
            }
            
            // Default settings
            let length = 16;
            let includeNumbers = true;
            let includeSymbols = true;
            let includeUppercase = true;
            let includeLowercase = true;
            let excludeSimilar = false;
            
            // Parse arguments
            for (const arg of args) {
                const num = parseInt(arg);
                if (!isNaN(num) && num >= 4 && num <= 128) {
                    length = num;
                } else if (arg === 'simple') {
                    includeSymbols = false;
                    excludeSimilar = true;
                } else if (arg === 'complex') {
                    includeSymbols = true;
                    excludeSimilar = false;
                } else if (arg === 'nosymbols') {
                    includeSymbols = false;
                } else if (arg === 'nonumbers') {
                    includeNumbers = false;
                }
            }

            // Character sets
            const lowercase = 'abcdefghijklmnopqrstuvwxyz';
            const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const numbers = '0123456789';
            const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            const similarChars = '0O1l|`';

            // Build character set
            let charset = '';
            if (includeLowercase) charset += lowercase;
            if (includeUppercase) charset += uppercase;
            if (includeNumbers) charset += numbers;
            if (includeSymbols) charset += symbols;

            // Remove similar characters if requested
            if (excludeSimilar) {
                for (const char of similarChars) {
                    charset = charset.replace(new RegExp(char, 'g'), '');
                }
            }

            // Generate password
            let password = '';
            const array = new Uint32Array(length);
            crypto.getRandomValues(array);
            
            for (let i = 0; i < length; i++) {
                password += charset[array[i] % charset.length];
            }

            // Ensure password meets complexity requirements
            if (includeUppercase && !/[A-Z]/.test(password)) {
                const pos = Math.floor(Math.random() * length);
                const upperChars = uppercase.split('').filter(c => !excludeSimilar || !similarChars.includes(c));
                password = password.substring(0, pos) + upperChars[Math.floor(Math.random() * upperChars.length)] + password.substring(pos + 1);
            }
            
            if (includeLowercase && !/[a-z]/.test(password)) {
                const pos = Math.floor(Math.random() * length);
                const lowerChars = lowercase.split('').filter(c => !excludeSimilar || !similarChars.includes(c));
                password = password.substring(0, pos) + lowerChars[Math.floor(Math.random() * lowerChars.length)] + password.substring(pos + 1);
            }
            
            if (includeNumbers && !/[0-9]/.test(password)) {
                const pos = Math.floor(Math.random() * length);
                const numChars = numbers.split('').filter(c => !excludeSimilar || !similarChars.includes(c));
                password = password.substring(0, pos) + numChars[Math.floor(Math.random() * numChars.length)] + password.substring(pos + 1);
            }
            
            if (includeSymbols && !/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
                const pos = Math.floor(Math.random() * length);
                password = password.substring(0, pos) + symbols[Math.floor(Math.random() * symbols.length)] + password.substring(pos + 1);
            }

            // Build simplified response
            const responseText = `🔐 Generated Password: ${password}`;

            await this.bot.messageHandler.reply(messageInfo, responseText);

        } catch (error) {
            console.error('Error generating password:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error generating password. Please try again.'
            );
        }
    }

    /**
     * Show password generator help
     */
    async showHelp(messageInfo) {
        try {
            let responseText = `💡 *Usage:*\n`;
            responseText += `• ${config.PREFIX}pg - Default 16 chars\n`;
            responseText += `• ${config.PREFIX}pg 24 - Custom length\n`;
            responseText += `• ${config.PREFIX}pg simple - No symbols\n`;
            responseText += `• ${config.PREFIX}pg complex - All chars\n`;
            responseText += `• ${config.PREFIX}pg nosymbols - Letters & numbers\n`;
            responseText += `• ${config.PREFIX}pg nonumbers - Letters only\n\n`;
            responseText += `⚠️ *Security tip:* Use unique passwords for each account`;

            await this.bot.messageHandler.reply(messageInfo, responseText);

        } catch (error) {
            console.error('Error showing password generator help:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error showing help. Please try again.'
            );
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 Password Generator plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new PasswordGeneratorPlugin();
        await plugin.init(bot);
        return plugin;
    }
};