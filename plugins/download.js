/**
 * MATDEV General Download Plugin
 * Download files from direct links
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const url = require('url');

class DownloadPlugin {
    constructor() {
        this.name = 'download';
        this.description = 'General file downloader';
        this.version = '1.0.0';
        this.maxFileSize = 50 * 1024 * 1024; // 50MB limit
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Download plugin loaded');
    }

    /**
     * Register download commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('download', this.downloadFile.bind(this), {
            description: 'Download file from direct link',
            usage: `${config.PREFIX}download <url>`,
            category: 'utility',
            plugin: 'download',
            source: 'download.js'
        });

        this.bot.messageHandler.registerCommand('dl', this.downloadFile.bind(this), {
            description: 'Download file from direct link (short)',
            usage: `${config.PREFIX}dl <url>`,
            category: 'utility',
            plugin: 'download',
            source: 'download.js'
        });
    }

    /**
     * Download file command
     */
    async downloadFile(sock, chatJid, senderJid, message, args) {
        try {
            if (!args || args.length === 0) {
                await sock.sendMessage(chatJid, {
                    text: `❌ Please provide a download URL\n\nUsage: ${config.PREFIX}download <url>\n\nExample: ${config.PREFIX}download https://example.com/file.pdf\n\n⚠️ *Note:* Only direct file links are supported (max 50MB)`
                });
                return;
            }

            const downloadUrl = args[0];
            
            // Validate URL
            if (!this.isValidUrl(downloadUrl)) {
                await sock.sendMessage(chatJid, {
                    text: '❌ Invalid URL. Please provide a valid direct download link.'
                });
                return;
            }

            // Send processing message
            const processingMsg = await sock.sendMessage(chatJid, {
                text: '🔄 Checking file...\n⏳ Please wait while we verify the download.'
            });

            try {
                // Head request to check file info
                const headResponse = await axios.head(downloadUrl, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                const contentLength = parseInt(headResponse.headers['content-length'] || '0');
                const contentType = headResponse.headers['content-type'] || 'application/octet-stream';
                
                // Check file size
                if (contentLength > this.maxFileSize) {
                    await sock.sendMessage(chatJid, {
                        text: `❌ File is too large (${this.formatFileSize(contentLength)}). Maximum allowed size is ${this.formatFileSize(this.maxFileSize)}.`
                    }, { quoted: processingMsg });
                    return;
                }

                // Get filename from URL or Content-Disposition
                let filename = this.getFilenameFromUrl(downloadUrl);
                const contentDisposition = headResponse.headers['content-disposition'];
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                    if (filenameMatch && filenameMatch[1]) {
                        filename = filenameMatch[1].replace(/['"]/g, '');
                    }
                }

                // Update processing message
                await sock.sendMessage(chatJid, {
                    text: `🔄 Downloading file...\n📁 *File:* ${filename}\n📊 *Size:* ${this.formatFileSize(contentLength)}\n⏳ Please wait...`
                }, { quoted: processingMsg });

                // Download the file
                const response = await axios.get(downloadUrl, {
                    responseType: 'arraybuffer',
                    timeout: 120000, // 2 minutes timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    maxContentLength: this.maxFileSize
                });

                if (!response.data) {
                    throw new Error('Failed to download file data');
                }

                // Determine how to send the file based on content type
                const fileBuffer = Buffer.from(response.data);
                
                let messageOptions = {};
                const caption = `📁 *File Downloaded*\n\n` +
                               `📝 *Name:* ${filename}\n` +
                               `📊 *Size:* ${this.formatFileSize(fileBuffer.length)}\n` +
                               `🔗 *Source:* ${downloadUrl}\n` +
                               `📱 *Downloaded by:* ${config.BOT_NAME}`;

                // Send as appropriate media type
                if (contentType.startsWith('image/')) {
                    messageOptions = {
                        image: fileBuffer,
                        caption: caption
                    };
                } else if (contentType.startsWith('video/')) {
                    messageOptions = {
                        video: fileBuffer,
                        caption: caption,
                        mimetype: contentType
                    };
                } else if (contentType.startsWith('audio/')) {
                    messageOptions = {
                        audio: fileBuffer,
                        caption: caption,
                        mimetype: contentType
                    };
                } else {
                    // Send as document for other file types
                    messageOptions = {
                        document: fileBuffer,
                        fileName: filename,
                        caption: caption,
                        mimetype: contentType
                    };
                }

                // Send the file
                await sock.sendMessage(chatJid, messageOptions);

                // Delete processing message
                try {
                    await sock.sendMessage(chatJid, { delete: processingMsg.key });
                } catch (e) {
                    // Ignore delete errors
                }

            } catch (downloadError) {
                console.error('Download error:', downloadError);
                
                let errorMessage = '❌ Failed to download file.\n\nPossible reasons:\n';
                
                if (downloadError.code === 'ENOTFOUND' || downloadError.code === 'ECONNREFUSED') {
                    errorMessage += '• URL is not reachable\n';
                } else if (downloadError.code === 'ETIMEDOUT') {
                    errorMessage += '• Download timeout (file too large or slow connection)\n';
                } else if (downloadError.response?.status === 404) {
                    errorMessage += '• File not found (404)\n';
                } else if (downloadError.response?.status === 403) {
                    errorMessage += '• Access forbidden (403)\n';
                } else {
                    errorMessage += '• Invalid or inaccessible URL\n';
                }
                
                errorMessage += '• File requires authentication\n';
                errorMessage += '• Server blocks automated downloads\n\n';
                errorMessage += 'Please ensure the URL is a direct file link.';

                await sock.sendMessage(chatJid, {
                    text: errorMessage
                }, { quoted: processingMsg });
            }

        } catch (error) {
            console.error('Error in download command:', error);
            await sock.sendMessage(chatJid, {
                text: '❌ An error occurred while processing the download. Please try again.'
            });
        }
    }

    /**
     * Validate URL
     */
    isValidUrl(string) {
        try {
            const urlObj = new URL(string);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    /**
     * Get filename from URL
     */
    getFilenameFromUrl(urlString) {
        try {
            const pathname = url.parse(urlString).pathname;
            const filename = path.basename(pathname);
            return filename || 'downloaded_file';
        } catch (error) {
            return 'downloaded_file';
        }
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = bytes / Math.pow(1024, unitIndex);
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
}

module.exports = new DownloadPlugin();