/**
 * MATDEV Caption Editor Plugin
 * Edit video and image captions without downloading media
 */

const config = require('../config');

class CaptionEditorPlugin {
    constructor() {
        this.name = 'captioneditor';
        this.description = 'Edit media captions without downloading';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        console.log('✅ Caption Editor plugin loaded');
    }

    /**
     * Register commands
     */
    registerCommands() {
        // Add caption to media
        this.bot.messageHandler.registerCommand('addcaption', this.addCaptionCommand.bind(this), {
            description: 'Add caption to image/video without downloading',
            usage: `${config.PREFIX}addcaption <new caption> (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });

        // Edit existing caption
        this.bot.messageHandler.registerCommand('editcaption', this.editCaptionCommand.bind(this), {
            description: 'Edit caption of image/video without downloading',
            usage: `${config.PREFIX}editcaption <new caption> (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });

        // Remove caption
        this.bot.messageHandler.registerCommand('removecaption', this.removeCaptionCommand.bind(this), {
            description: 'Remove caption from image/video without downloading',
            usage: `${config.PREFIX}removecaption (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });

        // Copy media with new caption
        this.bot.messageHandler.registerCommand('copycaption', this.copyCaptionCommand.bind(this), {
            description: 'Copy media with modified caption',
            usage: `${config.PREFIX}copycaption <new caption> (reply to media)`,
            category: 'media',
            plugin: 'captioneditor',
            source: 'captioneditor.js'
        });
    }

    /**
     * Add caption command
     */
    async addCaptionCommand(messageInfo) {
        try {
            // Check if replying to a message
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to add a caption.\n\n*Usage:* ${config.PREFIX}addcaption <caption>`
                );
                return;
            }

            // Check if it's media
            const mediaInfo = this.getMediaInfo(quotedMessage);
            if (!mediaInfo) {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
                return;
            }

            // Check if caption provided
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a caption.\n\n*Usage:* ${config.PREFIX}addcaption <caption>`
                );
                return;
            }

            const newCaption = messageInfo.args.join(' ');

            // Send media with new caption
            await this.sendMediaWithCaption(messageInfo, mediaInfo, newCaption, 'added');

        } catch (error) {
            console.error('Error in addCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error adding caption: ' + error.message);
        }
    }

    /**
     * Edit caption command
     */
    async editCaptionCommand(messageInfo) {
        try {
            // Check if replying to a message
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to edit its caption.\n\n*Usage:* ${config.PREFIX}editcaption <new caption>`
                );
                return;
            }

            // Check if it's media
            const mediaInfo = this.getMediaInfo(quotedMessage);
            if (!mediaInfo) {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
                return;
            }

            // Check if caption provided
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a new caption.\n\n*Usage:* ${config.PREFIX}editcaption <new caption>`
                );
                return;
            }

            const newCaption = messageInfo.args.join(' ');

            // Send media with edited caption
            await this.sendMediaWithCaption(messageInfo, mediaInfo, newCaption, 'edited');

        } catch (error) {
            console.error('Error in editCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error editing caption: ' + error.message);
        }
    }

    /**
     * Remove caption command
     */
    async removeCaptionCommand(messageInfo) {
        try {
            // Check if replying to a message
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to remove its caption.\n\n*Usage:* ${config.PREFIX}removecaption`
                );
                return;
            }

            // Check if it's media
            const mediaInfo = this.getMediaInfo(quotedMessage);
            if (!mediaInfo) {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
                return;
            }

            // Send media without caption
            await this.sendMediaWithCaption(messageInfo, mediaInfo, null, 'removed');

        } catch (error) {
            console.error('Error in removeCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error removing caption: ' + error.message);
        }
    }

    /**
     * Copy caption command
     */
    async copyCaptionCommand(messageInfo) {
        try {
            // Check if replying to a message
            const quotedMessage = await this.getQuotedMessage(messageInfo);
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please reply to an image or video to copy with new caption.\n\n*Usage:* ${config.PREFIX}copycaption <caption>`
                );
                return;
            }

            // Check if it's media
            const mediaInfo = this.getMediaInfo(quotedMessage);
            if (!mediaInfo) {
                await this.bot.messageHandler.reply(messageInfo, '❌ The replied message must contain an image or video.');
                return;
            }

            // Check if caption provided
            if (!messageInfo.args.length) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a caption.\n\n*Usage:* ${config.PREFIX}copycaption <caption>`
                );
                return;
            }

            const newCaption = messageInfo.args.join(' ');

            // Send media with new caption
            await this.sendMediaWithCaption(messageInfo, mediaInfo, newCaption, 'copied');

        } catch (error) {
            console.error('Error in copyCaptionCommand:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error copying with caption: ' + error.message);
        }
    }

    /**
     * Get quoted/replied message
     */
    async getQuotedMessage(messageInfo) {
        try {
            // Check for quoted message in extendedTextMessage
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            if (!contextInfo?.quotedMessage) {
                return null;
            }

            // Return the quoted message structure
            return {
                message: contextInfo.quotedMessage,
                key: {
                    remoteJid: messageInfo.key.remoteJid,
                    id: contextInfo.stanzaId,
                    participant: contextInfo.participant
                }
            };
        } catch (error) {
            console.error('Error getting quoted message:', error);
            return null;
        }
    }

    /**
     * Get media information from message
     */
    getMediaInfo(message) {
        try {
            const msg = message.message;
            if (!msg) return null;

            // Check for image
            if (msg.imageMessage) {
                return {
                    type: 'image',
                    media: msg.imageMessage,
                    originalCaption: msg.imageMessage.caption || null,
                    mimetype: msg.imageMessage.mimetype || 'image/jpeg'
                };
            }

            // Check for video
            if (msg.videoMessage) {
                return {
                    type: 'video',
                    media: msg.videoMessage,
                    originalCaption: msg.videoMessage.caption || null,
                    mimetype: msg.videoMessage.mimetype || 'video/mp4'
                };
            }

            return null;
        } catch (error) {
            console.error('Error getting media info:', error);
            return null;
        }
    }

    /**
     * Send media with modified caption
     */
    async sendMediaWithCaption(messageInfo, mediaInfo, newCaption, action) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '📝 Processing media caption...');

            // Prepare media message object
            let mediaMessage = {};
            const mediaObject = { ...mediaInfo.media };

            // Set the new caption (or remove if null)
            if (newCaption !== null) {
                mediaObject.caption = newCaption;
            } else {
                delete mediaObject.caption;
            }

            // Create message based on media type
            if (mediaInfo.type === 'image') {
                mediaMessage.image = {
                    url: mediaInfo.media.url,
                    caption: mediaObject.caption,
                    mimetype: mediaInfo.mimetype
                };
            } else if (mediaInfo.type === 'video') {
                mediaMessage.video = {
                    url: mediaInfo.media.url,
                    caption: mediaObject.caption,
                    mimetype: mediaInfo.mimetype
                };
            }

            // Send the media with new caption
            await this.bot.sock.sendMessage(messageInfo.chat_jid, mediaMessage);

            // Send success message
            let successMsg = '';
            if (action === 'added') {
                successMsg = '✅ Caption added successfully!';
            } else if (action === 'edited') {
                successMsg = '✅ Caption edited successfully!';
            } else if (action === 'removed') {
                successMsg = '✅ Caption removed successfully!';
            } else if (action === 'copied') {
                successMsg = '✅ Media copied with new caption!';
            }

            if (newCaption && action !== 'removed') {
                successMsg += `\n\n📝 *New caption:* ${newCaption}`;
            }

            if (mediaInfo.originalCaption && action !== 'added') {
                successMsg += `\n📄 *Original caption:* ${mediaInfo.originalCaption}`;
            }

            await this.bot.messageHandler.reply(messageInfo, successMsg);

        } catch (error) {
            console.error('Error sending media with caption:', error);
            
            // Try alternative method - forward and edit
            try {
                await this.forwardAndEdit(messageInfo, mediaInfo, newCaption, action);
            } catch (fallbackError) {
                console.error('Fallback method also failed:', fallbackError);
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to ${action} caption. The media might be too old or corrupted.`
                );
            }
        }
    }

    /**
     * Fallback method: Forward message and add caption explanation
     */
    async forwardAndEdit(messageInfo, mediaInfo, newCaption, action) {
        try {
            // Send explanation message
            let explanation = '';
            if (action === 'added') {
                explanation = `✅ *Caption Added*\n\n📝 *New Caption:* ${newCaption}`;
            } else if (action === 'edited') {
                explanation = `✅ *Caption Edited*\n\n📝 *New Caption:* ${newCaption}`;
                if (mediaInfo.originalCaption) {
                    explanation += `\n📄 *Original:* ${mediaInfo.originalCaption}`;
                }
            } else if (action === 'removed') {
                explanation = `✅ *Caption Removed*`;
                if (mediaInfo.originalCaption) {
                    explanation += `\n\n📄 *Original Caption:* ${mediaInfo.originalCaption}`;
                }
            } else if (action === 'copied') {
                explanation = `✅ *Media Copied with New Caption*\n\n📝 *Caption:* ${newCaption}`;
            }

            explanation += `\n\n💡 *Note:* Media caption couldn't be directly modified, but here's the requested information.`;

            await this.bot.messageHandler.reply(messageInfo, explanation);
        } catch (error) {
            throw new Error('Both primary and fallback methods failed');
        }
    }

    /**
     * Get media URL from message (helper method)
     */
    async getMediaUrl(media) {
        try {
            // If media has direct URL, return it
            if (media.url) {
                return media.url;
            }

            // Try to download and get buffer (for older messages)
            if (this.bot.sock && media) {
                const buffer = await this.bot.sock.downloadMediaMessage({
                    message: { [media.type + 'Message']: media }
                });
                return buffer;
            }

            return null;
        } catch (error) {
            console.error('Error getting media URL:', error);
            return null;
        }
    }
}

module.exports = CaptionEditorPlugin;