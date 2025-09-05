/**
 * MATDEV Utilities
 * Common utility functions for enhanced bot functionality
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const moment = require('moment-timezone');
const config = require('../config');

class Utils {
    constructor() {
        // Remove static timezone - make it dynamic
    }

    /**
     * Get current timezone from config
     */
    get timeZone() {
        return config.TIMEZONE || 'UTC';
    }

    /**
     * Format uptime duration
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Get current timestamp
     */
    getTimestamp() {
        return moment().tz(this.timeZone).format('YYYY-MM-DD HH:mm:ss z');
    }

    /**
     * Get formatted date
     */
    getFormattedDate(format = 'YYYY-MM-DD HH:mm:ss') {
        return moment().tz(this.timeZone).format(format);
    }

    /**
     * Sleep/delay function
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate random string
     */
    randomString(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        return result;
    }

    /**
     * Generate UUID
     */
    generateUUID() {
        return crypto.randomUUID();
    }

    /**
     * Hash string using SHA256
     */
    hash(text) {
        return crypto.createHash('sha256').update(text).digest('hex');
    }

    /**
     * Extract phone number from JID
     */
    extractPhone(jid) {
        return jid.split('@')[0];
    }

    /**
     * Format phone number
     */
    formatPhone(phone) {
        // Remove non-digit characters
        const cleaned = phone.replace(/\D/g, '');
        
        // Add country code if missing (assuming international format)
        if (cleaned.length === 10) {
            return `+1${cleaned}`; // Default to US
        } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
            return `+${cleaned}`;
        } else if (!cleaned.startsWith('+')) {
            return `+${cleaned}`;
        }
        
        return cleaned;
    }

    /**
     * Check if string is valid URL
     */
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * Check if string is valid email
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Sanitize filename
     */
    sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
    }

    /**
     * Get file extension
     */
    getFileExtension(filename) {
        return path.extname(filename).toLowerCase().slice(1);
    }

    /**
     * Get MIME type from extension
     */
    getMimeType(extension) {
        const mimeTypes = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'mp4': 'video/mp4',
            'avi': 'video/avi',
            'mkv': 'video/mkv',
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'pdf': 'application/pdf',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'txt': 'text/plain',
            'json': 'application/json',
            'xml': 'application/xml',
            'zip': 'application/zip',
            'rar': 'application/x-rar-compressed'
        };
        
        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Ensure directory exists
     */
    async ensureDir(dirPath) {
        try {
            await fs.ensureDir(dirPath);
            return true;
        } catch (error) {
            console.error('Error creating directory:', error);
            return false;
        }
    }

    /**
     * Read JSON file safely
     */
    async readJSON(filePath, defaultValue = null) {
        try {
            if (await this.fileExists(filePath)) {
                return await fs.readJson(filePath);
            }
            return defaultValue;
        } catch (error) {
            console.error('Error reading JSON:', error);
            return defaultValue;
        }
    }

    /**
     * Write JSON file safely
     */
    async writeJSON(filePath, data) {
        try {
            await this.ensureDir(path.dirname(filePath));
            await fs.writeJson(filePath, data, { spaces: 2 });
            return true;
        } catch (error) {
            console.error('Error writing JSON:', error);
            return false;
        }
    }

    /**
     * Clean temporary files
     */
    async cleanTempFiles(olderThanMs = 24 * 60 * 60 * 1000) { // 24 hours
        try {
            const tempDir = path.join(process.cwd(), 'tmp');
            if (!(await this.fileExists(tempDir))) {
                return;
            }
            
            const files = await fs.readdir(tempDir);
            const now = Date.now();
            let cleanedCount = 0;
            
            for (const file of files) {
                if (file.startsWith('.')) continue;
                
                const filePath = path.join(tempDir, file);
                const stats = await fs.stat(filePath);
                
                if (now - stats.mtime.getTime() > olderThanMs) {
                    await fs.remove(filePath);
                    cleanedCount++;
                }
            }
            
            return cleanedCount;
        } catch (error) {
            console.error('Error cleaning temp files:', error);
            return 0;
        }
    }

    /**
     * Escape RegExp special characters
     */
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Truncate string to specific length
     */
    truncate(str, length = 100, suffix = '...') {
        if (str.length <= length) {
            return str;
        }
        
        return str.substring(0, length - suffix.length) + suffix;
    }

    /**
     * Capitalize first letter
     */
    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Convert to title case
     */
    toTitleCase(str) {
        return str.replace(/\w\S*/g, (txt) => 
            txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        );
    }

    /**
     * Parse command arguments
     */
    parseArgs(text, prefix = config.PREFIX) {
        if (!text.startsWith(prefix)) {
            return null;
        }
        
        const args = text.slice(prefix.length).trim().split(/\s+/);
        const command = args.shift().toLowerCase();
        
        return {
            command,
            args,
            raw: text,
            argsString: args.join(' ')
        };
    }

    /**
     * Format number with commas
     */
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /**
     * Get random element from array
     */
    randomElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Shuffle array
     */
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    /**
     * Deep clone object
     */
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /**
     * Check if object is empty
     */
    isEmpty(obj) {
        if (obj == null) return true;
        if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
        return Object.keys(obj).length === 0;
    }

    /**
     * Merge objects deeply
     */
    deepMerge(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();

        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.deepMerge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }

        return this.deepMerge(target, ...sources);
    }

    /**
     * Check if value is an object
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * Get system information
     */
    getSystemInfo() {
        const process = require('process');
        const os = require('os');
        
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: process.memoryUsage()
            },
            cpu: os.cpus()[0],
            uptime: {
                system: os.uptime(),
                process: process.uptime()
            }
        };
    }

    /**
     * Generate QR code text (simple ASCII)
     */
    generateSimpleQR(text) {
        // This is a very basic QR-like representation
        // In production, you'd want to use a proper QR library
        const lines = [
            '█████████████████████',
            '█ ▄▄▄▄▄ █ ▄▄▄▄▄ █',
            '█ █   █ █ █   █ █',
            '█ █▄▄▄█ █ █▄▄▄█ █',
            '█▄▄▄▄▄▄▄█▄▄▄▄▄▄▄█',
            `█ ${text.slice(0, 15).padEnd(15)} █`,
            '█████████████████████'
        ];
        
        return lines.join('\n');
    }
}

module.exports = Utils;
