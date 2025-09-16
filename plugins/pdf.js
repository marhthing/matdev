const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');
const config = require('../config');

// PDF-specific libraries
const { pdfToImg } = require('pdf-to-img');
const puppeteer = require('puppeteer');

class PDFConverterPlugin {
    constructor() {
        this.name = 'pdf';
        this.description = 'PDF converter - convert text/documents to PDF or extract from PDF';
        this.version = '1.0.0';
        this.enabled = true;
        this.supportedFormats = {
            input: ['text', 'pdf', 'doc', 'docx', 'html'],
            output: ['pdf', 'txt', 'png', 'jpg', 'jpeg']
        };
        this.browserInstance = null;
    }

    async init(bot) {
        this.bot = bot;
        try {
            // Initialize reusable browser instance for performance
            await this.initializeBrowser();

            // Register PDF-specific commands
            this.bot.messageHandler.registerCommand('pdf', (messageInfo) => this.convertToPdf(messageInfo), {
                description: 'Convert text/documents to PDF',
                usage: `${config.PREFIX}pdf - Send text or reply to message/file`,
                category: 'utility',
                plugin: 'pdf',
                source: 'pdf.js'
            });

            this.bot.messageHandler.registerCommand('pdftxt', (messageInfo) => this.pdfToText(messageInfo), {
                description: 'Extract text from PDF',
                usage: `${config.PREFIX}pdftxt - Reply to PDF file`,
                category: 'utility',
                plugin: 'pdf',
                source: 'pdf.js'
            });

            this.bot.messageHandler.registerCommand('pdfimg', (messageInfo) => this.pdfToImage(messageInfo), {
                description: 'Convert PDF to image',
                usage: `${config.PREFIX}pdfimg [page] - Reply to PDF file`,
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

    async initializeBrowser() {
        try {
            if (!this.browserInstance) {
                console.log('🚀 Initializing Puppeteer browser instance...');
                this.browserInstance = await puppeteer.launch({
                    headless: 'new',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu',
                        '--no-first-run'
                    ]
                });
                console.log('✅ Browser instance ready');
            }
        } catch (error) {
            console.warn('⚠️ Could not initialize Puppeteer browser:', error.message);
            this.browserInstance = null;
        }
    }

    async convertToPdf(messageInfo) {
        try {
            console.log('🔄 PDF conversion request');

            let result = null;
            let quotedContent = null;

            // Check if there's a quoted/tagged message
            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            if (contextInfo?.quotedMessage) {
                quotedContent = this.extractQuotedMessageContent(contextInfo.quotedMessage);
                console.log(`📝 Found quoted message content: "${quotedContent?.substring(0, 100)}..."`);
            }

            // Priority 1: Handle quoted message content as text input
            if (quotedContent) {
                console.log('📝 Processing quoted message content');
                result = await this.convertTextToPdf(quotedContent);
            }
            // Priority 2: Handle current message text input (excluding the command)
            else if (messageInfo.text) {
                const commandPrefix = require('../config').PREFIX;
                const textContent = messageInfo.text.replace(new RegExp(`^${commandPrefix}pdf\\s*`, 'i'), '').trim();

                if (textContent) {
                    console.log('📝 Processing current message text');
                    result = await this.convertTextToPdf(textContent);
                }
            }

            // No valid input found
            if (!result) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ No content found to convert to PDF.\n\n**Usage options:**\n• Reply to a message with \`.pdf\`\n• Send text with \`.pdf your text here\``);
            }

            if (result && result.success) {
                console.log(`✅ PDF conversion complete: ${result.fileName}`);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: result.filePath },
                    fileName: result.fileName,
                    caption: `✅ PDF conversion complete\n📁 **${result.fileName}**`
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

    async pdfToText(messageInfo) {
        try {
            console.log('🔄 PDF to text extraction request');

            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            if (!contextInfo?.quotedMessage?.documentMessage) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a PDF file with this command.');
            }

            const quotedMessage = contextInfo.quotedMessage;
            const fileMessage = quotedMessage.documentMessage;

            if (!fileMessage.fileName?.toLowerCase().endsWith('.pdf')) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a PDF file.');
            }

            console.log(`📄 Processing PDF file: ${fileMessage.fileName}`);

            // Download the PDF file
            const downloadedFile = await this.downloadQuotedMedia(messageInfo, quotedMessage);
            if (!downloadedFile) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to download PDF file.');
            }

            const result = await this.modernPdfToText(downloadedFile.filePath);

            // Cleanup downloaded file
            setTimeout(async () => {
                try {
                    await fs.unlink(downloadedFile.filePath);
                } catch (e) {
                    console.warn(`⚠️ Cleanup warning: ${e.message}`);
                }
            }, 10000);

            if (result && result.success) {
                console.log(`✅ PDF text extraction complete: ${result.fileName}`);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    document: { url: result.filePath },
                    fileName: result.fileName,
                    caption: `✅ Text extracted from PDF\n📁 **${result.fileName}**`
                });

                // Cleanup result file
                setTimeout(async () => {
                    try {
                        await fs.unlink(result.filePath);
                    } catch (e) {
                        console.warn(`⚠️ Cleanup warning: ${e.message}`);
                    }
                }, 5000);
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to extract text from PDF: ${result?.error || 'Unknown error'}`);
            }

        } catch (error) {
            console.error('❌ PDF to text error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ PDF text extraction failed. Please try again.');
        }
    }

    async pdfToImage(messageInfo) {
        try {
            console.log('🔄 PDF to image conversion request');

            const contextInfo = messageInfo.message?.extendedTextMessage?.contextInfo;
            if (!contextInfo?.quotedMessage?.documentMessage) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a PDF file with this command.');
            }

            const quotedMessage = contextInfo.quotedMessage;
            const fileMessage = quotedMessage.documentMessage;

            if (!fileMessage.fileName?.toLowerCase().endsWith('.pdf')) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a PDF file.');
            }

            console.log(`📄 Processing PDF file: ${fileMessage.fileName}`);

            // Download the PDF file
            const downloadedFile = await this.downloadQuotedMedia(messageInfo, quotedMessage);
            if (!downloadedFile) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to download PDF file.');
            }

            const result = await this.modernPdfToImage(downloadedFile.filePath, 'png', messageInfo);

            // Cleanup downloaded file
            setTimeout(async () => {
                try {
                    await fs.unlink(downloadedFile.filePath);
                } catch (e) {
                    console.warn(`⚠️ Cleanup warning: ${e.message}`);
                }
            }, 10000);

            if (result && result.success) {
                console.log(`✅ PDF to image conversion complete: ${result.fileName}`);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: result.filePath },
                    caption: `✅ PDF converted to image\n📁 **${result.fileName}**`
                });

                // Cleanup result file
                setTimeout(async () => {
                    try {
                        await fs.unlink(result.filePath);
                    } catch (e) {
                        console.warn(`⚠️ Cleanup warning: ${e.message}`);
                    }
                }, 5000);
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to convert PDF to image: ${result?.error || 'Unknown error'}`);
            }

        } catch (error) {
            console.error('❌ PDF to image error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ PDF to image conversion failed. Please try again.');
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

    // Modern PDF creation using Puppeteer
    async createModernPDF(title, content) {
        try {
            console.log('🎯 Creating modern PDF using Puppeteer');

            // Fallback to simple PDF if Puppeteer is not available
            if (!this.browserInstance) {
                console.log('🔄 Puppeteer not available, using simple PDF creation');
                return await this.createSimpleTextPDF(title, content);
            }

            const html = this.generateModernHTML(title, content);
            const fileName = title ? `${this.sanitizeFileName(title)}_${Date.now()}.pdf` : `document_${Date.now()}.pdf`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));

            const page = await this.browserInstance.newPage();
            await page.setContent(html, { waitUntil: 'networkidle0' });

            await page.pdf({
                path: filePath,
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    right: '15mm',
                    bottom: '20mm',
                    left: '15mm'
                }
            });

            await page.close();

            console.log(`✅ Modern PDF creation complete: ${fileName}`);
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Modern PDF creation error:', error);

            // Fallback to simple PDF
            console.log('🔄 Falling back to simple PDF creation...');
            return await this.createSimpleTextPDF(title, content);
        }
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

    // Modern PDF to Image using pdf-to-img
    async modernPdfToImage(pdfPath, targetFormat, messageInfo) {
        try {
            console.log(`🎯 Modern PDF→Image conversion using pdf-to-img`);

            const pageNumber = messageInfo.args && messageInfo.args[0] ? parseInt(messageInfo.args[0]) : 1;
            console.log(`📄 Converting page ${pageNumber} to ${targetFormat.toUpperCase()}`);

            const outputDir = path.join(__dirname, '..', 'tmp');
            await fs.ensureDir(outputDir);

            // Modern method: pdf-to-img with zero system dependencies
            let pageIndex = 0;
            let convertedBuffer = null;

            for await (const image of pdfToImg(pdfPath, { scale: 1.5 })) {
                if (++pageIndex === pageNumber) {
                    convertedBuffer = image.buffer;
                    break;
                }
            }

            if (!convertedBuffer) {
                throw new Error(`Page ${pageNumber} not found in PDF`);
            }

            const fileName = `pdf_page_${pageNumber}_${Date.now()}.${targetFormat}`;
            const filePath = path.join(outputDir, fileName);

            // Convert to target format using Sharp
            if (targetFormat === 'png') {
                await fs.writeFile(filePath, convertedBuffer);
            } else {
                // Convert PNG to JPG using Sharp
                const jpegBuffer = await sharp(convertedBuffer)
                    .jpeg({ quality: 90 })
                    .toBuffer();
                await fs.writeFile(filePath, jpegBuffer);
            }

            console.log(`✅ Modern PDF→Image complete: ${fileName}`);
            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Modern PDF to image error:', error);
            return { success: false, error: 'Failed to convert PDF to image' };
        }
    }

    // Modern PDF to Text using pdf-parse
    async modernPdfToText(pdfPath) {
        try {
            console.log('🎯 Modern PDF→Text extraction');

            const pdfParse = require('pdf-parse');
            const pdfBuffer = await fs.readFile(pdfPath);
            const pdfData = await pdfParse(pdfBuffer);

            const fileName = `extracted_text_${Date.now()}.txt`;
            const filePath = path.join(__dirname, '..', 'tmp', fileName);

            await fs.ensureDir(path.dirname(filePath));
            await fs.writeFile(filePath, pdfData.text, 'utf8');

            return {
                success: true,
                filePath: filePath,
                fileName: fileName
            };

        } catch (error) {
            console.error('Modern PDF to text error:', error);
            return { success: false, error: 'Failed to extract text from PDF' };
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
            'text/html': '.html'
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
        return fileName
            .replace(/[^a-zA-Z0-9\s\-_.]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
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