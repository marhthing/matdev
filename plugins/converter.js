/**
 * File Converter Plugin - 2025 Latest Methods
 * Convert between PDF, DOCX, DOC, and image formats
 * Supports WhatsApp media messages and quoted messages
 * 
 * Commands:
 * - .pdftoimg - Convert PDF to images
 * - .imgtopdf - Convert images to PDF
 * - .pdftodoc - Convert PDF to DOCX
 * - .doctopdf - Convert DOCX/DOC to PDF
 * - .convert - Universal converter
 */

const config = require('../config');
const FileConverter = require('../converter.js');
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
        console.log('✅ File Converter plugin loaded (working commands: pdftoimg, imgtopdf, pdftodoc, doctopdf, convert)');
    }

    /**
     * Register all converter commands
     */
    registerCommands() {
        // PDF to Images command
        this.bot.messageHandler.registerCommand('pdftoimg', this.pdfToImagesCommand.bind(this), {
            description: 'Convert PDF to images (PNG/JPG)',
            usage: `${config.PREFIX}pdftoimg [png|jpg] (reply to PDF or send PDF with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // Images to PDF command
        this.bot.messageHandler.registerCommand('imgtopdf', this.imagesToPdfCommand.bind(this), {
            description: 'Convert images to PDF',
            usage: `${config.PREFIX}imgtopdf (reply to image or send image with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // PDF to DOCX command
        this.bot.messageHandler.registerCommand('pdftodoc', this.pdfToDocxCommand.bind(this), {
            description: 'Convert PDF to DOCX document',
            usage: `${config.PREFIX}pdftodoc (reply to PDF or send PDF with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // DOCX/DOC to PDF command
        this.bot.messageHandler.registerCommand('doctopdf', this.docToPdfCommand.bind(this), {
            description: 'Convert DOCX/DOC to PDF',
            usage: `${config.PREFIX}doctopdf (reply to document or send document with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // Universal converter command
        this.bot.messageHandler.registerCommand('convert', this.universalConvertCommand.bind(this), {
            description: 'Universal file converter (auto-detect format)',
            usage: `${config.PREFIX}convert <format> (reply to file or send file with caption)`,
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
     * PDF to Images command
     */
    async pdfToImagesCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a PDF file or send a PDF with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}pdftoimg [png|jpg]`
                );
                return;
            }

            // Check if it's a PDF
            if (!mediaData.filename.toLowerCase().includes('.pdf') && 
                !mediaData.mimetype.includes('pdf') && 
                !mediaData.buffer.toString('ascii', 0, 4).includes('%PDF')) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please send a PDF file.');
                return;
            }

            // Get output format from args
            const args = messageInfo.args || [];
            const format = args[0]?.toLowerCase() === 'jpg' ? 'jpg' : 'png';

            await this.bot.messageHandler.reply(messageInfo, 
                `🔄 Converting PDF to ${format.toUpperCase()} images... Please wait.`
            );

            // Convert PDF to images
            const images = await this.converter.pdfToImages(mediaData.buffer, { 
                format: format,
                scale: 1.5,
                quality: 90 
            });

            if (!images || images.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert PDF. Please try again.');
                return;
            }

            // Send images
            for (let i = 0; i < images.length; i++) {
                const image = images[i];
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    image: image.buffer,
                    caption: `📄 Page ${image.page} of ${images.length}\n🔄 PDF to ${format.toUpperCase()} conversion`
                });
            }

            await this.bot.messageHandler.reply(messageInfo, 
                `✅ Successfully converted PDF to ${images.length} ${format.toUpperCase()} image(s)!`
            );

        } catch (error) {
            console.log('PDF to images error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert PDF to images. Please ensure the file is a valid PDF.'
            );
        }
    }

    /**
     * Images to PDF command
     */
    async imagesToPdfCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to an image or send an image with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}imgtopdf`
                );
                return;
            }

            // Check if it's an image
            if (!mediaData.mimetype.includes('image')) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please send an image file.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting image to PDF... Please wait.');

            // Convert image to PDF
            const pdfBuffer = await this.converter.imagesToPdf([mediaData.buffer], null, {
                pageSize: 'A4',
                quality: 85
            });

            if (!pdfBuffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert image to PDF.');
                return;
            }

            // Send PDF
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: pdfBuffer,
                fileName: `converted_${Date.now()}.pdf`,
                mimetype: 'application/pdf',
                caption: '📄 Image converted to PDF'
            });

            await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted image to PDF!');

        } catch (error) {
            console.log('Image to PDF error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert image to PDF. Please ensure the file is a valid image.'
            );
        }
    }

    /**
     * PDF to DOCX command
     */
    async pdfToDocxCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a PDF file or send a PDF with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}pdftodoc`
                );
                return;
            }

            // Check if it's a PDF
            if (!mediaData.filename.toLowerCase().includes('.pdf') && 
                !mediaData.mimetype.includes('pdf') && 
                !mediaData.buffer.toString('ascii', 0, 4).includes('%PDF')) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please send a PDF file.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, 
                '🔄 Converting PDF to DOCX document... Please wait (this may take a moment).'
            );

            // Convert PDF to DOCX
            const docxBuffer = await this.converter.pdfToDocx(mediaData.buffer);

            if (!docxBuffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert PDF to DOCX.');
                return;
            }

            // Send DOCX
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: docxBuffer,
                fileName: `converted_${Date.now()}.docx`,
                mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                caption: '📄 PDF converted to DOCX'
            });

            await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted PDF to DOCX document!');

        } catch (error) {
            console.log('PDF to DOCX error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert PDF to DOCX. Please ensure the file is a valid PDF and try again.'
            );
        }
    }

    /**
     * DOCX/DOC to PDF command
     */
    async docToPdfCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a DOCX/DOC file or send a document with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}doctopdf`
                );
                return;
            }

            // Check if it's a document
            const isDoc = mediaData.filename.toLowerCase().includes('.doc') || 
                         mediaData.mimetype.includes('word') ||
                         mediaData.mimetype.includes('document');

            if (!isDoc) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please send a DOCX or DOC file.');
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, 
                '🔄 Converting document to PDF... Please wait (this may take a moment).'
            );

            // Convert based on file type
            let pdfBuffer;
            if (mediaData.filename.toLowerCase().includes('.docx') || 
                mediaData.mimetype.includes('openxml')) {
                pdfBuffer = await this.converter.docxToPdf(mediaData.buffer);
            } else {
                pdfBuffer = await this.converter.docToPdf(mediaData.buffer);
            }

            if (!pdfBuffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert document to PDF.');
                return;
            }

            // Send PDF
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: pdfBuffer,
                fileName: `converted_${Date.now()}.pdf`,
                mimetype: 'application/pdf',
                caption: '📄 Document converted to PDF'
            });

            await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted document to PDF!');

        } catch (error) {
            console.log('Document to PDF error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert document to PDF. Please ensure the file is a valid DOCX/DOC file.'
            );
        }
    }

    /**
     * Universal converter command
     */
    async universalConvertCommand(messageInfo) {
        try {
            const args = messageInfo.args || [];
            const targetFormat = args[0]?.toLowerCase();

            if (!targetFormat) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please specify target format.\n\n' +
                    `Usage: ${config.PREFIX}convert <format>\n` +
                    'Supported formats: pdf, docx, doc, png, jpg, jpeg, html, txt\n\n' +
                    'Example: `.convert pdf` (reply to image/doc)\n' +
                    'Example: `.convert png` (reply to PDF)'
                );
                return;
            }

            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a file or send a file with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}convert ${targetFormat}`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, 
                `🔄 Converting file to ${targetFormat.toUpperCase()}... Please wait.`
            );

            // Use universal converter
            const result = await this.converter.convert(mediaData.buffer, targetFormat, null, {
                quality: 85,
                scale: 1.5
            });

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to convert file to ${targetFormat.toUpperCase()}.`
                );
                return;
            }

            // Handle different result types
            if (Array.isArray(result)) {
                // Multiple images from PDF
                for (let i = 0; i < result.length; i++) {
                    const image = result[i];
                    await this.bot.sock.sendMessage(messageInfo.sender, {
                        image: image.buffer,
                        caption: `📄 Page ${i + 1} of ${result.length}\n🔄 Converted to ${targetFormat.toUpperCase()}`
                    });
                }
                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ Successfully converted to ${result.length} ${targetFormat.toUpperCase()} file(s)!`
                );
            } else if (typeof result === 'string') {
                // Text/HTML result
                await this.bot.messageHandler.reply(messageInfo, 
                    `📄 *Converted to ${targetFormat.toUpperCase()}:*\n\n${result.substring(0, 4000)}`
                );
            } else {
                // Buffer result (PDF, DOCX, etc.)
                const mimeTypes = {
                    pdf: 'application/pdf',
                    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    doc: 'application/msword',
                    png: 'image/png',
                    jpg: 'image/jpeg',
                    jpeg: 'image/jpeg'
                };

                if (['png', 'jpg', 'jpeg'].includes(targetFormat)) {
                    await this.bot.sock.sendMessage(messageInfo.sender, {
                        image: result,
                        caption: `🔄 Converted to ${targetFormat.toUpperCase()}`
                    });
                } else {
                    await this.bot.sock.sendMessage(messageInfo.sender, {
                        document: result,
                        fileName: `converted_${Date.now()}.${targetFormat}`,
                        mimetype: mimeTypes[targetFormat] || 'application/octet-stream',
                        caption: `📄 Converted to ${targetFormat.toUpperCase()}`
                    });
                }
                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ Successfully converted to ${targetFormat.toUpperCase()}!`
                );
            }

        } catch (error) {
            console.log('Universal convert error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Conversion failed. Please check the file format and try again.'
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
        message += `• \`${config.PREFIX}pdftoimg [png|jpg]\` - PDF to images\n`;
        message += `• \`${config.PREFIX}imgtopdf\` - Images to PDF\n`;
        message += `• \`${config.PREFIX}pdftodoc\` - PDF to DOCX\n`;
        message += `• \`${config.PREFIX}doctopdf\` - DOCX/DOC to PDF\n`;
        message += `• \`${config.PREFIX}convert <format>\` - Universal converter\n\n`;
        message += '💡 *Usage:* Reply to a file with the command or send file with command as caption';

        await this.bot.messageHandler.reply(messageInfo, message);
    }
}

module.exports = new ConverterPlugin();