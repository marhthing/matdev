
/**
 * MATDEV Database Manager
 * SQLite-based persistent storage for anti-delete features
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs-extra');
const Logger = require('./logger');

class DatabaseManager {
    constructor() {
        this.logger = new Logger();
        this.db = null;
        this.dbPath = path.join(__dirname, '../session/messages.db');
    }

    /**
     * Initialize database
     */
    async initialize() {
        try {
            // Ensure session directory exists
            await fs.ensureDir(path.dirname(this.dbPath));
            
            this.db = new sqlite3.Database(this.dbPath);
            
            // Create tables
            await this.createTables();
            
            this.logger.success('📂 Database initialized successfully');
        } catch (error) {
            this.logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Create necessary tables
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            const createTables = `
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    chat_jid TEXT NOT NULL,
                    sender_jid TEXT NOT NULL,
                    participant_jid TEXT,
                    message_type TEXT NOT NULL,
                    content TEXT,
                    media_url TEXT,
                    media_type TEXT,
                    timestamp INTEGER NOT NULL,
                    is_deleted BOOLEAN DEFAULT 0,
                    created_at INTEGER DEFAULT (strftime('%s','now'))
                );
                
                CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON messages(chat_jid, timestamp);
                CREATE INDEX IF NOT EXISTS idx_sender ON messages(sender_jid);
                CREATE INDEX IF NOT EXISTS idx_deleted ON messages(is_deleted);
                
                CREATE TABLE IF NOT EXISTS deleted_messages (
                    original_id TEXT PRIMARY KEY,
                    chat_jid TEXT NOT NULL,
                    sender_jid TEXT NOT NULL,
                    content TEXT,
                    media_info TEXT,
                    deleted_at INTEGER DEFAULT (strftime('%s','now')),
                    FOREIGN KEY(original_id) REFERENCES messages(id)
                );
            `;
            
            this.db.exec(createTables, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Archive a message with full media support
     */
    async archiveMessage(message) {
        if (!this.db) return false;
        
        try {
            const messageType = Object.keys(message.message || {})[0];
            const content = message.message[messageType];
            const text = content?.text || content?.caption || '';
            
            const sender = message.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const participant = isGroup ? message.key.participant : sender;

            let mediaUrl = null;
            let mediaType = null;

            // Handle media messages
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            if (mediaTypes.includes(messageType)) {
                try {
                    const downloadResult = await this.downloadAndSaveMedia(message, messageType);
                    if (downloadResult) {
                        mediaUrl = downloadResult.path;
                        mediaType = downloadResult.type;
                    }
                } catch (mediaError) {
                    this.logger.error('Error downloading media:', mediaError);
                    // Continue without media but log the error
                }
            }
            
            const sql = `
                INSERT OR REPLACE INTO messages 
                (id, chat_jid, sender_jid, participant_jid, message_type, content, media_url, media_type, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            return new Promise((resolve) => {
                this.db.run(sql, [
                    message.key.id,
                    sender,
                    sender,
                    participant,
                    messageType,
                    text,
                    mediaUrl,
                    mediaType,
                    message.messageTimestamp || Date.now()
                ], function(error) {
                    if (error) {
                        console.error('Archive error:', error);
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                });
            });
            
        } catch (error) {
            this.logger.error('Error archiving message:', error);
            return false;
        }
    }

    /**
     * Download and save media file
     */
    async downloadAndSaveMedia(message, messageType) {
        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            
            // Create media directory
            const mediaDir = path.join(__dirname, '../session/media');
            await fs.ensureDir(mediaDir);

            // Download media buffer
            const buffer = await downloadMediaMessage(message, 'buffer', {});
            if (!buffer) return null;

            // Generate unique filename
            const timestamp = Date.now();
            const messageId = message.key.id.replace(/[^a-zA-Z0-9]/g, '_');
            
            let extension = '';
            const content = message.message[messageType];
            
            // Determine file extension based on message type and mimetype
            if (content.mimetype) {
                const mimeToExt = {
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'image/gif': '.gif',
                    'image/webp': '.webp',
                    'video/mp4': '.mp4',
                    'video/3gpp': '.3gp',
                    'video/quicktime': '.mov',
                    'audio/mpeg': '.mp3',
                    'audio/ogg': '.ogg',
                    'audio/wav': '.wav',
                    'audio/aac': '.aac',
                    'application/pdf': '.pdf',
                    'application/msword': '.doc',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
                };
                extension = mimeToExt[content.mimetype] || '';
            }
            
            // Fallback extensions based on message type
            if (!extension) {
                const typeToExt = {
                    'imageMessage': '.jpg',
                    'videoMessage': '.mp4',
                    'audioMessage': '.mp3',
                    'documentMessage': '.bin',
                    'stickerMessage': '.webp'
                };
                extension = typeToExt[messageType] || '.bin';
            }

            const filename = `${timestamp}_${messageId}${extension}`;
            const filepath = path.join(mediaDir, filename);

            // Save file to disk
            await fs.writeFile(filepath, buffer);

            // Return relative path and media info
            return {
                path: `session/media/${filename}`,
                type: content.mimetype || messageType,
                size: buffer.length,
                filename: content.fileName || filename,
                duration: content.seconds || null,
                width: content.width || null,
                height: content.height || null
            };

        } catch (error) {
            this.logger.error('Error downloading media:', error);
            return null;
        }
    }

    /**
     * Retrieve archived message by ID
     */
    async getArchivedMessage(messageId) {
        if (!this.db) return null;
        
        const sql = `
            SELECT * FROM messages 
            WHERE id = ? AND is_deleted = 0
        `;
        
        return new Promise((resolve) => {
            this.db.get(sql, [messageId], (error, row) => {
                if (error) {
                    console.error('Retrieve error:', error);
                    resolve(null);
                } else {
                    resolve(row);
                }
            });
        });
    }

    /**
     * Get media file for archived message
     */
    async getArchivedMedia(messageId) {
        if (!this.db) return null;
        
        const message = await this.getArchivedMessage(messageId);
        if (!message || !message.media_url) return null;

        try {
            const mediaPath = path.join(__dirname, '..', message.media_url);
            const exists = await fs.pathExists(mediaPath);
            
            if (exists) {
                const buffer = await fs.readFile(mediaPath);
                return {
                    buffer,
                    type: message.media_type,
                    path: mediaPath,
                    filename: path.basename(mediaPath)
                };
            }
        } catch (error) {
            this.logger.error('Error retrieving archived media:', error);
        }
        
        return null;
    }

    /**
     * Mark message as deleted and store in deleted_messages
     */
    async markMessageDeleted(messageId, chatJid) {
        if (!this.db) return false;
        
        try {
            // First get the original message
            const originalMessage = await this.getArchivedMessage(messageId);
            if (!originalMessage) return false;
            
            // Mark as deleted in messages table
            const updateSql = `UPDATE messages SET is_deleted = 1 WHERE id = ?`;
            
            // Insert into deleted_messages table
            const insertSql = `
                INSERT INTO deleted_messages 
                (original_id, chat_jid, sender_jid, content, media_info)
                VALUES (?, ?, ?, ?, ?)
            `;
            
            return new Promise((resolve) => {
                this.db.serialize(() => {
                    this.db.run(updateSql, [messageId]);
                    this.db.run(insertSql, [
                        messageId,
                        chatJid,
                        originalMessage.sender_jid,
                        originalMessage.content,
                        JSON.stringify({
                            type: originalMessage.message_type,
                            media_url: originalMessage.media_url
                        })
                    ], function(error) {
                        resolve(!error);
                    });
                });
            });
            
        } catch (error) {
            this.logger.error('Error marking message as deleted:', error);
            return false;
        }
    }

    /**
     * Get recent messages from a chat (for anti-delete)
     */
    async getRecentMessages(chatJid, limit = 50) {
        if (!this.db) return [];
        
        const sql = `
            SELECT * FROM messages 
            WHERE chat_jid = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `;
        
        return new Promise((resolve) => {
            this.db.all(sql, [chatJid, limit], (error, rows) => {
                if (error) {
                    console.error('Get recent messages error:', error);
                    resolve([]);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    /**
     * Cleanup old messages and media files (keep last 3 days)
     * NOTE: This method is now called by centralized CleanupManager
     */
    async cleanupOldMessages() {
        if (!this.db) return;
        
        const threeDaysAgo = Math.floor(Date.now() / 1000) - (3 * 24 * 60 * 60);
        
        // First, get media files that will be deleted
        const getMediaSql = `
            SELECT media_url FROM messages 
            WHERE created_at < ? AND media_url IS NOT NULL
        `;
        
        return new Promise((resolve) => {
            this.db.all(getMediaSql, [threeDaysAgo], async (error, rows) => {
                if (error) {
                    resolve(false);
                    return;
                }
                
                // Delete media files from disk
                let deletedFiles = 0;
                for (const row of rows) {
                    try {
                        const filePath = path.join(__dirname, '..', row.media_url);
                        if (await fs.pathExists(filePath)) {
                            await fs.remove(filePath);
                            deletedFiles++;
                        }
                    } catch (fileError) {
                        console.error('Error deleting media file:', fileError);
                    }
                }
                
                // Delete database records
                const deleteSql = `
                    DELETE FROM messages 
                    WHERE created_at < ? AND is_deleted = 0
                `;
                
                this.db.run(deleteSql, [threeDaysAgo], function(dbError) {
                    if (!dbError) {
                        console.log(`🗑️ Cleaned up ${this.changes} old messages and ${deletedFiles} media files`);
                    }
                    resolve(!dbError);
                });
            });
        });
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        if (!this.db) return null;
        
        const sql = `
            SELECT 
                COUNT(*) as total_messages,
                COUNT(CASE WHEN media_url IS NOT NULL THEN 1 END) as media_messages,
                COUNT(CASE WHEN is_deleted = 1 THEN 1 END) as deleted_messages,
                SUM(CASE WHEN media_url IS NOT NULL THEN 1 ELSE 0 END) as total_media_files
            FROM messages
        `;
        
        return new Promise((resolve) => {
            this.db.get(sql, [], async (error, row) => {
                if (error) {
                    resolve(null);
                    return;
                }
                
                // Calculate media directory size
                let totalMediaSize = 0;
                try {
                    const mediaDir = path.join(__dirname, '../session/media');
                    if (await fs.pathExists(mediaDir)) {
                        const files = await fs.readdir(mediaDir);
                        for (const file of files) {
                            const stats = await fs.stat(path.join(mediaDir, file));
                            totalMediaSize += stats.size;
                        }
                    }
                } catch (sizeError) {
                    console.error('Error calculating media size:', sizeError);
                }
                
                resolve({
                    ...row,
                    media_size_bytes: totalMediaSize,
                    media_size_mb: (totalMediaSize / (1024 * 1024)).toFixed(2)
                });
            });
        });
    }

    /**
     * Close database connection
     */
    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((error) => {
                    if (!error) {
                        this.logger.info('📂 Database connection closed');
                    }
                    resolve();
                });
            });
        }
    }
}

module.exports = DatabaseManager;
