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
    }

    /**
     * Generate secure password
     */
    async generatePassword(messageInfo) {
        try {
            const { args } = messageInfo;
            
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

            // Calculate strength
            let strength = 'Weak';
            let strengthScore = 0;
            
            if (length >= 8) strengthScore += 1;
            if (length >= 12) strengthScore += 1;
            if (length >= 16) strengthScore += 1;
            if (/[a-z]/.test(password)) strengthScore += 1;
            if (/[A-Z]/.test(password)) strengthScore += 1;
            if (/[0-9]/.test(password)) strengthScore += 1;
            if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) strengthScore += 1;
            
            if (strengthScore >= 6) strength = 'Very Strong 🔒';
            else if (strengthScore >= 5) strength = 'Strong 🛡️';
            else if (strengthScore >= 3) strength = 'Medium ⚠️';
            else strength = 'Weak ❌';

            // Build response
            let responseText = `🔐 *Generated Password:*\n\n`;
            responseText += `\`\`\`${password}\`\`\`\n\n`;
            responseText += `📊 *Strength:* ${strength}\n`;
            responseText += `📏 *Length:* ${length} characters\n`;
            responseText += `🔧 *Composition:*\n`;
            
            if (includeLowercase) responseText += `• Lowercase letters ✅\n`;
            if (includeUppercase) responseText += `• Uppercase letters ✅\n`;
            if (includeNumbers) responseText += `• Numbers ✅\n`;
            if (includeSymbols) responseText += `• Symbols ✅\n`;
            if (excludeSimilar) responseText += `• Similar chars excluded ✅\n`;
            
            responseText += `\n💡 *Usage:*\n`;
            responseText += `• ${config.PREFIX}pg - Default 16 chars\n`;
            responseText += `• ${config.PREFIX}pg 24 - Custom length\n`;
            responseText += `• ${config.PREFIX}pg simple - No symbols\n`;
            responseText += `• ${config.PREFIX}pg complex - All chars\n`;
            responseText += `• ${config.PREFIX}pg nosymbols - Letters & numbers\n`;
            responseText += `• ${config.PREFIX}pg nonumbers - Letters only\n\n`;
            responseText += `⚠️ *Security tip:* Use unique passwords for each account`;

            await this.bot.messageHandler.reply(messageInfo, responseText);

        } catch (error) {
            console.error('Error generating password:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error generating password. Please try again.'
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