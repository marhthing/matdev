const fs = require('fs-extra');
const path = require('path');
const config = require('../config');

class PDFConverterPlugin {
    constructor() {
        this.name = 'pdf';
        this.description = 'PDF converter - convert text/documents to PDF';
        this.version = '1.0.0';
        this.enabled = true;
        this.supportedFormats = {
            input: ['text', 'image', 'jpg', 'png', 'jpeg', 'doc', 'docx', 'html'],
            output: ['pdf']
        };
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Register PDF command
            this.bot.messageHandler.registerCommand('pdf', (messageInfo) => this.convertToPdf(messageInfo), {
                description: 'Convert text/documents to PDF',
                usage: `${config.PREFIX}pdf - Send text or reply to message/file`,
                category: 'utility',
                plugin: 'pdf',
                source: 'pdf.js'
            });

            console.log('✅ PDF Converter plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize PDF Converter plugin:', error);
            return false;
        }
    }


    async convertToPdf(messageInfo) {
        try {
            console.log('🔄 PDF conversion request');

            let result = null;
            let quotedContent = null;
            let quotedFile = null;
            let customTitle = null;
            let bodyContent = null;

            // Check if there's a quoted/tagged message
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            if (contextInfo?.quotedMessage) {
                quotedContent = this.extractQuotedMessageContent(contextInfo.quotedMessage);

                // Check if quoted message is a document or image
                if (contextInfo.quotedMessage.documentMessage) {
                    quotedFile = contextInfo.quotedMessage;
                } else if (contextInfo.quotedMessage.imageMessage) {
                    quotedFile = contextInfo.quotedMessage;
                }

                const messageType = contextInfo.quotedMessage.imageMessage ? 'Image' : 
                                   contextInfo.quotedMessage.documentMessage ? 'Document' : 'Text';
                console.log(`📝 Found quoted message - Type: ${messageType}`);
            }

            // Extract any additional text after the .pdf command
            const commandPrefix = require('../config').PREFIX;
            const additionalText = messageInfo.text ? 
                messageInfo.text.replace(new RegExp(`^${commandPrefix}pdf\\s*`, 'i'), '').trim() : '';

            // LOGIC IMPLEMENTATION:
            if (quotedContent && additionalText) {
                // Case 1: Tagged text/document + additional text = quoted content is body, additional text is title
                console.log('📝 Case 1: Quoted content as body, additional text as title');
                bodyContent = quotedContent;
                customTitle = additionalText;
                result = await this.createModernPDF(customTitle, bodyContent);
            }
            else if (quotedContent && !additionalText) {
                // Case 2: Tagged text/document + no additional text = quoted content is body, no custom title
                console.log('📝 Case 2: Quoted content as body, no custom title');
                bodyContent = quotedContent;
                customTitle = null; // Let the system auto-extract title from content if available
                result = await this.convertTextToPdf(bodyContent);
            }
            else if (!quotedContent && additionalText) {
                // Case 3: No tagged content + text after .pdf = that text becomes the body
                console.log('📝 Case 3: Additional text as body');
                bodyContent = additionalText;
                result = await this.convertTextToPdf(bodyContent);
            }
            else if (quotedFile && !quotedContent) {
                // Case 4: Document/Image file without text content
                const isImage = contextInfo.quotedMessage.imageMessage;
                const fileType = isImage ? 'Image' : 'Document';
                console.log(`📄 Case 4: ${fileType} file conversion`);

                // Download and convert the file
                try {
                    const downloadedFile = await this.downloadQuotedMedia(messageInfo, quotedFile);
                    if (downloadedFile) {
                        if (isImage) {
                            // Convert image to PDF
                            const customTitle = additionalText || null;
                            result = await this.createImageToPdf(downloadedFile.filePath, customTitle);
                        } else {
                            // For documents, we'll handle conversion in a future update
                            // Here we should call a document to PDF converter
                            // For now, let's assume a placeholder function or throw an error if not implemented
                            result = await this.convertDocumentToPdf(downloadedFile.filePath, additionalText);
                        }

                        // Cleanup downloaded file
                        setTimeout(async () => {
                            try {
                                await fs.unlink(downloadedFile.filePath);
                            } catch (e) {
                                console.warn(`⚠️ Cleanup warning: ${e.message}`);
                            }
                        }, 10000);
                    }
                } catch (downloadError) {
                    console.error(`Failed to download quoted ${fileType.toLowerCase()}:`, downloadError);
                    result = { success: false, error: `Failed to download ${fileType.toLowerCase()}` };
                }
            }

            // No valid input found
            if (!result) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ No content found to convert to PDF.\n\n**Usage examples:**\n• Reply to text with \`.pdf\` (text becomes body)\n• Reply to text with \`.pdf My Title\` (text becomes body, "My Title" becomes title)\n• Send \`.pdf Hello World\` ("Hello World" becomes body)`);
            }

            if (result && result.success) {
                console.log(`✅ PDF conversion complete: ${result.fileName}`);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: result.filePath },
                    fileName: result.fileName
                });

                // Cleanup temporary file
                setTimeout(async () => {
                    try {
                        await fs.unlink(result.filePath);
                    } catch (e) {
                        console.warn(`⚠️ Cleanup warning: ${e.message}`);
                    }
                }, 5000);
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ PDF conversion failed: ${result?.error || 'Unknown error'}`);
            }

        } catch (error) {
            console.error('❌ PDF converter error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ PDF conversion failed. Please try again.');
        }
    }

    async convertTextToPdf(text) {
        try {
            console.log('📝 Converting text to PDF using modern methods');
            const cleanText = this.removeEmojis(text);
            const title = this.extractTitleFromText(cleanText)?.title;
            const contentWithoutTitle = this.extractTitleFromText(cleanText)?.remainingContent || cleanText;

            return await this.createModernPDF(title, contentWithoutTitle);
        } catch (error) {
            console.error('Text to PDF conversion error:', error);
            return { success: false, error: 'Failed to convert text to PDF' };
        }
    }
    
    // Placeholder for document to PDF conversion
    async convertDocumentToPdf(filePath, customTitle) {
        try {
            console.log(`📄 Converting document at ${filePath} to PDF`);
            
            // This is where you would integrate a library to convert DOCX/DOC to PDF.
            // For now, we'll simulate a successful conversion with a placeholder filename.
            // Example: using 'mammoth' for docx to html, then html to pdf, or 'unoconv' if available.
            
            // For demonstration, let's assume we just rename it with a .pdf extension
            // and create a simple text-based PDF from the filename for now.
            // In a real scenario, you'd parse the document content.
            
            const fileName = customTitle ? `${this.sanitizeFileName(customTitle)}_${Date.now()}.pdf` : `document_${Date.now()}.pdf`;
            const outputFilePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(outputFilePath));

            // Simulate creating a PDF with basic info
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument();
            const stream = fs.createWriteStream(outputFilePath);
            doc.pipe(stream);

            doc.fontSize(16).text(`Converted Document: ${path.basename(filePath)}`, { align: 'center' });
            doc.moveDown(2);
            doc.fontSize(12).text(`Title: ${customTitle || 'N/A'}`);
            doc.moveDown(1);
            doc.fontSize(10).text('Content of the document could not be extracted directly in this example.');
            doc.moveDown(3);
            doc.fontSize(8).fillColor('gray').text(`MATDEV Bot - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });
            doc.end();

            return new Promise((resolve, reject) => {
                stream.on('finish', () => {
                    console.log(`✅ Document to PDF conversion simulated complete: ${fileName}`);
                    resolve({
                        success: true,
                        filePath: outputFilePath,
                        fileName: fileName
                    });
                });
                stream.on('error', (error) => {
                    console.error('PDF stream error during document conversion:', error);
                    reject({ success: false, error: 'Failed to create PDF from document' });
                });
            });

        } catch (error) {
            console.error('Document to PDF conversion error:', error);
            return { success: false, error: 'Failed to convert document to PDF' };
        }
    }

    // PDF creation using PDFKit
    async createModernPDF(title, content) {
        return await this.createSimpleTextPDF(title, content);
    }

    // Simple PDF creation using PDFKit
    async createSimpleTextPDF(title, content) {
        try {
            const PDFDocument = require('pdfkit');
            const fileName = title ? `${this.sanitizeFileName(title)}_${Date.now()}.pdf` : `document_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            return new Promise((resolve, reject) => {
                const doc = new PDFDocument();
                const stream = fs.createWriteStream(filePath);

                doc.pipe(stream);

                if (title) {
                    doc.fontSize(16).text(title, { align: 'center' });
                    doc.moveDown(2);
                }
                doc.fontSize(12).text(content);

                // Add small footer
                doc.moveDown(3);
                doc.fontSize(8).fillColor('gray').text(`MATDEV Bot - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });

                doc.end();

                stream.on('finish', () => {
                    resolve({
                        success: true,
                        filePath: filePath,
                        fileName: fileName
                    });
                });

                stream.on('error', (error) => {
                    reject({ success: false, error: 'Failed to create PDF' });
                });
            });
        } catch (error) {
            console.error('Simple PDF creation error:', error);
            return { success: false, error: 'Failed to create PDF' };
        }
    }

    // Image to PDF conversion using PDFKit
    async createImageToPdf(imagePath, customTitle) {
        try {
            console.log('🖼️ Converting image to PDF');

            const PDFDocument = require('pdfkit');
            const fileName = customTitle ? `${this.sanitizeFileName(customTitle)}_${Date.now()}.pdf` : `image_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            return new Promise((resolve, reject) => {
                const doc = new PDFDocument();
                const stream = fs.createWriteStream(filePath);

                doc.pipe(stream);

                // Add title if provided
                if (customTitle) {
                    doc.fontSize(16).text(customTitle, { align: 'center' });
                    doc.moveDown(2);
                }

                // Add image to PDF
                try {
                    // Get image dimensions and fit to page
                    doc.image(imagePath, {
                        fit: [500, 600],
                        align: 'center',
                        valign: 'center'
                    });
                } catch (imageError) {
                    console.error('Error adding image to PDF:', imageError);
                    reject({ success: false, error: 'Failed to add image to PDF' });
                    return;
                }

                // Add small footer
                doc.moveDown(2);
                doc.fontSize(8).fillColor('gray').text(`MATDEV Bot - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });

                doc.end();

                stream.on('finish', () => {
                    console.log(`✅ Image to PDF conversion complete: ${fileName}`);
                    resolve({
                        success: true,
                        filePath: filePath,
                        fileName: fileName
                    });
                });

                stream.on('error', (error) => {
                    console.error('PDF stream error:', error);
                    reject({ success: false, error: 'Failed to create PDF from image' });
                });
            });

        } catch (error) {
            console.error('Image to PDF conversion error:', error);
            return { success: false, error: 'Failed to convert image to PDF' };
        }
    }

    // Helper functions
    generateModernHTML(title, content) {
        const htmlTitle = title || 'Document';
        const htmlContent = content.replace(/\n/g, '<br>');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(htmlTitle)}</title>
    <style>
        body { 
            font-family: 'Segoe UI', Arial, sans-serif; 
            line-height: 1.6; 
            margin: 40px; 
            color: #2c3e50;
        }
        h1 { 
            color: #2c3e50; 
            border-bottom: 2px solid #3498db; 
            padding-bottom: 10px; 
            text-align: center;
        }
        p { margin-bottom: 15px; }
        .footer {
            margin-top: 40px;
            font-size: 10px;
            color: #7f8c8d;
            text-align: center;
            border-top: 1px solid #ecf0f1;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    ${title ? `<h1>${this.escapeHtml(title)}</h1>` : ''}
    <p>${htmlContent}</p>
    <div class="footer">
        Generated by MATDEV Bot on ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}
    </div>
</body>
</html>`;
    }

    extractQuotedMessageContent(quotedMessage) {
        try {
            if (quotedMessage.conversation) {
                return quotedMessage.conversation;
            }
            if (quotedMessage.extendedTextMessage?.text) {
                return quotedMessage.extendedTextMessage.text;
            }
            if (quotedMessage.imageMessage?.caption) {
                return quotedMessage.imageMessage.caption;
            }
            if (quotedMessage.videoMessage?.caption) {
                return quotedMessage.videoMessage.caption;
            }
            if (quotedMessage.documentMessage?.caption) {
                return quotedMessage.documentMessage.caption;
            }
            return null;
        } catch (error) {
            console.error('Error extracting quoted message content:', error);
            return null;
        }
    }

    async downloadQuotedMedia(messageInfo, quotedMessage) {
        try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');

            const messageToDownload = {
                key: {
                    id: messageInfo.message.extendedTextMessage.contextInfo.stanzaId,
                    remoteJid: messageInfo.chat_jid,
                    fromMe: false,
                    participant: messageInfo.message.extendedTextMessage.contextInfo.participant
                },
                message: quotedMessage
            };

            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            let fileName = 'downloaded_file';
            let extension = '';

            if (quotedMessage.documentMessage) {
                fileName = quotedMessage.documentMessage.fileName || 'document';
                extension = path.extname(fileName) || this.getExtensionFromMimetype(quotedMessage.documentMessage.mimetype);
            } else if (quotedMessage.imageMessage) {
                extension = this.getExtensionFromMimetype(quotedMessage.imageMessage.mimetype) || '.jpg';
                fileName = `image_${Date.now()}${extension}`;
            }

            if (!path.extname(fileName)) {
                fileName += extension;
            }

            const tempDir = path.join(__dirname, '..', 'tmp');
            const filePath = path.join(tempDir, fileName);

            await fs.writeFile(filePath, buffer);

            return {
                filePath: filePath,
                fileName: fileName,
                buffer: buffer
            };

        } catch (error) {
            console.error('Error downloading quoted media:', error);
            throw error;
        }
    }

    getExtensionFromMimetype(mimetype) {
        const mimetypeMap = {
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'text/plain': '.txt',
            'text/html': '.html',
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp'
        };
        return mimetypeMap[mimetype] || '';
    }

    removeEmojis(text) {
        return text.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    }

    extractTitleFromText(text) {
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) return { title: null, remainingContent: text };

        const firstLine = lines[0].trim();
        if (firstLine.length <= 60 && lines.length > 1) {
            return {
                title: firstLine,
                remainingContent: lines.slice(1).join('\n').trim()
            };
        }

        return { title: null, remainingContent: text };
    }

    sanitizeFileName(fileName) {
        let cleanName = fileName || 'document';
        
        // Remove ALL existing extensions (anywhere in filename, not just at end)
        cleanName = cleanName.replace(/\.(docx?|pdf|txt|html)/gi, '');
        
        // Remove ALL timestamp patterns (not just at end)
        cleanName = cleanName.replace(/_\d+/g, '');
        
        // Sanitize filename - only allow safe characters
        cleanName = cleanName
            .replace(/[^a-zA-Z0-9\s\-_]/g, '')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_') // Replace multiple underscores with single
            .substring(0, 50)
            .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
        
        // Ensure we have a valid name
        if (!cleanName || cleanName.length < 1) {
            cleanName = 'document';
        }
        
        return cleanName;
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    async cleanup() {
        if (this.browserInstance) {
            try {
                await this.browserInstance.close();
                console.log('🧹 PDF Converter cleanup: Browser instance closed');
            } catch (error) {
                console.warn('⚠️ Browser cleanup warning:', error.message);
            }
        }
        console.log('🧹 PDF Converter plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new PDFConverterPlugin();
        await plugin.init(bot);
        return plugin;
    }
};