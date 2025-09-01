/**
 * MATDEV Logger
 * Advanced logging system with multiple levels and outputs
 */

const winston = require('winston');
const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class Logger {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.setupConsoleLogger(); // Set up colors first
        this.setupLogger();
    }

    /**
     * Setup Winston logger
     */
    setupLogger() {
        // Ensure logs directory exists
        if (config.LOG_TO_FILE) {
            fs.ensureDirSync(this.logDir);
        }

        // Define log format
        const logFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ timestamp, level, message, stack }) => {
                return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
            })
        );

        // Create transports
        const transports = [];

        // Console transport (always enabled)
        transports.push(
            new winston.transports.Console({
                level: config.LOG_LEVEL,
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                ),
                silent: false
            })
        );

        // File transport (optional)
        if (config.LOG_TO_FILE) {
            transports.push(
                new winston.transports.File({
                    filename: path.join(this.logDir, 'error.log'),
                    level: 'error',
                    format: logFormat,
                    maxsize: 5242880, // 5MB
                    maxFiles: 5,
                    tailable: true
                })
            );

            transports.push(
                new winston.transports.File({
                    filename: path.join(this.logDir, 'combined.log'),
                    format: logFormat,
                    maxsize: 5242880, // 5MB
                    maxFiles: 5,
                    tailable: true
                })
            );
        }

        // Create logger instance
        this.winstonLogger = winston.createLogger({
            level: config.LOG_LEVEL,
            format: logFormat,
            transports,
            exitOnError: false
        });

        // Handle uncaught exceptions
        this.winstonLogger.exceptions.handle(
            new winston.transports.Console({
                format: winston.format.simple()
            })
        );
    }

    /**
     * Setup console logger for direct use
     */
    setupConsoleLogger() {
        this.colors = {
            error: chalk.red,
            warn: chalk.yellow,
            info: chalk.blue,
            debug: chalk.gray,
            success: chalk.green,
            highlight: chalk.cyan
        };
    }

    /**
     * Log error message
     */
    error(message, error = null) {
        const logMessage = error ? `${message}: ${error.message || error}` : message;
        
        if (!this.colors || !this.colors.error) {
            console.log(`❌ ${logMessage}`);
        } else {
            console.log(this.colors.error(`❌ ${logMessage}`));
        }
        
        if (this.winstonLogger) {
            this.winstonLogger.error(logMessage, error);
        }
        
        if (error && error.stack && config.LOG_LEVEL === 'debug') {
            if (!this.colors || !this.colors.debug) {
                console.log(error.stack);
            } else {
                console.log(this.colors.debug(error.stack));
            }
        }
    }

    /**
     * Log warning message
     */
    warn(message, data = null) {
        const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
        
        if (!this.colors || !this.colors.warn) {
            console.log(`⚠️  ${logMessage}`);
        } else {
            console.log(this.colors.warn(`⚠️  ${logMessage}`));
        }
        
        if (this.winstonLogger) {
            this.winstonLogger.warn(logMessage);
        }
    }

    /**
     * Log info message
     */
    info(message, data = null) {
        const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
        
        if (!this.colors || !this.colors.info) {
            console.log(`ℹ️  ${logMessage}`);
        } else {
            console.log(this.colors.info(`ℹ️  ${logMessage}`));
        }
        
        if (this.winstonLogger) {
            this.winstonLogger.info(logMessage);
        }
    }

    /**
     * Log debug message
     */
    debug(message, data = null) {
        if (config.LOG_LEVEL !== 'debug') return;
        
        const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
        
        if (!this.colors || !this.colors.debug) {
            console.log(`🔍 ${logMessage}`);
        } else {
            console.log(this.colors.debug(`🔍 ${logMessage}`));
        }
        
        if (this.winstonLogger) {
            this.winstonLogger.debug(logMessage);
        }
    }

    /**
     * Log trace message (for Baileys compatibility)
     */
    trace(message, data = null) {
        if (config.LOG_LEVEL !== 'debug') return; // Only show traces in debug mode
        
        const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
        
        if (!this.colors || !this.colors.debug) {
            console.log(`🔬 ${logMessage}`);
        } else {
            console.log(this.colors.debug(`🔬 ${logMessage}`));
        }
        
        if (this.winstonLogger) {
            this.winstonLogger.debug(`TRACE: ${logMessage}`);
        }
    }

    /**
     * Log success message
     */
    success(message, data = null) {
        const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
        
        // Ensure colors are set up
        if (!this.colors || !this.colors.success) {
            console.log(`✅ ${logMessage}`); // Fallback without colors
            if (this.winstonLogger) {
                this.winstonLogger.info(`SUCCESS: ${logMessage}`);
            }
            return;
        }
        
        console.log(this.colors.success(`✅ ${logMessage}`));
        
        if (this.winstonLogger) {
            this.winstonLogger.info(`SUCCESS: ${logMessage}`);
        }
    }

    /**
     * Log highlighted message
     */
    highlight(message, data = null) {
        const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
        
        console.log(this.colors.highlight(`🎯 ${logMessage}`));
        
        if (this.winstonLogger) {
            this.winstonLogger.info(`HIGHLIGHT: ${logMessage}`);
        }
    }

    /**
     * Log with custom level and color
     */
    custom(level, message, color = 'white', emoji = '•') {
        const colorFunc = chalk[color] || chalk.white;
        console.log(colorFunc(`${emoji} ${message}`));
        
        if (this.winstonLogger) {
            this.winstonLogger.log(level, message);
        }
    }

    /**
     * Get logger instance for Baileys
     */
    getLogger() {
        return {
            trace: this.trace.bind(this),
            debug: this.debug.bind(this),
            info: this.info.bind(this),
            warn: this.warn.bind(this),
            error: this.error.bind(this),
            fatal: this.error.bind(this) // Map fatal to error
        };
    }

    /**
     * Create a formatted banner
     */
    banner(text, options = {}) {
        const {
            color = 'cyan',
            width = 80,
            padding = 2,
            borderChar = '='
        } = options;
        
        const colorFunc = this.colors[color] || chalk.cyan;
        const border = borderChar.repeat(width);
        const paddingSpaces = ' '.repeat(padding);
        const textLine = paddingSpaces + text + paddingSpaces;
        const emptyLine = ' '.repeat(width);
        
        console.log(colorFunc(border));
        console.log(colorFunc(emptyLine));
        console.log(colorFunc(textLine.padEnd(width)));
        console.log(colorFunc(emptyLine));
        console.log(colorFunc(border));
    }

    /**
     * Log table data
     */
    table(data, title = null) {
        if (title) {
            console.log(this.colors.highlight(`\n📊 ${title}`));
        }
        
        console.table(data);
        
        if (this.winstonLogger) {
            this.winstonLogger.info(`TABLE: ${title || 'Data'}`, { data });
        }
    }

    /**
     * Log JSON data with pretty formatting
     */
    json(data, title = null) {
        if (title) {
            console.log(this.colors.highlight(`\n📄 ${title}`));
        }
        
        console.log(JSON.stringify(data, null, 2));
        
        if (this.winstonLogger) {
            this.winstonLogger.info(`JSON: ${title || 'Data'}`, data);
        }
    }

    /**
     * Start a timer
     */
    time(label) {
        console.time(this.colors.info(`⏱️  ${label}`));
    }

    /**
     * End a timer
     */
    timeEnd(label) {
        console.timeEnd(this.colors.info(`⏱️  ${label}`));
    }

    /**
     * Log system performance
     */
    performance() {
        const memUsage = process.memoryUsage();
        const formatMemory = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
        
        console.log(this.colors.info('\n📊 System Performance:'));
        console.log(this.colors.debug(`   Heap Used: ${formatMemory(memUsage.heapUsed)}`));
        console.log(this.colors.debug(`   Heap Total: ${formatMemory(memUsage.heapTotal)}`));
        console.log(this.colors.debug(`   External: ${formatMemory(memUsage.external)}`));
        console.log(this.colors.debug(`   RSS: ${formatMemory(memUsage.rss)}`));
        console.log(this.colors.debug(`   Uptime: ${Math.floor(process.uptime())}s`));
    }

    /**
     * Get Winston logger instance
     */
    getLogger() {
        return this.winstonLogger;
    }

    /**
     * Get log files list
     */
    async getLogFiles() {
        if (!config.LOG_TO_FILE) {
            return [];
        }
        
        try {
            const files = await fs.readdir(this.logDir);
            return files.filter(file => file.endsWith('.log')).map(file => ({
                name: file,
                path: path.join(this.logDir, file),
                size: fs.statSync(path.join(this.logDir, file)).size
            }));
        } catch (error) {
            return [];
        }
    }

    /**
     * Clear log files
     */
    async clearLogs() {
        if (!config.LOG_TO_FILE) {
            return;
        }
        
        try {
            const files = await this.getLogFiles();
            for (const file of files) {
                await fs.remove(file.path);
            }
            this.info('Log files cleared');
        } catch (error) {
            this.error('Failed to clear log files', error);
        }
    }

    /**
     * Get recent log entries
     */
    async getRecentLogs(lines = 100) {
        if (!config.LOG_TO_FILE) {
            return [];
        }
        
        try {
            const logFile = path.join(this.logDir, 'combined.log');
            if (!(await fs.pathExists(logFile))) {
                return [];
            }
            
            const content = await fs.readFile(logFile, 'utf8');
            const logLines = content.split('\n').filter(line => line.trim());
            
            return logLines.slice(-lines);
        } catch (error) {
            this.error('Failed to read log file', error);
            return [];
        }
    }

    /**
     * Monitor log file size and rotate if needed
     */
    async rotateLogs() {
        if (!config.LOG_TO_FILE) {
            return;
        }
        
        try {
            const maxSize = 10 * 1024 * 1024; // 10MB
            const files = await this.getLogFiles();
            
            for (const file of files) {
                if (file.size > maxSize) {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupName = `${file.name}.${timestamp}`;
                    const backupPath = path.join(this.logDir, backupName);
                    
                    await fs.move(file.path, backupPath);
                    this.info(`Rotated log file: ${file.name} -> ${backupName}`);
                }
            }
        } catch (error) {
            this.error('Failed to rotate logs', error);
        }
    }
}

module.exports = Logger;
