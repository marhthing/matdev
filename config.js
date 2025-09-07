
/**
 * MATDEV Configuration
 * Environment-based configuration with intelligent defaults
 */

const fs = require('fs-extra');
const path = require('path');

// Only create .env file if it doesn't exist
function ensureEnvFileIfMissing() {
    const envPath = path.join(__dirname, '.env');
    
    // If .env already exists, don't touch it - preserve user settings
    if (fs.existsSync(envPath)) {
        // console.log('✅ Using existing .env file (preserving user settings)');
        return;
    }
    
    // console.log('📝 Creating default .env file...');
    
    // Default environment variables (only used if .env doesn't exist)
    const defaultEnv = {
        BOT_NAME: 'MATDEV',
        PREFIX: '.',
        PUBLIC_MODE: 'false',
        AUTO_TYPING: 'false',
        AUTO_READ: 'false',
        AUTO_STATUS_VIEW: 'false',
        ANTI_DELETE: 'true',
        MAX_CONCURRENT_MESSAGES: '5',
        MESSAGE_TIMEOUT: '30000',
        CACHE_TTL: '3600',
        ANTI_BAN: 'true',
        RATE_LIMIT_WINDOW: '60000',
        RATE_LIMIT_MAX_REQUESTS: '20',
        MAX_MEDIA_SIZE: '104857600',
        ALLOWED_MEDIA_TYPES: 'image,video,audio,document',
        LOG_LEVEL: 'info',
        LOG_TO_FILE: 'false',
        PLUGIN_AUTO_LOAD: 'true',
        STARTUP_MESSAGE: 'false',
        STATUS_REPORTS: 'false',
        BOT_REACTIONS: 'true',
        PORT: '8000',
        NODE_ENV: 'production',
        TIMEZONE: 'UTC',
        LANGUAGE: 'en'
    };
    
    try {
        // Write default .env file
        const envLines = Object.entries(defaultEnv)
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
            
        fs.writeFileSync(envPath, envLines + '\n');
        
        // console.log('✅ Default .env file created');
    } catch (error) {
        console.warn('⚠️ Could not create default .env file:', error.message);
    }
}

// Only create .env if it doesn't exist
ensureEnvFileIfMissing();

// Load environment variables
require('dotenv').config();

const config = {
    // Bot Identity
    BOT_NAME: process.env.BOT_NAME || 'MATDEV',
    SESSION_ID: process.env.SESSION_ID || '',
    OWNER_NUMBER: process.env.OWNER_NUMBER || '', // Auto-detected from connected WhatsApp

    // Bot Behavior
    PREFIX: process.env.PREFIX || '.',
    PUBLIC_MODE: process.env.PUBLIC_MODE === 'true',
    
    // Feature flags
    AUTO_TYPING: process.env.AUTO_TYPING === 'true' || false,
    AUTO_READ: process.env.AUTO_READ === 'true' || false,
    AUTO_STATUS_VIEW: process.env.AUTO_STATUS_VIEW === 'true' || false,
    ANTI_DELETE: process.env.ANTI_DELETE === 'true' || true,
    REJECT_CALLS: process.env.REJECT_CALLS === 'true' || false,

    // Performance Settings
    MAX_CONCURRENT_MESSAGES: parseInt(process.env.MAX_CONCURRENT_MESSAGES) || 5,
    MESSAGE_TIMEOUT: parseInt(process.env.MESSAGE_TIMEOUT) || 30000,
    CACHE_TTL: parseInt(process.env.CACHE_TTL) || 3600, // 1 hour

    // Security Features
    ANTI_BAN: process.env.ANTI_BAN !== 'false',
    RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 20,

    // Media Settings
    MAX_MEDIA_SIZE: parseInt(process.env.MAX_MEDIA_SIZE) || 100 * 1024 * 1024, // 100MB
    ALLOWED_MEDIA_TYPES: (process.env.ALLOWED_MEDIA_TYPES || 'image,video,audio,document').split(','),

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_TO_FILE: process.env.LOG_TO_FILE === 'true',

    // Advanced Features
    PLUGIN_AUTO_LOAD: process.env.PLUGIN_AUTO_LOAD !== 'false',
    STARTUP_MESSAGE: process.env.STARTUP_MESSAGE === 'true',
    STATUS_REPORTS: process.env.STATUS_REPORTS === 'true',
    BOT_REACTIONS: process.env.BOT_REACTIONS !== 'false',

    // External Services
    WEATHER_API_KEY: process.env.WEATHER_API_KEY || '',
    NEWS_API_KEY: process.env.NEWS_API_KEY || '',
    REMOVE_BG_API_KEY: process.env.REMOVE_BG_API_KEY || '',

    // Database (if needed)
    DATABASE_URL: process.env.DATABASE_URL || '',
    REDIS_URL: process.env.REDIS_URL || '',

    // Deployment
    PORT: parseInt(process.env.PORT) || 8000,
    NODE_ENV: process.env.NODE_ENV || 'production',

    // Regional Settings
    TIMEZONE: process.env.TIMEZONE || 'Africa/Lagos',
    LANGUAGE: process.env.LANGUAGE || 'en',

    // Hosting Platform Detection
    PLATFORM: process.env.DYNO ? 'heroku' : 
              process.env.RENDER ? 'render' : 
              process.env.RAILWAY ? 'railway' :
              process.env.KOYEB ? 'koyeb' : 'vps'
};

// Validation (warnings only, don't override)
if (!config.SESSION_ID && config.NODE_ENV === 'production') {
    console.warn('⚠️  SESSION_ID not configured. Bot will require manual QR scanning.');
}

if (!config.OWNER_NUMBER) {
    console.warn('⚠️  OWNER_NUMBER not configured. Some features may be limited.');
}

// Platform-specific optimizations (read-only)
if (config.PLATFORM === 'heroku') {
    // Don't override user settings, just provide info
    if (!process.env.LOG_TO_FILE) {
        // console.log('ℹ️  Heroku detected: File logging disabled by default');
    }
    if (!process.env.CACHE_TTL) {
        // console.log('ℹ️  Heroku detected: Using shorter cache TTL for memory optimization');
    }
}

module.exports = config;
