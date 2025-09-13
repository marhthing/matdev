const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class StatusPlugin {
    constructor() {
        this.name = 'status';
        this.description = 'WhatsApp status auto-view, auto-send, monitoring, and auto-react functionality';
        this.version = '2.0.0';

        // Store bound handlers to prevent duplicates on hot reload
        this.boundHandleMessagesUpsert = this.handleMessagesUpsert.bind(this);
        this.boundHandleStatusMonitoring = this.handleStatusMonitoring.bind(this);

        // Status settings storage file
        this.statusSettingsFile = path.join(__dirname, '..', 'session', 'storage', 'status_settings.json');
        this.statusSettings = this.loadStatusSettings();

        // Message deduplication set
        this.processedMessages = new Set();
        
        // Status reaction functionality
        this.reactedStatuses = new Set();
        this.statusReactions = [
            '❤️',    // Red heart
            '🧡',    // Orange heart
            '💛',    // Yellow heart
            '💚',    // Green heart
            '💙',    // Blue heart
            '💜',    // Purple heart
            '🤍',    // White heart
            '🤎',    // Brown heart
            '🖬',    // Black heart
            '💝'     // Pink heart (gift heart)
        ];
        
        // Start cleanup timer for reacted statuses
        this.startStatusReactCleanupTimer();
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.logger = bot.logger;
        this.registerCommands();

        // Setup event listeners when socket becomes available
        this.setupEventListeners();

        console.log('✅ Status plugin loaded');
        return this;
    }

    /**
     * Load status settings from JSON file
     */
    loadStatusSettings() {
        try {
            // Ensure storage directory exists
            const storageDir = path.dirname(this.statusSettingsFile);
            fs.ensureDirSync(storageDir);

            let settings = {};
            
            if (fs.existsSync(this.statusSettingsFile)) {
                settings = fs.readJsonSync(this.statusSettingsFile);
            }

            // Environment variable takes precedence over JSON settings
            const envStatusEnabled = config.AUTO_STATUS_VIEW;
            
            const finalSettings = {
                enabled: envStatusEnabled !== undefined ? envStatusEnabled : (settings.enabled || false),
                autoDownload: settings.autoDownload !== false, // default true
                viewMode: settings.viewMode || 'all', // 'all', 'except', 'only'
                filterJids: settings.filterJids || [],
                forwardDestination: settings.forwardDestination || `${config.OWNER_NUMBER}@s.whatsapp.net`,
                // Status reaction settings
                statusReactEnabled: settings.statusReactEnabled || process.env.STATUS_AUTO_REACT === 'true' || false,
                statusReactDelayMode: settings.statusReactDelayMode || process.env.STATUS_REACT_DELAY || 'delay',
                statusReactionDelay: settings.statusReactionDelay || {
                    min: 30000,  // 30 seconds
                    max: 300000  // 5 minutes
                },
                ...settings
            };

            // If environment variable is different from JSON, update JSON to match
            if (envStatusEnabled !== undefined && settings.enabled !== envStatusEnabled) {
                finalSettings.enabled = envStatusEnabled;
                console.log(`🔄 Syncing status settings with AUTO_STATUS_VIEW: ${envStatusEnabled}`);
                // Save the updated settings to keep them in sync
                fs.writeJsonSync(this.statusSettingsFile, finalSettings, { spaces: 2 });
            }

            return finalSettings;
        } catch (error) {
            console.error('Error loading status settings:', error);
        }

        // Default settings - check environment variable first
        return {
            enabled: config.AUTO_STATUS_VIEW || false,
            autoDownload: true,
            viewMode: 'all',
            filterJids: [],
            forwardDestination: `${config.OWNER_NUMBER}@s.whatsapp.net`,
            // Status reaction defaults
            statusReactEnabled: process.env.STATUS_AUTO_REACT === 'true' || false,
            statusReactDelayMode: process.env.STATUS_REACT_DELAY || 'delay',
            statusReactionDelay: {
                min: 30000,  // 30 seconds
                max: 300000  // 5 minutes
            }
        };
    }

    /**
     * Save status settings to JSON file
     */
    saveStatusSettings() {
        try {
            fs.writeJsonSync(this.statusSettingsFile, this.statusSettings, { spaces: 2 });
            console.log('💾 Status settings saved');
            
            // Update environment variable to keep it in sync
            this.updateEnvVar('AUTO_STATUS_VIEW', this.statusSettings.enabled.toString());
        } catch (error) {
            console.error('Error saving status settings:', error);
        }
    }

    /**
     * Setup event listeners when socket is available
     */
    setupEventListeners() {
        // Check if socket is already available
        if (this.bot.sock && this.bot.sock.ev) {
            this.registerSocketEvents();
        } else {
            // Wait for socket to be available
            const checkSocket = () => {
                if (this.bot.sock && this.bot.sock.ev) {
                    this.registerSocketEvents();
                } else {
                    setTimeout(checkSocket, 100);
                }
            };
            checkSocket();
        }
    }

    /**
     * Register socket events
     */
    registerSocketEvents() {
        try {
            // Register message handler for auto-send functionality and auto-view
            this.bot.sock.ev.on('messages.upsert', this.boundHandleMessagesUpsert);

            // Monitor status updates for auto-saving
            this.bot.sock.ev.on('messages.upsert', this.boundHandleStatusMonitoring);

            console.log('✅ Status plugin socket events registered');
        } catch (error) {
            console.error('Error registering status plugin events:', error);
        }
    }

    /**
     * Register all status commands
     */
    registerCommands() {
        // Register comprehensive status command
        this.bot.messageHandler.registerCommand('status', this.handleStatusCommand.bind(this), {
            description: 'Manage automatic status viewing, downloading, and forwarding',
            usage: `${config.PREFIX}status <jid>|on|off [no-dl] [except-view|only-view <jid,...>]`,
            category: 'status'
        });
        
        // Register status reaction command
        this.bot.messageHandler.registerCommand('reactstatus', this.handleStatusReactCommand.bind(this), {
            description: 'Manage automatic status reactions',
            usage: `${config.PREFIX}reactstatus on|off|delay|nodelay`,
            category: 'status'
        });
    }

    /**
     * Handle comprehensive status command
     */
    async handleStatusCommand(messageInfo) {
        try {
            const args = messageInfo.args;

            if (args.length === 0) {
                // Show current status
                return await this.showStatusInfo(messageInfo);
            }

            const action = args[0].toLowerCase();

            if (action === 'off') {
                // Turn off status features
                this.statusSettings.enabled = false;
                this.saveStatusSettings();

                return await this.bot.messageHandler.reply(messageInfo, 
                    '🔴 Status auto-view and auto-download disabled');
            }

            if (action === 'on') {
                // Parse complex on command arguments
                return await this.handleStatusOnCommand(messageInfo, args);
            }

            // Check if this is a modifier command (except-view, only-view, no-dl)
            if (action === 'except-view' || action === 'only-view' || action === 'no-dl') {
                // Apply modifier to current settings without requiring "on"
                return await this.handleStatusModifier(messageInfo, args);
            }

            // Check if this is a JID to set destination (like .save <jid> or .vv <jid>)
            if (args.length === 1) {
                // This is setting the forwarding destination
                const newDestination = this.normalizeJid(args[0]);
                this.statusSettings.forwardDestination = newDestination;
                this.saveStatusSettings();

                return await this.bot.messageHandler.reply(messageInfo, 
                    `📤 Status forwarding destination set to: ${newDestination}`);
            }

            // Invalid action
            return await this.bot.messageHandler.reply(messageInfo, 
                `❌ Invalid action. Use:\n` +
                `${config.PREFIX}status <jid> - Set forwarding destination\n` +
                `${config.PREFIX}status on|off [no-dl] [except-view|only-view <jid,...>]`);

        } catch (error) {
            console.error('Status command error:', error);
            return await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing status command');
        }
    }

    /**
     * Handle "status on" command with all its variations
     */
    async handleStatusOnCommand(messageInfo, args) {
        try {
            // Reset to defaults
            this.statusSettings.enabled = true;
            this.statusSettings.autoDownload = true;
            this.statusSettings.viewMode = 'all';
            this.statusSettings.filterJids = [];

            let i = 1; // Start after "on"
            let responseMsg = '🟢 Status auto-view enabled';

            // Parse arguments
            while (i < args.length) {
                const arg = args[i].toLowerCase();

                if (arg === 'no-dl') {
                    this.statusSettings.autoDownload = false;
                    responseMsg += '\n📱 Auto-download disabled';
                    i++;
                    continue;
                }

                if (arg === 'except-view') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing JID list for except-view');
                    }

                    const jidList = args[i + 1].split(',').map(jid => jid.trim());
                    this.statusSettings.viewMode = 'except';
                    this.statusSettings.filterJids = this.normalizeJids(jidList);
                    responseMsg += `\n🚫 Excluding ${this.statusSettings.filterJids.length} JIDs from auto-view`;
                    i += 2;
                    continue;
                }

                if (arg === 'only-view') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing JID list for only-view');
                    }

                    const jidList = args[i + 1].split(',').map(jid => jid.trim());
                    this.statusSettings.viewMode = 'only';
                    this.statusSettings.filterJids = this.normalizeJids(jidList);
                    responseMsg += `\n✅ Only viewing ${this.statusSettings.filterJids.length} specified JIDs`;
                    i += 2;
                    continue;
                }

                if (arg === 'destination') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing destination JID');
                    }

                    this.statusSettings.forwardDestination = this.normalizeJid(args[i + 1]);
                    responseMsg += `\n📤 Forward destination set`;
                    i += 2;
                    continue;
                }

                // Unknown argument
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unknown argument: ${args[i]}`);
            }

            // Save settings
            this.saveStatusSettings();

            return await this.bot.messageHandler.reply(messageInfo, '🟢 Enabled');

        } catch (error) {
            console.error('Status on command error:', error);
            return await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing status on command');
        }
    }

    /**
     * Handle status modifier commands without requiring "on"
     */
    async handleStatusModifier(messageInfo, args) {
        try {
            const wasEnabled = this.statusSettings.enabled;
            let responseMsg = '';

            // If it was disabled, mention that status is still disabled
            if (!wasEnabled) {
                responseMsg = '⚠️ Settings updated, but status is still disabled\n';
            }

            let i = 0; // Start from the first argument (the modifier)

            // Parse arguments
            while (i < args.length) {
                const arg = args[i].toLowerCase();

                if (arg === 'no-dl') {
                    this.statusSettings.autoDownload = false;
                    responseMsg += wasEnabled ? '📱 Auto-download disabled' : '📱 Auto-download will be disabled when enabled';
                    i++;
                    continue;
                }

                if (arg === 'except-view') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing JID list for except-view');
                    }

                    const jidList = args[i + 1].split(',').map(jid => jid.trim());
                    this.statusSettings.viewMode = 'except';
                    this.statusSettings.filterJids = this.normalizeJids(jidList);
                    responseMsg += wasEnabled ? 
                        `🚫 Excluding ${this.statusSettings.filterJids.length} JIDs from auto-view` :
                        `🚫 Will exclude ${this.statusSettings.filterJids.length} JIDs when enabled`;
                    i += 2;
                    continue;
                }

                if (arg === 'only-view') {
                    if (i + 1 >= args.length) {
                        return await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Missing JID list for only-view');
                    }

                    const jidList = args[i + 1].split(',').map(jid => jid.trim());
                    this.statusSettings.viewMode = 'only';
                    this.statusSettings.filterJids = this.normalizeJids(jidList);
                    responseMsg += wasEnabled ?
                        `✅ Only viewing ${this.statusSettings.filterJids.length} specified JIDs` :
                        `✅ Will only view ${this.statusSettings.filterJids.length} JIDs when enabled`;
                    i += 2;
                    continue;
                }

                // Unknown argument
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Unknown argument: ${args[i]}`);
            }

            // Save settings
            this.saveStatusSettings();

            return await this.bot.messageHandler.reply(messageInfo, responseMsg);

        } catch (error) {
            console.error('Error handling status modifier:', error);
            return await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing status modifier');
        }
    }

    /**
     * Show current status configuration
     */
    async showStatusInfo(messageInfo) {
        try {
            let info = `📊 *Status Configuration*\n\n`;
            info += `🔘 Status: ${this.statusSettings.enabled ? '🟢 Enabled' : '🔴 Disabled'}\n`;
            info += `💾 Auto download: ${this.statusSettings.autoDownload ? '✅ Enabled' : '❌ Disabled'}\n`;
            info += `📤 Forward to: ${this.statusSettings.forwardDestination}\n`;
            info += `👁️ View mode: ${this.statusSettings.viewMode.toUpperCase()}\n`;

            if (this.statusSettings.filterJids.length > 0) {
                info += `📝 Filtered JIDs: ${this.statusSettings.filterJids.join(', ')}\n`;
            } else {
                info += `📝 Filtered JIDs: None\n`;
            }

            info += `\n💡 Usage:\n`;
            info += `${config.PREFIX}status <jid> - Set forwarding destination\n`;
            info += `${config.PREFIX}status on | off | no-dl | except-view <jid,...> | only-view <jid,...>`;

            return await this.bot.messageHandler.reply(messageInfo, info);
        } catch (error) {
            console.error('Status info error:', error);
        }
    }

    /**
     * Normalize JID format
     */
    normalizeJid(jid) {
        if (!jid.includes('@')) {
            return `${jid}@s.whatsapp.net`;
        }
        return jid;
    }

    /**
     * Normalize array of JIDs
     */
    normalizeJids(jidList) {
        return jidList.map(jid => this.normalizeJid(jid));
    }

    /**
     * Update environment variable
     */
    updateEnvVar(key, value) {
        try {
            // Update the config object immediately
            config[key] = value === 'true';
            console.log(`🔧 Updated ${key} = ${value}`);
            
            // If system plugin is available, use it to update .env file
            if (this.bot.plugins && this.bot.plugins.system && this.bot.plugins.system.setEnvValue) {
                this.bot.plugins.system.setEnvValue(key, value);
            }
        } catch (error) {
            console.error(`Error updating ${key}:`, error);
        }
    }
    
    /**
     * Update .env file directly
     */
    updateEnvFile(key, value) {
        try {
            const envPath = path.join(__dirname, '..', '.env');
            
            if (!fs.existsSync(envPath)) {
                console.warn('⚠️ .env file not found, cannot save setting');
                return false;
            }
            
            let envContent = fs.readFileSync(envPath, 'utf8');
            const lines = envContent.split('\n');
            let keyFound = false;
            
            // Update existing key or add new one
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.startsWith(`${key}=`)) {
                    lines[i] = `${key}=${value}`;
                    keyFound = true;
                    break;
                }
            }
            
            // Add key if not found
            if (!keyFound) {
                lines.push(`${key}=${value}`);
            }
            
            // Write back to file
            fs.writeFileSync(envPath, lines.join('\n'));
            
            // Update process.env for immediate effect
            process.env[key] = value;
            
            return true;
        } catch (error) {
            console.error('Error updating .env file:', error);
            return false;
        }
    }
    
    /**
     * Start cleanup timer for old reacted statuses
     */
    startStatusReactCleanupTimer() {
        // Clean up every 6 hours
        this.statusReactCleanupInterval = setInterval(() => {
            console.log(`🧹 Cleaning up reacted status cache (${this.reactedStatuses.size} entries)`);
            this.reactedStatuses.clear();
        }, 6 * 60 * 60 * 1000);
    }
    
    /**
     * Handle status react command
     */
    async handleStatusReactCommand(messageInfo) {
        try {
            const action = messageInfo.args[0]?.toLowerCase();
            
            if (action === 'on' || action === 'enable') {
                this.statusSettings.statusReactEnabled = true;
                this.saveStatusSettings();
                this.updateEnvFile('STATUS_AUTO_REACT', 'true');
                await this.bot.messageHandler.reply(messageInfo, `✅ *STATUS AUTO REACTIONS ENABLED*`);
            } else if (action === 'off' || action === 'disable') {
                this.statusSettings.statusReactEnabled = false;
                this.saveStatusSettings();
                this.updateEnvFile('STATUS_AUTO_REACT', 'false');
                await this.bot.messageHandler.reply(messageInfo, '❌ *STATUS AUTO REACTIONS DISABLED*');
            } else if (action === 'delay') {
                this.statusSettings.statusReactDelayMode = 'delay';
                this.saveStatusSettings();
                this.updateEnvFile('STATUS_REACT_DELAY', 'delay');
                await this.bot.messageHandler.reply(messageInfo, '⏰ *STATUS REACTION DELAY ENABLED*\n\n🕐 Bot will now wait 30s-5min before reacting to status updates.');
            } else if (action === 'nodelay') {
                this.statusSettings.statusReactDelayMode = 'nodelay';
                this.saveStatusSettings();
                this.updateEnvFile('STATUS_REACT_DELAY', 'nodelay');
                await this.bot.messageHandler.reply(messageInfo, '⚡ *STATUS REACTION DELAY DISABLED*\n\n💨 Bot will now react to status updates instantly.');
            } else {
                // Show status
                const delayStatus = this.statusSettings.statusReactDelayMode === 'delay' ? 
                    `⏰ Delayed (${this.statusSettings.statusReactionDelay.min/1000}s-${this.statusSettings.statusReactionDelay.max/60000}min)` : 
                    '⚡ Instant';
                
                const response = `*👁️ STATUS AUTO REACT STATUS*\n\n` +
                    `*Status:* ${this.statusSettings.statusReactEnabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                    `*Timing:* ${delayStatus}\n` +
                    `*Reactions:* ${this.statusReactions.join('')}\n` +
                    `*Cache:* ${this.reactedStatuses.size} statuses\n\n` +
                    `*Commands:*\n` +
                    `${config.PREFIX}reactstatus on/off/delay/nodelay`;
                
                await this.bot.messageHandler.reply(messageInfo, response);
            }
        } catch (error) {
            console.error('Error in handleStatusReactCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling status reactions: ' + error.message);
        }
    }
    
    /**
     * Send status reaction using the proven working method
     */
    async sendStatusReaction(message, reaction) {
        // Use the proven working method: React using participant JID with status key structure
        return await this.bot.sock.sendMessage(message.key.participant, {
            react: {
                text: reaction,
                key: {
                    remoteJid: 'status@broadcast',
                    id: message.key.id,
                    participant: message.key.participant,
                    fromMe: false
                }
            }
        });
    }

    async handleMessagesUpsert({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                // Handle auto status view first
                await this.handleAutoStatusView(message);
                
                // Handle independent status reactions (works without viewing)
                await this.handleIndependentStatusReact(message);

                // Extract JID information using centralized JID utils
                const jids = this.bot.jidUtils.extractJIDs(message);
                if (!jids) continue;

                // Get message text
                const messageType = Object.keys(message.message || {})[0];
                const content = message.message[messageType];
                let text = '';

                if (typeof content === 'string') {
                    text = content;
                } else if (content?.text) {
                    text = content.text;
                }

                if (!text) continue;

                // Check if this is a reply to a status
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const contextInfo = message.message?.extendedTextMessage?.contextInfo;

                if (quotedMessage && this.isStatusReply({ quotedMessage, contextInfo })) {
                    // Handle auto-send functionality for bot owner's status
                    if (this.shouldAutoSend(text.toLowerCase(), contextInfo, jids)) {
                        await this.handleAutoSend(quotedMessage, jids.chat_jid);
                    }
                }
            } catch (error) {
                // console.error(`Error in status message handler: ${error.message}`);
            }
        }
    }

    /**
     * Handle independent status reactions (works without auto-view)
     */
    async handleIndependentStatusReact(message) {
        try {
            // Only process if status reactions are enabled
            if (!this.statusSettings.statusReactEnabled) {
                return;
            }
            
            // Check if this is a status message
            if (!this.isStatusMessage(message)) {
                return;
            }
            
            // Skip deleted/revoked status messages
            if (message.messageStubType === 'REVOKE' || 
                message.message?.protocolMessage?.type === 'REVOKE' ||
                !message.message || 
                Object.keys(message.message).length === 0) {
                return;
            }
            
            // Skip our own status
            if (message.key.fromMe) {
                return;
            }
            
            const participantJid = message.key.participant;
            const messageId = `${message.key.remoteJid}_${message.key.id}_${participantJid}`;
            
            // Check for message deduplication
            if (this.processedMessages.has(messageId)) {
                return;
            }
            
            // Apply JID filtering based on status settings (reuse viewing filters)
            if (!this.shouldViewStatus(participantJid)) {
                return;
            }
            
            // Mark message as processed for deduplication
            this.processedMessages.add(messageId);
            
            // Clean up old processed messages (keep last 1000)
            if (this.processedMessages.size > 1000) {
                const firstEntry = this.processedMessages.values().next().value;
                this.processedMessages.delete(firstEntry);
            }
            
            // Process reaction without viewing the status
            await this.handleStatusReactionOnly(message);
            
        } catch (error) {
            console.error('❌ Error in handleIndependentStatusReact:', error);
        }
    }
    
    /**
     * Check if message is a status message
     */
    isStatusMessage(message) {
        if (!message || !message.key) return false;
        
        const jid = message.key.remoteJid;
        
        // Multiple checks for status messages
        return (
            jid === 'status@broadcast' ||           // Traditional method
            jid?.endsWith('@broadcast') ||          // Updated method
            jid?.includes('status') ||              // Alternative check
            message.key.id?.startsWith('status_')   // ID-based check
        );
    }
    
    /**
     * Handle status reaction only (without viewing)
     */
    async handleStatusReactionOnly(message) {
        try {
            // Create unique identifier for this status
            const statusId = `${message.key.participant || message.key.remoteJid}_${message.key.id}`;
            
            // Skip if we already reacted to this status
            if (this.reactedStatuses.has(statusId)) {
                return;
            }
            
            // Mark as processed IMMEDIATELY to prevent duplicates
            this.reactedStatuses.add(statusId);
            
            // Get random status reaction
            const reaction = this.statusReactions[Math.floor(Math.random() * this.statusReactions.length)];
            if (!reaction) {
                return;
            }
            
            // Calculate delay based on delay mode
            const delay = this.statusSettings.statusReactDelayMode === 'delay' ? 
                         (this.statusSettings.statusReactionDelay.min + Math.random() * (this.statusSettings.statusReactionDelay.max - this.statusSettings.statusReactionDelay.min)) : 0;
            
            // Schedule the reaction (WITHOUT viewing the status)
            setTimeout(async () => {
                try {
                    await this.sendStatusReaction(message, reaction);
                    // Status reacted successfully WITHOUT viewing
                } catch (error) {
                    console.error('❌ Independent status reaction failed:', error.message);
                    // Remove from cache since reaction failed
                    this.reactedStatuses.delete(statusId);
                }
            }, delay);
            
        } catch (error) {
            console.error('❌ Error in handleStatusReactionOnly:', error);
        }
    }
    
    /**
     * Handle status auto react functionality (only when viewing)
     */
    async handleStatusAutoReact(message) {
        try {
            // Skip our own status
            if (message.key.fromMe) {
                return;
            }
            
            // Create unique identifier for this status
            const statusId = `${message.key.participant || message.key.remoteJid}_${message.key.id}`;
            
            // Skip if we already reacted to this status
            if (this.reactedStatuses.has(statusId)) {
                return;
            }
            
            // Mark as processed IMMEDIATELY to prevent duplicates
            this.reactedStatuses.add(statusId);
            
            // Get random status reaction
            const reaction = this.statusReactions[Math.floor(Math.random() * this.statusReactions.length)];
            if (!reaction) {
                return;
            }
            
            // Calculate delay based on delay mode
            const delay = this.statusSettings.statusReactDelayMode === 'delay' ? 
                         (this.statusSettings.statusReactionDelay.min + Math.random() * (this.statusSettings.statusReactionDelay.max - this.statusSettings.statusReactionDelay.min)) : 0;
            
            // Schedule the reaction
            setTimeout(async () => {
                try {
                    await this.sendStatusReaction(message, reaction);
                    // Status reacted successfully as extension of auto-view
                } catch (error) {
                    console.error('❌ Status reaction failed:', error.message);
                    // Remove from cache since reaction failed
                    this.reactedStatuses.delete(statusId);
                }
            }, delay);
            
        } catch (error) {
            console.error('❌ Error in handleStatusAutoReact:', error);
        }
    }
    
    /**
     * Handle auto status view functionality
     */
    async handleAutoStatusView(message) {
        try {
            // Check if this is a status update and auto-view is enabled
            if (message.key?.remoteJid === 'status@broadcast' && 
                !message.key.fromMe && 
                this.statusSettings.enabled) {

                // Skip deleted/revoked status messages
                if (message.messageStubType === 'REVOKE' || 
                    message.message?.protocolMessage?.type === 'REVOKE' ||
                    !message.message || 
                    Object.keys(message.message).length === 0) {
                    // Skipping deleted/revoked status message
                    return;
                }

                const participantJid = message.key.participant;
                const messageId = `${message.key.remoteJid}_${message.key.id}_${participantJid}`;

                // Check for message deduplication
                if (this.processedMessages.has(messageId)) {
                    return;
                }

                // Apply JID filtering based on viewMode
                if (!this.shouldViewStatus(participantJid)) {
                    this.logger.debug('🚫 Skipped viewing status from:', participantJid, '(filtered)');
                    return;
                }

                // Mark message as processed
                this.processedMessages.add(messageId);

                // Clean up old processed messages (keep last 1000)
                if (this.processedMessages.size > 1000) {
                    const firstEntry = this.processedMessages.values().next().value;
                    this.processedMessages.delete(firstEntry);
                }

                // Auto-view the status
                await this.bot.sock.readMessages([message.key]);
                // Status auto-viewed successfully
                
                // Handle status auto-react if enabled (only when viewing)
                if (this.statusSettings.statusReactEnabled) {
                    await this.handleStatusAutoReact(message);
                }

                // Handle auto-download and forwarding if enabled
                if (this.statusSettings.autoDownload) {
                    await this.handleAutoDownloadAndForward(message);
                }
            }
        } catch (error) {
            console.error('❌ Error auto-viewing status:', error.message, error.stack);
        }
    }

    /**
     * Check if a status should be viewed based on filtering settings
     */
    shouldViewStatus(participantJid) {
        if (!participantJid) return false;

        // Log for debugging
        console.log(`🔍 Checking if should view status from: ${participantJid}`);
        console.log(`🔍 View mode: ${this.statusSettings.viewMode}`);
        console.log(`🔍 Filter JIDs: ${JSON.stringify(this.statusSettings.filterJids)}`);

        switch (this.statusSettings.viewMode) {
            case 'all':
                return true;
            case 'except':
                // Check both exact match and normalized versions
                const isExcluded = this.statusSettings.filterJids.some(filterJid => {
                    return filterJid === participantJid || 
                           this.normalizeJidForMatching(filterJid) === participantJid ||
                           filterJid === this.normalizeJidForMatching(participantJid);
                });
                console.log(`🔍 Should exclude: ${isExcluded}`);
                return !isExcluded;
            case 'only':
                // Check both exact match and normalized versions
                const isIncluded = this.statusSettings.filterJids.some(filterJid => {
                    return filterJid === participantJid || 
                           this.normalizeJidForMatching(filterJid) === participantJid ||
                           filterJid === this.normalizeJidForMatching(participantJid);
                });
                console.log(`🔍 Should include: ${isIncluded}`);
                return isIncluded;
            default:
                return true;
        }
    }

    /**
     * Normalize JID for robust matching (different from the existing normalizeJid function)
     */
    normalizeJidForMatching(jid) {
        if (!jid) return jid;

        // Remove common suffixes for comparison
        let normalized = jid.replace('@s.whatsapp.net', '').replace('@lid', '');

        // If it's just a number, we'll compare both with and without suffixes
        if (/^\d+$/.test(normalized)) {
            return normalized;
        }

        return jid;
    }

    /**
     * Handle auto-download and forwarding functionality
     */
    async handleAutoDownloadAndForward(message) {
        try {
            const participantJid = message.key.participant;

            // Extract and download media if present
            const mediaData = await this.extractStatusMedia(message);
            const textContent = this.extractStatusText(message);

            if (mediaData || textContent) {
                // Forward to destination
                const destination = this.statusSettings.forwardDestination;

                if (mediaData) {
                    // Use anti-delete style tagging format for media
                    const tagText = 'statusMessage • Status';
                    const originalCaption = mediaData.caption || '';

                    if (mediaData.image) {
                        await this.bot.sock.sendMessage(destination, {
                            image: mediaData.image,
                            caption: originalCaption,
                            contextInfo: {
                                quotedMessage: {
                                    conversation: tagText
                                },
                                participant: participantJid,
                                remoteJid: 'status@broadcast',
                                fromMe: false,
                                quotedMessageId: message.key.id || `status_${Date.now()}`
                            }
                        });
                    } else if (mediaData.video) {
                        await this.bot.sock.sendMessage(destination, {
                            video: mediaData.video,
                            caption: originalCaption,
                            contextInfo: {
                                quotedMessage: {
                                    conversation: tagText
                                },
                                participant: participantJid,
                                remoteJid: 'status@broadcast',
                                fromMe: false,
                                quotedMessageId: message.key.id || `status_${Date.now()}`
                            }
                        });
                    } else if (mediaData.audio) {
                        await this.bot.sock.sendMessage(destination, {
                            audio: mediaData.audio,
                            mimetype: mediaData.mimetype,
                            contextInfo: {
                                quotedMessage: {
                                    conversation: tagText
                                },
                                participant: participantJid,
                                remoteJid: 'status@broadcast',
                                fromMe: false,
                                quotedMessageId: message.key.id || `status_${Date.now()}`
                            }
                        });
                    } else if (mediaData.document) {
                        await this.bot.sock.sendMessage(destination, {
                            document: mediaData.document,
                            mimetype: mediaData.mimetype,
                            fileName: mediaData.fileName,
                            contextInfo: {
                                quotedMessage: {
                                    conversation: tagText
                                },
                                participant: participantJid,
                                remoteJid: 'status@broadcast',
                                fromMe: false,
                                quotedMessageId: message.key.id || `status_${Date.now()}`
                            }
                        });
                    } else if (mediaData.sticker) {
                        await this.bot.sock.sendMessage(destination, {
                            sticker: mediaData.sticker,
                            contextInfo: {
                                quotedMessage: {
                                    conversation: tagText
                                },
                                participant: participantJid,
                                remoteJid: 'status@broadcast',
                                fromMe: false,
                                quotedMessageId: message.key.id || `status_${Date.now()}`
                            }
                        });
                    }

                    // Status media forwarded successfully

                } else if (textContent) {
                    // Forward text status with anti-delete style tagging
                    const tagText = 'statusMessage • Status';

                    await this.bot.sock.sendMessage(destination, {
                        text: textContent,
                        contextInfo: {
                            quotedMessage: {
                                conversation: tagText
                            },
                            participant: participantJid,
                            remoteJid: 'status@broadcast',
                            fromMe: false,
                            quotedMessageId: message.key.id || `status_${Date.now()}`
                        }
                    });

                    // Status text forwarded successfully
                }
            }
        } catch (error) {
            console.error('❌ Error in auto-download and forward:', error.message, error.stack);
        }
    }

    /**
     * Check if message is a reply to WhatsApp status
     */
    isStatusReply(messageData) {
        // Check if message has quoted message and it's from status
        if (!messageData.quotedMessage) return false;

        // Status messages have specific characteristics:
        // 1. They come from status@broadcast
        // 2. Or have specific contextInfo indicating status
        const contextInfo = messageData.contextInfo;
        const isStatusBroadcast = contextInfo?.remoteJid?.includes('status@broadcast') ||
                                 contextInfo?.participant?.includes('status@broadcast') ||
                                 messageData.quotedMessage.key?.remoteJid?.includes('status@broadcast');

        return isStatusBroadcast;
    }

    /**
     * Check if user wants auto-send (contains 'send' keyword)
     */
    shouldAutoSend(text, contextInfo, jids) {
        // Only auto-send if replying to bot owner's status
        const botOwnerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
        const isReplyingToBotOwner = contextInfo?.participant === botOwnerJid;

        // Don't auto-send to the bot owner themselves
        if (jids.participant_jid === botOwnerJid) {
            return false;
        }

        // Check for 'send' keyword variations (more comprehensive)
        const hasSendKeyword = text.includes('send') ||
                              text.includes('please send') ||
                              text.includes('send please') ||
                              text.includes('pls send') ||
                              text.includes('send pls') ||
                              text.includes('plz send') ||
                              text.includes('send plz') ||
                              text.match(/\bsend\b/);

        console.log(`🔍 Auto-send check: Bot owner status: ${isReplyingToBotOwner}, Has send keyword: ${hasSendKeyword}, Text: "${text}"`);

        return isReplyingToBotOwner && hasSendKeyword;
    }

    /**
     * Auto-send status media to user who replied with 'send'
     */
    async handleAutoSend(quotedMessage, userJid) {
        try {
            // Extract media from quoted status
            const mediaData = await this.extractStatusMedia(quotedMessage);

            if (mediaData) {
                // Send the media to the user
                await this.bot.sock.sendMessage(userJid, mediaData);
                console.log(`📤 Auto-sent status media to ${userJid}`);
            } else {
                // If no media, send text content
                const textContent = this.extractStatusText(quotedMessage);
                if (textContent) {
                    await this.bot.sock.sendMessage(userJid, { text: textContent });
                    console.log(`📤 Auto-sent status text to ${userJid}`);
                }
            }
        } catch (error) {
            console.error(`Error in auto-send: ${error.message}`);
        }
    }

    /**
     * Monitor status updates for auto-saving own status
     */
    async handleStatusMonitoring({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                // Check if this is a status update from the bot owner
                if (message.key.remoteJid === 'status@broadcast' &&
                    message.key.participant === `${config.OWNER_NUMBER}@s.whatsapp.net`) {

                    // Status is already saved automatically in session/media by WhatsApp
                    // No need to forward to private chat
                    console.log('📱 Detected own status update (auto-save to chat disabled)');
                }
            } catch (error) {
                console.error(`Error in status monitoring: ${error.message}`);
            }
        }
    }


    /**
     * Extract media from status message
     */
    async extractStatusMedia(messageOrQuoted) {
        try {
            const { downloadMediaMessage } = require('baileys');

            // Handle both direct message and quoted message formats
            let messageContent, messageKey;

            if (messageOrQuoted.message) {
                // Direct message format
                messageContent = messageOrQuoted.message;
                messageKey = messageOrQuoted.key;
            } else {
                // Quoted message format
                messageContent = messageOrQuoted.message || messageOrQuoted;
                messageKey = messageOrQuoted.key || {};
            }

            // Create a proper message structure for baileys
            const mockMessage = {
                key: messageKey,
                message: messageContent
            };

            // Check for different media types
            if (messageContent.imageMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    image: buffer,
                    caption: messageContent.imageMessage.caption || ''
                };
            }

            if (messageContent.videoMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    video: buffer,
                    caption: messageContent.videoMessage.caption || ''
                };
            }

            if (messageContent.audioMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    audio: buffer,
                    mimetype: messageContent.audioMessage.mimetype
                };
            }

            if (messageContent.documentMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    document: buffer,
                    mimetype: messageContent.documentMessage.mimetype,
                    fileName: messageContent.documentMessage.fileName
                };
            }

            if (messageContent.stickerMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    sticker: buffer
                };
            }

            return null;
        } catch (error) {
            console.error(`Error extracting status media: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract text content from status
     */
    extractStatusText(messageOrQuoted) {
        try {
            // Handle both direct message and quoted message formats
            let messageContent;

            if (messageOrQuoted.message) {
                // Direct message format
                messageContent = messageOrQuoted.message;
            } else {
                // Quoted message format  
                messageContent = messageOrQuoted.message || messageOrQuoted;
            }

            if (messageContent.conversation) {
                return messageContent.conversation;
            }

            if (messageContent.extendedTextMessage) {
                return messageContent.extendedTextMessage.text;
            }

            // Check for text in media messages
            if (messageContent.imageMessage?.caption) {
                return messageContent.imageMessage.caption;
            }

            if (messageContent.videoMessage?.caption) {
                return messageContent.videoMessage.caption;
            }

            return null;
        } catch (error) {
            console.error(`Error extracting status text: ${error.message}`);
            return null;
        }
    }

    /**
     * Clean up event listeners to prevent duplicates on hot reload
     */
    destroy() {
        try {
            if (this.bot.sock?.ev) {
                this.bot.sock.ev.off('messages.upsert', this.boundHandleMessagesUpsert);
                this.bot.sock.ev.off('messages.upsert', this.boundHandleStatusMonitoring);
                console.log('🗑️ Status plugin event listeners cleaned up');
            }
            
            // Clean up status reaction cleanup interval
            if (this.statusReactCleanupInterval) {
                clearInterval(this.statusReactCleanupInterval);
                this.statusReactCleanupInterval = null;
                console.log('🗑️ Status reaction cleanup timer stopped');
            }
        } catch (error) {
            console.error('Error cleaning up status plugin events:', error);
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new StatusPlugin();
        await plugin.init(bot);
        return plugin;
    }
};