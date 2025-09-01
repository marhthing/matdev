/**
 * MATDEV - High-Performance WhatsApp Bot
 * Built with Node.js and Baileys for superior performance and reliability
 * 
 * @author MATDEV Team
 * @version 1.0.0
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
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
const Utils = require('./lib/utils');

// Initialize components
const logger = new Logger();
const cache = new CacheManager();
const security = new SecurityManager(cache);
const utils = new Utils();

class MATDEV {
    constructor() {
        this.sock = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.startTime = Date.now();
        this.initialConnection = true; // Track if this is initial connection
        this.messageStats = {
            sent: 0,
            received: 0,
            commands: 0
        };
        
        // Initialize managers
        this.connectionManager = new ConnectionManager(this);
        this.sessionManager = new SessionManager();
        this.messageHandler = new MessageHandler(this, cache, security);
        
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
                '@whiskeysockets/baileys',
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
                            await plugin.init(this);
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
            let reconnectDelay = 3000; // Default 3 seconds
            
            switch (statusCode) {
                case DisconnectReason.badSession:
                    logger.warn('🔴 Bad session detected - clearing corrupted session...');
                    clearSession = true;
                    shouldReconnect = true;
                    break;
                    
                case DisconnectReason.loggedOut:
                    logger.warn('🚪 Device logged out remotely - manual authentication required');
                    clearSession = true;
                    shouldReconnect = false; // Don't auto-reconnect, needs QR scan
                    break;
                    
                case DisconnectReason.connectionClosed:
                    logger.warn('🔄 Connection closed by server - reconnecting with existing session...');
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
                    reconnectDelay = 1000; // Quick restart
                    break;
                    
                case 401: // Unauthorized
                    if (this.initialConnection && this.reconnectAttempts < 3) {
                        logger.warn('🔄 Initial connection failed (401) - retrying with existing session...');
                        shouldReconnect = true;
                        reconnectDelay = 10000; // Longer delay for initial attempts
                    } else if (this.reconnectAttempts >= 8) {
                        logger.warn('🔴 Persistent authentication failed after multiple attempts - clearing session...');
                        clearSession = true;
                        this.reconnectAttempts = 0;
                    } else {
                        logger.warn(`🔄 Authentication issue (401) - retrying without clearing session... (attempt ${this.reconnectAttempts + 1})`);
                        shouldReconnect = true;
                        reconnectDelay = 8000; // Longer delay for auth issues
                    }
                    break;
                    
                default:
                    logger.warn(`🔄 Unknown disconnect reason (${statusCode}) - attempting reconnection...`);
                    shouldReconnect = true;
                    reconnectDelay = 5000;
            }
            
            logger.warn(`Connection closed. Status: ${statusCode}, Reason: ${lastDisconnect?.error?.message || 'Unknown'}`);
            
            // Clear session only if necessary
            if (clearSession) {
                await this.clearBadSession();
            }
            
            // Handle reconnection
            if (shouldReconnect) {
                logger.info(`🔄 Reconnecting in ${reconnectDelay/1000}s... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
                setTimeout(() => {
                    this.handleReconnection();
                }, reconnectDelay);
            } else {
                logger.error('❌ Connection terminated. Please scan QR code to reconnect.');
                // For logged out case, show QR code again
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

        for (const message of messages) {
            if (!message) continue;
            
            try {
                // Update statistics
                this.messageStats.received++;
                
                // Cache message
                cache.cacheMessage(message);
                
                // Security checks
                if (await security.isBlocked(message.key.remoteJid)) {
                    continue;
                }
                
                // Rate limiting
                if (await security.isRateLimited(message.key.remoteJid)) {
                    continue;
                }
                
                // Process message
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
     * Clear bad session files
     */
    async clearBadSession() {
        try {
            const sessionPath = path.join(__dirname, 'session');
            if (await fs.pathExists(sessionPath)) {
                // Get list of files before clearing for logging
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
            // If we can't clear session files, try to remove the entire directory and recreate it
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
     * Handle reconnection with exponential backoff
     */
    async handleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('❌ Maximum reconnection attempts reached. Clearing session and retrying...');
            await this.clearBadSession();
            this.reconnectAttempts = 0;
            // Wait 30 seconds before starting fresh
            setTimeout(() => {
                this.connect();
            }, 30000);
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 60000); // Less aggressive backoff
        
        logger.warn(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay/1000}s...`);
        
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
     * Graceful shutdown
     */
    async shutdown() {
        logger.info('🛑 Shutting down MATDEV...');
        
        try {
            if (this.sock && this.isConnected) {
                await this.sock.logout();
            }
        } catch (error) {
            logger.error('Error during shutdown:', error);
        }
        
        logger.success('✅ MATDEV shutdown complete');
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
