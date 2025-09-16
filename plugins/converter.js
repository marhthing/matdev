
/**
 * File Converter Plugin - 2025 Latest Methods
 * Convert between PDF, DOCX, DOC, and image formats
 * Supports WhatsApp media messages and quoted messages
 * 
 * Commands:
 * - .pdf - Convert any document/image to PDF
 * - .doc - Convert any document to DOCX
 * - .png - Convert any file to PNG
 * - .jpg - Convert any file to JPG
 * - .html - Convert any document to HTML
 * - .txt - Convert any document to text
 */

const config = require('../config');
const FileConverter = require('../lib/converter.js');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs').promises;

class ConverterPlugin {
    constructor() {
        this.name = 'converter';
        this.description = 'File converter for PDF, DOCX, DOC, and image formats';
        this.version = '1.0.0';
        this.converter = new FileConverter();
    }

    /**
     * Initialize plugin and register commands
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ File Converter plugin loaded (working commands: pdf, doc, png, jpg, html, txt)');
    }

    /**
     * Register all converter commands
     */
    registerCommands() {
        // PDF converter command
        this.bot.messageHandler.registerCommand('pdf', this.convertToPdfCommand.bind(this), {
            description: 'Convert any document or image to PDF',
            usage: `${config.PREFIX}pdf (reply to file or send file with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // DOCX converter command
        this.bot.messageHandler.registerCommand('doc', this.convertToDocxCommand.bind(this), {
            description: 'Convert any document to DOCX',
            usage: `${config.PREFIX}doc (reply to document or send document with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // PNG converter command
        this.bot.messageHandler.registerCommand('png', this.convertToPngCommand.bind(this), {
            description: 'Convert any file to PNG image',
            usage: `${config.PREFIX}png (reply to file or send file with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // JPG converter command
        this.bot.messageHandler.registerCommand('jpg', this.convertToJpgCommand.bind(this), {
            description: 'Convert any file to JPG image',
            usage: `${config.PREFIX}jpg (reply to file or send file with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // HTML converter command
        this.bot.messageHandler.registerCommand('html', this.convertToHtmlCommand.bind(this), {
            description: 'Convert any document to HTML',
            usage: `${config.PREFIX}html (reply to document or send document with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // TXT converter command
        this.bot.messageHandler.registerCommand('txt', this.convertToTxtCommand.bind(this), {
            description: 'Convert any document to text',
            usage: `${config.PREFIX}txt (reply to document or send document with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // Conversion help/list command
        this.bot.messageHandler.registerCommand('convertlist', this.listConversionsCommand.bind(this), {
            description: 'List all supported file conversions',
            usage: `${config.PREFIX}convertlist`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });
    }

    /**
     * Download media from message with error handling
     */
    async downloadMedia(message, expectedType = null) {
        try {
            let messageToDownload = null;
            let mediaType = null;

            // Check direct message first
            const directPdf = message.message?.documentMessage;
            const directImage = message.message?.imageMessage;
            
            if (directPdf || directImage) {
                messageToDownload = {
                    key: message.key,
                    message: message.message
                };
                mediaType = directPdf ? 'document' : 'image';
            } else {
                // Check quoted message
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      message.message?.quotedMessage;
                
                if (!quotedMessage) {
                    return null;
                }

                // Check quoted message types
                if (quotedMessage.documentMessage) {
                    mediaType = 'document';
                    messageToDownload = { 
                        message: quotedMessage,
                        key: message.message.extendedTextMessage?.contextInfo?.quotedMessage?.key || message.key
                    };
                } else if (quotedMessage.imageMessage) {
                    mediaType = 'image';
                    messageToDownload = { 
                        message: quotedMessage,
                        key: message.message.extendedTextMessage?.contextInfo?.quotedMessage?.key || message.key
                    };
                }
            }

            if (!messageToDownload) {
                return null;
            }

            // Download media
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            if (!buffer) {
                return null;
            }

            // Get filename and mimetype
            let filename = 'file';
            let mimetype = '';
            
            const messageContent = messageToDownload.message;
            if (messageContent.documentMessage) {
                filename = messageContent.documentMessage.fileName || 'document';
                mimetype = messageContent.documentMessage.mimetype || '';
            } else if (messageContent.imageMessage) {
                filename = 'image';
                mimetype = messageContent.imageMessage.mimetype || 'image/jpeg';
            }

            return {
                buffer,
                filename,
                mimetype,
                mediaType
            };

        } catch (error) {
            console.log('Download media error:', error);
            return null;
        }
    }

    /**
     * Convert to PDF command
     */
    async convertToPdfCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a file or send a file with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}pdf`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to PDF... Please wait.');

            // Use universal converter
            const result = await this.converter.convert(mediaData.buffer, 'pdf', null, {
                quality: 85,
                pageSize: 'A4'
            });

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to PDF.');
                return;
            }

            // Send PDF
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: result,
                fileName: `converted_${Date.now()}.pdf`,
                mimetype: 'application/pdf',
                caption: '📄 Converted to PDF'
            });

            await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to PDF!');

        } catch (error) {
            console.log('Convert to PDF error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to PDF. Please ensure the file is valid.'
            );
        }
    }

    /**
     * Convert to DOCX command
     */
    async convertToDocxCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a document or send a document with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}doc`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to DOCX... Please wait.');

            // Use universal converter
            const result = await this.converter.convert(mediaData.buffer, 'docx', null);

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to DOCX.');
                return;
            }

            // Send DOCX
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: result,
                fileName: `converted_${Date.now()}.docx`,
                mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                caption: '📄 Converted to DOCX'
            });

            await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to DOCX!');

        } catch (error) {
            console.log('Convert to DOCX error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to DOCX. Please ensure the file is a valid document.'
            );
        }
    }

    /**
     * Convert to PNG command
     */
    async convertToPngCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a file or send a file with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}png`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to PNG... Please wait.');

            // Use universal converter
            const result = await this.converter.convert(mediaData.buffer, 'png', null, {
                quality: 100
            });

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to PNG.');
                return;
            }

            // Handle multiple images from PDF
            if (Array.isArray(result)) {
                for (let i = 0; i < result.length; i++) {
                    const image = result[i];
                    await this.bot.sock.sendMessage(messageInfo.sender, {
                        image: image.buffer,
                        caption: `📄 Page ${i + 1} of ${result.length} - Converted to PNG`
                    });
                }
                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ Successfully converted to ${result.length} PNG image(s)!`
                );
            } else {
                // Single image
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    image: result,
                    caption: '🖼️ Converted to PNG'
                });
                await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to PNG!');
            }

        } catch (error) {
            console.log('Convert to PNG error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to PNG. Please ensure the file is valid.'
            );
        }
    }

    /**
     * Convert to JPG command
     */
    async convertToJpgCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a file or send a file with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}jpg`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to JPG... Please wait.');

            // Use universal converter
            const result = await this.converter.convert(mediaData.buffer, 'jpg', null, {
                quality: 85
            });

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to JPG.');
                return;
            }

            // Handle multiple images from PDF
            if (Array.isArray(result)) {
                for (let i = 0; i < result.length; i++) {
                    const image = result[i];
                    await this.bot.sock.sendMessage(messageInfo.sender, {
                        image: image.buffer,
                        caption: `📄 Page ${i + 1} of ${result.length} - Converted to JPG`
                    });
                }
                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ Successfully converted to ${result.length} JPG image(s)!`
                );
            } else {
                // Single image
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    image: result,
                    caption: '🖼️ Converted to JPG'
                });
                await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to JPG!');
            }

        } catch (error) {
            console.log('Convert to JPG error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to JPG. Please ensure the file is valid.'
            );
        }
    }

    /**
     * Convert to HTML command
     */
    async convertToHtmlCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a document or send a document with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}html`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to HTML... Please wait.');

            // Use universal converter
            const result = await this.converter.convert(mediaData.buffer, 'html', null);

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to HTML.');
                return;
            }

            // Send HTML content as text (truncated if too long)
            const htmlContent = typeof result === 'string' ? result : result.toString();
            const truncatedHtml = htmlContent.length > 4000 ? htmlContent.substring(0, 4000) + '...' : htmlContent;
            
            await this.bot.messageHandler.reply(messageInfo, 
                `📄 *Converted to HTML:*\n\n\`\`\`html\n${truncatedHtml}\n\`\`\``
            );

        } catch (error) {
            console.log('Convert to HTML error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to HTML. Please ensure the file is a valid document.'
            );
        }
    }

    /**
     * Convert to TXT command
     */
    async convertToTxtCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a document or send a document with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}txt`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to text... Please wait.');

            // Use universal converter
            const result = await this.converter.convert(mediaData.buffer, 'txt', null);

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to text.');
                return;
            }

            // Send text content (truncated if too long)
            const textContent = typeof result === 'string' ? result : result.toString();
            const truncatedText = textContent.length > 4000 ? textContent.substring(0, 4000) + '...' : textContent;
            
            await this.bot.messageHandler.reply(messageInfo, 
                `📄 *Converted to Text:*\n\n${truncatedText}`
            );

        } catch (error) {
            console.log('Convert to TXT error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to text. Please ensure the file is a valid document.'
            );
        }
    }

    /**
     * List supported conversions command
     */
    async listConversionsCommand(messageInfo) {
        const conversions = this.converter.getSupportedConversions();
        
        let message = '📋 *SUPPORTED FILE CONVERSIONS*\n\n';
        
        for (const [from, info] of Object.entries(conversions)) {
            message += `🔹 *${from}*\n`;
            message += `   → ${info.to.join(', ')}\n`;
            message += `   ${info.description}\n\n`;
        }

        message += '🔧 *AVAILABLE COMMANDS:*\n\n';
        message += `• \`${config.PREFIX}pdf\` - Convert any file to PDF\n`;
        message += `• \`${config.PREFIX}doc\` - Convert any document to DOCX\n`;
        message += `• \`${config.PREFIX}png\` - Convert any file to PNG\n`;
        message += `• \`${config.PREFIX}jpg\` - Convert any file to JPG\n`;
        message += `• \`${config.PREFIX}html\` - Convert any document to HTML\n`;
        message += `• \`${config.PREFIX}txt\` - Convert any document to text\n\n`;
        message += '💡 *Usage:* Reply to a file with the command or send file with command as caption';

        await this.bot.messageHandler.reply(messageInfo, message);
    }
}

module.exports = new ConverterPlugin();
