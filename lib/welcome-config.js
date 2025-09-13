
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
    }
};
