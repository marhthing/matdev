
/**
 * MATDEV Bot Welcome Message Configuration
 * This file contains the welcome message template and settings
 * for first-time WhatsApp connections.
 */

module.exports = {
    // Welcome message template
    template: {
        title: "🎉 *WELCOME TO MATDEV BOT!*",
        subtitle: "🚀 Your WhatsApp account has been successfully linked!",
        
        sections: {
            configuration: {
                title: "📋 *CURRENT CONFIGURATION:*",
                format: "tree" // "tree" or "list"
            },
            
            systemSettings: {
                title: "🔧 *SYSTEM SETTINGS:*",
                items: [
                    "└── Auto-configured from environment"
                ]
            },
            
            quickCommands: {
                title: "⚡ *QUICK COMMANDS:*",
                items: [
                    "menu - View all available commands",
                    "help - Get detailed help", 
                    "ping - Check bot response time",
                    "stats - Bot statistics",
                    "time - Current bot time",
                    "jid - Get chat JID information"
                ]
            },
            
            ownerCommands: {
                title: "👑 *OWNER COMMANDS:*",
                items: [
                    "env - Check environment variables",
                    "setenv KEY=VALUE - Modify settings",
                    "restart - Restart the bot",
                    "update - Check for updates",
                    "permissions - Manage user permissions"
                ]
            },
            
            security: {
                title: "🔒 *SECURITY:*",
                items: [
                    "Owner-only commands protected",
                    "Rate limiting enabled", 
                    "Anti-ban protection active",
                    "Session encryption enabled"
                ]
            },
            
            help: {
                title: "🆘 *NEED HELP?*",
                items: [
                    "help <command> for specific command info",
                    "ping for connection test",
                    "Check console logs for troubleshooting"
                ]
            }
        },
        
        footer: "Ready to explore? Start with {prefix}menu to see all available features! 🚀"
    },
    
    // Configuration settings to display
    displaySettings: [
        { key: "AUTO_READ", label: "AUTO_READ" },
        { key: "AUTO_STATUS_VIEW", label: "AUTO_STATUS_VIEW" },
        { key: "AUTO_TYPING", label: "AUTO_TYPING" },
        { key: "AUTO_REACT", label: "AUTO_REACT" },
        { key: "STATUS_AUTO_REACT", label: "STATUS_AUTO_REACT" },
        { key: "ANTI_DELETE", label: "ANTI_DELETE" },
        { key: "PUBLIC_MODE", label: "PUBLIC_MODE", special: "mode" },
        { key: "PREFIX", label: "PREFIX", special: "text" },
        { key: "LANGUAGE", label: "LANGUAGE", special: "text", icon: "🌍" },
        { key: "TIMEZONE", label: "TIMEZONE", special: "text", icon: "🕐" }
    ],
    
    // Icons configuration
    icons: {
        enabled: "✅",
        disabled: "❌", 
        public: "🌍",
        private: "🔒",
        bullet: "•"
    },
    
    // Tree formatting characters
    treeChars: {
        middle: "├──",
        last: "└──",
        space: "    "
    },

    /**
     * Generate configuration display for welcome message
     */
    generateConfigDisplay(config) {
        const { template, displaySettings, icons } = this;
        
        // Helper functions
        const getStatusIcon = (value) => {
            if (typeof value === 'boolean') {
                return value ? icons.enabled : icons.disabled;
            }
            return value === 'true' ? icons.enabled : icons.disabled;
        };
        
        const getModeIcon = (isPublic) => isPublic ? icons.public : icons.private;
        
        // Build modern welcome message
        let message = `╭─────────────────────────────────────╮\n`;
        message += `│    🤖 *MATDEV BOT ACTIVATED* 🤖    │\n`;
        message += `╰─────────────────────────────────────╯\n\n`;
        message += `🚀 *Welcome!* Your WhatsApp is now linked!\n\n`;
        
        // Configuration section with modern boxes
        message += `┌─ 📋 *CONFIGURATION STATUS* ─┐\n`;
        displaySettings.forEach((setting, index) => {
            const isLast = index === displaySettings.length - 1;
            const prefix = isLast ? "└" : "├";
            
            const configValue = config[setting.key];
            let displayValue = configValue;
            let statusIcon = "";
            
            if (setting.special === "mode") {
                statusIcon = getModeIcon(configValue);
                displayValue = configValue ? "Public" : "Private";
            } else if (setting.special === "text") {
                statusIcon = setting.icon || "📝";
                displayValue = `"${configValue}"`;
            } else {
                statusIcon = getStatusIcon(configValue);
                displayValue = configValue ? "ON" : "OFF";
            }
            
            message += `${prefix}─ ${setting.label}: ${displayValue} ${statusIcon}\n`;
        });
        message += `└─────────────────────────────────┘\n\n`;
        
        // Quick commands section
        message += `⚡ *ESSENTIAL COMMANDS:*\n`;
        template.sections.quickCommands.items.forEach(item => {
            message += `▸ ${config.PREFIX}${item}\n`;
        });
        message += `\n`;
        
        // Owner commands section  
        message += `👑 *OWNER COMMANDS:*\n`;
        template.sections.ownerCommands.items.forEach(item => {
            message += `▸ ${config.PREFIX}${item}\n`;
        });
        message += `\n`;
        
        // Security status
        message += `🛡️ *SECURITY STATUS:*\n`;
        template.sections.security.items.forEach(item => {
            message += `✓ ${item}\n`;
        });
        message += `\n`;
        
        // Help section
        message += `🆘 *NEED HELP?*\n`;
        template.sections.help.items.forEach(item => {
            message += `• ${config.PREFIX}${item}\n`;
        });
        message += `\n`;
        
        // Footer with modern styling
        message += `╭─────────────────────────────────────╮\n`;
        message += `│  Ready to explore? Try ${config.PREFIX}menu! 🚀  │\n`;
        message += `╰─────────────────────────────────────╯`;
        
        return message;
    }
};
