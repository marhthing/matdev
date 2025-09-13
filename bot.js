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
        this.lastReportTime = null; // Track last status report time
        this.messageStats = {
            received: 0,
            sent: 0,
            commands: 0
        };

        // Initialize cached JID utils to reduce processing overhead
        const JIDUtils = require('./lib/jid-utils');
        this.jidUtils = new JIDUtils(logger);

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

            // Start WhatsApp connection FIRST and wait for it to be fully established
            await this.connectAndWaitForReady();

            // Initialize JSON storage after connection is established
            await this.database.initialize();

            // Load plugins only after WhatsApp is fully connected
            await this.loadPlugins();

            // Store plugin references for direct access
            this.setupPluginReferences();

            // Check for restart completion message
            await this.checkRestartCompletion();

            // Check for update completion and send notification
            await this.checkUpdateCompletion();

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
        const dirs = [
            'session', 
            'session/auth',  // For WhatsApp authentication files
            'session/media', // For media files
            'session/storage', // For storage files  
            'session/viewonce', // For viewonce files
            'tmp', 
            'plugins'
        ];

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
                                // Plugin reference stored
                            } else if (pluginName === 'antidelete') {
                                // Special handling for antidelete plugin
                                this.plugins.antidelete = pluginInstance || plugin;
                                // Plugin reference stored
                            }

                            loadedCount++;
                            // Plugin loaded
                        } else {
                            logger.warn(`⚠️ Plugin ${file} has no init function - skipping`);
                        }
                    } catch (error) {
                        logger.error(`❌ Failed to load plugin ${file}: ${error.message} - continuing with other plugins`);
                        // Continue loading other plugins instead of stopping
                    }
                }
            }

            logger.success(`🔌 Bot ready - ${loadedCount} plugins loaded`);

            // Mark plugins as loaded and show ready message
            this.pluginsLoaded = true;
            console.log(chalk.green('\n🎉 MATDEV is now ready to serve!\n'));

            // Initialize hot reload for plugins
            this.initializePluginHotReload();

            // Send startup confirmation message to bot private chat
            await this.sendStartupConfirmation();

            // Send startup notification if it was deferred
            if (this.shouldSendStartupNotification) {
                await this.sendStartupNotification();
                this.shouldSendStartupNotification = false;
            }
        } catch (error) {
            logger.error('Failed to load plugins:', error);
        }
    }

    /**
     * Initialize hot reload system for plugins
     */
    initializePluginHotReload() {
        const pluginsDir = path.join(__dirname, 'plugins');

        try {
            // Watch for changes in plugins directory
            this.pluginWatcher = require('fs').watch(pluginsDir, { recursive: false }, (eventType, filename) => {
                if (filename && filename.endsWith('.js')) {
                    logger.info(`🔥 Hot reload detected: ${filename} (${eventType})`);

                    // Debounce rapid file changes
                    clearTimeout(this.reloadTimeout);
                    this.reloadTimeout = setTimeout(() => {
                        this.reloadPlugin(filename);
                    }, 500);
                }
            });

            logger.success('🔥 Plugin hot reload system initialized');
        } catch (error) {
            logger.error('Failed to initialize plugin hot reload:', error.message);
        }
    }

    /**
     * Reload a specific plugin
     */
    async reloadPlugin(filename) {
        const pluginPath = path.join(__dirname, 'plugins', filename);
        const pluginName = filename.replace('.js', '');

        try {
            // Check if file exists (handles deletion)
            if (!await fs.pathExists(pluginPath)) {
                logger.info(`🗑️ Plugin removed: ${filename}`);
                await this.unloadPlugin(pluginName);
                return;
            }

            logger.info(`🔄 Reloading plugin: ${filename}`);

            // Unload existing plugin first
            await this.unloadPlugin(pluginName);

            // Clear require cache for the plugin
            delete require.cache[require.resolve(pluginPath)];

            // Load the plugin again
            const plugin = require(pluginPath);
            if (plugin && typeof plugin.init === 'function') {
                const pluginInstance = await plugin.init(this);

                // Store plugin reference
                if (pluginInstance && pluginInstance.name) {
                    this.plugins[pluginInstance.name] = pluginInstance;
                    logger.success(`🔥 Hot reloaded plugin: ${filename}`);
                } else if (pluginName === 'antidelete') {
                    this.plugins.antidelete = pluginInstance || plugin;
                    logger.success(`🔥 Hot reloaded antidelete plugin: ${filename}`);
                } else {
                    logger.success(`🔥 Hot reloaded plugin: ${filename}`);
                }
            } else {
                logger.warn(`⚠️ Plugin ${filename} has no init function after reload - skipping`);
            }

        } catch (error) {
            logger.error(`Failed to hot reload plugin ${filename}:`, error.message);
        }
    }

    /**
     * Unload a plugin and clean up its commands
     */
    async unloadPlugin(pluginName) {
        try {
            // Clean up plugin event listeners if destroy method exists
            if (this.plugins[pluginName] && typeof this.plugins[pluginName].destroy === 'function') {
                this.plugins[pluginName].destroy();
            }

            // Remove plugin from stored references
            if (this.plugins[pluginName]) {
                delete this.plugins[pluginName];
            }

            // Remove plugin commands from message handler using the new method
            if (this.messageHandler && this.messageHandler.unregisterCommandsByPlugin) {
                const removedCount = this.messageHandler.unregisterCommandsByPlugin(pluginName);
                if (removedCount > 0) {
                    logger.info(`🗑️ Removed ${removedCount} commands from plugin: ${pluginName}`);
                }
            }

            logger.info(`🗑️ Unloaded plugin: ${pluginName}`);
        } catch (error) {
            logger.error(`Error unloading plugin ${pluginName}:`, error.message);
        }
    }

    /**
     * Send startup confirmation message to bot private chat
     */
    async sendStartupConfirmation() {
        try {
            if (this.sock && config.OWNER_NUMBER) {
                const botPrivateChat = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                
                // Use stored first-time status (checked before linked.json was created)
                if (this.isFirstTimeSession) {
                    // Send enhanced welcome message with image and configuration
                    await this.sendEnhancedWelcomeMessage(botPrivateChat);
                } else {
                    // Send normal startup message for existing sessions
                    await this.sock.sendMessage(botPrivateChat, {
                        text: "MATDEV bot started successfully"
                    });
                }
                
                this.messageStats.sent++; // Increment sent counter for startup message
                logger.info('✅ Startup confirmation sent to bot private chat');
            }
        } catch (error) {
            logger.error('Failed to send startup confirmation:', error.message);
        }
    }

    /**
     * Check if this is a first-time connection (no linked.json file exists)
     */
    async isFirstTimeConnection() {
        try {
            const linkedFilePath = path.join(__dirname, 'session', 'storage', 'linked.json');
            const linkedFileExists = await fs.pathExists(linkedFilePath);
            
            // If linked.json doesn't exist, it's first-time
            return !linkedFileExists;
        } catch (error) {
            logger.warn('Error checking linked status:', error.message);
            return false; // Assume existing session on error
        }
    }

    /**
     * Send enhanced welcome message for first-time connections
     */
    async sendEnhancedWelcomeMessage(chatId) {
        try {
            // Load welcome configuration
            const welcomeConfig = require('./lib/welcome-config.js');
            
            // Get bot image path
            const imagePath = path.join(__dirname, 'lib', 'img', 'matdev-bot.jpg');
            
            // Generate configuration display using config template
            const configDisplay = this.generateConfigDisplay(welcomeConfig);
            
            // Send image with detailed caption
            await this.sock.sendMessage(chatId, {
                image: { url: imagePath },
                caption: configDisplay
            });
            
            logger.info('✅ Enhanced welcome message sent for first-time connection');
        } catch (error) {
            logger.error('Failed to send enhanced welcome message:', error.message);
            // Fallback to normal message
            await this.sock.sendMessage(chatId, {
                text: "MATDEV bot started successfully"
            });
        }
    }

    /**
     * Generate configuration display for welcome message
     */
    generateConfigDisplay(welcomeConfig) {
        const { template, displaySettings, icons, treeChars } = welcomeConfig;
        
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

    /**
     * Create or update linked.json file to track connection history
     */
    async createOrUpdateLinkedFile() {
        try {
            const linkedFilePath = path.join(__dirname, 'session', 'storage', 'linked.json');
            const currentTime = new Date().toISOString();
            
            let linkedData = {
                firstLinked: currentTime,
                lastStarted: currentTime,
                restartHistory: [currentTime]
            };
            
            // If file exists, load existing data and update
            if (await fs.pathExists(linkedFilePath)) {
                const existingData = await fs.readJson(linkedFilePath);
                linkedData = {
                    firstLinked: existingData.firstLinked, // Keep original link time
                    lastStarted: currentTime,
                    restartHistory: [...(existingData.restartHistory || []), currentTime]
                };
                
                // Keep only last 10 restart entries to prevent file bloat
                if (linkedData.restartHistory.length > 10) {
                    linkedData.restartHistory = linkedData.restartHistory.slice(-10);
                }
            }
            
            // Ensure storage directory exists
            await fs.ensureDir(path.dirname(linkedFilePath));
            
            // Write updated linked data
            await fs.writeJson(linkedFilePath, linkedData, { spaces: 2 });
            
            if (!await fs.pathExists(linkedFilePath.replace('.json', '.backup.json'))) {
                logger.info('📝 Created linked.json - WhatsApp connection history initialized');
            }
        } catch (error) {
            logger.warn('Failed to create/update linked.json:', error.message);
        }
    }

    /**
     * Establish WhatsApp connection and wait for it to be ready
     */
    async connectAndWaitForReady() {
        return new Promise(async (resolve, reject) => {
            try {
                // Set up connection ready handler
                this.connectionReadyResolver = resolve;
                this.connectionErrorResolver = reject;

                // Start the connection process
                await this.connect();

                // If already connected, resolve immediately
                if (this.isConnected) {
                    resolve();
                }

            } catch (error) {
                reject(error);
            }
        });
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
                path.join(__dirname, 'session', 'auth')
            );

            // Create socket connection
            // Create completely silent logger for Baileys to reduce crypto noise
            const baileyLogger = {
                trace: () => {},
                debug: () => {},
                info: () => {},
                warn: () => {},
                error: () => {},
                fatal: () => {},
                child: () => baileyLogger, // Return self for child logger calls
                level: 'silent'
            };

            // Temporarily suppress console outputs during Baileys operations
            const originalConsoleLog = console.log;
            const originalConsoleWarn = console.warn;
            const originalConsoleError = console.error;
            
            // Override console methods to filter Baileys crypto messages
            console.log = (...args) => {
                const message = args.join(' ');
                if (message.includes('Closing stale open session') || 
                    message.includes('Removing old closed session') ||
                    message.includes('SessionEntry') ||
                    message.includes('pendingPreKey') ||
                    message.includes('registrationId') ||
                    message.includes('baseKey') ||
                    message.includes('chainKey')) {
                    return; // Suppress these messages
                }
                originalConsoleLog(...args);
            };
            
            console.warn = (...args) => {
                const message = args.join(' ');
                if (message.includes('session') || message.includes('prekey')) {
                    return; // Suppress session warnings
                }
                originalConsoleWarn(...args);
            };
            
            console.error = (...args) => {
                const message = args.join(' ');
                if (message.includes('session') || message.includes('prekey')) {
                    return; // Suppress session errors
                }
                originalConsoleError(...args);
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

            // Restore original console methods after socket creation
            setTimeout(() => {
                console.log = originalConsoleLog;
                console.warn = originalConsoleWarn;
                console.error = originalConsoleError;
            }, 5000); // Restore after 5 seconds to allow initial setup

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

        // Message update handler (for anti-delete detection)
        this.sock.ev.on('messages.update', this.handleMessageUpdates.bind(this));

        // Call handler
        this.sock.ev.on('call', this.handleCall.bind(this));

        // Group updates handler
        this.sock.ev.on('groups.update', this.handleGroupUpdates.bind(this));

        // Status updates handler (moved to handleMessages for unified processing)
        // if (config.AUTO_STATUS_VIEW) {
        //     this.sock.ev.on('messages.upsert', this.handleStatusView.bind(this));
        // }
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

            // Auto-set owner number from connected WhatsApp (always update on connect)
            if (botNumber !== 'Unknown') {
                const previousOwner = config.OWNER_NUMBER;
                config.OWNER_NUMBER = botNumber;
                process.env.OWNER_NUMBER = botNumber;
                
                if (!previousOwner || previousOwner !== botNumber) {
                    logger.success(`🤖 Auto-configured owner number: ${botNumber}`);
                    // Update .env file if it exists
                    await this.updateEnvFile('OWNER_NUMBER', botNumber);
                } else {
                    logger.info(`✅ Owner number confirmed: ${botNumber}`);
                }
            }

            // Initialize security features
            await security.initialize(this.sock);

            // Resolve the connection ready promise if it exists
            if (this.connectionReadyResolver) {
                logger.info('🔗 WhatsApp connection ready - proceeding with initialization...');
                this.connectionReadyResolver();
                this.connectionReadyResolver = null;
            }

            // Check if first-time connection BEFORE creating linked.json
            this.isFirstTimeSession = await this.isFirstTimeConnection();
            
            // Create or update linked.json file after successful connection
            await this.createOrUpdateLinkedFile();

            // Send startup notification if configured (will be done after plugins load)
            if (config.OWNER_NUMBER && config.STARTUP_MESSAGE) {
                this.shouldSendStartupNotification = true;
            }

            // Start periodic tasks
            this.startPeriodicTasks();

            // Only show ready message if plugins are already loaded
            if (this.pluginsLoaded) {
                console.log(chalk.green('\n🎉 MATDEV is now ready to serve!\n'));
            }
        } else if (connection === 'connecting') {
            logger.info('⏳ Connecting to WhatsApp...');
        }

        // Set owner JID when connected (avoid duplicate event listeners)
        if (this.sock && this.sock.ev) {
            this.sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            logger.info(`📡 Connection update: ${connection}`);

            if (connection === 'open') {
                logger.info('✅ WhatsApp connection established');
                this.connectionAttempts = 0;

                // Set bot JID globally once when connected to reduce repeated operations
                if (this.sock?.user?.id) {
                    const botNumber = this.sock.user.id.split(':')[0];
                    global.botJid = `${botNumber}@s.whatsapp.net`;
                    logger.info(`🔧 Bot JID set globally: ${global.botJid}`);
                }
            }
            });
        }
    }

    /**
     * Handle incoming messages
     */
    async handleMessages({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                // Skip if message is undefined or null
                if (!message || !message.key) {
                    continue;
                }

                // Handle status updates - now handled by status plugin
                if (message.key.remoteJid === 'status@broadcast') {
                    continue; // Status plugin handles all status-related functionality
                }

                // Auto-read messages if enabled (for non-status messages)
                if (config.AUTO_READ && !message.key.fromMe) {
                    try {
                        await this.sock.readMessages([message.key]);
                        logger.debug('📖 Auto-read message from:', message.key.remoteJid);
                    } catch (error) {
                        logger.error('Error auto-reading message:', error.message);
                    }
                }

                // Auto-typing simulation if enabled (for non-status messages)
                if (config.AUTO_TYPING && !message.key.fromMe) {
                    try {
                        await this.sock.sendPresenceUpdate('composing', message.key.remoteJid);
                        // Stop typing after a realistic delay
                        setTimeout(async () => {
                            try {
                                await this.sock.sendPresenceUpdate('paused', message.key.remoteJid);
                            } catch (error) {
                                logger.error('Error stopping typing indicator:', error.message);
                            }
                        }, 2000 + Math.random() * 3000); // 2-5 seconds
                        logger.debug('⌨️ Auto-typing activated for:', message.key.remoteJid);
                    } catch (error) {
                        logger.error('Error auto-typing:', error.message);
                    }
                }

                // Archive message using JSONStorage
                if (this.database) {
                    await this.database.archiveMessage(message);
                }

                // Check if this is a deletion event (protocol message) 
                // Skip this check here to avoid duplicate processing - let messages.update handle deletions
                if (message.message?.protocolMessage?.type === 0 || message.message?.protocolMessage?.type === 'REVOKE') {
                    // This is a deletion event, skip regular processing but don't handle here
                    // The messages.update handler will catch this
                    logger.debug('📝 Deletion event received in messages.upsert - will be handled by messages.update');
                    continue;
                }

                // Skip processing our own messages unless it's a command or sticker command
                if (message.key.fromMe) {
                    // Check if it's a text command from us
                    const messageType = Object.keys(message.message || {})[0];
                    const content = message.message?.[messageType];
                    const text = typeof content === 'string' ? content : content?.text || '';
                    const caption = content?.caption || '';

                    // Check for text commands OR sticker commands OR media captions
                    const isTextCommand = text.startsWith(config.PREFIX);
                    const isCaptionCommand = caption.startsWith(config.PREFIX);
                    const isStickerMessage = messageType === 'stickerMessage';

                    if (isTextCommand || isCaptionCommand || isStickerMessage) {
                        // Process our own commands (text, caption, or sticker)
                        // console.log(`🤖 Processing own message - Text: "${text}", Caption: "${caption}", Type: ${messageType}`);
                        await this.messageHandler.process(message);
                    }
                    continue;
                }

                // if (config.OWNER_NUMBER) {
                //     // Add owner verification logic
                //     const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                //     if (message.key.remoteJid !== ownerJid && !this.isGroup(message.key.remoteJid)) {
                //         // Skip non-owner messages in private chats
                //         continue;
                //     }
                // }

                // Process all messages (incoming and outgoing) through the MessageHandler
                // logger.info(`🔄 Calling MessageHandler to process command...`);
                
                // Increment received messages counter for non-outgoing messages
                if (!message.key.fromMe) {
                    this.messageStats.received++;
                }
                
                await this.messageHandler.process(message);
                // logger.info(`✅ MessageHandler processing completed`);

                // MessageHandler takes care of all command processing, so we can continue to next message
                continue;

            } catch (error) {
                logger.error('Error processing message:', error);
                // Don't let one message error crash the bot
                continue;
            }
        }
    }

    /**
     * Handle message updates, specifically for detecting deleted messages
     */
    async handleMessageUpdates(messages) {
        for (const message of messages) {
            // logger.info('📨 Message update received');

            // Check for different types of message deletions
            let deletionDetected = false;
            let messageId, chatJid;

            // Method 1: Check for REVOKE stub type (68 in newer Baileys versions)
            if (message.update?.messageStubType === 68) {
                messageId = message.key.id;
                chatJid = message.key.remoteJid;
                deletionDetected = true;
                // logger.warn(`🗑️ DELETION DETECTED VIA STUB TYPE 68 - ID: ${messageId}, Chat: ${chatJid}`);
            }
            // Method 2: Check legacy stub type 6 (for compatibility)
            else if (message.update?.messageStubType === 6) {
                messageId = message.key.id;
                chatJid = message.key.remoteJid;
                deletionDetected = true;
                // logger.warn(`🗑️ DELETION DETECTED VIA STUB TYPE 6 - ID: ${messageId}, Chat: ${chatJid}`);
            }
            // Method 3: Protocol message revoke (type 0 = MESSAGE_DELETE)
            else if (message.update?.message?.protocolMessage?.type === 0) {
                const revokedKey = message.update.message.protocolMessage.key;
                if (revokedKey && revokedKey.id) {
                    messageId = revokedKey.id;
                    chatJid = revokedKey.remoteJid || message.key.remoteJid;
                    deletionDetected = true;
                    logger.warn(`🗑️ REVOKE DETECTED VIA PROTOCOL TYPE 0 - ID: ${messageId}, Chat: ${chatJid}`);
                }
            }
            // Method 4: Legacy protocol message revoke (string type)
            else if (message.update?.message?.protocolMessage?.type === 'REVOKE') {
                const revokedKey = message.update.message.protocolMessage.key;
                if (revokedKey && revokedKey.id) {
                    messageId = revokedKey.id;
                    chatJid = revokedKey.remoteJid || message.key.remoteJid;
                    deletionDetected = true;
                    logger.warn(`🗑️ REVOKE DETECTED VIA PROTOCOL STRING - ID: ${messageId}, Chat: ${chatJid}`);
                }
            }
            // Method 5: Check for messageStubType 1 (which sometimes indicates deletion)
            else if (message.update?.messageStubType === 1) {
                messageId = message.key.id;
                chatJid = message.key.remoteJid;
                deletionDetected = true;
                // logger.warn(`🗑️ DELETION DETECTED VIA STUB TYPE 1 - ID: ${messageId}, Chat: ${chatJid}`);
            }

            // Process deletion if detected
            if (deletionDetected && messageId && chatJid) {
                try {
                    // Use the anti-delete plugin if available and enabled
                    if (this.plugins && this.plugins.antidelete && config.ANTI_DELETE) {
                        // logger.info('🔄 Delegating to anti-delete plugin');
                        await this.plugins.antidelete.handleMessageDeletion(messageId, chatJid);
                    } else {
                        // Fallback to built-in handling
                        logger.info('🔄 Using built-in anti-delete handling');
                        await this.handleAntiDelete(messageId, chatJid);
                    }
                } catch (error) {
                    logger.error('Error processing deletion:', error);
                }
            } else {
                // Check if this is a message edit (not a deletion)
                if (message.update?.message && message.key?.id) {
                    // logger.info('📝 Message edit detected - processing for commands and archival');
                    
                    // Create a proper message object structure for edited content
                    const editedMessage = {
                        key: message.key,
                        message: {
                            editedMessage: {
                                message: message.update.message,
                                timestamp: Math.floor(Date.now() / 1000)
                            }
                        },
                        messageTimestamp: Math.floor(Date.now() / 1000)
                    };
                    
                    // Process the edited message for commands and archival
                    try {
                        await this.messageHandler.process(editedMessage);
                        // logger.info('✅ Edited message processed and archived');
                    } catch (error) {
                        logger.error('Error processing edited message:', error);
                    }
                } else {
                    // Log unhandled message updates for debugging
                    logger.debug('📝 Unhandled message update - not a deletion or edit');
                }
            }
        }
    }

    /**
     * Handle incoming calls
     */
    async handleCall(calls) {
        for (const call of calls) {
            // Reject calls if config.REJECT_CALLS is true and it's an incoming call offer
            if (config.REJECT_CALLS && call.status === 'offer') {
                try {
                    await this.sock.rejectCall(call.id, call.from);
                    logger.info(`📞 Rejected incoming call from: ${call.from}`);
                } catch (error) {
                    logger.error(`Failed to reject call from ${call.from}:`, error);
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
     * Handle status view automation (now integrated into handleMessages)
     */
    // async handleStatusView({ messages }) {
    //     if (!config.AUTO_STATUS_VIEW) return;

    //     for (const message of messages) {
    //         if (message.key.remoteJid === 'status@broadcast') {
    //             try {
    //                 await this.sock.readMessages([message.key]);
    //                 logger.debug(`👀 Viewed status from: ${message.key.participant}`);
    //             } catch (error) {
    //                 logger.error('Failed to view status:', error);
    //             }
    //         }
    //     }
    // }

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


        // Status report every 6 hours consistently
        if (config.OWNER_NUMBER) {
            const sixHours = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
            
            // Set up interval that checks if 6 hours have passed since startup
            setInterval(() => {
                const timeSinceStart = Date.now() - this.startTime;
                const hoursSinceStart = timeSinceStart / (60 * 60 * 1000);
                
                // Send report every 6 hours exactly (at 6h, 12h, 18h, etc.)
                if (hoursSinceStart >= 6 && Math.floor(hoursSinceStart) % 6 === 0) {
                    // Check if we haven't sent a report in the last hour to avoid duplicates
                    if (!this.lastReportTime || (Date.now() - this.lastReportTime) >= (5 * 60 * 60 * 1000)) {
                        this.sendStatusReport();
                        this.lastReportTime = Date.now();
                    }
                }
            }, 60 * 60 * 1000); // Check every hour
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
                `🔒 Security Events: ${security.getSecurityStats().securityEvents}\n` +
                `🏃‍♂️ Status: Running optimally`;

            await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                text: report
            });
            
            // Increment sent messages counter for status report
            this.messageStats.sent++;
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
     * Setup direct references to important plugins
     */
    setupPluginReferences() {
        // Store direct reference to anti-delete plugin for message update handling
        if (this.plugins && this.plugins.antidelete) {
            logger.info('✅ Anti-delete plugin reference established');
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
     * Check for update completion and send notification
     */
    async checkUpdateCompletion() {
        try {
            const updateFlagPath = '.update_flag.json';

            if (fs.existsSync(updateFlagPath)) {
                // Wait for bot to fully initialize - same timing as restart completion
                setTimeout(async () => {
                    try {
                        const updateInfo = JSON.parse(fs.readFileSync(updateFlagPath, 'utf8'));

                        // Send update completion message to bot owner
                        const completionMessage = '✅ Bot updated';

                        await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                            text: completionMessage
                        });

                        // Clean up the update flag file
                        fs.unlinkSync(updateFlagPath);

                        logger.success('✅ Update completion notification sent');
                    } catch (error) {
                        logger.error('Error sending update completion notification:', error);
                        // Clean up the file even if there's an error
                        if (fs.existsSync(updateFlagPath)) {
                            fs.unlinkSync(updateFlagPath);
                        }
                    }
                }, 5000); // Use same timing as restart completion (5 seconds)
            }
        } catch (error) {
            logger.error('Error checking update completion:', error);
        }
    }

    /**
     * Check for restart completion and send notification
     */
    async checkRestartCompletion() {
        try {
            const restartInfoPath = '.restart_info.json';

            if (fs.existsSync(restartInfoPath)) {
                // Wait a bit for bot to fully initialize
                setTimeout(async () => {
                    try {
                        const restartInfo = JSON.parse(fs.readFileSync(restartInfoPath, 'utf8'));

                        // Send restart completion message
                        await this.sock.sendMessage(restartInfo.chatJid, {
                            text: '✅ Restart completed'
                        });

                        // Clean up the restart info file
                        fs.unlinkSync(restartInfoPath);

                        logger.info('✅ Restart completion message sent');
                    } catch (error) {
                        logger.error('Error sending restart completion message:', error);
                        // Clean up the file even if there's an error
                        if (fs.existsSync(restartInfoPath)) {
                            fs.unlinkSync(restartInfoPath);
                        }
                    }
                }, 3000); // Wait 3 seconds for WhatsApp connection to stabilize
            }
        } catch (error) {
            logger.error('Error checking restart completion:', error);
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