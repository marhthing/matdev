/**
 * MATDEV - High-Performance WhatsApp Bot
 * Built with Node.js and Baileys for superior performance and reliability
 * 
 * @author MATDEV Team
 * @version 1.0.0
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('baileys');
const { Boom } = require('@hapi/boom');
const chalk = require('chalk');
const qrcode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');

// Core modules
const config = require('./config');
const Logger = require('./lib/logger');
const ConnectionManager = require('./lib/connection');
const SessionManager = require('./lib/session');
const MessageHandler = require('./lib/message');
const SecurityManager = require('./lib/security');
const CacheManager = require('./lib/cache');
const JSONStorageManager = require('./lib/json-storage');
const Utils = require('./lib/utils');

// Initialize components
const logger = new Logger();
const cache = new CacheManager();
const database = new JSONStorageManager();
const security = new SecurityManager(cache);
const utils = new Utils();

class MATDEV {
    constructor() {
        this.sock = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50;
        this.startTime = Date.now();
        this.initialConnection = true; // Track if this is initial connection
        this.messageStats = {
            sent: 0,
            received: 0,
            commands: 0
        };

        // Store plugin instances
        this.plugins = {};

        // Store owner's group JID (LID format) when detected
        this.ownerGroupJid = null;

        // Initialize managers
        this.connectionManager = new ConnectionManager(this);
        this.sessionManager = new SessionManager();
        this.database = database;
        this.database.bot = this; // Pass bot instance to database
        this.messageHandler = new MessageHandler(this, cache, security, database);

        // Bind methods
        this.connect = this.connect.bind(this);
        this.handleConnection = this.handleConnection.bind(this);
        this.handleMessages = this.handleMessages.bind(this);
    }

    /**
     * Initialize and start the bot
     */
    async start() {
        try {
            logger.info('🚀 Starting MATDEV WhatsApp Bot...');

            // Display banner
            this.displayBanner();

            // Check and install dependencies
            await this.checkDependencies();

            // Ensure required directories exist
            await this.ensureDirectories();

            // Initialize JSON storage
            await this.database.initialize();

            // Load plugins
            await this.loadPlugins();

            // Start connection
            await this.connect();

        } catch (error) {
            logger.error('Failed to start MATDEV:', error);
            process.exit(1);
        }
    }

    /**
     * Check and install required dependencies
     */
    async checkDependencies() {
        try {
            logger.info('📦 Checking dependencies...');

            const requiredPackages = [
                'baileys',
                '@hapi/boom', 
                'chalk',
                'qrcode-terminal',
                'fs-extra',
                'winston',
                'node-cache',
                'moment-timezone',
                'dotenv'
            ];

            const { execSync } = require('child_process');
            const packageJson = require('./package.json');
            const installedDeps = {
                ...packageJson.dependencies || {},
                ...packageJson.devDependencies || {}
            };

            const missingPackages = requiredPackages.filter(pkg => !installedDeps[pkg]);

            if (missingPackages.length > 0) {
                logger.info(`📥 Installing missing packages: ${missingPackages.join(', ')}`);
                execSync(`npm install ${missingPackages.join(' ')}`, { stdio: 'inherit' });
                logger.success('✅ Dependencies installed successfully');
            } else {
                logger.success('✅ All dependencies are available');
            }

        } catch (error) {
            logger.warn('⚠️ Dependency check failed, continuing anyway:', error.message);
        }
    }

    /**
     * Display startup banner
     */
    displayBanner() {
        console.clear();
        console.log(chalk.cyan(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                              MATDEV WhatsApp Bot                             ║
║                          High-Performance | Secure | Reliable                ║
╠══════════════════════════════════════════════════════════════════════════════╣
║ Version: 1.0.0                                                               ║
║ Node.js: ${process.version}                                                              ║
║ Platform: ${process.platform} ${process.arch}                                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝
        `));

        logger.info('Bot Configuration:');
        logger.info(`- Bot Name: ${config.BOT_NAME}`);
        logger.info(`- Session ID: ${config.SESSION_ID ? 'Configured' : 'Not Set'}`);
        logger.info(`- Owner: ${config.OWNER_NUMBER}`);
        logger.info(`- Public Mode: ${config.PUBLIC_MODE ? 'Enabled' : 'Disabled'}`);
        logger.info(`- Auto Status View: ${config.AUTO_STATUS_VIEW ? 'Enabled' : 'Disabled'}`);
        logger.info(`- Anti-Ban Protection: Enabled`);
        console.log('');
    }

    /**
     * Ensure required directories exist
     */
    async ensureDirectories() {
        const dirs = ['session', 'tmp', 'plugins'];

        for (const dir of dirs) {
            await fs.ensureDir(path.join(__dirname, dir));
        }
    }

    /**
     * Load bot plugins
     */
    async loadPlugins() {
        logger.info('📦 Loading plugins...');

        try {
            const pluginsDir = path.join(__dirname, 'plugins');
            const pluginFiles = await fs.readdir(pluginsDir);

            let loadedCount = 0;

            for (const file of pluginFiles) {
                if (file.endsWith('.js')) {
                    try {
                        const plugin = require(path.join(pluginsDir, file));
                        if (plugin && typeof plugin.init === 'function') {
                            const pluginInstance = await plugin.init(this);
                            
                            // Store plugin reference for direct access
                            const pluginName = file.replace('.js', '');
                            if (pluginInstance && pluginInstance.name) {
                                this.plugins[pluginInstance.name] = pluginInstance;
                                logger.info(`📌 Stored plugin reference: ${pluginInstance.name}`);
                            } else if (pluginName === 'antidelete') {
                                // Special handling for antidelete plugin
                                this.plugins.antidelete = pluginInstance || plugin;
                                logger.info(`📌 Stored antidelete plugin reference`);
                            }
                            
                            loadedCount++;
                            logger.success(`Loaded plugin: ${file}`);
                        }
                    } catch (error) {
                        logger.error(`Failed to load plugin ${file}:`, error.message);
                    }
                }
            }

            logger.success(`✅ Loaded ${loadedCount} plugins successfully`);
        } catch (error) {
            logger.error('Failed to load plugins:', error);
        }
    }

    /**
     * Establish WhatsApp connection
     */
    async connect() {
        try {
            logger.info('🔌 Establishing WhatsApp connection...');

            // Check if we should validate/clear old session files on startup issues
            if (this.reconnectAttempts > 0 && this.initialConnection) {
                logger.info('🔍 Validating session files after startup issues...');
                const sessionPath = path.join(__dirname, 'session');
                const sessionExists = await fs.pathExists(sessionPath);

                if (sessionExists) {
                    const files = await fs.readdir(sessionPath);
                    if (files.length === 0) {
                        logger.info('📁 Empty session directory detected');
                    } else {
                        logger.info(`📁 Found ${files.length} session files`);
                    }
                }
            }

            // Initialize auth state
            const { state, saveCreds } = await useMultiFileAuthState(
                path.join(__dirname, 'session')
            );

            // Create socket connection
            // Create minimal logger for Baileys
            const baileyLogger = {
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                fatal: () => {},
                child: () => baileyLogger // Return self for child logger calls
            };

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false, // We handle QR display ourselves
                logger: baileyLogger, // Minimal logger to prevent conflicts
                browser: ['MATDEV', 'Desktop', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                markOnlineOnConnect: false, // Stay discreet
                generateHighQualityLinkPreview: true,
                syncFullHistory: false, // Optimize memory usage
                getMessage: async (key) => {
                    // Return cached message if available
                    return cache.getMessage(key.id) || {};
                }
            });

            // Set up event handlers
            this.setupEventHandlers(saveCreds);

        } catch (error) {
            logger.error('Connection failed:', error);
            await this.handleReconnection();
        }
    }

    /**
     * Setup all event handlers
     */
    setupEventHandlers(saveCreds) {
        // Connection state handler
        this.sock.ev.on('connection.update', this.handleConnection);

        // Credentials update handler
        this.sock.ev.on('creds.update', saveCreds);

        // Message handler
        this.sock.ev.on('messages.upsert', this.handleMessages);

        // Call handler
        this.sock.ev.on('call', this.handleCall.bind(this));

        // Group updates handler
        this.sock.ev.on('groups.update', this.handleGroupUpdates.bind(this));

        // Status updates handler
        if (config.AUTO_STATUS_VIEW) {
            this.sock.ev.on('messages.upsert', this.handleStatusView.bind(this));
        }
    }

    /**
     * Handle connection updates
     */
    async handleConnection(update) {
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (qr) {
            logger.info('📱 Scan QR Code to connect:');
            qrcode.generate(qr, { small: true });
            console.log(chalk.yellow('\n🔗 Or use pairing code method if available\n'));
        }

        if (connection === 'close') {
            this.isConnected = false;
            const statusCode = lastDisconnect?.error?.output?.statusCode;

            // Handle different disconnect reasons properly
            let shouldReconnect = true;
            let clearSession = false;
            let reconnectDelay = Math.min(3000 + (this.reconnectAttempts * 1000), 15000); // Progressive delay

            switch (statusCode) {
                case DisconnectReason.badSession:
                    // Try to recover first, clear session only after multiple failures
                    if (this.reconnectAttempts >= 5) {
                        logger.warn('🔴 Bad session detected - clearing session after multiple failures...');
                        clearSession = true;
                        shouldReconnect = true;
                        this.reconnectAttempts = 0;
                    } else {
                        logger.warn(`🔄 Bad session detected - retrying without clearing (${this.reconnectAttempts + 1}/5)...`);
                        shouldReconnect = true;
                    }
                    break;

                case DisconnectReason.loggedOut:
                    // Try to recover first on startup, clear session only after multiple failures
                    if (this.reconnectAttempts >= 5) {
                        logger.warn('🚪 Device logged out - clearing session after multiple failures...');
                        clearSession = true;
                        shouldReconnect = true;
                        this.reconnectAttempts = 0;
                    } else {
                        logger.warn(`🔄 Device logged out - retrying without clearing (${this.reconnectAttempts + 1}/5)...`);
                        shouldReconnect = true;
                    }
                    break;

                case DisconnectReason.connectionClosed:
                    logger.warn('🔄 Connection closed by server - reconnecting...');
                    shouldReconnect = true;
                    reconnectDelay = 2000;
                    break;

                case DisconnectReason.connectionLost:
                    logger.warn('📡 Connection lost - attempting reconnection...');
                    shouldReconnect = true;
                    reconnectDelay = 5000;
                    break;

                case DisconnectReason.connectionReplaced:
                    logger.warn('🔄 Connection replaced by another device - reconnecting...');
                    shouldReconnect = true;
                    reconnectDelay = 3000;
                    break;

                case DisconnectReason.timedOut:
                    logger.warn('⏰ Connection timed out - retrying...');
                    shouldReconnect = true;
                    reconnectDelay = 4000;
                    break;

                case DisconnectReason.restartRequired:
                    logger.warn('🔄 WhatsApp restart required - preserving session...');
                    shouldReconnect = true;
                    reconnectDelay = 1000;
                    break;

                case 401: // Unauthorized - Try recovery first, then clear session
                    if (this.reconnectAttempts >= 8) {
                        logger.warn('🔴 Authentication failed - clearing session after multiple attempts...');
                        clearSession = true;
                        shouldReconnect = true;
                        this.reconnectAttempts = 0;
                    } else {
                        logger.warn(`🔄 Authentication issue (401) - retrying (${this.reconnectAttempts + 1}/8)...`);
                        shouldReconnect = true;
                        reconnectDelay = Math.min(1000 + (this.reconnectAttempts * 500), 8000);
                    }
                    break;

                default:
                    logger.warn(`🔄 Unknown disconnect reason (${statusCode}) - attempting reconnection...`);
                    shouldReconnect = true;
                    reconnectDelay = 5000;
            }

            logger.warn(`Connection closed. Status: ${statusCode}, Reason: ${lastDisconnect?.error?.message || 'Unknown'}`);

            // Clear session if necessary
            if (clearSession) {
                await this.clearSession();
                // After clearing session, wait a bit then try to reconnect
                if (shouldReconnect) {
                    logger.info('🔄 Session cleared, reconnecting in 3s for fresh authentication...');
                    setTimeout(() => {
                        this.connect();
                    }, 3000);
                }
            } else if (shouldReconnect) {
                logger.info(`🔄 Reconnecting in ${reconnectDelay/1000}s... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
                setTimeout(() => {
                    this.handleReconnection();
                }, reconnectDelay);
            } else {
                logger.error('❌ Connection terminated. Please scan QR code to reconnect.');
                setTimeout(() => {
                    this.connect();
                }, 5000);
            }
        } else if (connection === 'open') {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.initialConnection = false; // Mark as no longer initial connection
            logger.info('🟢 Session established successfully - preserving authentication');

            logger.success('✅ Successfully connected to WhatsApp!');
            const botNumber = this.sock.user?.id?.split(':')[0] || 'Unknown';
            logger.info(`📱 Bot Number: ${botNumber}`);
            logger.info(`👤 Bot Name: ${this.sock.user?.name || config.BOT_NAME}`);

            // Auto-set owner number if not configured
            if (!config.OWNER_NUMBER && botNumber !== 'Unknown') {
                config.OWNER_NUMBER = botNumber;
                process.env.OWNER_NUMBER = botNumber;
                logger.success(`🤖 Auto-configured owner number: ${botNumber}`);

                // Update .env file if it exists
                await this.updateEnvFile('OWNER_NUMBER', botNumber);
            }

            // Initialize security features
            await security.initialize(this.sock);

            // Send startup notification if configured
            if (config.OWNER_NUMBER && config.STARTUP_MESSAGE) {
                await this.sendStartupNotification();
            }

            // Start periodic tasks
            this.startPeriodicTasks();

            console.log(chalk.green('\n🎉 MATDEV is now ready to serve!\n'));
        } else if (connection === 'connecting') {
            logger.info('⏳ Connecting to WhatsApp...');
        }
    }

    /**
     * Handle incoming messages
     */
    async handleMessages({ messages, type }) {
        if (type !== 'notify') return;

        logger.info(`📬 Received ${messages.length} messages of type: ${type}`);

        for (const message of messages) {
            if (!message || !message.message) continue;

            try {
                // FIRST: ALWAYS archive ALL messages (incoming and outgoing) for anti-delete
                logger.info(`📂 Archiving message for anti-delete...`);
                await this.database.archiveMessage(message);

                // Log all message details for debugging
                logger.info(`🔍 Message key:`, JSON.stringify(message.key, null, 2));
                logger.info(`📝 Message content:`, JSON.stringify(message.message, null, 2));

                // Update statistics for all messages
                this.messageStats.received++;

                // Cache all messages
                cache.cacheMessage(message);

                // Check for deletion events and trigger anti-delete via plugin
                const messageType = Object.keys(message.message || {})[0];
                if (messageType === 'protocolMessage' && message.message.protocolMessage?.type === 'REVOKE') {
                    const revokedKey = message.message.protocolMessage.key;
                    const actualChatJid = message.key.remoteJid; // Use the actual chat JID from the message envelope
                    logger.warn(`🗑️ DELETION DETECTED - ID: ${revokedKey?.id}, Chat: ${actualChatJid}`);

                    // Always process deletions - we'll determine ownership in the anti-delete handler
                    // The fromMe flag and remoteJid in protocol messages can be unreliable
                    try {
                        // Trigger anti-delete handling directly through the plugin if available
                        if (this.plugins.antidelete && this.plugins.antidelete.handleMessageDeletion) {
                            logger.info(`🔍 Triggering anti-delete plugin for message: ${revokedKey.id}`);
                            await this.plugins.antidelete.handleMessageDeletion(revokedKey.id, actualChatJid);
                            logger.info(`✅ Anti-delete plugin handling completed for: ${revokedKey.id}`);
                        } else {
                            // Fallback to built-in handler
                            logger.info(`🔍 Using fallback anti-delete for message: ${revokedKey.id}`);
                            await this.handleAntiDelete(revokedKey.id, actualChatJid);
                            logger.info(`✅ Fallback anti-delete handling completed for: ${revokedKey.id}`);
                        }
                    } catch (error) {
                        logger.error(`❌ Anti-delete handling failed for ${revokedKey.id}:`, error);
                    }
                }

                // Skip system messages, receipts, reactions, etc. for COMMAND processing only
                const ignoredTypes = ['protocolMessage', 'reactionMessage', 'pollUpdateMessage', 'receiptMessage'];
                if (ignoredTypes.includes(messageType)) {
                    logger.debug(`Archived system message type: ${messageType}, skipping command processing`);
                    continue;
                }

                // For COMMAND processing, determine participant
                const botJid = `${this.sock.user?.id?.split(':')[0]}@s.whatsapp.net`;
                const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;

                let participant;
                const sender = message.key.remoteJid;

                if (message.key.fromMe) {
                    logger.info(`📤 Processing outgoing message from bot/owner`);
                    participant = botJid;
                    logger.info(`📤 Bot command to: ${sender} (from: ${participant})`);
                } else {
                    logger.info(`📥 Processing incoming message`);
                    const isGroup = sender.endsWith('@g.us');

                    if (isGroup && message.key.participant) {
                        // Preserve original participant format (including @lid)
                        participant = message.key.participant;
                    } else {
                        participant = isGroup ? message.key.participant : sender;
                    }

                    logger.info(`📥 Incoming message from: ${sender} (participant: ${participant})`);
                }

                // Extract text for command processing
                const content = message.message[messageType];
                let text = '';

                if (typeof content === 'string') {
                    text = content;
                } else if (content?.text) {
                    text = content.text;
                } else if (content?.caption) {
                    text = content.caption;
                } else {
                    text = ''; // For media messages without text/caption
                }

                // Only continue with command processing if there's text
                if (!text || !text.trim()) {
                    logger.debug(`Archived message without text content, type: ${messageType}`);
                    continue;
                }

                // Check if it's a command (starts with prefix) - skip non-commands early
                const hasPrefix = text.trim().startsWith(config.PREFIX);
                if (!hasPrefix) {
                    logger.debug(`Archived non-command message: "${text.substring(0, 50)}..."`);
                    continue;
                }

                // Permission verification for command processing (support both regular and LID JIDs)
                const isFromOwner = participant === ownerJid || 
                                  participant.startsWith(`${config.OWNER_NUMBER}:`) ||
                                  (this.ownerGroupJid && participant === this.ownerGroupJid) ||
                                  participant.includes(`${config.OWNER_NUMBER}@lid`);

                // Check if user has any permissions (for non-owners)
                let hasAnyPermissions = false;
                if (!isFromOwner) {
                    const userPermissions = this.database.getUserPermissions(participant);
                    hasAnyPermissions = userPermissions.length > 0;
                }

                // Allow command processing if user is owner OR has any permissions
                if (!isFromOwner && !hasAnyPermissions) {
                    logger.debug(`Archived command from unauthorized user: ${participant}`);
                    continue;
                }

                const userType = isFromOwner ? 'owner' : 'permitted user';
                logger.info(`📨 Processing command from ${userType}: ${participant}`);
                logger.info(`📝 Command text: "${text}"`);

                // Security checks for commands
                if (await security.isBlocked(message.key.remoteJid)) {
                    logger.debug(`Command blocked by security: ${message.key.remoteJid}`);
                    continue;
                }

                // Rate limiting for commands
                if (await security.isRateLimited(message.key.remoteJid)) {
                    logger.debug(`Command rate limited: ${message.key.remoteJid}`);
                    continue;
                }

                // Process the command message
                await this.messageHandler.process(message);

            } catch (error) {
                logger.error('Error processing message:', error);
                // Don't let one message error crash the bot
                continue;
            }
        }
    }

    /**
     * Handle incoming calls
     */
    async handleCall(calls) {
        for (const call of calls) {
            if (config.REJECT_CALLS && call.status === 'offer') {
                try {
                    await this.sock.rejectCall(call.id, call.from);
                    logger.info(`📞 Rejected call from: ${call.from}`);
                } catch (error) {
                    logger.error('Failed to reject call:', error);
                }
            }
        }
    }

    /**
     * Handle group updates
     */
    async handleGroupUpdates(updates) {
        for (const update of updates) {
            try {
                // Cache group info
                if (update.participants) {
                    cache.cacheGroupInfo(update.id, update);
                }
            } catch (error) {
                logger.error('Error handling group update:', error);
            }
        }
    }

    /**
     * Handle status view automation
     */
    async handleStatusView({ messages }) {
        if (!config.AUTO_STATUS_VIEW) return;

        for (const message of messages) {
            if (message.key.remoteJid === 'status@broadcast') {
                try {
                    await this.sock.readMessages([message.key]);
                    logger.debug(`👀 Viewed status from: ${message.key.participant}`);
                } catch (error) {
                    logger.error('Failed to view status:', error);
                }
            }
        }
    }

    /**
     * Clear session files when absolutely necessary
     */
    async clearSession() {
        try {
            const sessionPath = path.join(__dirname, 'session');
            if (await fs.pathExists(sessionPath)) {
                const files = await fs.readdir(sessionPath);
                await fs.emptyDir(sessionPath);
                logger.info(`🗑️ Cleared ${files.length} session files for fresh authentication`);
            } else {
                logger.info('🗑️ No session files to clear');
            }

            // Clear any cached authentication state
            if (this.sock) {
                this.sock = null;
            }

        } catch (error) {
            logger.error('Failed to clear session:', error);
            try {
                const sessionPath = path.join(__dirname, 'session');
                await fs.remove(sessionPath);
                await fs.ensureDir(sessionPath);
                logger.info('🗑️ Force cleared session directory');
            } catch (forceError) {
                logger.error('Failed to force clear session:', forceError);
            }
        }
    }

    /**
     * Handle reconnection with intelligent session preservation
     */
    async handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.warn('❌ Maximum reconnection attempts reached. Resetting attempt counter and continuing...');
            this.reconnectAttempts = 0;
            logger.info('🔄 Waiting 2 minutes before next reconnection cycle...');
            setTimeout(() => {
                this.connect();
            }, 120000); // 2 minutes instead of 5
            return;
        }

        this.reconnectAttempts++;

        // More aggressive reconnection for startup issues
        let delay;
        if (this.initialConnection) {
            // Faster reconnects on startup
            delay = Math.min(1000 + (this.reconnectAttempts * 500), 10000); 
        } else {
            // Normal reconnects during runtime
            delay = Math.min(2000 + (this.reconnectAttempts * 1000), 30000);
        }

        logger.warn(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s...`);

        // Clear any existing socket before reconnecting
        if (this.sock) {
            try {
                this.sock.end();
                this.sock = null;
            } catch (error) {
                // Ignore cleanup errors
            }
        }

        setTimeout(() => {
            this.connect();
        }, delay);
    }

    /**
     * Send startup notification to owner
     */
    async sendStartupNotification() {
        try {
            const uptime = utils.formatUptime(Date.now() - this.startTime);
            const botNumber = this.sock.user?.id?.split(':')[0] || 'Unknown';
            const autoConfigured = config.OWNER_NUMBER === botNumber ? '\n🤖 Owner auto-configured from bot number' : '';

            const notification = `🚀 *MATDEV Bot Started*\n\n` +
                `⏰ Started at: ${new Date().toLocaleString()}\n` +
                `📱 Bot Number: ${botNumber}\n` +
                `👤 Owner: ${config.OWNER_NUMBER}${autoConfigured}\n` +
                `⚡ Performance Mode: Active\n` +
                `🛡️ Security Features: Enabled\n` +
                `📊 Status: All systems operational\n\n` +
                `Type ${config.PREFIX}help for commands`;

            await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                text: notification
            });
        } catch (error) {
            logger.error('Failed to send startup notification:', error);
        }
    }

    /**
     * Start periodic maintenance tasks
     */
    startPeriodicTasks() {
        // Cache cleanup every 30 minutes
        setInterval(() => {
            cache.cleanup();
            logger.debug('🧹 Cache cleanup completed');
        }, 30 * 60 * 1000);

        // Security cleanup every hour
        setInterval(() => {
            security.cleanup();
            logger.debug('🛡️ Security cleanup completed');
        }, 60 * 60 * 1000);

        // Storage cleanup every 2 hours
        setInterval(async () => {
            try {
                await this.database.cleanupOldMessages();
                logger.debug('🗑️ Storage cleanup completed');
            } catch (error) {
                logger.error('Error during storage cleanup:', error);
            }
        }, 2 * 60 * 60 * 1000);

        // Status report every 6 hours
        if (config.OWNER_NUMBER) {
            setInterval(() => {
                this.sendStatusReport();
            }, 6 * 60 * 60 * 1000);
        }
    }

    /**
     * Send periodic status report to owner
     */
    async sendStatusReport() {
        try {
            const uptime = utils.formatUptime(Date.now() - this.startTime);
            const memUsage = process.memoryUsage();

            const report = `📊 *MATDEV Status Report*\n\n` +
                `⏱️ Uptime: ${uptime}\n` +
                `📨 Messages Received: ${this.messageStats.received}\n` +
                `📤 Messages Sent: ${this.messageStats.sent}\n` +
                `⚡ Commands Executed: ${this.messageStats.commands}\n` +
                `🧠 Memory Usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB\n` +
                `🔒 Security Events: ${security.getSecurityStats().blocked}\n` +
                `🏃‍♂️ Status: Running optimally`;

            await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                text: report
            });
        } catch (error) {
            logger.error('Failed to send status report:', error);
        }
    }

    /**
     * Update environment file with new values
     */
    async updateEnvFile(key, value) {
        try {
            const envPath = path.join(__dirname, '.env');
            let envContent = '';

            // Read existing .env file if it exists
            if (await fs.pathExists(envPath)) {
                envContent = await fs.readFile(envPath, 'utf8');
            }

            // Check if key already exists
            const lines = envContent.split('\n');
            let keyExists = false;

            for (let i = 0; i < lines.length; i++) {
                if (lines[i].startsWith(`${key}=`)) {
                    lines[i] = `${key}=${value}`;
                    keyExists = true;
                    break;
                }
            }

            // Add new key if it doesn't exist
            if (!keyExists) {
                lines.push(`${key}=${value}`);
            }

            // Write back to file
            await fs.writeFile(envPath, lines.join('\n'));
            logger.info(`📝 Updated .env file: ${key}=${value}`);

        } catch (error) {
            logger.warn(`⚠️ Failed to update .env file: ${error.message}`);
        }
    }

    /**
     * Handle anti-delete functionality
     */
    async handleAntiDelete(messageId, chatJid) {
        try {
            logger.info(`🗑️ Starting anti-delete processing for message: ${messageId} in chat: ${chatJid}`);

            // Add delay to ensure message is properly stored before checking
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get the original message from our database
            logger.info(`🔍 Searching for archived message: ${messageId}`);
            const originalMessage = await this.database.getArchivedMessage(messageId);

            if (originalMessage && config.OWNER_NUMBER) {
                logger.info('📋 Original message found:', {
                    id: originalMessage.id,
                    sender: originalMessage.sender_jid,
                    participant: originalMessage.participant_jid,
                    content: originalMessage.content?.substring(0, 50),
                    timestamp: originalMessage.timestamp
                });

                // Alert for ALL incoming messages (fromMe should be stored correctly)
                const botJid = `${this.sock.user.id.split(':')[0]}@s.whatsapp.net`;
                const isIncoming = originalMessage.sender_jid !== botJid;

                logger.info(`🔍 Message analysis - Bot JID: ${botJid}, Sender: ${originalMessage.sender_jid}, Is incoming: ${isIncoming}`);

                if (isIncoming) {
                    logger.info(`📤 Sending anti-delete alert for incoming message: ${messageId}`);
                    await this.sendDeletedMessageAlert(originalMessage, chatJid);
                    await this.database.markMessageDeleted(messageId, chatJid);
                    logger.success(`✅ Anti-delete alert sent successfully for message: ${messageId}`);
                } else {
                    logger.info(`ℹ️ Skipping own message deletion: ${messageId} (fromMe: true)`);
                }
            } else {
                logger.warn(`❌ Original message not found in database: ${messageId}`);
                // Send a generic notification about deletion detection
                if (config.OWNER_NUMBER) {
                    logger.info(`📤 Sending unknown deletion notification for: ${messageId}`);
                    const unknownDeleteNotification = `🗑️ *MESSAGE DELETION DETECTED*\n\n` +
                        `⚠️ *Warning:* A message was deleted but could not be recovered\n` +
                        `📱 *Chat:* ${chatJid.split('@')[0]}\n` +
                        `🆔 *Message ID:* ${messageId}\n` +
                        `🕐 *Detected At:* ${new Date().toLocaleString()}\n\n` +
                        `_This might be due to the message being sent before the bot started monitoring._`;

                    await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                        text: unknownDeleteNotification
                    });
                    logger.success('✅ Unknown deletion alert sent successfully');
                }
            }
        } catch (error) {
            logger.error('❌ Error in handleAntiDelete:', error);
            throw error; // Re-throw to see the error in the calling function
        }
    }

    /**
     * Handle message updates, specifically for detecting deleted messages
     */
    async handleMessageUpdates(messages) {
        for (const message of messages) {
            // Check if the message has been deleted
            if (message.update.messageStubType === 6) { // 6 indicates message deletion
                const messageId = message.key.id;
                const chatJid = message.key.remoteJid;

                logger.warn(`🗑️ DELETION DETECTED VIA UPDATE - ID: ${messageId}, Chat: ${chatJid}`);

                // Trigger anti-delete handling
                await this.handleAntiDelete(messageId, chatJid);
            }
        }
    }

    /**
     * Send alert about deleted message to the owner
     */
    async sendDeletedMessageAlert(archivedMessage, chatJid) {
        try {
            // Format the anti-delete notification
            const chatName = chatJid.endsWith('@g.us') ?
                `Group: ${chatJid.split('@')[0]}` :
                `Private: ${archivedMessage.sender_jid.split('@')[0]}`;

            const senderName = archivedMessage.participant_jid ?
                archivedMessage.participant_jid.split('@')[0] :
                archivedMessage.sender_jid.split('@')[0];

            const deleteNotification = `🗑️ *DELETED MESSAGE DETECTED*\n\n` +
                `👤 *Sender:* ${senderName}\n` +
                `💬 *Chat:* ${chatName}\n` +
                `📅 *Original Time:* ${new Date(archivedMessage.timestamp * 1000).toLocaleString()}\n` +
                `🕐 *Deleted At:* ${new Date().toLocaleString()}\n\n` +
                `📝 *Content:*\n${archivedMessage.content || 'No text content'}\n\n` +
                `_Anti-delete detection by MATDEV_`;

            // Send to owner
            await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                text: deleteNotification
            });

            // If message had media, try to recover and send it
            if (archivedMessage.media_url) {
                const mediaData = await this.database.getArchivedMedia(archivedMessage.id);

                if (mediaData) {
                    const mediaMessage = {
                        caption: `📎 *Recovered Media*\n\nThis ${archivedMessage.message_type.replace('Message', '')} was deleted from the above message.`
                    };

                    // Add the appropriate media type
                    if (archivedMessage.message_type === 'imageMessage') {
                        mediaMessage.image = mediaData;
                    } else if (archivedMessage.message_type === 'videoMessage') {
                        mediaMessage.video = mediaData;
                    } else if (archivedMessage.message_type === 'audioMessage') {
                        mediaMessage.audio = mediaData;
                    } else if (archivedMessage.message_type === 'documentMessage') {
                        mediaMessage.document = mediaData;
                    }

                    await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, mediaMessage);
                }
            }
        } catch (error) {
            console.error('Error sending delete alert:', error);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        logger.info('🛑 Shutting down MATDEV...');

        try {
            // Close database connection
            if (this.database) {
                await this.database.close();
            }

            // Don't logout, just close the connection to preserve session
            if (this.sock && this.isConnected) {
                logger.info('🔄 Preserving session during shutdown...');
                this.sock.end();
                this.sock = null;
                this.isConnected = false;

                // Give time for cleanup
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            logger.error('Error during shutdown:', error);
        }

        logger.success('✅ MATDEV shutdown complete - session preserved');
        process.exit(0);
    }
}

// Initialize and start the bot
const bot = new MATDEV();

// Handle graceful shutdown
process.on('SIGINT', () => bot.shutdown());
process.on('SIGTERM', () => bot.shutdown());

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    bot.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    bot.shutdown();
});

// Start the bot
bot.start().catch(console.error);

module.exports = MATDEV;